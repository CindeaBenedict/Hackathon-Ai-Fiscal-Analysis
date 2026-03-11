from datetime import datetime
from dataclasses import replace
import math
import os
import threading
import time
from statistics import NormalDist, pstdev
import uuid

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from ai_agent import (
    OllamaUnavailableError,
    extract_first_int,
    extract_profit_list,
    extract_profits_from_json,
    generate_text,
    provider_status,
    pull_model,
)
from auth import get_api_key, init_auth_db, login_user, register_user, set_api_key, validate_token
from data_ingest import (
    parse_csv_bytes,
    parse_excel_bytes,
    parse_json_bytes,
    summarize_file,
)
from models import (
    AIAdvisorRequest,
    AIAdvisorResponse,
    AIAdvisorSummaryRequest,
    AIAdvisorSummaryResponse,
    AIAdvisorDistributionResponse,
    AIKeysResponse,
    AIKeysUpdateRequest,
    AuthLoginRequest,
    AuthRegisterRequest,
    AuthResponse,
    AIOrderAdviceRequest,
    AIOrderAdviceResponse,
    AIRecommendOrderForSimulationRequest,
    AIRecommendOrderForSimulationResponse,
    AILogEntry,
    CompactSimulationResponse,
    DataChatRequest,
    DataChatResponse,
    DataFileSummary,
    SimChatRequest,
    SimChatResponse,
    FactorImpact,
    ProcessFileRequest,
    ProcessFileResponse,
    SimulationRequest,
    SimulationResponse,
    Strategy,
    TheoryReportRequest,
    TheoryReportResponse,
)
from simulator import (
    SimulationConfig,
    run_monte_carlo,
    run_monte_carlo_compact,
    run_monte_carlo_stable,
)


app = FastAPI(title="Supply Chain Uncertainty Simulator")
AI_LOGS: list[AILogEntry] = []
MAX_AI_LOGS = 200
DATA_FILES: list[DataFileSummary] = []
RAW_DATA_BY_FILE: dict[str, list[dict]] = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _auto_pull_model() -> None:
    """Pull the default Ollama model in the background on startup."""
    model = os.getenv("DEFAULT_MODEL", "llama3.2:1b")
    # Wait a few seconds for Ollama container to fully start
    time.sleep(8)
    try:
        status = provider_status()
        existing = status["ollama"]["models"]
        # Check if model (or its base name) is already present
        base = model.split(":")[0]
        if any(m == model or m.startswith(base) for m in existing):
            return  # already downloaded
        pull_model(model)
    except Exception:
        pass  # Non-fatal: user will see "model not found" in AI calls


@app.on_event("startup")
def startup_event() -> None:
    import sys
    import traceback
    print("Backend startup: initializing auth DB...", file=sys.stderr, flush=True)
    try:
        init_auth_db()
        print("Backend startup: auth DB OK, starting model pull thread.", file=sys.stderr, flush=True)
        threading.Thread(target=_auto_pull_model, daemon=True).start()
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        raise RuntimeError(f"Startup failed: {e}") from e


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


@app.get("/ai/status")
def ai_status() -> dict:
    """Return availability and model lists for every AI provider."""
    return provider_status()


def _mask_key(key: str | None) -> str:
    if not key or len(key) < 8:
        return ""
    return key[:4] + "…" + key[-4:] if len(key) > 8 else "****"


