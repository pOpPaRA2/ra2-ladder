import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from urllib import request, error

# ---- PATHS (adjust if needed) ----
BOT_FOLDER = r"F:\cbot"  # where cbot.py + ladder.db live

# ✅ FIX: load .env ONLY if python-dotenv exists (no crash if missing)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BOT_FOLDER, ".env"), override=True)
except ModuleNotFoundError:
    pass  # dotenv not installed; assume env vars already set

DB_PATH = os.path.join(BOT_FOLDER, "ladder.db")
OUT_DIR = os.path.join(BOT_FOLDER, "ladder_site", "site")
OUT_JSON = os.path.join(OUT_DIR, "leaderboard.json")

# ---- DISCORD SETTINGS ----
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "").strip()
DISCORD_API_BASE = "https://discord.com/api/v10"

# Cache usernames so you don't hammer Discord every export
CACHE_PATH = os.path.join(BOT_FOLDER, "ladder_site", "username_cache.json")


def iso_to_pretty(s: str | None) -> str | None:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return s


def _load_cache() -> dict:
    if os.path.exists(CACHE_PATH):
        try:
            with open(CACHE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return {}


def _save_cache(cache: dict) -> None:
    try:
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    except Exception:
        pass


def _discord_get_json(url: str) -> dict | None:
    """Discord GET with basic rate-limit handling."""
    if not DISCORD_TOKEN or DISCORD_TOKEN.count(".") < 2:
        return None

    headers = {
        "Authorization": f"Bot {DISCORD_TOKEN}",
        "User-Agent": "RA2LadderExporter",
    }
    req = request.Request(url, headers=headers, method="GET")

    try:
        with request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body)
    except error.HTTPError as e:
        if e.code == 429:
            try:
                data = json.loads(e.read().decode("utf-8"))
                retry_after = float(data.get("retry_after", 1.5))
            except Exception:
                retry_after = 2.0
            time.sleep(retry_after + 0.2)
            return _discord_get_json(url)
        return None
    except Exception:
        return None


def _fetch_username(user_id: int, cache: dict) -> str | None:
    key = str(user_id)
    if key in cache:
        return cache[key] or None

    data = _discord_get_json(f"{DISCORD_API_BASE}/users/{user_id}")
    if not data:
        cache[key] = None
        return None

    username = data.get("username")
    cache[key] = username
    return username


def main():
    if not os.path.exists(DB_PATH):
        raise SystemExit(f"DB not found: {DB_PATH}")

    os.makedirs(OUT_DIR, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute("""
        SELECT
            p.user_id,
            p.class,
            p.wins,
            p.losses,
            p.win_streak,
            p.loss_streak,
            p.dodges,
            p.last_match_ts,
            COALESCE(r.rating, 1000) AS rating
        FROM players p
        LEFT JOIN ratings r ON r.user_id = p.user_id
    """)
    rows = c.fetchall()
    conn.close()

    cache = _load_cache()

    players = []
    for r in rows:
        uid = int(r["user_id"])
        wins = int(r["wins"] or 0)
        losses = int(r["losses"] or 0)
        games = wins + losses

        username = _fetch_username(uid, cache)

        players.append({
            "user_id": uid,
            "username": username,
            "class": str(r["class"] or ""),
            "rating": int(r["rating"] or 1000),
            "wins": wins,
            "losses": losses,
            "games": games,
            "win_streak": int(r["win_streak"] or 0),
            "loss_streak": int(r["loss_streak"] or 0),
            "dodges": int(r["dodges"] or 0),
            "last_match": iso_to_pretty(r["last_match_ts"]),
        })

    _save_cache(cache)

    players.sort(key=lambda x: (x["rating"], x["wins"]), reverse=True)

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "count": len(players),
        "players": players,
    }

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"✅ Wrote {OUT_JSON} ({len(players)} players)")


if __name__ == "__main__":
    main()
