"""
AI provider abstraction — routes to Ollama, Claude, or OpenAI based on model name.

  Model prefix    Provider          Needs env var or app setting
  ─────────────   ────────────────  ─────────────────────────────
  claude-*        Anthropic Claude  ANTHROPIC_API_KEY (env or Settings in app)
  gpt-* / o1-*    OpenAI            OPENAI_API_KEY (env or Settings in app)
  (anything else) Ollama (local)    —  (runs in Docker)
"""
import json
import os
import re
import urllib.error
import urllib.request

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


def _get_anthropic_key() -> str:
    """Prefer app-stored key, then env."""
    try:
        from auth import get_api_key
        v = get_api_key("ANTHROPIC_API_KEY")
        if v:
            return v
    except Exception:
        pass
    return os.getenv("ANTHROPIC_API_KEY", "").strip()


def _get_openai_key() -> str:
    """Prefer app-stored key, then env."""
    try:
        from auth import get_api_key
        v = get_api_key("OPENAI_API_KEY")
        if v:
            return v
    except Exception:
        pass
    return os.getenv("OPENAI_API_KEY", "").strip()


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

def _generate_claude(prompt: str, model: str, max_tokens: int = 1024) -> str:
    api_key = _get_anthropic_key()
    if not api_key:
        raise OllamaUnavailableError(
            "Claude API key is not set. Add it in Settings (or set ANTHROPIC_API_KEY in .env) and try again."
        )
    payload = json.dumps({
        "model": model,
        "max_tokens": max_tokens,
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

def _generate_openai(prompt: str, model: str, max_tokens: int = 1024) -> str:
    api_key = _get_openai_key()
    if not api_key:
        raise OllamaUnavailableError(
            "OpenAI API key is not set. Add it in Settings (or set OPENAI_API_KEY in .env) and try again."
        )
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
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

def generate_text(prompt: str, model: str, system: str | None = None, max_tokens: int = 1024) -> str:
    """
    Generate text using the appropriate provider for the given model name.
    The `system` parameter is only used by Ollama (Claude/OpenAI handle it via the prompt).
    """
    if system:
        prompt = f"{system}\n\n{prompt}"

    provider = _provider(model)
    if provider == "claude":
        return _generate_claude(prompt, model, max_tokens=max_tokens)
    if provider == "openai":
        return _generate_openai(prompt, model, max_tokens=max_tokens)
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
            "available": bool(_get_anthropic_key()),
            "models": [
                "claude-haiku-4-5-20251001",
                "claude-sonnet-4-6",
                "claude-opus-4-6",
            ],
        },
        "openai": {
            "available": bool(_get_openai_key()),
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


def extract_profit_list(text: str, max_values: int = 250) -> list[float]:
    """Parse a list of numbers from AI output (comma/newline/space separated)."""
    tokens = re.split(r"[\s,\n]+", text)
    result: list[float] = []
    for t in tokens:
        if len(result) >= max_values:
            break
        cleaned = t.strip().replace("$", "").replace(",", "")
        if not cleaned:
            continue
        try:
            result.append(float(cleaned))
        except ValueError:
            pass
    return result[:max_values]


def extract_profits_from_json(text: str, max_values: int = 250) -> list[float] | None:
    """
    Parse JSON from AI output and return the 'profits' array.
    Expects object like {"profits": [100, -200, 300, ...]}.
    Returns None if no valid JSON or no 'profits' key.
    """
    text = (text or "").strip()
    start = text.find("{")
    if start == -1:
        return None
    end = text.rfind("}")
    if end == -1 or end <= start:
        return None
    try:
        obj = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    raw = obj.get("profits")
    if raw is None:
        raw = obj.get("profit_values")
    if not isinstance(raw, list):
        return None
    result: list[float] = []
    for x in raw:
        if len(result) >= max_values:
            break
        if isinstance(x, (int, float)):
            result.append(float(x))
        elif isinstance(x, str):
            try:
                result.append(float(x.replace("$", "").replace(",", "").strip()))
            except ValueError:
                pass
    return result if result else None
