#!/usr/bin/env python3
"""export_ladder_strong.py

Strong exporter for RA2 Ladder (v1.0 stable)

Keeps your current exporter behavior:
- Reads ladder.db (players + ratings)
- Optional .env load (only if python-dotenv installed)
- Optional Discord username lookup with caching + rate-limit handling
- Writes leaderboard.json for GitHub Pages

Adds:
- streak_icon
- rank + rank_change (movement vs previous exported leaderboard.json)
- matches.json (last 50; uses match_result_audit if available else match_results)

Default output:
  F:\cbot\ladder_site\docs\leaderboard.json
  F:\cbot\ladder_site\docs\matches.json

Usage (PowerShell):
  cd F:\cbot\ladder_site
  python .\export_ladder_strong.py
  git add docs\leaderboard.json docs\matches.json
  git commit -m "Update ladder data"
  git push

Optional:
  python .\export_ladder_strong.py --db F:\cbot\ladder.db --out F:\cbot\ladder_site\docs --limit 50
  python .\export_ladder_strong.py --also-site
"""

import argparse
import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from urllib import request, error

# ---- PATHS (match your repo layout) ----
BOT_FOLDER = r"F:\cbot"  # where cbot.py + ladder.db live

# load .env ONLY if python-dotenv exists (no crash if missing)
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BOT_FOLDER, ".env"), override=True)
except ModuleNotFoundError:
    pass

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "").strip()
DISCORD_API_BASE = "https://discord.com/api/v10"

CACHE_PATH = os.path.join(BOT_FOLDER, "ladder_site", "username_cache.json")

STREAK_ICONS = {
    "win": "\U0001F525",   # fire
    "loss": "\U0001F976",  # cold face
    "none": "\u2014",      # em dash
}

ELO_DEFAULT = 1000


