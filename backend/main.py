from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from ai_agent import OllamaUnavailableError, extract_first_int, generate_text
from models import (
    AIAdvisorRequest,
    AIAdvisorResponse,
    AIOrderAdviceRequest,
    AIOrderAdviceResponse,
    CompactSimulationResponse,
    SimulationRequest,
    SimulationResponse,
    Strategy,
)
from simulator import run_monte_carlo, run_monte_carlo_compact


app = FastAPI(title="Supply Chain Uncertainty Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok"}


@app.post("/simulate", response_model=SimulationResponse)
def simulate(payload: SimulationRequest) -> SimulationResponse:
    if payload.strategy == Strategy.custom and payload.order_quantity is None:
        raise HTTPException(
            status_code=400,
            detail="order_quantity is required when strategy is custom.",
        )

    result = run_monte_carlo(
        strategy=payload.strategy,
        simulations=payload.simulations,
        custom_quantity=payload.order_quantity,
    )
    return SimulationResponse(**result)


@app.post("/simulate/compact", response_model=CompactSimulationResponse)
def simulate_compact(payload: SimulationRequest) -> CompactSimulationResponse:
    if payload.strategy == Strategy.custom and payload.order_quantity is None:
        raise HTTPException(
            status_code=400,
            detail="order_quantity is required when strategy is custom.",
        )

    result = run_monte_carlo_compact(
        strategy=payload.strategy,
        simulations=payload.simulations,
        custom_quantity=payload.order_quantity,
    )
    return CompactSimulationResponse(**result)


@app.post("/ai/order-advice", response_model=AIOrderAdviceResponse)
def ai_order_advice(payload: AIOrderAdviceRequest) -> AIOrderAdviceResponse:
    prompt = f"""
You are a supply chain advisor.
Inventory: {payload.inventory}
Demand trend: {payload.demand_trend}
Cash: {payload.cash}

How many units should we order next week?
Return only a number.
""".strip()

    try:
        raw_response = generate_text(prompt=prompt, model=payload.model)
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return AIOrderAdviceResponse(
        recommended_order_units=extract_first_int(raw_response),
        model=payload.model,
        raw_response=raw_response,
    )


@app.post("/ai/advisor", response_model=AIAdvisorResponse)
def ai_advisor(payload: AIAdvisorRequest) -> AIAdvisorResponse:
    if payload.strategy == Strategy.custom and payload.order_quantity is None:
        raise HTTPException(
            status_code=400,
            detail="order_quantity is required when strategy is custom.",
        )

    compact = run_monte_carlo_compact(
        strategy=payload.strategy,
        simulations=payload.simulations,
        custom_quantity=payload.order_quantity,
    )

    prompt = f"""
You are a supply chain uncertainty advisor.
Use ONLY these simulation outputs; do not invent numbers.

strategy: {payload.strategy}
simulations: {payload.simulations}
avg_profit: {compact["avg_profit"]:.2f}
worst_profit: {compact["worst_profit"]:.2f}
best_profit: {compact["best_profit"]:.2f}
bankruptcy_probability: {compact["bankruptcy_probability"]:.4f}
stockouts_average: {compact["stockouts_average"]:.3f}
profit_p10: {compact["profit_p10"]:.2f}
profit_p50: {compact["profit_p50"]:.2f}
profit_p90: {compact["profit_p90"]:.2f}

Write a concise advisory paragraph that:
1) explains why this strategy is risky or resilient
2) highlights downside risk
3) suggests one concrete change to reduce bankruptcy risk
""".strip()

    try:
        summary = generate_text(prompt=prompt, model=payload.model)
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return AIAdvisorResponse(
        model=payload.model,
        summary=summary,
        compact_metrics=CompactSimulationResponse(**compact),
    )
