import json
import re
import urllib.request
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "src" / "wrestling-reference.generated.json"
SOURCE_URL = "https://prowrestling.fandom.com/wiki/WWF_Superstars_of_Wrestling"
API_URL = "https://prowrestling.fandom.com/api.php?action=parse&page=WWF_Superstars_of_Wrestling&prop=text&format=json&origin=*"
USER_AGENT = "Mozilla/5.0 Tobytube/1.0 (personal metadata importer)"


def main():
    request = urllib.request.Request(API_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        html = json.load(response)["parse"]["text"]["*"]
    table = pd.read_html(StringIO(html))[0]
    dates = parse_dates(table)

    database = json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))
    episodes = database.setdefault("episodes", [])
    existing = {
        (item.get("date"), canonical_series(item)): item
        for item in episodes
        if item.get("promotionId") == "wwe"
    }
    counters = {}
    added = []
    for date in dates:
        year = date[:4]
        counters[year] = counters.get(year, 0) + 1
        if (date, "superstars") in existing:
            current = existing[(date, "superstars")]
            current["sourceIds"] = list(dict.fromkeys([*(current.get("sourceIds") or []), "prowrestling-fandom-superstars"]))
            current["broadcastDate"] = date
            current["recordType"] = "episode"
            current["eventType"] = "TV Show"
            current["seriesName"] = "Superstars of Wrestling"
            continue
        added.append({
            "id": f"wwe-superstars-of-wrestling-{date}",
            "promotionId": "wwe",
            "promotion": "World Wrestling Federation",
            "recordType": "episode",
            "eventType": "TV Show",
            "seriesId": "wwe-superstars",
            "seriesName": "Superstars of Wrestling",
            "title": f"WWF Superstars of Wrestling - {date}",
            "date": date,
            "broadcastDate": date,
            "episodeNumber": counters[year],
            "sourceIds": ["prowrestling-fandom-superstars"],
            "externalIds": {"fandom": SOURCE_URL},
            "libraryVisible": True,
        })
    episodes.extend(added)
    if not any(source.get("id") == "prowrestling-fandom-superstars" for source in database.get("sources", [])):
        database.setdefault("sources", []).append({
            "id": "prowrestling-fandom-superstars",
            "name": "Pro Wrestling Wiki: WWF Superstars of Wrestling results",
            "url": SOURCE_URL,
        })
    database["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    REFERENCE_PATH.write_text(json.dumps(database, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"WWF Superstars source confirmed: {len(dates)} broadcast dates; added {len(added)} missing episodes.")


def parse_dates(table):
    values = []
    for column in table.columns:
        values.extend(column if isinstance(column, tuple) else [column])
    values.extend(table.iloc[:, 0].tolist())
    current_year = None
    dates = []
    for raw in values:
        text = re.sub(r"\s+", " ", str(raw)).strip()
        year_match = re.search(r"\b(19\d{2})\s+List of WWF Superstars", text)
        if year_match:
            current_year = int(year_match.group(1))
            text = text[year_match.end():]
        if not current_year:
            continue
        for month, day in re.findall(r"(?<!\d)(1[0-2]|[1-9])\s*/\s*(3[01]|[12]\d|[1-9])(?!\d)", text):
            try:
                dates.append(f"{current_year:04d}-{int(month):02d}-{int(day):02d}")
            except ValueError:
                continue
    return list(dict.fromkeys(dates))


def canonical_series(item):
    text = " ".join([str(item.get("seriesName") or ""), str(item.get("title") or "")]).lower()
    return "superstars" if "superstars" in text else ""


if __name__ == "__main__":
    main()
