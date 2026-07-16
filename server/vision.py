"""Optional vision backend: read a nutrition label from a photo.

Given an image of a product's Nutrition Facts table, this asks a vision-capable
LLM (via an OpenAI-compatible chat endpoint) to extract the nutritional values
PER 100 g. It reuses the same endpoint/key as the text LLM (see llm.py) but a
separate model can be set because vision needs a multimodal model.

Configure via .env (or environment variables):
    EATTRACK_LLM_API_KEY=sk-...        (cloud only; Ollama needs no key)
    EATTRACK_LLM_URL=...               (e.g. http://localhost:11434/v1/chat/completions)
    EATTRACK_VISION_MODEL=llama3.2-vision   (falls back to EATTRACK_LLM_MODEL)

Disabled unless a vision model is configured. Standard library only (urllib).
"""

import json
import os
import urllib.error
import urllib.request

from llm import DEFAULT_URL, _valid_per100

_PROMPT = (
    "You are a nutrition label reader. The image shows a food product's "
    "Nutrition Facts / nutritional values table. Extract the values PER 100 g. "
    "If the label only lists values per serving, convert them to per 100 g "
    "using the serving size. Use kcal for calories (if only kJ is shown, "
    "divide by 4.184). Respond ONLY with JSON of this exact shape: "
    '{"name":"<product name or empty>","per_100g":'
    '{"calories":<kcal>,"protein":<g>,"carbs":<g>,"fat":<g>,"fiber":<g>}}'
)


def _model():
    return os.environ.get("EATTRACK_VISION_MODEL") or os.environ.get("EATTRACK_LLM_MODEL")


def is_enabled():
    """Vision needs an endpoint AND an explicit vision model to opt in."""
    has_endpoint = bool(os.environ.get("EATTRACK_LLM_API_KEY") or os.environ.get("EATTRACK_LLM_URL"))
    return has_endpoint and bool(_model())


def read_label(image_data_url):
    """Return per-100g macros from a label image, or None on failure.

    `image_data_url` must be a data URL like "data:image/jpeg;base64,....".
    Result: { name, calories, protein, carbs, fat, fiber, source:"vision" }.
    """
    if not image_data_url:
        return None

    key = os.environ.get("EATTRACK_LLM_API_KEY")
    url = os.environ.get("EATTRACK_LLM_URL", DEFAULT_URL)
    if not key and url == DEFAULT_URL:
        return None

    model = _model()
    if not model:
        return None

    payload = {
        "model": model,
        "temperature": 0,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _PROMPT},
                    {"type": "image_url", "image_url": {"url": image_data_url}},
                ],
            }
        ],
    }
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        content = body["choices"][0]["message"]["content"]
        raw = json.loads(_strip_fences(content))
    except (urllib.error.URLError, KeyError, ValueError, TimeoutError):
        return None

    per100 = _valid_per100(raw.get("per_100g"))
    if not per100:
        return None

    name = str(raw.get("name") or "").strip()
    return {"name": name, "source": "vision", **per100}


def _strip_fences(text):
    """Some models wrap JSON in ```json ... ``` fences; strip them."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t
        t = t.replace("```json", "").replace("```", "").strip()
    return t