def require_auth(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token.")
    token = authorization.split(" ", 1)[1].strip()
    username = validate_token(token)
    if username is None:
        raise HTTPException(status_code=401, detail="Invalid token.")
    return username


@app.get("/ai/keys", response_model=AIKeysResponse)
def get_ai_keys() -> AIKeysResponse:
    """Return masked API key status (for Settings UI). No auth required to read status."""
    ak = get_api_key("ANTHROPIC_API_KEY")
    ok = get_api_key("OPENAI_API_KEY")
    return AIKeysResponse(
        anthropic_set=bool(ak),
        anthropic_masked=_mask_key(ak) or "(not set)",
        openai_set=bool(ok),
        openai_masked=_mask_key(ok) or "(not set)",
    )


@app.put("/ai/keys", response_model=AIKeysResponse)
def update_ai_keys(
    body: AIKeysUpdateRequest,
    _username: str = Depends(require_auth),
) -> AIKeysResponse:
    """Store Claude/OpenAI API keys from the app. Requires auth."""
    if body.anthropic is not None:
        set_api_key("ANTHROPIC_API_KEY", body.anthropic)
    if body.openai is not None:
        set_api_key("OPENAI_API_KEY", body.openai)
    return get_ai_keys()


def _config_from_request(payload: SimulationRequest) -> SimulationConfig:
    # Zero starting cash = no inventory (cannot operate without capital)
    initial_inv = payload.initial_inventory if (payload.initial_cash or 0) > 0 else 0.0
    return SimulationConfig(
        initial_inventory=initial_inv,
        initial_cash=payload.initial_cash,
        baseline_demand=payload.baseline_demand,
        demand_std_dev=payload.demand_std_dev,
        lead_time_weeks=payload.lead_time_weeks,
        holding_cost=payload.holding_cost,
        stockout_penalty=payload.stockout_penalty,
        order_cost=payload.order_cost,
        sale_price=payload.sale_price,
        weekly_fixed_cost=payload.weekly_fixed_cost,
        bankruptcy_cash_threshold=payload.bankruptcy_cash_threshold,
        supplier_delay_probability=payload.supplier_delay_probability,
        demand_spike_probability=payload.demand_spike_probability,
        demand_drop_probability=payload.demand_drop_probability,
        production_loss_probability=payload.production_loss_probability,
        demand_spike_multiplier=payload.demand_spike_multiplier,
        demand_drop_multiplier=payload.demand_drop_multiplier,
        production_loss_fraction=payload.production_loss_fraction,
    )


def _add_ai_log(entry: AILogEntry) -> None:
    AI_LOGS.insert(0, entry)
    if len(AI_LOGS) > MAX_AI_LOGS:
        del AI_LOGS[MAX_AI_LOGS:]


def _timed_ai_call(action: str, model: str, prompt: str, *, max_tokens: int = 1024) -> tuple[str | None, str | None, float]:
    """Call AI, return (response_text, error_text, duration_ms)."""
    t0 = time.monotonic()
    try:
        result = generate_text(prompt=prompt, model=model, max_tokens=max_tokens)
        duration_ms = (time.monotonic() - t0) * 1000
        _add_ai_log(AILogEntry(
            timestamp=datetime.utcnow().isoformat(),
            action=action,
            model=model,
            prompt=prompt,
            response=result,
            duration_ms=round(duration_ms, 1),
            prompt_chars=len(prompt),
            response_chars=len(result),
        ))
        return result, None, duration_ms
    except OllamaUnavailableError as exc:
        duration_ms = (time.monotonic() - t0) * 1000
        _add_ai_log(AILogEntry(
            timestamp=datetime.utcnow().isoformat(),
            action=f"{action}.error",
            model=model,
            prompt=prompt,
            error=str(exc),
            duration_ms=round(duration_ms, 1),
            prompt_chars=len(prompt),
        ))
        return None, str(exc), duration_ms


def _z_score(confidence_level: float) -> float:
    return NormalDist().inv_cdf(0.5 + confidence_level / 2.0)


def _profit_confidence_interval(
    profits: list[float], confidence_level: float
) -> tuple[float, float, float]:
    if not profits:
        return 0.0, 0.0, 0.0
    mean_profit = sum(profits) / len(profits)
    std_profit = pstdev(profits) if len(profits) > 1 else 0.0
    z = _z_score(confidence_level)
    margin = z * std_profit / math.sqrt(max(len(profits), 1))
    return mean_profit, mean_profit - margin, mean_profit + margin


def _bankruptcy_confidence_interval(
    bankruptcy_count: int, simulations: int, confidence_level: float
) -> tuple[float, float, float]:
    p_hat = bankruptcy_count / max(simulations, 1)
    z = _z_score(confidence_level)
    variance = p_hat * (1.0 - p_hat) / max(simulations, 1)
    margin = z * math.sqrt(max(variance, 0.0))
    return p_hat, max(0.0, p_hat - margin), min(1.0, p_hat + margin)


def _required_simulations_for_error(
    profit_std_dev: float, confidence_level: float, target_margin_of_error: float
) -> int:
    z = _z_score(confidence_level)
    n_required = (z * profit_std_dev / target_margin_of_error) ** 2
    return max(1, math.ceil(n_required))


def _factor_impact_analysis(
    strategy: Strategy,
    custom_quantity: int | None,
    config: SimulationConfig,
    baseline_avg_profit: float,
    baseline_bankruptcy_probability: float,
    simulations: int,
) -> list[FactorImpact]:
    scenarios: list[tuple[str, SimulationConfig, str]] = [
        (
            "Supplier Delay Probability +50%",
            replace(
                config,
                supplier_delay_probability=min(1.0, config.supplier_delay_probability * 1.5),
            ),
            "Higher supplier delay increases stockout exposure and reduces service reliability.",
        ),
        (
            "Demand Volatility +25%",
            replace(config, demand_std_dev=config.demand_std_dev * 1.25),
            "More volatile demand increases both excess inventory risk and stockout risk.",
        ),
        (
            "Weekly Fixed Cost +30%",
            replace(config, weekly_fixed_cost=config.weekly_fixed_cost * 1.3),
            "Higher fixed overhead compresses cash buffer and raises insolvency pressure.",
        ),
        (
            "Stockout Penalty +30%",
            replace(config, stockout_penalty=config.stockout_penalty * 1.3),
            "More expensive stockouts amplify downside during disruption-heavy weeks.",
        ),
        (
            "Lead Time +1 Week",
            replace(config, lead_time_weeks=min(8, config.lead_time_weeks + 1)),
            "Longer replenishment lag reduces agility and increases mismatch with demand.",
        ),
    ]

    impacts: list[FactorImpact] = []
    for factor_name, stressed_config, explanation in scenarios:
        stressed = run_monte_carlo_compact(
            strategy=strategy,
            simulations=simulations,
            custom_quantity=custom_quantity,
            config=stressed_config,
        )
        stressed_avg_profit = stressed["avg_profit"]
        stressed_bp = stressed["bankruptcy_probability"]
        impacts.append(
            FactorImpact(
                factor=factor_name,
                baseline_avg_profit=baseline_avg_profit,
                stressed_avg_profit=stressed_avg_profit,
                delta_avg_profit=stressed_avg_profit - baseline_avg_profit,
                baseline_bankruptcy_probability=baseline_bankruptcy_probability,
                stressed_bankruptcy_probability=stressed_bp,
                delta_bankruptcy_probability=stressed_bp - baseline_bankruptcy_probability,
                explanation=explanation,
            )
        )
    return impacts


@app.post("/simulate", response_model=SimulationResponse)
def simulate(payload: SimulationRequest, _: str = Depends(require_auth)) -> SimulationResponse:
    if payload.strategy == Strategy.custom and payload.order_quantity is None:
        raise HTTPException(
            status_code=400,
            detail="order_quantity is required when strategy is custom.",
        )

    result = run_monte_carlo(
        strategy=payload.strategy,
        simulations=payload.simulations,
        custom_quantity=payload.order_quantity,
        config=_config_from_request(payload),
    )
    return SimulationResponse(**result)


@app.post("/simulate/compact", response_model=CompactSimulationResponse)
def simulate_compact(
    payload: SimulationRequest, _: str = Depends(require_auth)
) -> CompactSimulationResponse:
    if payload.strategy == Strategy.custom and payload.order_quantity is None:
        raise HTTPException(
            status_code=400,
            detail="order_quantity is required when strategy is custom.",
        )

    result = run_monte_carlo_compact(
        strategy=payload.strategy,
        simulations=payload.simulations,
        custom_quantity=payload.order_quantity,
        config=_config_from_request(payload),
    )
    return CompactSimulationResponse(**result)


@app.post("/ai/order-advice", response_model=AIOrderAdviceResponse)
def ai_order_advice(
    payload: AIOrderAdviceRequest, _: str = Depends(require_auth)
) -> AIOrderAdviceResponse:
    prompt = f"""
You are a supply chain advisor.
Inventory: {payload.inventory}
Demand trend: {payload.demand_trend}
Cash: {payload.cash}

How many units should we order next week?
Return only one integer wrapped as <answer>NUMBER</answer>.
""".strip()

    raw_response, err, _ = _timed_ai_call("ai.order_advice", payload.model, prompt)
    if err:
        raise HTTPException(status_code=503, detail=err)
    return AIOrderAdviceResponse(
        recommended_order_units=extract_first_int(raw_response or ""),
        model=payload.model,
        raw_response=raw_response or "",
    )


@app.post("/ai/recommend-order-for-simulation", response_model=AIRecommendOrderForSimulationResponse)
def ai_recommend_order_for_simulation(
    payload: AIRecommendOrderForSimulationRequest, _: str = Depends(require_auth)
) -> AIRecommendOrderForSimulationResponse:
    """
    AI recommends a fixed order quantity (units per week) for the given scenario.
    This quantity is then used in Monte Carlo, so the chosen AI model affects the math results.
    """
    prompt = f"""You are a supply chain planner. Given this scenario, recommend a fixed order quantity (units to order every week for the whole horizon).

SCENARIO:
- Planning horizon: {payload.weeks} weeks
- Demand per week: normally distributed, mean {payload.baseline_demand:.0f}, std dev {payload.demand_std_dev:.0f}
- Initial inventory: {payload.initial_inventory:.0f} units
- Initial cash: ${payload.initial_cash:,.0f}
- Sale price: ${payload.sale_price:.0f}/unit, order cost: ${payload.order_cost:.0f}/unit
- Holding cost: ${payload.holding_cost:.0f}/unit/week, stockout penalty: ${payload.stockout_penalty:.0f}/unit
- Weekly fixed cost: ${payload.weekly_fixed_cost:,.0f}, bankruptcy if cash < ${payload.bankruptcy_cash_threshold:,.0f}

What fixed order quantity (one number, same every week) do you recommend? Consider balancing stockouts vs excess inventory and cash.
Reply with only one integer. If you use tags, use <answer>NUMBER</answer>.""".strip()

    raw_response, err, _ = _timed_ai_call("ai.recommend_order_for_simulation", payload.model, prompt)
    if err:
        raise HTTPException(status_code=503, detail=err)
    q = extract_first_int(raw_response or "100")
    # Clamp to sensible range for the simulation
    q = max(20, min(300, q))
    return AIRecommendOrderForSimulationResponse(
        recommended_order_quantity=q,
        model=payload.model,
    )


@app.post("/ai/advisor", response_model=AIAdvisorResponse)
def ai_advisor(payload: AIAdvisorRequest, _: str = Depends(require_auth)) -> AIAdvisorResponse:
    if payload.strategy == Strategy.custom and payload.order_quantity is None:
        raise HTTPException(
            status_code=400,
            detail="order_quantity is required when strategy is custom.",
        )

    compact = run_monte_carlo_compact(
        strategy=payload.strategy,
        simulations=payload.simulations,
        custom_quantity=payload.order_quantity,
        config=_config_from_request(payload),
    )

    bk_pct = compact["bankruptcy_probability"] * 100
    prompt = f"""You are a supply chain risk advisor. Analyze ONLY the numbers below. Do not invent figures.

SIMULATION RESULTS ({payload.simulations} runs, strategy={payload.strategy}):
- Average profit:     ${compact["avg_profit"]:,.0f}
- P10 (bad case):     ${compact["profit_p10"]:,.0f}
- P50 (median):       ${compact["profit_p50"]:,.0f}
- P90 (good case):    ${compact["profit_p90"]:,.0f}
- Worst run:          ${compact["worst_profit"]:,.0f}
- Best run:           ${compact["best_profit"]:,.0f}
- Bankruptcy rate:    {bk_pct:.1f}%
- Avg weekly stockouts: {compact["stockouts_average"]:.2f}

Write 3 short bullet points:
• RISK: one sentence on the biggest risk shown by these numbers
• UPSIDE: one sentence on the best-case scenario
• ACTION: one concrete recommendation to improve the median outcome
Keep each bullet under 25 words.""".strip()

    summary, err, _ = _timed_ai_call("ai.advisor", payload.model, prompt)
    if err:
        raise HTTPException(status_code=503, detail=err)
    return AIAdvisorResponse(
        model=payload.model,
        summary=summary or "",
        compact_metrics=CompactSimulationResponse(**compact),
    )


@app.post("/ai/advisor-summary", response_model=AIAdvisorSummaryResponse)
def ai_advisor_summary(
    payload: AIAdvisorSummaryRequest, _: str = Depends(require_auth)
) -> AIAdvisorSummaryResponse:
    """
    Generate a short AI analysis from already-computed simulation results.
    Used for the initial AI Advisor message without re-running Monte Carlo.
    """
    bk_pct = payload.bankruptcy_probability * 100
    p10 = payload.profit_p10 if payload.profit_p10 is not None else payload.worst_profit
    p50 = payload.profit_p50 if payload.profit_p50 is not None else payload.avg_profit
    p90 = payload.profit_p90 if payload.profit_p90 is not None else payload.best_profit

    prompt = f"""You are a supply chain risk advisor. Analyze ONLY the numbers below. Do not invent figures.

SIMULATION RESULTS ({payload.simulations or "N"} runs, strategy={payload.strategy or "custom"}):
- Average profit:     ${payload.avg_profit:,.0f}
- P10 (bad case):     ${p10:,.0f}
- P50 (median):       ${p50:,.0f}
- P90 (good case):    ${p90:,.0f}
- Worst run:          ${payload.worst_profit:,.0f}
- Best run:           ${payload.best_profit:,.0f}
- Bankruptcy rate:    {bk_pct:.1f}%
- Avg weekly stockouts: {payload.stockouts_average:.2f}

Write 3 short bullet points:
• RISK: one sentence on the biggest risk shown by these numbers
• UPSIDE: one sentence on the best-case scenario
• ACTION: one concrete recommendation to improve the median outcome
Keep each bullet under 25 words.""".strip()

    summary, err, _ = _timed_ai_call("ai.advisor_summary", payload.model, prompt)
    if err:
        raise HTTPException(status_code=503, detail=err)
    return AIAdvisorSummaryResponse(model=payload.model, summary=summary or "")


@app.post("/ai/advisor-distribution", response_model=AIAdvisorDistributionResponse)
def ai_advisor_distribution(
    payload: AIAdvisorRequest, _: str = Depends(require_auth)
) -> AIAdvisorDistributionResponse:
    """AI produces its own estimated profit distribution (plottable alongside math Monte Carlo)."""
    if payload.strategy == Strategy.custom and payload.order_quantity is None:
        raise HTTPException(
            status_code=400,
            detail="order_quantity is required when strategy is custom.",
        )

    compact = run_monte_carlo_compact(
        strategy=payload.strategy,
        simulations=payload.simulations,
        custom_quantity=payload.order_quantity,
        config=_config_from_request(payload),
    )

    bk_pct = compact["bankruptcy_probability"] * 100
    prompt = f"""You are a supply chain analyst. Given the scenario and results below, output a JSON object with a list of profit values.

SCENARIO: strategy={payload.strategy}, {payload.simulations} runs.
MATH MODEL RESULTS: avg profit ${compact["avg_profit"]:,.0f}, P10 ${compact["profit_p10"]:,.0f}, P50 ${compact["profit_p50"]:,.0f}, P90 ${compact["profit_p90"]:,.0f}. Worst ${compact["worst_profit"]:,.0f}, best ${compact["best_profit"]:,.0f}. Bankruptcy {bk_pct:.1f}%.

TASK: Reply with ONLY a single JSON object, no other text. The object must have one key "profits" whose value is an array of about 100 numbers. Each number is one possible profit outcome in dollars for this scenario. Use the math results as guidance but vary the values to form a distribution.

Example format:
{{"profits": [-1200, 3400, 2100, 500, -400, 2800, ...]}}""".strip()

    raw, err, _ = _timed_ai_call("ai.advisor_distribution", payload.model, prompt, max_tokens=2048)
    if err:
        raise HTTPException(status_code=503, detail=err)

    profits = extract_profits_from_json(raw or "")
    if not profits:
        profits = extract_profit_list(raw or "", max_values=250)
    if len(profits) < 15:
        raise HTTPException(
            status_code=503,
            detail=f"AI did not return enough numbers (got {len(profits)}, need at least 15). Expected JSON like {{\"profits\": [ ... ]}}. Try a different model or try again.",
        )

    return AIAdvisorDistributionResponse(model=payload.model, profits=profits)


@app.get("/ai/logs", response_model=list[AILogEntry])
def get_ai_logs(_: str = Depends(require_auth)) -> list[AILogEntry]:
    return AI_LOGS


@app.delete("/ai/logs")
def clear_ai_logs(_: str = Depends(require_auth)) -> dict:
    AI_LOGS.clear()
    return {"status": "cleared"}


@app.post("/data/upload", response_model=DataFileSummary)
async def upload_data_file(
    file: UploadFile = File(...), _: str = Depends(require_auth)
) -> DataFileSummary:
    filename = file.filename or "uploaded_file"
    content = await file.read()
    suffix = filename.lower().split(".")[-1]

    if suffix == "csv":
        columns, rows = parse_csv_bytes(content)
        file_type = "csv"
    elif suffix == "json":
        columns, rows = parse_json_bytes(content)
        file_type = "json"
    elif suffix in {"xlsx", "xlsm", "xltx", "xltm"}:
        columns, rows = parse_excel_bytes(content)
        file_type = "excel"
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Use CSV, JSON, or Excel (.xlsx).",
        )

    summary = summarize_file(
        file_id=str(uuid.uuid4()),
        filename=filename,
        file_type=file_type,
        columns=columns,
        rows=rows,
        uploaded_at=datetime.utcnow().isoformat(),
    )
    DATA_FILES.insert(0, summary)
    RAW_DATA_BY_FILE[summary.id] = rows
    return summary


