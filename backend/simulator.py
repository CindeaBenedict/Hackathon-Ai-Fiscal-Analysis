"""
Monte Carlo supply chain simulation — mathematical model.

1. Weekly demand: D_t ~ max(0, N(μ, σ²))
2. Inventory: I_t_raw = I_{t-1} + A_t - D_t,  I_t = max(0, I_t_raw)
3. Stockout: Stockout_t = max(0, D_t - (I_{t-1} + A_t))
4. Sold: S_t = min(D_t, I_{t-1} + A_t)
5. Weekly profit: Π_t = p·S_t - c_o·Q_t - c_h·I_t - c_s·Stockout_t - c_f
6. Total profit: Π = sum_{t=1..T} Π_t
7. Monte Carlo: μ̂_Π = (1/N) Σ Π^(i),  σ̂ = sqrt(Σ(Π^(i)-μ̂)²/(N-1))
8. CI 95%: μ̂_Π ± 1.96·σ̂/√N
9. VaR 95%: 5th percentile of Π
10. CVaR 95%: mean of worst 5% of outcomes
11. Bankruptcy: P(bankrupt) = (1/N) Σ 1(Π^(i) < B)
12. Sharpe ratio: (μ̂_Π) / σ̂  (risk-free = 0 for simplicity)
13. Sortino ratio: μ̂_Π / σ_downside  (only negative deviations)
14. Max drawdown: largest peak-to-trough in cumulative weekly cash
15. Service level: fraction of weeks with zero stockouts
16. Skewness: m3 / σ³  (asymmetry of profit distribution)
17. Kurtosis: m4 / σ⁴ − 3  (excess kurtosis; tail heaviness)
"""
import hashlib
import random
from dataclasses import dataclass, field
from typing import Dict, List, Tuple
import math

from models import Strategy


TOTAL_WEEKS = 12
INITIAL_INVENTORY = 150.0
INITIAL_CASH = 5_000.0   # Small brewery, tight cash — creates ~20% realistic bankruptcy risk
BASELINE_DEMAND = 100.0

HOLDING_COST = 2.0
STOCKOUT_PENALTY = 25.0
ORDER_COST = 10.0
SALE_PRICE = 50.0  # Premium brewery; gross margin = $40/unit

BASE_LEAD_TIME = 1


@dataclass
class SupplyChainState:
    inventory: float = INITIAL_INVENTORY
    cash: float = INITIAL_CASH
    orders_in_transit: List[Tuple[int, float]] = field(default_factory=list)
    weekly_demand_history: List[float] = field(default_factory=list)
    stockouts: int = 0


@dataclass
class SimulationConfig:
    initial_inventory: float = INITIAL_INVENTORY
    initial_cash: float = INITIAL_CASH
    baseline_demand: float = BASELINE_DEMAND
    demand_std_dev: float = 25.0       # Realistic demand variance
    lead_time_weeks: int = BASE_LEAD_TIME
    holding_cost: float = HOLDING_COST
    stockout_penalty: float = STOCKOUT_PENALTY
    order_cost: float = ORDER_COST
    sale_price: float = SALE_PRICE
    weekly_fixed_cost: float = 3200.0  # Overhead: staff, rent, wages — creates ~20% bankruptcy rate
    bankruptcy_cash_threshold: float = 500.0  # Cash below $500 = bankrupt
    supplier_delay_probability: float = 0.10
    demand_spike_probability: float = 0.05
    demand_drop_probability: float = 0.05
    production_loss_probability: float = 0.02
    demand_spike_multiplier: float = 1.5
    demand_drop_multiplier: float = 0.5
    production_loss_fraction: float = 0.2


def _strategy_quantity(strategy: Strategy, custom_quantity: int | None) -> int:
    # Conservative = safety buffer above demand → fewer stockouts, more stable.
    # Aggressive = lean (below demand) → more stockouts, riskier.
    if strategy == Strategy.conservative:
        return 120
    if strategy == Strategy.balanced:
        return 100
    if strategy == Strategy.aggressive:
        return 80
    return custom_quantity if custom_quantity is not None else 100


def _apply_disruption_events(
    state: SupplyChainState, demand: float, config: SimulationConfig
) -> tuple[float, int]:
    """
    Apply independent disruption events and return:
    - adjusted demand
    - additional lead time for the order that will be placed this week
    """
    adjusted_demand = demand
    lead_time_extra = 0

    # 5% chance demand spike
    if random.random() < config.demand_spike_probability:
        adjusted_demand *= config.demand_spike_multiplier

    # 5% chance demand drop
    if random.random() < config.demand_drop_probability:
        adjusted_demand *= config.demand_drop_multiplier

    # 2% chance production loss: lose 20% of current inventory
    if random.random() < config.production_loss_probability:
        state.inventory *= 1.0 - config.production_loss_fraction

    # 10% chance supplier delay: +1 week lead time for this week's order
    if random.random() < config.supplier_delay_probability:
        lead_time_extra = 1

    return adjusted_demand, lead_time_extra