def now_utc_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def iso_to_pretty(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(s)


def _username_to_str(u):
    if u is None:
        return None
    if isinstance(u, dict):
        return u.get("name") or u.get("username") or u.get("display_name")
    return str(u)


def _load_cache():
    if os.path.exists(CACHE_PATH):
        try:
            with open(CACHE_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return {}


def _save_cache(cache):
    try:
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


def _discord_get_json(url: str):
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


def _fetch_username(user_id: int, cache: dict):
    # Normalize any old dict-form usernames in cache
    for k, v in list(cache.items()):
        cache[k] = _username_to_str(v)

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


def _load_prev_ranks(out_dir: str):
    prev_path = os.path.join(out_dir, "leaderboard.json")
    if not os.path.exists(prev_path):
        return {}
    try:
        with open(prev_path, "r", encoding="utf-8") as f:
            prev = json.load(f)
        ranks = {}
        for idx, p in enumerate(prev.get("players", []), start=1):
            uid = p.get("user_id")
            if uid is None:
                continue
            ranks[int(uid)] = idx
        return ranks
    except Exception:
        return {}


def _streak_icon(win_streak: int, loss_streak: int) -> str:
    if win_streak > 0:
        return STREAK_ICONS["win"]
    if loss_streak > 0:
        return STREAK_ICONS["loss"]
    return STREAK_ICONS["none"]


def export_leaderboard(db_path: str, out_dir: str, also_site: bool = False):
    os.makedirs(out_dir, exist_ok=True)
    prev_ranks = _load_prev_ranks(out_dir)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    c.execute(
        """
        SELECT
            p.user_id,
            p.class,
            p.wins,
            p.losses,
            p.win_streak,
            p.loss_streak,
            p.dodges,
            p.last_match_ts,
            COALESCE(r.rating, ?) AS rating
        FROM players p
        LEFT JOIN ratings r ON r.user_id = p.user_id
        """,
        (int(ELO_DEFAULT),),
    )
    rows = c.fetchall()
    conn.close()

    cache = _load_cache()

    players = []
    for r in rows:
        uid = int(r["user_id"])
        wins = int(r["wins"] or 0)
        losses = int(r["losses"] or 0)
        games = wins + losses
        ws = int(r["win_streak"] or 0)
        ls = int(r["loss_streak"] or 0)

        username = _fetch_username(uid, cache)

        players.append(
            {
                "user_id": uid,
                "username": _username_to_str(username),
                "class": str(r["class"] or ""),
                "rating": int(r["rating"] or ELO_DEFAULT),
                "wins": wins,
                "losses": losses,
                "games": games,
                "win_streak": ws,
                "loss_streak": ls,
                "dodges": int(r["dodges"] or 0),
                "last_match": iso_to_pretty(r["last_match_ts"]),
                "streak_icon": _streak_icon(ws, ls),
            }
        )

    _save_cache(cache)

    players.sort(key=lambda x: (int(x.get("rating") or 0), int(x.get("wins") or 0)), reverse=True)

    for idx, p in enumerate(players, start=1):
        uid = int(p["user_id"])
        p["rank"] = idx
        prev = prev_ranks.get(uid)
        p["rank_change"] = (int(prev) - int(idx)) if prev is not None else None

    payload = {
        "generated_at": now_utc_str(),
        "count": len(players),
        "players": players,
    }

    out_json = os.path.join(out_dir, "leaderboard.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    if also_site:
        site_dir = os.path.join(BOT_FOLDER, "ladder_site", "site")
        os.makedirs(site_dir, exist_ok=True)
        site_json = os.path.join(site_dir, "leaderboard.json")
        with open(site_json, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

    return out_json, len(players)


def export_matches(db_path: str, out_dir: str, limit: int = 50):
    os.makedirs(out_dir, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    audit_used = False
    try:
        c.execute("SELECT 1 FROM match_result_audit LIMIT 1").fetchone()
        audit_used = True
    except Exception:
        audit_used = False

    matches = []

    if audit_used:
        rows = c.execute(
            """
            SELECT
                a.match_id,
                a.guild_id,
                a.winner_id,
                a.loser_id,
                a.winner_class,
                a.loser_class,
                a.format,
                a.score_text,
                a.confirmer_user_id,
                a.old_winner_rating,
                a.new_winner_rating,
                a.delta_winner,
                a.old_loser_rating,
                a.new_loser_rating,
                a.delta_loser,
                a.confirmed_ts
            FROM match_result_audit a
            ORDER BY a.confirmed_ts DESC, a.audit_id DESC
            LIMIT ?
            """,
            (int(limit),),
        ).fetchall()

        for r in rows:
            matches.append(
                {
                    "match_id": int(r["match_id"]),
                    "guild_id": int(r["guild_id"]),
                    "winner_id": int(r["winner_id"]),
                    "loser_id": int(r["loser_id"]),
                    "winner_class": str(r["winner_class"] or ""),
                    "loser_class": str(r["loser_class"] or ""),
                    "format": str(r["format"] or ""),
                    "score": str(r["score_text"] or ""),
                    "confirmer_user_id": int(r["confirmer_user_id"] or 0),
                    "winner_rating_old": int(r["old_winner_rating"] or ELO_DEFAULT),
                    "winner_rating_new": int(r["new_winner_rating"] or ELO_DEFAULT),
                    "winner_delta": int(r["delta_winner"] or 0),
                    "loser_rating_old": int(r["old_loser_rating"] or ELO_DEFAULT),
                    "loser_rating_new": int(r["new_loser_rating"] or ELO_DEFAULT),
                    "loser_delta": int(r["delta_loser"] or 0),
                    "timestamp": str(r["confirmed_ts"]),
                }
            )
    else:
        rows = c.execute(
            """
            SELECT
                result_id,
                match_id,
                winner_id,
                loser_id,
                winner_class,
                loser_class,
                format,
                score_text,
                completed_ts
            FROM match_results
            ORDER BY completed_ts DESC, result_id DESC
            LIMIT ?
            """,
            (int(limit),),
        ).fetchall()

        for r in rows:
            matches.append(
                {
                    "match_id": int(r["match_id"]),
                    "winner_id": int(r["winner_id"]),
                    "loser_id": int(r["loser_id"]),
                    "winner_class": str(r["winner_class"] or ""),
                    "loser_class": str(r["loser_class"] or ""),
                    "format": str(r["format"] or ""),
                    "score": str(r["score_text"] or ""),
                    "timestamp": str(r["completed_ts"]),
                }
            )

    conn.close()

    payload = {
        "generated_at": now_utc_str(),
        "count": len(matches),
        "audit_used": audit_used,
        "matches": matches,
    }

    out_json = os.path.join(out_dir, "matches.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    return out_json, len(matches), audit_used


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.path.join(BOT_FOLDER, "ladder.db"))
    ap.add_argument("--out", default=os.path.join(BOT_FOLDER, "ladder_site", "docs"))
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--also-site", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        raise SystemExit(f"DB not found: {args.db}")

    lb_path, n = export_leaderboard(args.db, args.out, also_site=args.also_site)
    m_path, m_n, audit_used = export_matches(args.db, args.out, limit=args.limit)

    print(f"✅ Wrote {lb_path} ({n} players)")
    print(f"✅ Wrote {m_path} ({m_n} matches) | audit_used={audit_used}")


if __name__ == "__main__":
    main()
