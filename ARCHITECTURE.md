# Supply Chain Command Center — Architecture & How Everything Works

This document describes how the pieces fit together: **Docker, Kubernetes, Puppeteer**, the **Monte Carlo math**, and the **application stack**.

---

## 1. Docker, Kubernetes, and Puppeteer — Relations

### Docker: packaging and local runs

Everything that runs in production or in CI is packaged as **Docker images**:

| Image | Built from | Purpose |
|-------|------------|---------|
| `ollama/ollama:latest` | Official image | Runs the LLM (e.g. Llama). No custom build. |
| `supplychain-backend:latest` | `backend/Dockerfile` | FastAPI app: simulation, auth, AI proxy. |
| `supplychain-frontend:latest` | `frontend/Dockerfile` | Nginx serving the built React app; proxies `/api/` to backend. |
| `supplychain-puppeteer:latest` | `qa/puppeteer/Dockerfile` | Headless Chrome + Node + Puppeteer for smoke tests. |

- **Docker Compose** (`docker-compose.yml`) runs these services on a single host: `ollama`, `backend`, `frontend`, and optionally `puppeteer-smoke` (with `--profile qa`). The backend talks to Ollama via the `ollama` service name; the frontend talks to the backend via `/api/` proxied by Nginx to `backend:8000`.
- So **Docker** is the way we build and run the app (and QA) in a reproducible way.

### Kubernetes: production deployment

**Kubernetes (k8s)** is the orchestration layer when you deploy the same app to a cluster instead of a single Docker host:

- **Same images**: The k8s manifests (`k8s/backend.yaml`, `k8s/frontend.yaml`) use the same image names (`supplychain-backend:latest`, `supplychain-frontend:latest`). You build those images with Docker (e.g. `docker compose build`) and make them available to the cluster (e.g. load into a local registry or push to a registry the cluster can pull from).
- **Relation**: Docker **builds** the images; Kubernetes **runs** those images as Deployments and Services. So:
  - **Docker** = build + run on one machine (dev/CI).
  - **Kubernetes** = run the same containers in a cluster (scaling, health checks, ingress).
- **Ingress** (`k8s/ingress.yaml`) routes traffic (e.g. `supplychain.local`) to the frontend Service; the frontend still proxies `/api/` to the backend Service inside the cluster.

So: **Docker provides the containers; Kubernetes decides where and how they run (pods, services, ingress).**

### Puppeteer: QA smoke tests

**Puppeteer** is used only for **automated smoke tests**, not for the main app logic:

- **What it does**: The `qa/puppeteer` app launches a headless Chrome browser, opens the frontend URL, and checks that:
  - Backend `/health` and `/auth/guest` work.
  - Ollama status is reported.
  - The frontend loads and gets past the splash screen.
  - “Run Simulation” runs and the dashboard shows results (e.g. `.metrics-grid`).
  - Tabs (e.g. AI Logs) are clickable.
- **How it fits**:
  - **Docker**: The Puppeteer test runs inside its own container (`supplychain-puppeteer:latest`), built from `qa/puppeteer/Dockerfile`, which uses `ghcr.io/puppeteer/puppeteer` (Chrome + Node). In Compose it’s a separate service that `depends_on` backend and frontend.
  - **Kubernetes**: `k8s/puppeteer-job.yaml` defines a **Job** that runs the same Puppeteer container once (e.g. after deploy) to smoke-test the deployed app. The Job uses `TARGET_URL: http://frontend` so it hits the in-cluster frontend Service.

So: **Puppeteer is the QA client that uses Docker to run and, in k8s, runs as a one-off Job against the deployed frontend/backend.**

**Summary**

- **Docker** → build and run backend, frontend, Ollama, and Puppeteer tests.
- **Kubernetes** → run the same backend/frontend images in a cluster; optionally run the Puppeteer image as a Job.
- **Puppeteer** → no relation to business logic; it’s the tool that drives a browser to verify the app end-to-end.

---

## 2. Monte Carlo Simulation — Math and Logic

The core simulation lives in **`backend/simulator.py`**. It’s a discrete-time, weekly supply-chain model with random demand and optional disruptions.

### 2.1 Per-week (single run) model

Each **run** is 12 weeks. In every week \(t\) the following happens in order.

1. **Receive orders**  
   Orders that were placed with lead time and are due this week arrive: inventory increases, “orders in transit” is updated.

2. **Demand**  
   \[
   D_t \sim \max\bigl(0,\ \mathcal{N}(\mu,\sigma^2)\bigr)
   \]  
   With \(\mu = \texttt{baseline\_demand}\), \(\sigma = \texttt{demand\_std\_dev}\). So weekly demand is normal, clipped to non-negative.