def simulate_single_run(
    strategy: Strategy,
    config: SimulationConfig,
    custom_quantity: int | None = None,
) -> Dict:
    state = SupplyChainState(
        inventory=config.initial_inventory,
        cash=config.initial_cash,
    )
    order_quantity = float(_strategy_quantity(strategy, custom_quantity))
    inventory_trace: List[float] = [state.inventory]
    cash_trace: List[float] = [state.cash]
    weekly_stockout_flags: List[bool] = []
    bankrupt = False
    bankruptcy_week: int | None = None

    for week in range(1, TOTAL_WEEKS + 1):
        # 1) Receive arriving orders
        arrivals = [qty for arrival_week, qty in state.orders_in_transit if arrival_week == week]
        state.inventory += sum(arrivals)
        state.orders_in_transit = [
            (arrival_week, qty)
            for arrival_week, qty in state.orders_in_transit
            if arrival_week > week
        ]

        # 2) Generate stochastic demand around baseline
        demand = random.gauss(config.baseline_demand, config.demand_std_dev)
        demand = max(0.0, demand)

        # 7) Add random disruption events (applies to demand/inventory/lead time)
        demand, lead_time_extra = _apply_disruption_events(state, demand, config)
        state.weekly_demand_history.append(demand)

        # 3) Fulfill demand from inventory
        fulfilled = min(state.inventory, demand)
        missing = max(0.0, demand - state.inventory)
        state.inventory -= fulfilled

        # Revenue from fulfilled demand
        state.cash += fulfilled * config.sale_price

        # 4) Stockout penalty if unmet demand
        if missing > 0:
            state.stockouts += 1
            state.cash -= missing * config.stockout_penalty
            weekly_stockout_flags.append(True)
        else:
            weekly_stockout_flags.append(False)

        # 5) Holding cost on remaining inventory
        state.cash -= state.inventory * config.holding_cost

        # Operational fixed cost (staff, utilities, overhead)
        state.cash -= config.weekly_fixed_cost

        # 6) Place new order based on strategy — only if we can afford it
        max_affordable = max(0, int(state.cash / config.order_cost))
        order_actual = min(order_quantity, max_affordable)
        state.cash -= order_actual * config.order_cost
        if order_actual > 0:
            arrival_week = week + config.lead_time_weeks + lead_time_extra
            state.orders_in_transit.append((arrival_week, float(order_actual)))

        if state.cash < config.bankruptcy_cash_threshold:
            bankrupt = True
            if bankruptcy_week is None:
                bankruptcy_week = week

        inventory_trace.append(state.inventory)
        cash_trace.append(state.cash)

    profit = state.cash - config.initial_cash

    # Max drawdown from cumulative cash trace
    peak = cash_trace[0]
    max_dd = 0.0
    for c in cash_trace[1:]:
        if c > peak:
            peak = c
        dd = peak - c
        if dd > max_dd:
            max_dd = dd

    service_level = 1.0 - (sum(weekly_stockout_flags) / max(len(weekly_stockout_flags), 1))

    return {
        "profit": profit,
        "stockouts": state.stockouts,
        "inventory_trace": inventory_trace,
        "cash_trace": cash_trace,
        "bankrupt": bankrupt,
        "bankruptcy_week": bankruptcy_week,
        "max_drawdown": max_dd,
        "service_level": service_level,
    }


def run_monte_carlo(
    strategy: Strategy,
    simulations: int = 100,
    custom_quantity: int | None = None,
    config: SimulationConfig | None = None,
) -> Dict:
    simulation_config = config or SimulationConfig()
    # Deterministic seed so same inputs always give same results
    param_str = (
        f"{strategy.value}:{simulations}:{custom_quantity or 0}:"
        f"{simulation_config.baseline_demand}:{simulation_config.demand_std_dev}:"
        f"{simulation_config.weekly_fixed_cost}:{simulation_config.initial_cash}"
    )
    seed = int(hashlib.md5(param_str.encode()).hexdigest()[:8], 16)
    random.seed(seed)

    run_results: List[Dict] = [
        simulate_single_run(
            strategy=strategy,
            custom_quantity=custom_quantity,
            config=simulation_config,
        )
        for _ in range(simulations)
    ]

    profits = [result["profit"] for result in run_results]
    stockout_counts = [result["stockouts"] for result in run_results]
    inventory_traces = [result["inventory_trace"] for result in run_results]

    bankruptcies = sum(1 for result in run_results if result["bankrupt"])

    return {
        "avg_profit": sum(profits) / len(profits),
        "best_profit": max(profits),
        "worst_profit": min(profits),
        "stockouts_average": sum(stockout_counts) / len(stockout_counts),
        "bankruptcy_probability": bankruptcies / len(profits),
        "bankruptcy_count": bankruptcies,
        "inventory_traces": inventory_traces,
        "profits": profits,
    }


