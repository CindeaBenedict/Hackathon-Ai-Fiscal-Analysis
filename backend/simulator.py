import random
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from models import Strategy


TOTAL_WEEKS = 12
INITIAL_INVENTORY = 150.0
INITIAL_CASH = 100_000.0
BASELINE_DEMAND = 100.0

HOLDING_COST = 2.0
STOCKOUT_PENALTY = 20.0
ORDER_COST = 10.0
SALE_PRICE = 35.0

BASE_LEAD_TIME = 1


@dataclass
class SupplyChainState:
    inventory: float = INITIAL_INVENTORY
    cash: float = INITIAL_CASH
    orders_in_transit: List[Tuple[int, float]] = field(default_factory=list)
    weekly_demand_history: List[float] = field(default_factory=list)
    stockouts: int = 0


def _strategy_quantity(strategy: Strategy, custom_quantity: int | None) -> int:
    if strategy == Strategy.conservative:
        return 150
    if strategy == Strategy.balanced:
        return 120
    if strategy == Strategy.aggressive:
        return 100
    return custom_quantity if custom_quantity is not None else 120


def _apply_disruption_events(state: SupplyChainState, demand: float) -> tuple[float, int]:
    """
    Apply independent disruption events and return:
    - adjusted demand
    - additional lead time for the order that will be placed this week
    """
    adjusted_demand = demand
    lead_time_extra = 0

    # 5% chance demand spike
    if random.random() < 0.05:
        adjusted_demand *= 1.5

    # 5% chance demand drop
    if random.random() < 0.05:
        adjusted_demand *= 0.5

    # 2% chance production loss: lose 20% of current inventory
    if random.random() < 0.02:
        state.inventory *= 0.8

    # 10% chance supplier delay: +1 week lead time for this week's order
    if random.random() < 0.10:
        lead_time_extra = 1

    return adjusted_demand, lead_time_extra


def simulate_single_run(strategy: Strategy, custom_quantity: int | None = None) -> Dict:
    state = SupplyChainState()
    order_quantity = float(_strategy_quantity(strategy, custom_quantity))
    inventory_trace: List[float] = [state.inventory]

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
        demand = random.gauss(BASELINE_DEMAND, 15.0)
        demand = max(0.0, demand)

        # 7) Add random disruption events (applies to demand/inventory/lead time)
        demand, lead_time_extra = _apply_disruption_events(state, demand)
        state.weekly_demand_history.append(demand)

        # 3) Fulfill demand from inventory
        fulfilled = min(state.inventory, demand)
        missing = max(0.0, demand - state.inventory)
        state.inventory -= fulfilled

        # Revenue from fulfilled demand
        state.cash += fulfilled * SALE_PRICE

        # 4) Stockout penalty if unmet demand
        if missing > 0:
            state.stockouts += 1
            state.cash -= missing * STOCKOUT_PENALTY

        # 5) Holding cost on remaining inventory
        state.cash -= state.inventory * HOLDING_COST

        # 6) Place new order based on strategy
        state.cash -= order_quantity * ORDER_COST
        arrival_week = week + BASE_LEAD_TIME + lead_time_extra
        state.orders_in_transit.append((arrival_week, order_quantity))

        inventory_trace.append(state.inventory)

    profit = state.cash - INITIAL_CASH
    return {
        "profit": profit,
        "stockouts": state.stockouts,
        "inventory_trace": inventory_trace,
    }


def run_monte_carlo(
    strategy: Strategy,
    simulations: int = 100,
    custom_quantity: int | None = None,
) -> Dict:
    run_results: List[Dict] = [
        simulate_single_run(strategy=strategy, custom_quantity=custom_quantity)
        for _ in range(simulations)
    ]

    profits = [result["profit"] for result in run_results]
    stockout_counts = [result["stockouts"] for result in run_results]
    inventory_traces = [result["inventory_trace"] for result in run_results]

    bankruptcies = sum(1 for p in profits if INITIAL_CASH + p < 0)

    return {
        "avg_profit": sum(profits) / len(profits),
        "best_profit": max(profits),
        "worst_profit": min(profits),
        "stockouts_average": sum(stockout_counts) / len(stockout_counts),
        "bankruptcy_probability": bankruptcies / len(profits),
        "inventory_traces": inventory_traces,
        "profits": profits,
    }