@app.get("/data/files", response_model=list[DataFileSummary])
def list_data_files(_: str = Depends(require_auth)) -> list[DataFileSummary]:
    return DATA_FILES


@app.delete("/data/files")
def clear_data_files(_: str = Depends(require_auth)) -> dict:
    DATA_FILES.clear()
    RAW_DATA_BY_FILE.clear()
    return {"status": "cleared"}


@app.post("/ai/data-chat", response_model=DataChatResponse)
def ai_data_chat(payload: DataChatRequest, _: str = Depends(require_auth)) -> DataChatResponse:
    if not DATA_FILES:
        raise HTTPException(
            status_code=400,
            detail="No data uploaded yet. Upload CSV/JSON/Excel first.",
        )

    dataset_context_lines = []
    for item in DATA_FILES[:5]:
        dataset_context_lines.append(
            f"- file={item.name}, type={item.file_type}, rows={item.rows}, columns={item.columns}"
        )
        dataset_context_lines.append(f"  sample_rows={item.sample_rows[:2]}")
    dataset_context = "\n".join(dataset_context_lines)

    prompt = f"""
You are a supply chain data advisor.
Use ONLY the provided dataset summaries and samples.
If the answer is not present, say clearly what additional data is needed.

Dataset context:
{dataset_context}

User question:
{payload.message}
""".strip()

    answer, err, _ = _timed_ai_call("ai.data_chat", payload.model, prompt)
    if err:
        raise HTTPException(status_code=503, detail=err)
    return DataChatResponse(model=payload.model, answer=answer or "")


