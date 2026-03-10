from enum import Enum
from typing import List, Optional

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