def run_monte_carlo_stable(
    strategy: Strategy,
    simulations: int = 100,
    custom_quantity: int | None = None,
    config: SimulationConfig | None = None,
    min_simulations: int = 500,
    max_simulations: int = 10000,
    target_profit_ci_half_width: float = 800.0,
    target_bankruptcy_ci_half_width: float = 0.015,
) -> Dict:
    """
    Adaptive Monte Carlo loop:
    keep sampling until confidence interval widths become stable.
    """
    simulation_config = config or SimulationConfig()
    # Deterministic seed so same inputs always give same results
    param_str = (
        f"{strategy.value}:{simulations}:{custom_quantity or 0}:"
        f"{simulation_config.baseline_demand}:{simulation_config.demand_std_dev}:"
        f"{simulation_config.weekly_fixed_cost}:{simulation_config.initial_cash}"
    )
    seed = int(hashlib.md5(param_str.encode()).hexdigest()[:8], 16)
    random.seed(seed)

    batch_size = max(100, simulations)
    run_results: List[Dict] = []

    while len(run_results) < max_simulations:
        for _ in range(batch_size):
            run_results.append(
                simulate_single_run(
                    strategy=strategy,
                    custom_quantity=custom_quantity,
                    config=simulation_config,
                )
            )

        if len(run_results) < min_simulations:
            continue

        profits = [r["profit"] for r in run_results]
        mean_profit = sum(profits) / len(profits)
        n_run = len(profits)
        if n_run >= 2:
            variance = sum((p - mean_profit) ** 2 for p in profits) / (n_run - 1)
            std_profit = math.sqrt(max(variance, 0.0))
        else:
            std_profit = 0.0
        profit_ci_half_width = 1.96 * std_profit / math.sqrt(n_run) if n_run > 0 else float("inf")

        bankruptcies = sum(1 for r in run_results if r["bankrupt"])
        p_hat = bankruptcies / len(run_results)
        bankruptcy_ci_half_width = (
            1.96 * math.sqrt(max(p_hat * (1 - p_hat) / len(run_results), 0.0))
        )

        if (
            profit_ci_half_width <= target_profit_ci_half_width
            and bankruptcy_ci_half_width <= target_bankruptcy_ci_half_width
        ):
            break

    profits = [result["profit"] for result in run_results]
    stockout_counts = [result["stockouts"] for result in run_results]
    inventory_traces = [result["inventory_trace"] for result in run_results]
    bankruptcies = sum(1 for result in run_results if result["bankrupt"])
    bankruptcy_weeks = [r["bankruptcy_week"] for r in run_results if r["bankruptcy_week"] is not None]
    max_drawdowns = [r["max_drawdown"] for r in run_results]
    service_levels = [r["service_level"] for r in run_results]

    n = len(profits)
    mean_p = sum(profits) / n
    if n >= 2:
        variance = sum((p - mean_p) ** 2 for p in profits) / (n - 1)
        std_p = math.sqrt(max(variance, 0.0))
    else:
        std_p = 0.0
    p_hat = bankruptcies / n

    se = std_p / math.sqrt(n) if n > 0 else 0.0
    profit_ci_half_width = 1.96 * se

    trace_sample = inventory_traces[:20] if len(inventory_traces) > 20 else inventory_traces

    skew = _skewness(profits, mean_p, std_p)
    kurt = _kurtosis(profits, mean_p, std_p)
    sharpe = _sharpe_ratio(mean_p, std_p)
    sortino = _sortino_ratio(mean_p, profits)
    avg_max_dd = sum(max_drawdowns) / n if n > 0 else 0.0
    avg_service_level = sum(service_levels) / n if n > 0 else 0.0
    avg_bankruptcy_week = sum(bankruptcy_weeks) / len(bankruptcy_weeks) if bankruptcy_weeks else None

    return {
        "avg_profit": mean_p,
        "best_profit": max(profits),
        "worst_profit": min(profits),
        "profit_std_dev": std_p,
        "profit_p05": _percentile(profits, 0.05),
        "profit_p10": _percentile(profits, 0.10),
        "profit_p25": _percentile(profits, 0.25),
        "profit_p50": _percentile(profits, 0.50),
        "profit_p75": _percentile(profits, 0.75),
        "profit_p90": _percentile(profits, 0.90),
        "profit_p95": _percentile(profits, 0.95),
        "profit_cvar95": _cvar95(profits),
        "profit_skewness": skew,
        "profit_kurtosis": kurt,
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "avg_max_drawdown": avg_max_dd,
        "avg_service_level": avg_service_level,
        "avg_bankruptcy_week": avg_bankruptcy_week,
        "stockouts_average": sum(stockout_counts) / n,
        "bankruptcy_probability": p_hat,
        "bankruptcy_count": bankruptcies,
        "actual_simulations": n,
        "profit_ci_half_width": profit_ci_half_width,
        "profit_ci_low": mean_p - profit_ci_half_width,
        "profit_ci_high": mean_p + profit_ci_half_width,
        "bankruptcy_ci_half_width": 1.96 * math.sqrt(max(p_hat * (1 - p_hat) / n, 0.0)),
        "inventory_traces": trace_sample,
        "profits": profits,
    }


