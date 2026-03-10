# Brewery Supply Chain Uncertainty Simulator

A mobile-first prototype that demonstrates how uncertainty impacts supply chain decisions using Monte Carlo simulation over a 12-week planning horizon.

## Tech Stack

- Backend: Python + FastAPI
- Mobile app: Flutter
- Charts: `fl_chart`

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

flutter_app/
  pubspec.yaml
  lib/
    main.dart
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

## Run Flutter App

```bash
cd flutter_app
flutter pub get
flutter run
```

Notes:
- For Android emulator use backend URL `http://10.0.2.2:8000`
- For iOS simulator use backend URL `http://127.0.0.1:8000`
- For a physical phone use your laptop local network IP (example: `http://192.168.1.23:8000`)

## Run With Docker (cool stack)

Build and run backend + web dashboard:

```bash
docker compose up --build
```

Services:
- Backend API: `http://localhost:8000`
- Frontend dashboard: `http://localhost:8080`

Run Puppeteer smoke test:

```bash
docker compose --profile qa up --build puppeteer-smoke
```

## Kubernetes (local cluster ready)

Build images and load them into your cluster (for example with `kind`/`minikube`), then apply:

```bash
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/ingress.yaml
```

Optional browser smoke job in-cluster:

```bash
kubectl apply -f k8s/puppeteer-job.yaml
kubectl logs job/supplychain-puppeteer-smoke
```

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

### `POST /ai/order-advice`

Uses a local Ollama model to recommend next week's order quantity.

Request:

```json
{
  "inventory": 80,
  "demand_trend": "rising",
  "cash": 60000,
  "model": "llama3"
}
```

Response:

```json
{
  "recommended_order_units": 132,
  "model": "llama3",
  "raw_response": "132"
}
```

### `POST /ai/advisor`

Runs simulation + asks local model for a concise risk explanation based on real metrics.

Request:

```json
{
  "strategy": "balanced",
  "order_quantity": 120,
  "simulations": 100,
  "model": "llama3"
}
```

### `POST /simulate/compact`

Compact response designed for mobile clients (smaller payload):

```json
{
  "avg_profit": 12345.6,
  "best_profit": 20000.0,
  "worst_profit": -10000.0,
  "stockouts_average": 1.4,
  "bankruptcy_probability": 0.0,
  "profit_p10": 5000.0,
  "profit_p50": 12000.0,
  "profit_p90": 18000.0,
  "avg_inventory_trace": [150, 120, 110, 130],
  "profit_histogram_bins": [3, 8, 19, 26, 18, 13, 8, 5],
  "profit_histogram_edges": [-5000, -2500, 0, 2500, 5000, 7500, 10000, 12500, 15000]
}
```

## Free Local AI (Ollama)

Install and run Ollama:

```bash
brew install ollama
ollama serve
ollama run llama3
```

Local model API:
- `http://localhost:11434/api/generate`

Optional env var for backend:

```bash
export OLLAMA_BASE_URL=http://localhost:11434
```

Example AI call:

```bash
curl -X POST http://127.0.0.1:8000/ai/order-advice \
  -H "Content-Type: application/json" \
  -d '{"inventory":80,"demand_trend":"rising","cash":60000,"model":"llama3"}'
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