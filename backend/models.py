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
    simulations: int = Field(default=500, ge=1, le=5000)
    initial_inventory: float = Field(default=150, ge=0)
    initial_cash: float = Field(default=5000, ge=0)
    baseline_demand: float = Field(default=100, ge=0)
    demand_std_dev: float = Field(default=25, ge=0)
    lead_time_weeks: int = Field(default=1, ge=0, le=8)
    holding_cost: float = Field(default=2, ge=0)
    stockout_penalty: float = Field(default=25, ge=0)
    order_cost: float = Field(default=10, ge=0)
    sale_price: float = Field(default=50, ge=0)
    weekly_fixed_cost: float = Field(default=3200, ge=0)
    bankruptcy_cash_threshold: float = Field(default=500)
    supplier_delay_probability: float = Field(default=0.10, ge=0, le=1)
    demand_spike_probability: float = Field(default=0.05, ge=0, le=1)
    demand_drop_probability: float = Field(default=0.05, ge=0, le=1)
    production_loss_probability: float = Field(default=0.02, ge=0, le=1)
    demand_spike_multiplier: float = Field(default=1.5, ge=1)
    demand_drop_multiplier: float = Field(default=0.5, ge=0, le=1)
    production_loss_fraction: float = Field(default=0.2, ge=0, le=1)


class SimulationResponse(BaseModel):
    avg_profit: float
    best_profit: float
    worst_profit: float
    profit_std_dev: Optional[float] = None
    profit_p05: Optional[float] = None   # VaR 95%
    profit_p10: Optional[float] = None
    profit_p50: Optional[float] = None
    profit_p90: Optional[float] = None
    profit_p95: Optional[float] = None
    profit_cvar95: Optional[float] = None   # CVaR 95% (Expected Shortfall)
    stockouts_average: float
    bankruptcy_probability: float
    bankruptcy_count: int
    actual_simulations: Optional[int] = None
    profit_ci_half_width: Optional[float] = None
    profit_ci_low: Optional[float] = None
    profit_ci_high: Optional[float] = None
    bankruptcy_ci_half_width: Optional[float] = None
    inventory_traces: List[List[float]]
    profits: List[float]


class CompactSimulationResponse(BaseModel):
    avg_profit: float
    best_profit: float
    worst_profit: float
    stockouts_average: float
    bankruptcy_probability: float
    bankruptcy_count: int
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


class AIRecommendOrderForSimulationRequest(BaseModel):
    """Scenario params for AI to recommend a single order quantity (used to drive Monte Carlo)."""
    model: str = Field(default="llama3.2:1b")
    baseline_demand: float = Field(default=100, ge=0)
    demand_std_dev: float = Field(default=25, ge=0)
    initial_cash: float = Field(default=5000, ge=0)
    initial_inventory: float = Field(default=150, ge=0)
    sale_price: float = Field(default=50, ge=0)
    order_cost: float = Field(default=10, ge=0)
    holding_cost: float = Field(default=2, ge=0)
    stockout_penalty: float = Field(default=25, ge=0)
    weekly_fixed_cost: float = Field(default=3200, ge=0)
    bankruptcy_cash_threshold: float = Field(default=500)
    weeks: int = Field(default=12, ge=1, le=52)


class AIRecommendOrderForSimulationResponse(BaseModel):
    recommended_order_quantity: int
    model: str


class AIAdvisorRequest(SimulationRequest):
    model: str = Field(default="llama3")


class AIAdvisorResponse(BaseModel):
    model: str
    summary: str
    compact_metrics: CompactSimulationResponse


class AIAdvisorSummaryRequest(BaseModel):
    """Request initial AI analysis from already-computed simulation results (no re-run)."""
    model: str = Field(default="llama3.2:1b")
    strategy: Optional[str] = None
    simulations: Optional[int] = None
    avg_profit: float = Field(..., description="Average profit from Monte Carlo")
    profit_p10: Optional[float] = None
    profit_p50: Optional[float] = None
    profit_p90: Optional[float] = None
    worst_profit: float = Field(..., description="Worst run profit")
    best_profit: float = Field(..., description="Best run profit")
    bankruptcy_probability: float = Field(..., ge=0, le=1)
    bankruptcy_count: Optional[int] = None
    stockouts_average: float = Field(default=0)


