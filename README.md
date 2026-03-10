# Brewery Supply Chain Uncertainty Simulator

A prototype web app that demonstrates how uncertainty impacts supply chain decisions using Monte Carlo simulation over a 12-week planning horizon.

## Tech Stack

- Backend: Python + FastAPI
- Frontend: React + TypeScript + Vite
- Charts: Chart.js (via `react-chartjs-2`)

## Project Structure

```text
backend/
  main.py
  simulator.py
  models.py
  requirements.txt

frontend/
  index.html
  package.json
  tsconfig*.json
  vite.config.ts
  src/
    App.tsx
    main.tsx
    styles.css
    components/
      StrategySelector.tsx
      ResultsDashboard.tsx
      SimulationChart.tsx
```

## Run Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend will run on `http://127.0.0.1:8000`.

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will run on `http://127.0.0.1:5173`.

## API

### `POST /simulate`

Request body:

```json
{
  "strategy": "balanced",
  "order_quantity": 120,
  "simulations": 100
}
```

Response body:

```json
{
  "avg_profit": 12345.6,
  "best_profit": 20000.0,
  "worst_profit": -10000.0,
  "stockouts_average": 1.4,
  "bankruptcy_probability": 0.0,
  "inventory_traces": [[150, 60, 80, 40]],
  "profits": [10000, 12000, -3000]
}
```

## Implemented Simulation Behavior

- 12-week simulation horizon
- State variables:
  - `inventory`
  - `cash`
  - `orders_in_transit`
  - `weekly_demand_history`
- Initial values:
  - `inventory = 150`
  - `cash = 100000`
- Demand baseline:
  - normal distribution around 100 units/week
- Costs:
  - `holding_cost = 2`
  - `stockout_penalty = 20`
  - `order_cost = 10`
- Disruptions:
  - 10% supplier delay (`+1` week lead time)
  - 5% demand spike (`x1.5`)
  - 5% demand drop (`x0.5`)
  - 2% production loss (lose 20% inventory)

## Strategies

- `conservative`: order 150 units weekly
- `balanced`: order 120 units weekly
- `aggressive`: order 100 units weekly
- `custom`: user-defined weekly order quantity