def _percentile(values: List[float], q: float) -> float:
    """Quantile q in [0,1] with linear interpolation."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if q <= 0:
        return ordered[0]
    if q >= 1:
        return ordered[-1]
    pos = (len(ordered) - 1) * q
    lower = int(math.floor(pos))
    upper = int(math.ceil(pos))
    if lower == upper:
        return ordered[lower]
    weight = pos - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def _cvar95(profits: List[float]) -> float:
    """CVaR 95%: mean of the worst 5% of profit outcomes (Expected Shortfall)."""
    if not profits:
        return 0.0
    ordered = sorted(profits)
    k = max(1, math.ceil(0.05 * len(ordered)))
    return sum(ordered[:k]) / k


def _skewness(values: List[float], mean: float, std: float) -> float:
    """Sample skewness (Fisher). Positive = right tail, negative = left tail."""
    n = len(values)
    if n < 3 or std == 0:
        return 0.0
    m3 = sum((v - mean) ** 3 for v in values) / n
    return m3 / (std ** 3)


def _kurtosis(values: List[float], mean: float, std: float) -> float:
    """Excess kurtosis (Fisher). >0 = heavy tails, <0 = light tails. Normal = 0."""
    n = len(values)
    if n < 4 or std == 0:
        return 0.0
    m4 = sum((v - mean) ** 4 for v in values) / n
    return (m4 / (std ** 4)) - 3.0


def _sharpe_ratio(mean: float, std: float) -> float | None:
    """Sharpe ratio (risk-free = 0). None if std is 0."""
    if std == 0:
        return None
    return mean / std


def _sortino_ratio(mean: float, values: List[float]) -> float | None:
    """Sortino ratio: mean / downside deviation (target = 0)."""
    negatives = [v for v in values if v < 0]
    if not negatives:
        return None if mean == 0 else float("inf") if mean > 0 else float("-inf")
    downside_var = sum(v ** 2 for v in negatives) / len(values)
    downside_std = math.sqrt(max(downside_var, 0.0))
    if downside_std == 0:
        return None
    return mean / downside_std


def _mean_trace(traces: List[List[float]]) -> List[float]:
    if not traces:
        return []
    width = len(traces[0])
    means: List[float] = []
    for i in range(width):
        means.append(sum(trace[i] for trace in traces) / len(traces))
    return means


def run_monte_carlo_compact(
    strategy: Strategy,
    simulations: int = 100,
    custom_quantity: int | None = None,
    config: SimulationConfig | None = None,
) -> Dict:
    """
    Compact version for mobile clients:
    returns aggregated metrics and summarized traces/histogram only.
    """
    full = run_monte_carlo(
        strategy=strategy,
        simulations=simulations,
        custom_quantity=custom_quantity,
        config=config,
    )
    profits: List[float] = full["profits"]
    traces: List[List[float]] = full["inventory_traces"]

    bins_count = 8
    min_profit = min(profits)
    max_profit = max(profits)
    spread = max(max_profit - min_profit, 1.0)
    bin_size = spread / bins_count
    bins = [0 for _ in range(bins_count)]
    for value in profits:
        index = int((value - min_profit) / bin_size)
        if index == bins_count:
            index -= 1
        bins[index] += 1

    return {
        "avg_profit": full["avg_profit"],
        "best_profit": full["best_profit"],
        "worst_profit": full["worst_profit"],
        "stockouts_average": full["stockouts_average"],
        "bankruptcy_probability": full["bankruptcy_probability"],
        "bankruptcy_count": full["bankruptcy_count"],
        "profit_p10": _percentile(profits, 0.10),
        "profit_p50": _percentile(profits, 0.50),
        "profit_p90": _percentile(profits, 0.90),
        "avg_inventory_trace": _mean_trace(traces),
        "profit_histogram_bins": bins,
        "profit_histogram_edges": [
            min_profit + (i * bin_size) for i in range(bins_count + 1)
        ],
    }
