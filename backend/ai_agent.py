import json
import os
import re
import urllib.error
import urllib.request


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")


class OllamaUnavailableError(Exception):
    pass


def generate_text(prompt: str, model: str, system: str | None = None) -> str:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
    }
    if system:
        payload["system"] = system

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url=f"{OLLAMA_BASE_URL}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw)
            return parsed.get("response", "").strip()
    except TimeoutError as exc:
        raise OllamaUnavailableError(
            "Ollama request timed out. Model may still be loading; try again in 20-30s "
            "or use a smaller model like llama3.2:1b."
        ) from exc
    except urllib.error.URLError as exc:
        raise OllamaUnavailableError(
            "Could not reach Ollama. Start it with `ollama serve` and pull/run a model "
            "like `ollama run llama3`."
        ) from exc


def extract_first_int(text: str) -> int:
    # Prefer explicit XML-like answer tags if prompt requested them.
    tagged = re.search(r"<answer>\s*(-?\d+)\s*</answer>", text, flags=re.IGNORECASE)
    if tagged:
        return max(0, int(tagged.group(1)))

    # Fallback: pick the last integer to avoid grabbing percentages from explanations.
    matches = re.findall(r"-?\d+", text)
    if not matches:
        return 0
    match = matches[-1]
    if match is None:
        return 0
    return max(0, int(match))