@app.post("/ai/sim-chat", response_model=SimChatResponse)
def sim_chat(payload: SimChatRequest, _: str = Depends(require_auth)) -> SimChatResponse:
    """
    Interactive AI chat about the current simulation results.
    Keeps conversation history and provides context-aware explanations
    of why the math produces good or bad outcomes.
    """
    # Build simulation context block
    ctx_lines: list[str] = []
    if payload.avg_profit is not None:
        n = payload.actual_simulations or payload.simulations or 0
        bk_pct = (payload.bankruptcy_probability or 0) * 100
        avg = payload.avg_profit
        verdict = (
            "FAILING — majority of runs go bankrupt or lose money"
            if bk_pct > 40
            else "RISKY — significant bankruptcy exposure"
            if bk_pct > 15
            else "MARGINAL — thin positive margins with meaningful downside"
            if avg < 2000
            else "HEALTHY — positive expected return with manageable risk"
        )

        ctx_lines = [
            f"SIMULATION RESULTS ({n:,} Monte Carlo runs, strategy={payload.strategy}):",
            f"  Verdict: {verdict}",
            f"  Average profit:    ${avg:,.0f}",
            f"  Std deviation (σ): ${payload.profit_std_dev or 0:,.0f}",
            f"  VaR 95% (P05):     ${payload.profit_p05 or 0:,.0f}  (worst 5% of scenarios)",
            f"  P10 bad case:      ${payload.profit_p10 or 0:,.0f}",
            f"  P50 median:        ${payload.profit_p50 or 0:,.0f}",
            f"  P90 good case:     ${payload.profit_p90 or 0:,.0f}",
            f"  Best run:          ${payload.best_profit or 0:,.0f}",
            f"  Worst run:         ${payload.worst_profit or 0:,.0f}",
            f"  Bankruptcy rate:   {bk_pct:.1f}%  ({payload.bankruptcy_count or 0} / {n} runs went bankrupt)",
            f"  Avg weekly stockouts: {payload.stockouts_average or 0:.2f}",
            "",
            "ECONOMICS:",
            f"  Sale price:       ${payload.sale_price or 0:.0f}/unit",
            f"  Order cost:       ${payload.order_cost or 10:.0f}/unit",
            f"  Gross margin:     ${(payload.sale_price or 50) - (payload.order_cost or 10):.0f}/unit",
            f"  Weekly fixed cost: ${payload.weekly_fixed_cost or 0:,.0f}",
            f"  Starting cash:    ${payload.initial_cash or 0:,.0f}",
            f"  Bankruptcy threshold: ${payload.bankruptcy_cash_threshold or 0:,.0f}",
            "",
            "KEY MATH (balanced strategy, 100 units demand/week):",
            f"  Weekly revenue ≈ 100 × ${payload.sale_price or 50} = ${100*(payload.sale_price or 50):,.0f}",
            f"  Weekly order cost ≈ 120 × ${payload.order_cost or 10} = ${120*(payload.order_cost or 10):,.0f}",
            f"  Weekly gross profit ≈ ${100*((payload.sale_price or 50)-(payload.order_cost or 10)):,.0f}",
            f"  Weekly fixed overhead = ${payload.weekly_fixed_cost or 0:,.0f}",
            f"  Weekly net (before disruptions) ≈ ${100*((payload.sale_price or 50)-(payload.order_cost or 10)) - (payload.weekly_fixed_cost or 0):,.0f}",
        ]

    context_block = "\n".join(ctx_lines) if ctx_lines else "(No simulation data yet.)"

    # Build conversation history block
    history_block = ""
    for msg in payload.history[-8:]:  # keep last 8 exchanges to stay in context window
        role = "User" if msg.role == "user" else "Advisor"
        history_block += f"\n{role}: {msg.content}"

    system = (
        "You are an expert supply chain risk advisor and Monte Carlo statistician. "
        "You explain financial math, probability, and supply chain dynamics in plain, direct language. "
        "When bankruptcy is high, explain the specific math causing it. "
        "When profits are good, explain why the strategy works. "
        "Keep responses to 3-5 sentences maximum. Be specific with numbers from the data."
    )

    prompt = f"""{system}

{context_block}
{history_block}
User: {payload.message}
Advisor:"""

    answer, err, _ = _timed_ai_call("ai.sim_chat", payload.model, prompt)
    if err:
        raise HTTPException(status_code=503, detail=err)
    return SimChatResponse(model=payload.model, answer=(answer or "").strip())