class AIAdvisorSummaryResponse(BaseModel):
    model: str
    summary: str


class AIAdvisorDistributionResponse(BaseModel):
    """AI-generated profit distribution (AI's own 'Monte Carlo' style analysis)."""
    model: str
    profits: List[float]


class AILogEntry(BaseModel):
    timestamp: str
    action: str
    model: str
    prompt: str
    response: Optional[str] = None
    error: Optional[str] = None
    duration_ms: Optional[float] = None
    prompt_chars: Optional[int] = None
    response_chars: Optional[int] = None


class DataFileSummary(BaseModel):
    id: str
    name: str
    file_type: str
    rows: int
    columns: List[str]
    sample_rows: List[dict]
    uploaded_at: str


class DataChatRequest(BaseModel):
    message: str = Field(min_length=1)
    model: str = Field(default="llama3.2:1b")


class DataChatResponse(BaseModel):
    model: str
    answer: str


class SimChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class SimChatRequest(BaseModel):
    message: str = Field(min_length=1)
    model: str = Field(default="llama3.2:1b")
    history: List[SimChatMessage] = Field(default_factory=list)
    # Simulation context — all optional so the endpoint can be called without results
    strategy: Optional[str] = None
    simulations: Optional[int] = None
    avg_profit: Optional[float] = None
    worst_profit: Optional[float] = None
    best_profit: Optional[float] = None
    profit_std_dev: Optional[float] = None
    profit_p10: Optional[float] = None
    profit_p50: Optional[float] = None
    profit_p90: Optional[float] = None
    profit_p05: Optional[float] = None
    stockouts_average: Optional[float] = None
    bankruptcy_probability: Optional[float] = None
    bankruptcy_count: Optional[int] = None
    actual_simulations: Optional[int] = None
    # Economics context
    sale_price: Optional[float] = None
    weekly_fixed_cost: Optional[float] = None
    order_cost: Optional[float] = None
    initial_cash: Optional[float] = None
    bankruptcy_cash_threshold: Optional[float] = None


class SimChatResponse(BaseModel):
    model: str
    answer: str


class AuthRegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class AuthLoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    username: str


class AIKeysResponse(BaseModel):
    """Masked API key status for display in Settings."""
    anthropic_set: bool = False
    anthropic_masked: str = ""
    openai_set: bool = False
    openai_masked: str = ""


class AIKeysUpdateRequest(BaseModel):
    anthropic: Optional[str] = Field(default=None, description="Claude API key; omit or empty to leave unchanged")
    openai: Optional[str] = Field(default=None, description="OpenAI API key; omit or empty to leave unchanged")


class ProcessFileRequest(BaseModel):
    model: str = Field(default="llama3.2:1b")


class ProcessFileResponse(BaseModel):
    file_id: str
    inferred_mapping: dict
    processed_row_count: int
    processed_sample_rows: List[dict]
    ai_notes: Optional[str] = None


class FactorImpact(BaseModel):
    factor: str
    baseline_avg_profit: float
    stressed_avg_profit: float
    delta_avg_profit: float
    baseline_bankruptcy_probability: float
    stressed_bankruptcy_probability: float
    delta_bankruptcy_probability: float
    explanation: str


class TheoryReportRequest(SimulationRequest):
    confidence_level: float = Field(default=0.95, gt=0.5, lt=0.999)
    target_margin_of_error: float = Field(default=1000, gt=0)
    model: Optional[str] = Field(default=None)


class TheoryReportResponse(BaseModel):
    expected_profit: float
    profit_std_dev: float
    confidence_interval_low: float
    confidence_interval_high: float
    bankruptcy_probability: float
    bankruptcy_confidence_interval_low: float
    bankruptcy_confidence_interval_high: float
    required_simulations_for_target_error: int
    mathematical_notes: List[str]
    factor_impacts: List[FactorImpact]
    ai_explanation: Optional[str] = None