3. **Optional disruptions** (same week, after demand draw):  
   - Demand spike (e.g. ×1.5) or drop (×0.5) with small probabilities.  
   - Production loss: lose a fraction of current inventory.  
   - Supplier delay: this week’s order gets +1 week lead time.

4. **Fulfillment and inventory**  
   - Fulfilled: \(S_t = \min(\text{inventory},\ D_t)\).  
   - Inventory after demand: subtract \(S_t\).  
   - Stockout: \(\max(0,\ D_t - \text{available})\); each unit of unmet demand incurs a **stockout penalty** and counts as a stockout event.

5. **Cash**  
   - Revenue: \(S_t \times \texttt{sale\_price}\).  
   - Order cost: \(\texttt{order\_cost} \times Q_t\) (only if we place an order; order quantity \(Q_t\) comes from the **strategy**).  
   - Holding cost: \(\texttt{holding\_cost} \times \text{inventory}\) (end-of-week).  
   - Stockout cost: \(\texttt{stockout\_penalty} \times \text{unmet demand}\).  
   - Fixed cost: \(\texttt{weekly\_fixed\_cost}\).

6. **Order placement**  
   Strategy (conservative / balanced / aggressive / custom or AI-recommended-as-custom) gives a **fixed order quantity** \(Q\). We only order if we can afford it; the order arrives in \(\texttt{lead\_time\_weeks}\) (plus any extra week from supplier delay).

7. **Bankruptcy**  
   If cash falls below \(\texttt{bankruptcy\_cash\_threshold}\), the run is marked **bankrupt** and we still complete the 12 weeks for that run (profit = final cash − initial cash).

So in one run we get: **profit** (change in cash), **stockouts** count, **inventory trace** over 12 weeks, and a **bankrupt** flag.

### 2.2 Monte Carlo aggregation (many runs)

We do \(N\) independent runs (same parameters, same strategy). From the \(N\) profits \(\Pi^{(1)},\ldots,\Pi^{(N)}\) and bankrupt flags:

- **Mean profit**: \(\hat{\mu}_\Pi = \frac{1}{N}\sum_i \Pi^{(i)}\).
- **Sample standard deviation**: \(\hat{\sigma} = \sqrt{\frac{1}{N-1}\sum_i (\Pi^{(i)}-\hat{\mu}_\Pi)^2}\).
- **95% confidence interval (CLT)**: \(\hat{\mu}_\Pi \pm 1.96\,\frac{\hat{\sigma}}{\sqrt{N}}\).
- **VaR 95%**: 5th percentile of \(\{\Pi^{(i)}\}\) (worst 5% threshold).
- **CVaR 95% (Expected Shortfall)**: mean of the worst 5% of profits.
- **Bankruptcy probability**: \(\hat{p} = \frac{1}{N}\sum_i \mathbf{1}(\Pi^{(i)} \text{ bankrupt})\); with a binomial CI for \(\hat{p}\).

The **adaptive** entrypoint (`run_monte_carlo_stable`) keeps adding runs until the profit CI half-width and the bankruptcy CI width are below targets (and within min/max run counts). That’s what the main UI uses for stable, comparable results.

### 2.3 Strategy → order quantity

- **Conservative**: 120 units/week.  
- **Balanced**: 100 units/week.  
- **Aggressive**: 80 units/week.  
- **Custom**: user (or frontend) provides `order_quantity`.  
- **AI-recommended**: in the app, this is implemented as “call `/ai/recommend-order-for-simulation` once, get an integer \(Q\), then run Monte Carlo with **strategy = custom** and **order_quantity = \(Q\)**.” So the math is unchanged; only the source of \(Q\) is the AI.

All of the above is implemented in `backend/simulator.py`; the REST API in `backend/main.py` just maps request payloads to `SimulationConfig` and calls `run_monte_carlo` or `run_monte_carlo_stable`.

---

## 3. How the App Is Made — High-Level Architecture