@app.post("/theory/report", response_model=TheoryReportResponse)
def theory_report(
    payload: TheoryReportRequest, _: str = Depends(require_auth)
) -> TheoryReportResponse:
    if payload.strategy == Strategy.custom and payload.order_quantity is None:
        raise HTTPException(
            status_code=400,
            detail="order_quantity is required when strategy is custom.",
        )

    config = _config_from_request(payload)
    analysis_simulations = min(payload.simulations, 600)
    full = run_monte_carlo(
        strategy=payload.strategy,
        simulations=analysis_simulations,
        custom_quantity=payload.order_quantity,
        config=config,
    )

    profits = full["profits"]
    expected_profit, ci_low, ci_high = _profit_confidence_interval(
        profits, payload.confidence_level
    )
    profit_std_dev = pstdev(profits) if len(profits) > 1 else 0.0
    bankruptcy_probability, bp_low, bp_high = _bankruptcy_confidence_interval(
        full["bankruptcy_count"], analysis_simulations, payload.confidence_level
    )
    required_n = _required_simulations_for_error(
        profit_std_dev, payload.confidence_level, payload.target_margin_of_error
    )

    factor_impacts = _factor_impact_analysis(
        strategy=payload.strategy,
        custom_quantity=payload.order_quantity,
        config=config,
        baseline_avg_profit=expected_profit,
        baseline_bankruptcy_probability=bankruptcy_probability,
        simulations=max(120, analysis_simulations // 2),
    )

    notes = [
        "Simple Monte Carlo estimator: E[X] approximated by sample mean of independent runs.",
        "Profit confidence interval uses CLT approximation: mean ± z * sigma / sqrt(n).",
        "Bankruptcy interval uses normal approximation for Bernoulli proportion.",
        f"Required simulations target uses n >= (z*sigma/epsilon)^2 with epsilon={payload.target_margin_of_error}.",
        f"Factor sensitivity computed with one-at-a-time stressed scenarios over {max(120, analysis_simulations // 2)} runs each.",
    ]

    ai_explanation = None
    if payload.model:
        factor_lines = "\n".join(
            [
                f"{f.factor}: delta_profit={f.delta_avg_profit:.2f}, delta_bankruptcy={f.delta_bankruptcy_probability:.4f}"
                for f in factor_impacts
            ]
        )
        prompt = f"""
You are a quantitative supply-chain analyst.
Explain these Monte Carlo results in plain but rigorous language.
Use only the values provided.

expected_profit={expected_profit:.2f}
profit_std_dev={profit_std_dev:.2f}
profit_ci=[{ci_low:.2f}, {ci_high:.2f}]
bankruptcy_probability={bankruptcy_probability:.4f}
bankruptcy_ci=[{bp_low:.4f}, {bp_high:.4f}]
required_simulations={required_n}
factor_impacts:
{factor_lines}

Write:
1) one short pure-math interpretation
2) one short practical real-world interpretation
3) two concrete recommendations
""".strip()
        ai_explanation, _, _ = _timed_ai_call("ai.theory_report", payload.model, prompt)

    return TheoryReportResponse(
        expected_profit=expected_profit,
        profit_std_dev=profit_std_dev,
        confidence_interval_low=ci_low,
        confidence_interval_high=ci_high,
        bankruptcy_probability=bankruptcy_probability,
        bankruptcy_confidence_interval_low=bp_low,
        bankruptcy_confidence_interval_high=bp_high,
        required_simulations_for_target_error=required_n,
        mathematical_notes=notes,
        factor_impacts=factor_impacts,
        ai_explanation=ai_explanation,
    )


@app.post("/simulate/stable", response_model=SimulationResponse)
def simulate_stable(
    payload: SimulationRequest, _: str = Depends(require_auth)
) -> SimulationResponse:
    if payload.strategy == Strategy.custom and payload.order_quantity is None:
        raise HTTPException(
            status_code=400,
            detail="order_quantity is required when strategy is custom.",
        )
    result = run_monte_carlo_stable(
        strategy=payload.strategy,
        simulations=payload.simulations,
        custom_quantity=payload.order_quantity,
        config=_config_from_request(payload),
    )
    return SimulationResponse(**result)


@app.post("/auth/register", response_model=AuthResponse)
def auth_register(payload: AuthRegisterRequest) -> AuthResponse:
    try:
        register_user(payload.username, payload.password)
    except Exception:
        raise HTTPException(status_code=400, detail="Username already exists.")
    token = login_user(payload.username, payload.password)
    if token is None:
        raise HTTPException(status_code=500, detail="Registration failed.")
    return AuthResponse(token=token, username=payload.username)


@app.post("/auth/login", response_model=AuthResponse)
def auth_login(payload: AuthLoginRequest) -> AuthResponse:
    token = login_user(payload.username, payload.password)
    if token is None:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    return AuthResponse(token=token, username=payload.username)


@app.post("/auth/guest", response_model=AuthResponse)
def auth_guest() -> AuthResponse:
    guest_username = "guest"
    guest_password = "guest-pass-1234"
    try:
        register_user(guest_username, guest_password)
    except Exception:
        # Guest user already exists; proceed to login.
        pass
    token = login_user(guest_username, guest_password)
    if token is None:
        raise HTTPException(status_code=500, detail="Could not create guest session.")
    return AuthResponse(token=token, username=guest_username)


def _to_float(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().replace(",", "")
        if cleaned == "":
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


@app.post("/ai/process-file/{file_id}", response_model=ProcessFileResponse)
def ai_process_file(
    file_id: str,
    payload: ProcessFileRequest,
    _: str = Depends(require_auth),
) -> ProcessFileResponse:
    file_meta = next((f for f in DATA_FILES if f.id == file_id), None)
    if file_meta is None:
        raise HTTPException(status_code=404, detail="File not found.")
    raw_rows = RAW_DATA_BY_FILE.get(file_id, [])
    if not raw_rows:
        raise HTTPException(status_code=400, detail="No raw rows available for this file.")

    lower_columns = {col.lower(): col for col in file_meta.columns}
    mapping = {
        "date": next((v for k, v in lower_columns.items() if "date" in k), None),
        "sku": next((v for k, v in lower_columns.items() if "sku" in k or "product" in k), None),
        "demand": next((v for k, v in lower_columns.items() if "demand" in k or "sales" in k), None),
        "inventory": next((v for k, v in lower_columns.items() if "inventory" in k or "stock" in k), None),
        "cash": next((v for k, v in lower_columns.items() if "cash" in k or "balance" in k), None),
        "cost": next((v for k, v in lower_columns.items() if "cost" in k or "expense" in k), None),
    }

    processed_rows = []
    for row in raw_rows[:2000]:
        processed_rows.append(
            {
                "date": row.get(mapping["date"]) if mapping["date"] else None,
                "sku": row.get(mapping["sku"]) if mapping["sku"] else None,
                "demand": _to_float(row.get(mapping["demand"])) if mapping["demand"] else None,
                "inventory": _to_float(row.get(mapping["inventory"])) if mapping["inventory"] else None,
                "cash": _to_float(row.get(mapping["cash"])) if mapping["cash"] else None,
                "cost": _to_float(row.get(mapping["cost"])) if mapping["cost"] else None,
            }
        )

    prompt = f"""
You are a data operations assistant.
Given this inferred column mapping and processed sample rows, suggest short notes on data quality
and what to do next before forecasting.

mapping={mapping}
sample_rows={processed_rows[:10]}
Return 3 concise bullet points.
""".strip()

    ai_notes, _, _ = _timed_ai_call("ai.process_file", payload.model, prompt)

    return ProcessFileResponse(
        file_id=file_id,
        inferred_mapping=mapping,
        processed_row_count=len(processed_rows),
        processed_sample_rows=processed_rows[:20],
        ai_notes=ai_notes,
    )


# ── Serve frontend when built (e.g. full app on Heroku) ─────────────────────
_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(_frontend_dist):
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
else:

    def _root_html() -> str:
        frontend_url = os.getenv("FRONTEND_URL", "").strip()
        link = frontend_url if frontend_url else "https://your-app.vercel.app"
        return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Supply Chain API</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 42rem; margin: 4rem auto; padding: 0 1rem; color: #1e293b; }}
  h1 {{ font-size: 1.25rem; color: #0f172a; }}
  p {{ line-height: 1.6; color: #475569; }}
  a {{ color: #2563eb; }}
  .box {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem; margin-top: 1.5rem; }}
</style>
</head>
<body>
  <h1>Supply Chain Command Center — API</h1>
  <p>This is the <strong>backend API</strong>. The app runs at the same origin when deployed with frontend (e.g. Heroku full stack).</p>
  <div class="box">
    <p><strong>Frontend URL:</strong><br><a href="{link}" target="_blank" rel="noopener">{link}</a></p>
  </div>
  <p style="margin-top: 1.5rem;"><a href="/docs">API docs (Swagger)</a> · <a href="/health">Health</a></p>
</body>
</html>"""

    @app.get("/", response_class=HTMLResponse)
    def _root() -> str:
        return _root_html()
