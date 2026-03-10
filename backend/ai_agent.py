"""
AI provider abstraction — routes to Ollama, Claude, or OpenAI based on model name.

  Model prefix    Provider          Needs env var
  ─────────────   ────────────────  ──────────────────────
  claude-*        Anthropic Claude  ANTHROPIC_API_KEY
  gpt-* / o1-*    OpenAI            OPENAI_API_KEY
  (anything else) Ollama (local)    —  (runs in Docker)
"""
import json
import os
import re
import urllib.error
import urllib.request

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


class OllamaUnavailableError(Exception):
    pass


# ── Provider detection ────────────────────────────────────────────────────────

def _provider(model: str) -> str:
    m = model.lower()
    if m.startswith("claude-"):
        return "claude"
    if m.startswith("gpt-") or m.startswith("o1-") or m.startswith("o3-"):
        return "openai"
    return "ollama"


# ── Ollama ────────────────────────────────────────────────────────────────────

def _generate_ollama(prompt: str, model: str) -> str:
    payload = json.dumps({"model": model, "prompt": prompt, "stream": False}).encode()
    req = urllib.request.Request(
        url=f"{OLLAMA_BASE_URL}/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read()).get("response", "").strip()
    except TimeoutError as exc:
        raise OllamaUnavailableError(
            "Ollama request timed out. The model may still be downloading — "
            "check /ai/status and try again in a minute."
        ) from exc
    except urllib.error.URLError as exc:
        raise OllamaUnavailableError(
            "Could not reach Ollama container. Make sure it's running: "
            "`docker compose up ollama`"
        ) from exc


# ── Anthropic Claude ──────────────────────────────────────────────────────────

def _generate_claude(prompt: str, model: str) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise OllamaUnavailableError(
            "ANTHROPIC_API_KEY is not set. "
            "Add it to your .env file or docker-compose environment and restart."
        )
    payload = json.dumps({
        "model": model,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        url="https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
            return data["content"][0]["text"].strip()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        raise OllamaUnavailableError(f"Claude API error {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise OllamaUnavailableError(f"Could not reach Anthropic API: {exc}") from exc


# ── OpenAI ────────────────────────────────────────────────────────────────────

def _generate_openai(prompt: str, model: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise OllamaUnavailableError(
            "OPENAI_API_KEY is not set. "
            "Add it to your .env file or docker-compose environment and restart."
        )
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
    }).encode()
    req = urllib.request.Request(
        url="https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
            return data["choices"][0]["message"]["content"].strip()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        raise OllamaUnavailableError(f"OpenAI API error {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise OllamaUnavailableError(f"Could not reach OpenAI API: {exc}") from exc


# ── Public interface ──────────────────────────────────────────────────────────

def generate_text(prompt: str, model: str, system: str | None = None) -> str:
    """
    Generate text using the appropriate provider for the given model name.
    The `system` parameter is only used by Ollama (Claude/OpenAI handle it via the prompt).
    """
    if system:
        prompt = f"{system}\n\n{prompt}"

    provider = _provider(model)
    if provider == "claude":
        return _generate_claude(prompt, model)
    if provider == "openai":
        return _generate_openai(prompt, model)
    return _generate_ollama(prompt, model)


def provider_status() -> dict:
    """Return which providers are currently configured."""
    ollama_ok = False
    ollama_models: list[str] = []
    ollama_pulling: list[str] = []

    try:
        with urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/tags", timeout=4) as r:
            data = json.loads(r.read())
        ollama_models = [m["name"] for m in data.get("models", [])]
        ollama_ok = True
    except Exception:
        pass

    # Check if a pull is in progress (Ollama returns partial models during pull)
    try:
        with urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/ps", timeout=4) as r:
            ps = json.loads(r.read())
            ollama_pulling = [m.get("name", "") for m in ps.get("models", [])
                              if "pulling" in m.get("status", "")]
    except Exception:
        pass

    return {
        "ollama": {
            "available": ollama_ok,
            "models": ollama_models,
            "pulling": ollama_pulling,
        },
        "claude": {
            "available": bool(os.getenv("ANTHROPIC_API_KEY", "").strip()),
            "models": [
                "claude-3-haiku-20240307",
                "claude-3-5-sonnet-20241022",
                "claude-3-opus-20240229",
            ],
        },
        "openai": {
            "available": bool(os.getenv("OPENAI_API_KEY", "").strip()),
            "models": ["gpt-4o-mini", "gpt-4o"],
        },
    }


def pull_model(model: str) -> None:
    """Trigger an Ollama model pull (blocking)."""
    payload = json.dumps({"name": model, "stream": False}).encode()
    req = urllib.request.Request(
        url=f"{OLLAMA_BASE_URL}/api/pull",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        r.read()


def extract_first_int(text: str) -> int:
    tagged = re.search(r"<answer>\s*(-?\d+)\s*</answer>", text, flags=re.IGNORECASE)
    if tagged:
        return max(0, int(tagged.group(1)))
    matches = re.findall(r"-?\d+", text)
    return max(0, int(matches[-1])) if matches else 0