### 3.1 Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  React (Vite) SPA  │  /  → static assets + index.html               │ │
│  │                    │  /api/* → proxied to backend (by Nginx in Docker)│ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ HTTPS/HTTP
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Frontend container (Nginx)                                               │
│  • Serves built React from /usr/share/nginx/html                         │
│  • location /api/ → proxy_pass http://backend:8000/                       │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ /api/* → backend:8000
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Backend container (FastAPI / Uvicorn)                                    │
│  • /health, /auth/*, /simulate, /simulate/stable, /simulate/compact        │
│  • /ai/status, /ai/recommend-order-for-simulation, /ai/advisor,           │
│    /ai/advisor-summary, /ai/sim-chat, /ai/logs, /ai/keys, ...             │
│  • /theory/report, /data/upload, ...                                      │
│  • Uses simulator.py for Monte Carlo; ai_agent.py to call Ollama/Claude/  │
│    OpenAI; auth.py for tokens; data_ingest for uploads                    │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ LLM calls
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Ollama container (optional in k8s)                                       │
│  • Local LLM server (e.g. llama3.2:1b)                                   │
│  • Backend uses OLLAMA_BASE_URL (e.g. http://ollama:11434)                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Frontend (React + Vite)

- **Location**: `frontend/`. Build: `npm run build` → `dist/`; in Docker a multi-stage build produces static files that Nginx serves.
- **API base**: The app uses `VITE_API_BASE_URL` in dev (e.g. proxy to backend); in production it defaults to `/api` so Nginx can proxy to the backend.
- **Flow**:
  - **Auth**: Guest login via `POST /auth/guest`; token stored and sent as `Authorization: Bearer …` on API calls.
  - **Simulation**: User picks strategy (including “AI-recommended”). For AI-recommended, the frontend first calls `POST /ai/recommend-order-for-simulation`, then `POST /simulate/stable` with `strategy: "custom"` and the recommended `order_quantity`. Results are shown in the dashboard (metrics, charts, AI advisor chat).
  - **AI advisor**: Dashboard can send messages to `POST /ai/sim-chat` with conversation history and current simulation metrics; backend uses the selected model (Ollama/Claude/OpenAI) and returns a reply.
  - **Theory**: Theory page calls `POST /theory/report` to get factor impacts, CIs, and optional AI explanation.
  - **Settings**: API keys (Claude/OpenAI) are sent to the backend and stored server-side; Ollama is configured via backend env.
- **Routing**: Single-page app; “pages” are Dashboard, AI Logs, Theory, Settings, switched by state (no separate URL router required for this flow).

### 3.3 Backend (FastAPI)

- **Location**: `backend/`. Entry: `uvicorn main:app`.
- **Main modules**:
  - **main.py**: Routes, CORS, auth dependency (`require_auth`), mapping request bodies to `SimulationConfig` and calling the simulator or AI.
  - **simulator.py**: As above — Monte Carlo and single-run logic.
  - **models.py**: Pydantic models for requests/responses (e.g. `SimulationRequest`, `SimulationResponse`, `Strategy`).
  - **ai_agent.py**: Calls Ollama (and optionally Claude/OpenAI) for text generation; used by recommend-order, advisor, sim-chat, theory report, etc.
  - **auth.py**: Token validation, guest/register/login, API key storage.
  - **data_ingest.py**: Parsing uploaded files (CSV/Excel/JSON) and summarizing.
- **Strategy**: Backend only knows `conservative | balanced | aggressive | custom`. “AI-recommended” is a frontend flow that gets \(Q\) from `/ai/recommend-order-for-simulation` and then calls simulate with `custom` + that \(Q\).

### 3.4 Data flow (simulation + AI)

1. User sets parameters and strategy (including “AI-recommended”) and clicks Run.  
2. If AI-recommended: frontend → `POST /ai/recommend-order-for-simulation` → backend → Ollama/Claude/OpenAI → integer \(Q\) → frontend.  
3. Frontend → `POST /simulate/stable` with strategy (or `custom` + \(Q\)), simulations count, and economic params.  
4. Backend builds `SimulationConfig`, calls `run_monte_carlo_stable` in `simulator.py`, returns metrics, percentiles, traces, profits.  
5. Frontend stores results and renders dashboard (math panel + charts + AI advisor). Optional: frontend requests an initial summary via `/ai/advisor-summary` or user chats via `/ai/sim-chat`.  
6. All of this is stateless per request except auth DB, in-memory AI logs, and optional file uploads.

---

## 4. File / Directory Roles (Quick Reference)

| Path | Role |
|------|------|
| `docker-compose.yml` | Defines ollama, backend, frontend, puppeteer-smoke services and networks. |
| `backend/Dockerfile` | Builds FastAPI app image. |
| `frontend/Dockerfile` | Builds React app, then Nginx image serving it + proxying `/api/`. |
| `frontend/nginx.conf` | Nginx config: `/api/` → backend:8000. |
| `qa/puppeteer/` | Puppeteer smoke test; Dockerfile and k8s Job run it. |
| `k8s/*.yaml` | Deployments, Services, Ingress, Puppeteer Job for the same images. |
| `backend/simulator.py` | Monte Carlo and single-run supply-chain math. |
| `backend/main.py` | HTTP API and wiring to simulator and AI. |
| `backend/models.py` | Request/response and Strategy enum. |
| `backend/ai_agent.py` | LLM calls (Ollama, optional Claude/OpenAI). |
| `frontend/src/App.tsx` | Top-level state, auth, run simulation (including AI-recommended flow), page switch. |
| `frontend/src/components/` | Dashboard, StrategySelector, TheoryPage, Settings, Logs, etc. |

This should give you a single place to see how Docker, Kubernetes, and Puppeteer relate, how the Monte Carlo model works, and how the app is structured end to end.
