# Supply Chain Command Center

A **Monte Carlo supply chain simulator** with an **AI advisor**: run hundreds of stochastic scenarios, inspect the math (profit distribution, VaR, bankruptcy risk), and chat with an AI that explains results and recommends order quantities. Supports local LLMs (Ollama) and optional cloud APIs (Claude, OpenAI).

---

## Table of contents

- [What the app does](#what-the-app-does)
- [Installer downloads (no backend access)](#installer-downloads-no-backend-access)
- [Prerequisites](#prerequisites)
- [Quick start (Docker)](#quick-start-docker)
- [Detailed setup](#detailed-setup)
  - [Option A: Docker (recommended)](#option-a-docker-recommended)
  - [Option B: Linux one-command install + start](#option-b-linux-one-command-install--start)
  - [Option C: Local development (no Docker)](#option-c-local-development-no-docker)
  - [Option D: Kubernetes](#option-d-kubernetes)
  - [Option E: Heroku (full app)](#option-e-heroku-full-app--frontend--backend)
- [Environment variables](#environment-variables)
- [API keys and AI providers](#api-keys-and-ai-providers)
- [Running tests](#running-tests)
- [Project structure](#project-structure)
- [Useful commands](#useful-commands)
- [Troubleshooting](#troubleshooting)
- [Further reading](#further-reading)

---

## What the app does

| Feature | Description |
|--------|-------------|
| **Monte Carlo simulation** | Runs hundreds of 12-week supply chain scenarios with random demand, optional disruptions (demand spikes, supplier delays, production loss), and configurable economics. |
| **Math panel** (blue) | Pure statistics: average profit, P10/P50/P90, VaR 95%, CVaR 95%, bankruptcy rate, confidence intervals. |
| **AI Advisor** (green) | Explains results in plain language and answers follow-up questions. Can recommend a fixed order quantity used in the simulation. |
| **Strategies** | Conservative (120 u/wk), Balanced (100), Aggressive (80), Custom (you set Q), or **AI-recommended** (AI suggests Q, then simulation runs with it). |
| **Theory page** | Factor impact analysis (how changing demand, costs, etc. affects profit and bankruptcy), with optional AI explanation. |
| **Data upload** | Upload CSV / Excel / JSON for AI-assisted analysis. |
| **AI Logs** | Inspect every prompt and response the AI made (useful for debugging and auditing). |
| **Settings** | Store Claude/OpenAI API keys in the app; choose default AI model. |

The app is **responsive**: it works on smaller screens (tablets, phones) with a single-column layout and stacked controls.

---

## Installer downloads (no backend access)

Use these packaged apps when users cannot run or access the backend setup directly.
Release page: [GitLab Releases](https://gitlab.com/next-level-challenge/team-28/-/releases)

### Desktop installers

- **Windows Setup (.exe):** [Download](https://gitlab.com/next-level-challenge/team-28/-/releases/permalink/latest/downloads/SupplyChainCommand-Setup.exe)
- **macOS (.dmg, unsigned local app):** [Download](https://gitlab.com/next-level-challenge/team-28/-/releases/permalink/latest/downloads/SupplyChainCommand.dmg)
- **Linux AppImage:** [Download](https://gitlab.com/next-level-challenge/team-28/-/releases/permalink/latest/downloads/SupplyChainCommand.AppImage)
- **Linux .deb (Ubuntu):** [Download](https://gitlab.com/next-level-challenge/team-28/-/releases/permalink/latest/downloads/supply-chain-command-amd64.deb)
- **Linux .rpm:** [Download](https://gitlab.com/next-level-challenge/team-28/-/releases/permalink/latest/downloads/supply-chain-command-x86_64.rpm)

### Mobile packages

- **Android (.apk):** [Download](https://gitlab.com/next-level-challenge/team-28/-/releases/permalink/latest/downloads/supply-chain-command.apk)
- **iOS local build guide (Xcode, signing required):** [Instructions](#option-c-local-development-no-docker)

### Notes for users

- These app packages are intended for local use where full backend deployment is not available.
- Some features that require live server APIs may be limited depending on package mode.
- On macOS without notarization, first launch may require **right-click -> Open**.

### Build installers locally (all OS targets)

This repo includes build scripts for local app packages in `scripts/`:

- macOS/Linux shell script: `scripts/package_all_local_apps.sh`
- Windows PowerShell script: `scripts/package_all_local_apps.ps1`

From project root:

```bash
# Build all desktop + mobile targets (requires Flutter SDK + platform toolchains)
npm run package:local:all

# Desktop only
npm run package:local:desktop

# Mobile only
npm run package:local:mobile
```

Or run specific targets:

```bash
bash ./scripts/package_all_local_apps.sh windows linux android
```

On Windows (PowerShell):

```powershell
.\scripts\package_all_local_apps.ps1 windows android
```

#### Platform requirements

- **Windows packaging**: run on Windows with Visual Studio build tools.
- **macOS packaging**: run on macOS with Xcode.
- **Linux packaging**: run on Linux (Ubuntu recommended) with required build deps.
- **Android APK**: Android SDK + Java toolchain.
- **iOS build**: macOS + Xcode; signing is still required to install on devices.

---

## Prerequisites

| Tool | Purpose | Where to get it |
|------|---------|-----------------|
| **Docker** | Build and run the app (backend, frontend, Ollama) in containers. | [Install Docker Engine](https://docs.docker.com/engine/install/) (Linux) or [Docker Desktop](https://www.docker.com/products/docker-desktop) (Mac/Windows). |
| **Docker Compose** | Orchestrates the multi-container setup. | Included with Docker Desktop; on Linux install the [Compose plugin](https://docs.docker.com/compose/install/). |
| **Node.js 20+** (optional) | Only needed for **local development** (frontend dev server, Puppeteer tests). | [nodejs.org](https://nodejs.org/) or your package manager. |
| **Python 3.12+** (optional) | Only needed for **local development** (backend without Docker). | [python.org](https://www.python.org/) or your package manager. |

**For the quickest path:** install Docker (and Docker Compose), then use the [Quick start](#quick-start-docker) below. Ollama runs inside Docker — you do **not** need to install Ollama on your host.

---

## Quick start (Docker)

From the project root:

```bash
./start.sh
```

The script will:

1. Check that Docker is installed and running (and on macOS, try to start Docker Desktop if needed).
2. Look for a `.env` file (optional; for API keys — see [Environment variables](#environment-variables)).
3. Run `docker compose down --remove-orphans` to clear any old state, then `docker compose up --build -d` to build and start:
   - **ollama** — local LLM server (downloads the default model, ~1 GB, on first run).
   - **backend** — FastAPI app (simulation, auth, AI proxy).
   - **frontend** — Nginx serving the React app and proxying `/api/` to the backend.
4. Wait until both backend and frontend respond.
5. Print the app URL and open it in your browser on macOS.

**First run:** Ollama pulls the default model in the background. The AI may show “model not found” until the pull finishes. Check progress with:

```bash
docker compose logs -f ollama
```

**Open the app:** [http://localhost:8080](http://localhost:8080)

**Stop everything:**

```bash
./stop.sh
```

---

## Detailed setup

### Option A: Docker (recommended)

1. **Install Docker** (and Docker Compose) as in [Prerequisites](#prerequisites).
2. **Clone the repo** and `cd` into it:
   ```bash
   git clone <repo-url> team-28 && cd team-28
   ```
3. **(Optional)** Copy `.env.example` to `.env` and add API keys if you want Claude or OpenAI:
   ```bash
   cp .env.example .env
   # Edit .env and set ANTHROPIC_API_KEY and/or OPENAI_API_KEY if desired.
   ```
4. **Start the stack:**
   ```bash
   ./start.sh
   ```
5. Open **http://localhost:8080** in your browser.

**Ports:**

- `8080` — frontend (Nginx + React).
- `8000` — backend (FastAPI); also used by the frontend proxy for `/api/`.
- `11434` — Ollama (used by the backend container).

**Rebuild after code changes:**

```bash
docker compose build
docker compose up -d
```

Or use `make build` then `./start.sh` (start.sh runs `docker compose up --build -d`).

---

### Option B: Linux one-command install + start

On **Ubuntu/Debian** you can install Docker (if missing) and start the app in one go:

```bash
./setup-and-start.sh
```

You will be prompted for `sudo` to install Docker. After installation, the script runs `./start.sh`. If your user is not in the `docker` group yet, you may need to log out and back in, or run `newgrp docker`, to run Docker without `sudo` next time.

---

### Option C: Local development (no Docker)

Use this for frontend/backend development with hot reload. You still need **Ollama** for the AI (either install it on the host or run only the Ollama container).

#### 1. Ollama (local or container)

- **Option 1:** Install [Ollama](https://ollama.com) on your machine and run `ollama serve` (or use the app). Pull a model: `ollama pull llama3.2:1b`.
- **Option 2:** Run only Ollama in Docker: `docker compose up -d ollama`, and set `OLLAMA_BASE_URL=http://localhost:11434` for the backend.

#### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export OLLAMA_BASE_URL=http://localhost:11434   # if Ollama is on host
uvicorn main:app --reload --port 8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

#### 3. Frontend

In a **second terminal**:

```bash
cd frontend
npm install
npm run dev
```

The dev server uses `frontend/.env.development` (or Vite’s default) to proxy API requests to `http://127.0.0.1:8000`. Open the URL Vite prints (e.g. http://localhost:5173).

#### 4. Optional: API keys

Set in the backend environment or in the app **Settings** (stored in backend):

- `ANTHROPIC_API_KEY` — for Claude models.
- `OPENAI_API_KEY` — for GPT/o1 models.

---

### Option D: Kubernetes

The repo includes Kubernetes manifests for running the same Docker images in a cluster.

**Assumptions:** You have a cluster and `kubectl` configured. The cluster can pull the images (e.g. from a registry you pushed to, or a local registry).

1. **Build and tag images** (example with a registry):
   ```bash
   docker compose build
   docker tag supplychain-backend:latest <your-registry>/supplychain-backend:latest
   docker tag supplychain-frontend:latest <your-registry>/supplychain-frontend:latest
   docker push <your-registry>/supplychain-backend:latest
   docker push <your-registry>/supplychain-frontend:latest
   ```
2. **Update image names** in `k8s/backend.yaml` and `k8s/frontend.yaml` if you use a registry (replace `supplychain-backend:latest` with `<your-registry>/supplychain-backend:latest`, etc.).
3. **Deploy:**
   ```bash
   kubectl apply -f k8s/backend.yaml
   kubectl apply -f k8s/frontend.yaml
   kubectl apply -f k8s/ingress.yaml
   ```
4. **Ollama:** The current k8s set does not include Ollama. You can run Ollama as a Deployment/Service in the cluster and set `OLLAMA_BASE_URL` in the backend Deployment to point to that service, or use an external Ollama URL.
5. **Ingress:** `k8s/ingress.yaml` uses `ingressClassName: nginx` and host `supplychain.local`. Adjust host and class to match your cluster. Point DNS or `/etc/hosts` at the Ingress so the browser can open the app.
6. **Smoke tests:** To run the Puppeteer smoke test as a Job:
   ```bash
   # Build and push the Puppeteer image, then:
   kubectl apply -f k8s/puppeteer-job.yaml
   kubectl logs -f job/supplychain-puppeteer-smoke
   ```
   The Job expects `TARGET_URL` (e.g. `http://frontend`) to reach the frontend Service inside the cluster.

For a fuller picture of how Docker, Kubernetes, and Puppeteer fit together, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

### Option E: Heroku (full app — frontend + backend)

The repo is set up so **one Heroku app** serves both the React frontend and the FastAPI backend. Same URL: open the app in the browser, API calls go to the same origin.

**Files at repo root:** `Procfile`, `runtime.txt`, `requirements.txt`, `package.json`, `app.json`.

1. **Buildpacks (in order):** Node.js first (builds the frontend), then Python (backend).
   - In Dashboard: **Settings → Buildpacks → Add buildpack** → `heroku/nodejs`, then `heroku/python`.
   - Or deploy from GitHub with **app.json** (buildpacks are listed there).
2. **Config vars** (Dashboard → Settings → Config Vars):
   - **`VITE_API_BASE_URL`** = leave **empty** for full-app deploy. The frontend will call `/auth/guest`, `/simulate/stable`, etc. on the same origin. (Only set this if you later put the frontend on Vercel and keep the backend on Heroku.)
   - Optional: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` for AI (no Ollama on Heroku).
3. **Deploy** from the **root** of the repo:
   ```bash
   heroku create nume-app
   git push heroku main
   ```
4. **Build:** Heroku runs `npm run build` (root `package.json` → builds `frontend/`), then `pip install -r requirements.txt`, then `Procfile` starts `gunicorn` in `backend/`. At runtime the backend serves `frontend/dist` at `/` and API routes at `/health`, `/auth/guest`, etc.

**Only backend on Heroku (frontend on Vercel):** Set `VITE_API_BASE_URL` on Vercel to your Heroku URL. Do **not** add the Node buildpack (or Heroku will still build the frontend but you’ll use Vercel). Or use a separate Heroku app with only the Python buildpack and no root `package.json` build.

---

## Environment variables

These are used by **Docker Compose** (backend service) when you run `./start.sh` or `docker compose up`. Put them in a `.env` file in the **project root** (same directory as `docker-compose.yml`); Compose loads `.env` automatically.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OLLAMA_BASE_URL` | No | `http://ollama:11434` | Backend uses this to call Ollama. In Compose, `ollama` is the service name. For local dev, use `http://localhost:11434` if Ollama runs on the host. |
| `ANTHROPIC_API_KEY` | No | — | Claude API key. Can also be set in the app Settings (stored server-side). |
| `OPENAI_API_KEY` | No | — | OpenAI API key. Can also be set in the app Settings. |
| `DEFAULT_MODEL` | No | `llama3.2:1b` | Model pulled by Ollama on first backend startup and used as default in the UI. |
| `AUTH_DB_PATH` | No | `/app/data/auth.db` | Path to SQLite DB for auth and API keys (inside the backend container). Backed by a volume in Compose. |

**Example `.env`:**

```bash
# Copy from .env.example
cp .env.example .env

# Optional: enable cloud AI
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Optional: different Ollama model
DEFAULT_MODEL=llama3.2:1b
```

---

## API keys and AI providers

- **Ollama (local):** No key. Runs in Docker (or on your machine). Model is chosen in the UI (e.g. `llama3.2:1b`). Backend calls `OLLAMA_BASE_URL`.
- **Claude (Anthropic):** Set `ANTHROPIC_API_KEY` in `.env` or in the app **Settings**. Use model names like `claude-3-5-sonnet-20241022`.
- **OpenAI:** Set `OPENAI_API_KEY` in `.env` or in **Settings**. Use model names like `gpt-4o` or `gpt-4o-mini`.

Keys stored in Settings are saved in the backend (SQLite) and used in preference to environment variables. The app never sends keys to the frontend; only masked status is shown.

---

## Running tests

**Puppeteer smoke tests** (end-to-end: backend health, guest auth, Ollama status, frontend load, Run Simulation, Logs tab):

```bash
# With Docker Compose (backend + frontend must be running)
make qa
# or
docker compose --profile qa run --rm puppeteer-smoke
```

The QA profile starts the Puppeteer container after backend and frontend; it hits `http://frontend` (Compose network). Screenshots are written inside the container (e.g. `/tmp/smoke-dashboard.png`).

**Backend unit tests:** There are no automated Python unit tests in the repo yet; you can run the API manually via [http://localhost:8000/docs](http://localhost:8000/docs).

---

## Project structure

| Path | Description |
|------|-------------|
| `backend/` | FastAPI app: simulation, auth, AI proxy, data upload. |
| `backend/main.py` | HTTP routes and wiring. |
| `backend/simulator.py` | Monte Carlo and single-run supply chain logic. |
| `backend/models.py` | Pydantic request/response and `Strategy` enum. |
| `backend/ai_agent.py` | Ollama / Claude / OpenAI text generation. |
| `backend/auth.py` | Token validation, guest/register/login, API key storage. |
| `frontend/` | React (Vite) SPA. |
| `frontend/src/App.tsx` | Top-level state, auth, simulation flow (including AI-recommended). |
| `frontend/src/components/` | Dashboard, StrategySelector, TheoryPage, Settings, Logs, charts. |
| `frontend/nginx.conf` | Nginx config in Docker: serve SPA and proxy `/api/` to backend. |
| `qa/puppeteer/` | Puppeteer smoke test (Node + headless Chrome). |
| `k8s/` | Kubernetes manifests (Deployments, Services, Ingress, Puppeteer Job). |
| `docker-compose.yml` | Ollama, backend, frontend, optional Puppeteer QA service. |
| `start.sh` / `stop.sh` | Start/stop Compose stack and open browser. |
| `setup-and-start.sh` | One-time Docker install (Ubuntu/Debian) then `./start.sh`. |
| `.env.example` | Template for `.env` (API keys, default model). |
| `ARCHITECTURE.md` | How Docker, Kubernetes, Puppeteer, Monte Carlo math, and the app fit together. |

---

## Useful commands

| Command | Description |
|---------|-------------|
| `./start.sh` | Start all services (Docker), open app in browser. |
| `./stop.sh` | Stop and remove containers. |
| `make start` | Same as `./start.sh`. |
| `make stop` | Same as `./stop.sh`. |
| `make restart` | Stop then start. |
| `make build` | Rebuild Docker images (no start). |
| `make qa` | Run Puppeteer smoke tests. |
| `make logs` | Follow Compose logs. |
| `make help` | List make targets. |
| `docker compose logs -f ollama` | Follow Ollama logs (e.g. model pull progress). |
| `docker compose logs -f backend` | Follow backend logs. |

---

## Troubleshooting

| Issue | What to try |
|-------|--------------|
| **App doesn’t start** | Ensure Docker is running: `docker info`. On Linux: `sudo systemctl start docker`. |
| **“Could not reach Ollama” / AI not working** | With Docker: ensure the `ollama` service is up (`docker compose ps`). On first run, wait for the model to finish pulling: `docker compose logs -f ollama`. For local dev, run `ollama serve` and have backend use `OLLAMA_BASE_URL=http://localhost:11434`. |
| **Port already in use** | Stop the stack first: `./stop.sh`. Change ports in `docker-compose.yml` if needed (e.g. `8080:80` → `8888:80` for frontend). |
| **Permission denied (Docker)** | On Linux, add your user to the `docker` group: `sudo usermod -aG docker $USER`, then log out and back in (or `newgrp docker`). |
| **Want a clean slate** | `./stop.sh && docker compose build --no-cache && ./start.sh`. |
| **Frontend shows old code** | Hard refresh (Ctrl+Shift+R / Cmd+Shift+R) or clear cache. If using Docker, rebuild: `docker compose build frontend && docker compose up -d frontend`. |
| **API keys not working** | Keys can be set in `.env` or in the app **Settings**. Restart the backend after changing `.env`: `docker compose restart backend`. |

---

## Further reading

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Relation of Docker, Kubernetes, and Puppeteer; Monte Carlo math; app architecture and data flow.
- **API docs** — When the backend is running: [http://localhost:8000/docs](http://localhost:8000/docs).
- **Ollama** — [ollama.com](https://ollama.com) for local LLM models and docs.
