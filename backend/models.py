from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class Strategy(str, Enum):
    conservative = "conservative"
    balanced = "balanced"
    aggressive = "aggressive"
    custom = "custom"


class SimulationRequest(BaseModel):
    strategy: Strategy
    order_quantity: Optional[int] = Field(
        default=None,
        ge=0,
        description="Only used when strategy=custom.",
    )
    simulations: int = Field(default=100, ge=1, le=5000)


class SimulationResponse(BaseModel):
    avg_profit: float
    best_profit: float
    worst_profit: float
    stockouts_average: float
    bankruptcy_probability: float
    inventory_traces: List[List[float]]
    profits: List[float]


class CompactSimulationResponse(BaseModel):
    avg_profit: float
    best_profit: float
    worst_profit: float
    stockouts_average: float
    bankruptcy_probability: float
    profit_p10: float
    profit_p50: float
    profit_p90: float
    avg_inventory_trace: List[float]
    profit_histogram_bins: List[int]
    profit_histogram_edges: List[float]


class AIOrderAdviceRequest(BaseModel):
    inventory: float = Field(ge=0)
    demand_trend: Literal["rising", "stable", "falling"]
    cash: float = Field(ge=0)
    model: str = Field(default="llama3")


class AIOrderAdviceResponse(BaseModel):
    recommended_order_units: int
    model: str
    raw_response: str


class AIAdvisorRequest(SimulationRequest):
    model: str = Field(default="llama3")


class AIAdvisorResponse(BaseModel):
    model: str
    summary: str
    compact_metrics: CompactSimulationResponse
