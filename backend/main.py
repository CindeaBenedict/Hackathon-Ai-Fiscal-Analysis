from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import SimulationRequest, SimulationResponse, Strategy
from simulator import run_monte_carlo


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
