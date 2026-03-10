# Supply Chain Command Center

Monte Carlo supply chain simulation with AI advisor.

---

## Quick Start

### 1 — Install prerequisites (once)

| Tool | What it does | Download |
|---|---|---|
| **Docker Desktop** | Runs the app in containers | https://www.docker.com/products/docker-desktop |
| **Ollama** | Runs the AI locally (free) | https://ollama.com |

Both are free, one-click installers.

### 2 — Start the app

```bash
./start.sh
```

That's it. The script will:
- Start Docker if it's not running
- Start Ollama and download the AI model (first time only, ~1 GB)
- Build and launch the app
- Open your browser at **http://localhost:8080**

### 3 — Stop the app

```bash
./stop.sh
```

---

## What the app does

| Feature | Description |
|---|---|
| **Monte Carlo Simulation** | Runs hundreds of supply chain scenarios in seconds |
| **Math Analysis** (blue panel) | Pure statistics: average, P10/P50/P90, VaR, bankruptcy rate |
| **AI Advisor** (green panel) | Explains the results in plain language, answers your questions |
| **Data Upload** | Upload CSV / JSON / Excel files for AI analysis |
| **AI Logs** | See every prompt and response the AI made |

---

## Troubleshooting

**App doesn't start**
→ Make sure Docker Desktop is running (look for the whale icon in your menu bar)

**AI says "Could not reach Ollama"**
→ Run `ollama serve` in a terminal, or restart your computer

**Port already in use**
→ Run `./stop.sh` first, then `./start.sh` again

**Want to reset everything**
→ Run `./stop.sh && ./start.sh`

---

## For developers

```bash
# Start with live reloading (no Docker)
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8000
cd frontend && npm run dev

# Rebuild Docker images
make build

# Run smoke tests
make qa

# View logs
make logs
```

The API docs are always available at **http://localhost:8000/docs** when running.
