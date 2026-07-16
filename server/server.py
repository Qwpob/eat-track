"""Eat_Track backend — Python standard library only (no pip installs).

Serves the static frontend from ../public and a small JSON API for logging
meals (with automatic macro calculation), daily weight, and goals.

Run:  python server/server.py
Open: http://localhost:5000
"""

import json
import mimetypes
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)  # so `import parser` / `storage` works


def _load_dotenv():
    """Load ../.env if present so an optional LLM key is picked up."""
    root = os.path.abspath(os.path.join(HERE, ".."))
    candidates = [
        os.path.join(root, ".env"),
        os.path.join(root, ".env.txt"),
        os.path.join(root, ".env.local"),
    ]
    env_path = next((p for p in candidates if os.path.isfile(p)), None)
    if env_path is None:
        return None
    with open(env_path, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key, value = key.strip(), value.strip()
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                value = value[1:-1]
            os.environ.setdefault(key, value)
    return env_path


_ENV_PATH = _load_dotenv()

import food_db  # noqa: E402
import llm  # noqa: E402
import meal_parser  # noqa: E402
import nutrition_api  # noqa: E402
import storage  # noqa: E402
import vision  # noqa: E402

PUBLIC_DIR = os.path.abspath(os.path.join(HERE, "..", "public"))
PORT = int(os.environ.get("PORT", "5000"))


def _today():
    return time.strftime("%Y-%m-%d")


def _parse_text(text):
    """Try the LLM backend first (if configured), else the local parser.

    The local parser falls back to the online OpenFoodFacts database for any
    food it does not recognize locally.
    """
    if llm.is_enabled():
        result = llm.llm_parse(text)
        if result is not None:
            result["engine"] = "llm"
            return result
    resolver = nutrition_api.lookup if nutrition_api.is_enabled() else None
    result = meal_parser.parse_meal(text, resolver=resolver)
    result["engine"] = "online" if resolver else "local"
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep the console quiet
        pass

    # ---- helpers -------------------------------------------------------
    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length == 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    def _serve_static(self, path):
        rel = path.lstrip("/") or "index.html"
        full = os.path.abspath(os.path.join(PUBLIC_DIR, rel))
        if not full.startswith(PUBLIC_DIR) or not os.path.isfile(full):
            index = os.path.join(PUBLIC_DIR, "index.html")
            if os.path.isfile(index):
                full = index
            else:
                self.send_error(404)
                return
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        with open(full, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---- routing -------------------------------------------------------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if not path.startswith("/api/"):
            self._serve_static(path)
            return

        if path == "/api/config":
            if llm.is_enabled():
                engine = "llm"
            elif nutrition_api.is_enabled():
                engine = "online"
            else:
                engine = "local"
            self._send_json({
                "engine": engine,
                "vision": vision.is_enabled(),
                "today": _today(),
            })
        elif path == "/api/day":
            date = (qs.get("date") or [_today()])[0]
            self._send_json(storage.get_day(date))
        elif path == "/api/history":
            limit = int((qs.get("limit") or ["30"])[0])
            self._send_json(storage.get_history(limit))
        elif path == "/api/goals":
            self._send_json(storage.get_goals())
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        data = self._read_json()

        if path == "/api/parse":
            text = (data.get("text") or "").strip()
            if not text:
                self._send_json({"error": "empty text"}, 400)
                return
            self._send_json(_parse_text(text))

        elif path == "/api/label":
            if not vision.is_enabled():
                self._send_json({"error": "vision disabled"}, 503)
                return
            image = (data.get("image") or "").strip()
            if not image:
                self._send_json({"error": "empty image"}, 400)
                return
            result = vision.read_label(image)
            if result is None:
                self._send_json({"error": "could not read label"}, 422)
                return
            self._send_json(result)

        elif path == "/api/meals":
            text = (data.get("text") or "").strip()
            date = data.get("date") or _today()
            if not text:
                self._send_json({"error": "empty text"}, 400)
                return
            parsed = _parse_text(text)
            meal = storage.add_meal(date, text, parsed)
            self._send_json({"meal": meal, "day": storage.get_day(date)})

        elif path == "/api/meals/item":
            date = data.get("date") or _today()
            name = (data.get("name") or "").strip()
            per100 = llm._valid_per100(data.get("per_100g"))
            try:
                grams = round(float(data.get("grams")), 1)
            except (TypeError, ValueError):
                grams = 0
            if not name or grams <= 0 or not per100:
                self._send_json({"error": "invalid item"}, 400)
                return
            item = {
                "food": name,
                "grams": grams,
                "source": data.get("source", "vision"),
                **food_db.scale_per100(per100, grams),
            }
            parsed = {
                "items": [item],
                "unmatched": [],
                "totals": meal_parser._sum_macros([item]),
            }
            meal = storage.add_meal(date, name, parsed)
            self._send_json({"meal": meal, "day": storage.get_day(date)})

        elif path == "/api/weight":
            date = data.get("date") or _today()
            weight = storage.set_weight(date, data.get("weight"))
            self._send_json({"weight": weight, "day": storage.get_day(date)})

        elif path == "/api/goals":
            self._send_json(storage.set_goals(data))

        else:
            self._send_json({"error": "not found"}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        if parsed.path == "/api/meals":
            date = (qs.get("date") or [_today()])[0]
            meal_id = (qs.get("id") or [""])[0]
            ok = storage.delete_meal(date, meal_id)
            self._send_json({"ok": ok, "day": storage.get_day(date)})
        else:
            self._send_json({"error": "not found"}, 404)


def _lan_ip():
    """Best-effort local network IP (for accessing the app from a phone)."""
    import socket

    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # no packets are actually sent
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def main():
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    mimetypes.add_type("image/svg+xml", ".svg")
    if llm.is_enabled():
        engine = "LLM (+ online fallback)"
    elif nutrition_api.is_enabled():
        engine = "local + OpenFoodFacts (online)"
    else:
        engine = "local"
    print(f"Eat_Track running (parser: {engine})")
    print(f"  On this PC:  http://localhost:{PORT}")
    ip = _lan_ip()
    if ip:
        print(f"  On phone:    http://{ip}:{PORT}   (same Wi-Fi)")
    if _ENV_PATH:
        print(f"Loaded env from {_ENV_PATH}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
