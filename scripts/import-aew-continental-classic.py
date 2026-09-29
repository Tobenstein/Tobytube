import json
import re
import urllib.request
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "src" / "wrestling-reference.generated.json"
SOURCES = {year: f"https://en.wikipedia.org/wiki/{year}_Continental_Classic" for year in (2023, 2024, 2025)}
USER_AGENT = "Tobytube personal metadata importer (local prototype)"


def main():
    db = json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))
    tournament = next(item for item in db.get("tournaments", []) if item.get("id") == "aew-continental-classic")
    tournament["pageType"] = "round-robin"
    tournament["results"] = [parse_year(year, url, db) for year, url in SOURCES.items()]
    tournament["externalIds"] = {str(year): url for year, url in SOURCES.items()}
    tournament["sourceIds"] = ["wikipedia-aew-continental-classic-years"]
    if not any(source.get("id") == "wikipedia-aew-continental-classic-years" for source in db.get("sources", [])):
        db.setdefault("sources", []).append({"id": "wikipedia-aew-continental-classic-years", "name": "Wikipedia AEW Continental Classic yearly histories"})
    db["generatedAt"] = now_utc()
    REFERENCE_PATH.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Imported AEW Continental Classic: " + ", ".join(f"{item['year']} ({len(item['matches'])} matches)" for item in tournament["results"]))


def parse_year(year, url, db):
    tables = fetch_tables(url)
    infobox = {clean(row.iloc[0]).lower(): clean(row.iloc[1]) for _, row in tables[0].iterrows()}
    standings = tables[4]
    leagues = {
        "Blue": league_rows(standings.iloc[:, 0], standings.iloc[:, 1]),
        "Gold": league_rows(standings.iloc[:, 2], standings.iloc[:, 3]),
    }
    matches = []
    for _, row in tables[2].iterrows():
        date = parse_month_day(row.iloc[0], year)
        match_text = clean(row.iloc[4])
        if not date or not match_text:
            continue
        matches.append({
            "date": date,
            "show": clean(row.iloc[1]),
            "venue": clean(row.iloc[2]),
            "league": {"B": "Blue", "G": "Gold", "F": "Final"}.get(clean(row.iloc[3]), clean(row.iloc[3])),
            "match": match_text,
            "time": clean(row.iloc[5]),
        })
    winner = clean(infobox.get("champion"))
    runner_up = clean(infobox.get("runner-up"))
    winner_league, winner_points = entrant_result(leagues, winner)
    runner_league, runner_points = entrant_result(leagues, runner_up)
    final_match = matches[-1]
    archive = find_archive_event(db, final_match["show"], final_match["date"])
    return {
        "year": year,
        "winner": winner,
        "winnerPersonId": wrestler_id(winner),
        "winnerPoints": winner_points,
        "winnerLeague": winner_league,
        "runnerUp": runner_up,
        "runnerUpPersonId": wrestler_id(runner_up),
        "runnerUpPoints": runner_points,
        "runnerUpLeague": runner_league,
        "final": {
            "date": final_match["date"],
            "event": final_match["show"],
            "venue": final_match["venue"],
            "eventId": archive.get("id") if archive else None,
        },
        "leagues": leagues,
        "matches": matches,
        "sourceUrl": url,
    }


def fetch_tables(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        html = response.read().decode("utf-8", errors="replace")
    return pd.read_html(StringIO(html))


def league_rows(names, points):
    output = []
    for name, point_value in zip(names, points):
        name = clean(name)
        if not name or name.lower() == "nan":
            continue
        note_match = re.search(r"\[([^]]+)\]$", name)
        clean_name = re.sub(r"\[[^]]+\]$", "", name).strip()
        try:
            point_value = int(point_value)
        except (TypeError, ValueError):
            point_value = None
        output.append({"name": clean_name, "personId": wrestler_id(clean_name), "points": point_value, "note": note_match.group(1) if note_match else None})
    return output


def entrant_result(leagues, entrant):
    target = normalize(entrant)
    for league, rows in leagues.items():
        for row in rows:
            if normalize(row["name"]) == target:
                return league, row["points"]
    return None, None


def find_archive_event(db, title, date):
    key = normalize(title)
    candidates = [item for item in db.get("events", []) + db.get("episodes", []) if item.get("promotionId") == "aew" and item.get("date") == date]
    return next((item for item in candidates if key in normalize(item.get("title")) or normalize(item.get("title")) in key), None) or (candidates[0] if candidates else None)


def parse_month_day(value, year):
    parsed = pd.to_datetime(f"{clean(value)} {year}", errors="coerce")
    return None if pd.isna(parsed) else parsed.strftime("%Y-%m-%d")


def wrestler_id(name):
    return None if not clean(name) else f"wrestler-{slug(name)}"


def normalize(value):
    return re.sub(r"[^a-z0-9]+", " ", clean(value).lower()).strip()


def slug(value):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", clean(value).lower()))


def clean(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


if __name__ == "__main__":
    main()
