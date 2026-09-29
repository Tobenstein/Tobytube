import argparse
import io
import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "src" / "wrestling-reference.generated.json"
CACHE_DIR = ROOT / "cache" / "aew-wikipedia"
SOURCE_ID = "wikipedia-aew-programming"

USER_AGENT = "Tobytube metadata prototype (personal use)"

EPISODE_SOURCES = [
    {
        "key": "dynamite-episodes",
        "url": "https://en.wikipedia.org/wiki/List_of_AEW_Dynamite_episodes",
        "series_id": "aew-dynamite",
        "series_name": "Dynamite",
        "short_name": "DYNAMITE",
        "start_date": "2019-10-02",
        "end_date": None,
    },
    {
        "key": "collision-episodes",
        "url": "https://en.wikipedia.org/wiki/List_of_AEW_Collision_episodes",
        "series_id": "aew-collision",
        "series_name": "Collision",
        "short_name": "COLLISION",
        "start_date": "2023-06-17",
        "end_date": None,
    },
    {
        "key": "rampage-episodes",
        "url": "https://en.wikipedia.org/wiki/List_of_AEW_Rampage_episodes",
        "series_id": "aew-rampage",
        "series_name": "Rampage",
        "short_name": "RAMPAGE",
        "start_date": "2021-08-13",
        "end_date": "2024-12-27",
    },
    {
        "key": "dark-episodes",
        "url": "https://en.wikipedia.org/wiki/List_of_AEW_Dark_episodes",
        "series_id": "aew-dark",
        "series_name": "Dark",
        "short_name": "DARK",
        "start_date": "2019-10-08",
        "end_date": "2023-04-25",
    },
    {
        "key": "dark-elevation-episodes",
        "url": "https://en.wikipedia.org/wiki/List_of_AEW_Dark:_Elevation_episodes",
        "series_id": "aew-dark-elevation",
        "series_name": "Dark: Elevation",
        "short_name": "ELEVATION",
        "start_date": "2021-03-15",
        "end_date": "2023-04-24",
    },
]

EVENT_SOURCES = [
    {
        "key": "dynamite-special-episodes",
        "url": "https://en.wikipedia.org/wiki/List_of_AEW_Dynamite_special_episodes",
        "kind": "dynamite-specials",
    },
    {
        "key": "special-events",
        "url": "https://en.wikipedia.org/wiki/List_of_All_Elite_Wrestling_special_events",
        "kind": "special-events",
    },
    {
        "key": "pay-per-view-events",
        "url": "https://en.wikipedia.org/wiki/List_of_All_Elite_Wrestling_pay-per-view_events",
        "kind": "ppv-events",
    },
    {
        "key": "battle-of-the-belts",
        "url": "https://en.wikipedia.org/wiki/AEW_Battle_of_the_Belts",
        "kind": "battle-of-the-belts",
    },
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Re-download cached Wikipedia pages.")
    args = parser.parse_args()

    db = read_json(REFERENCE_PATH)
    ensure_reference_shape(db)
    ensure_source(db)
    ensure_promotion(db)
    purge_previous_import(db)
    ensure_series(db)

    special_keys = set()
    imported_episodes = 0
    imported_events = 0
    imported_matches = 0

    for source in EVENT_SOURCES:
        html = read_source(source, args.refresh)
        tables = pd.read_html(io.BytesIO(html))
        if source["kind"] == "dynamite-specials":
            events = parse_dynamite_specials(tables, source)
        elif source["kind"] == "special-events":
            events = parse_special_events(tables, source)
        elif source["kind"] == "ppv-events":
            events = parse_ppv_events(tables, source)
        else:
            events = parse_battle_of_the_belts(tables, source)

        for event in events:
            special_keys.add((event.get("seriesName"), event["date"], special_key_name(event)))
            imported_events += upsert_record(db["events"], event)
            imported_matches += upsert_main_event_match(db, event, event.get("mainEvent"))

    for source in EPISODE_SOURCES:
        html = read_source(source, args.refresh)
        tables = pd.read_html(io.BytesIO(html))
        for episode in parse_episode_tables(tables, source, special_keys):
            table = db["events"] if episode["recordType"] == "event" else db["episodes"]
            other_table = db["episodes"] if episode["recordType"] == "event" else db["events"]
            remove_by_id(other_table, episode["id"])
            imported_episodes += 1 if episode["recordType"] == "episode" else 0
            imported_events += 1 if episode["recordType"] == "event" else 0
            upsert_record(table, episode)
            imported_matches += upsert_main_event_match(db, episode, episode.get("mainEvent"))

    db["generatedAt"] = now_utc()
    REFERENCE_PATH.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "Imported AEW Wikipedia programming: "
        f"{imported_episodes} weekly episodes, {imported_events} events/specials, "
        f"{imported_matches} main-event match placeholders."
    )


def read_source(source, refresh=False):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / f"{source['key']}.html"
    if refresh or not target.exists():
        request = urllib.request.Request(source["url"], headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=45) as response:
            target.write_bytes(response.read())
    return target.read_bytes()


def parse_episode_tables(tables, source, special_keys):
    records = []
    for table in tables:
        table = normalize_columns(table)
        columns = set(table.columns)
        if not {"date", "location", "venue"}.issubset(columns):
            continue
        if "no" not in columns:
            continue

        for _, row in table.iterrows():
            episode_number = parse_number(row.get("no"))
            date_text = clean(row.get("date"))
            date, special_name = parse_date_with_special(date_text)
            if not date:
                continue

            main_event = clean(row.get("main_event"))
            inferred_special = special_name
            if not inferred_special:
                inferred_special = find_matching_special_name(source["series_name"], date, special_keys)

            record_type = "event" if inferred_special else "episode"
            title = (
                f"AEW {source['series_name']}: {inferred_special}"
                if inferred_special
                else f"AEW {source['series_name']} #{episode_number}"
            )
            record_id = (
                f"wikipedia-aew-tv-special-{slug(source['series_name'])}-{date}-{slug(inferred_special)}"
                if inferred_special
                else f"wikipedia-aew-{slug(source['series_name'])}-{episode_number or date}"
            )

            records.append(
                base_record(
                    record_id,
                    title,
                    date,
                    "TV Special" if inferred_special else "TV Show",
                    record_type,
                    source,
                    venue=clean(row.get("venue")),
                    location=clean(row.get("location")),
                    series_name=source["series_name"],
                    series_id=source["series_id"],
                    episode_number=episode_number,
                    main_event=main_event,
                    summary=main_event,
                    external_key=source["key"],
                )
            )
    return records


def parse_dynamite_specials(tables, source):
    events = []
    for table in tables:
        table = normalize_columns(table)
        if not {"episode", "date", "venue", "location"}.issubset(set(table.columns)):
            continue
        for _, row in table.iterrows():
            title = clean(row.get("episode"))
            date, _ = parse_date_with_special(clean(row.get("date")))
            if not title or not date:
                continue
            event = base_record(
                f"wikipedia-aew-tv-special-dynamite-{date}-{slug(title)}",
                f"AEW Dynamite: {title}",
                date,
                "TV Special",
                "event",
                source,
                venue=clean(row.get("venue")),
                location=clean(row.get("location")),
                series_name="Dynamite",
                series_id="aew-dynamite",
                main_event=extract_last_sentence(clean(row.get("notes"))),
                summary=clean(row.get("notes")),
                external_key=source["key"],
            )
            events.append(event)
    return dedupe_records(events)


def parse_special_events(tables, source):
    events = []
    year = 2018
    for table in tables:
        table = normalize_columns(table)
        if "event_1" not in table.columns or "date" not in table.columns:
            continue
        year += 1
        for _, row in table.iterrows():
            title = clean(row.get("event_1")) or clean(row.get("event"))
            date, _ = parse_date_with_special(clean(row.get("date")), default_year=year)
            if not title or not date:
                continue
            events.append(
                base_record(
                    f"wikipedia-aew-special-{date}-{slug(title)}",
                    title if title.startswith("AEW ") else f"AEW {title}",
                    date,
                    "TV Special",
                    "event",
                    source,
                    venue=clean(row.get("venue")),
                    location=clean(row.get("location")),
                    main_event=clean(row.get("main_event")),
                    summary=clean(row.get("notes")),
                    external_key=source["key"],
                )
            )
    return dedupe_records(events)


def parse_ppv_events(tables, source):
    events = []
    year = 2018
    for table in tables:
        table = normalize_columns(table)
        if "event" not in table.columns or "date" not in table.columns or "main_event" not in table.columns:
            continue
        year += 1
        for _, row in table.iterrows():
            title = clean(row.get("event"))
            date, _ = parse_date_with_special(clean(row.get("date")), default_year=year)
            if not title or not date:
                continue
            events.append(
                base_record(
                    f"wikipedia-aew-ppv-{date}-{slug(title)}",
                    title if title.startswith("AEW ") else f"AEW {title}",
                    date,
                    "Pay-Per-View",
                    "event",
                    source,
                    venue=clean(row.get("venue")),
                    location=clean(row.get("location")),
                    attendance=parse_number(row.get("attendance")),
                    main_event=clean(row.get("main_event")),
                    summary=clean(row.get("notes")),
                    external_key=source["key"],
                )
            )
    return dedupe_records(events)


def parse_battle_of_the_belts(tables, source):
    events = []
    for table in tables:
        table = normalize_columns(table)
        if not {"event", "date", "city", "venue"}.issubset(set(table.columns)):
            continue
        for _, row in table.iterrows():
            title = clean(row.get("event"))
            date, _ = parse_date_with_special(clean(row.get("date")))
            if not title or not date:
                continue
            events.append(
                base_record(
                    f"wikipedia-aew-battle-of-the-belts-{date}-{slug(title)}",
                    f"AEW {title}" if not title.startswith("AEW ") else title,
                    date,
                    "TV Special",
                    "event",
                    source,
                    venue=clean(row.get("venue")),
                    location=clean(row.get("city")),
                    main_event=clean(row.get("main_event")),
                    external_key=source["key"],
                )
            )
    return dedupe_records(events)


def base_record(
    record_id,
    title,
    date,
    event_type,
    record_type,
    source,
    venue=None,
    location=None,
    attendance=None,
    series_name=None,
    series_id=None,
    episode_number=None,
    main_event=None,
    summary=None,
    external_key=None,
):
    city, region, country = split_location(location)
    return {
        "id": record_id,
        "title": clean(title),
        "promotionId": "aew",
        "promotion": "All Elite Wrestling",
        "date": date,
        "dateDisplay": date,
        "venue": venue,
        "city": city,
        "region": region,
        "country": country,
        "location": location,
        "attendance": attendance,
        "eventType": event_type,
        "seriesName": series_name,
        "seriesId": series_id,
        "episodeNumber": episode_number,
        "recordType": record_type,
        "mainEvent": main_event,
        "summary": summary,
        "sourceIds": [SOURCE_ID],
        "externalIds": {
            "wikipedia": {
                "url": source["url"],
                "sourcePage": external_key,
            }
        },
        "importedAt": now_utc(),
    }


def upsert_main_event_match(db, event, main_event):
    text = clean(main_event)
    if not text or text.lower().startswith("none"):
        return 0

    match = {
        "id": f"{event['id']}-main-event",
        "eventId": event["id"],
        "eventRecordType": event["recordType"],
        "promotionId": "aew",
        "order": 999,
        "label": "Main Event",
        "raw": text,
        "displayText": text,
        "stipulation": infer_stipulation(text),
        "titleMatch": infer_title_match(text),
        "championshipId": None,
        "participants": [],
        "teams": [],
        "champions": infer_champions_from_text(text),
        "championMarked": "(c)" in text,
        "spoilerSafe": True,
        "winner": None,
        "result": None,
        "sourceIds": [SOURCE_ID],
        "externalIds": {"wikipedia": event["externalIds"]["wikipedia"]},
    }
    return upsert_record(db["matches"], match)


def ensure_reference_shape(db):
    for key in [
        "sources",
        "promotions",
        "series",
        "events",
        "episodes",
        "venues",
        "people",
        "matches",
        "championships",
        "titleReigns",
        "externalIds",
    ]:
        db.setdefault(key, [])
    db.setdefault("schemaVersion", 1)


def ensure_source(db):
    source = {
        "id": SOURCE_ID,
        "name": "Wikipedia AEW programming lists",
        "type": "events",
        "url": "https://en.wikipedia.org/wiki/List_of_All_Elite_Wrestling_special_events",
        "priority": 20,
        "notes": "AEW episode, special, and pay-per-view tables. Main-event text is imported spoiler-safe; winner/result fields are reserved for later sources.",
    }
    upsert_record(db["sources"], source)


def ensure_promotion(db):
    promotion = {
        "id": "aew",
        "name": "All Elite Wrestling",
        "summary": "AEW archive imported from Wikipedia programming and event lists.",
        "sourceIds": [SOURCE_ID],
        "externalIds": {"wikipedia": {"url": "https://en.wikipedia.org/wiki/All_Elite_Wrestling"}},
    }
    upsert_record(db["promotions"], promotion)


def ensure_series(db):
    for source in EPISODE_SOURCES:
        series = {
            "id": source["series_id"],
            "promotionId": "aew",
            "name": source["series_name"],
            "shortName": source["short_name"],
            "startDate": source["start_date"],
            "endDate": source["end_date"],
            "sourceIds": [SOURCE_ID],
            "externalIds": {"wikipedia": {"url": source["url"]}},
        }
        upsert_record(db["series"], series)


def purge_previous_import(db):
    for table_name in ("events", "episodes", "matches"):
        db[table_name] = [
            record
            for record in db[table_name]
            if not (
                record.get("promotionId") == "aew"
                and SOURCE_ID in (record.get("sourceIds") or [])
            )
        ]


def normalize_columns(table):
    table = table.copy()
    flattened = []
    counts = {}
    for column in table.columns:
        if isinstance(column, tuple):
            column = "_".join(str(part) for part in column if str(part) != "nan")
        name = clean(column).lower()
        name = name.replace(".", "")
        name = re.sub(r"[^a-z0-9]+", "_", name).strip("_")
        name = name.replace("main_event", "main_event")
        if name in counts:
            counts[name] += 1
            name = f"{name}_{counts[name]}"
        else:
            counts[name] = 0
        flattened.append(name)
    table.columns = flattened
    return table


def parse_date_with_special(value, default_year=None):
    raw = clean(value)
    if not raw:
        return None, None

    parentheticals = re.findall(r"\(([^)]+)\)", raw)
    special = None
    for item in parentheticals:
        if re.search(r"aired\s+([A-Za-z]+\s+\d{1,2})", item, flags=re.I):
            continue
        if not re.search(r"taped|pre-empt|delay|aired|moved", item, flags=re.I):
            special = clean(item)
            break

    aired_match = re.search(r"aired\s+([A-Za-z]+\s+\d{1,2})", raw, flags=re.I)
    if aired_match and default_year:
        date_part = f"{aired_match.group(1)}, {default_year}"
    else:
        date_part = re.sub(r"\([^)]*\)", "", raw).strip()
        if default_year and not re.search(r"\b\d{4}\b", date_part):
            date_part = f"{date_part}, {default_year}"

    date_part = re.sub(r"\[[^\]]+\]", "", date_part)
    date_part = re.sub(r"\s+", " ", date_part).strip()
    date = parse_date(date_part)
    return date, special


def parse_date(value):
    if not value:
        return None
    for fmt in ("%B %d, %Y", "%B %d %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def find_matching_special_name(series_name, date, special_keys):
    for special_series, special_date, name in special_keys:
        if special_series == series_name and special_date == date:
            return name
    return None


def special_key_name(record):
    title = clean(record.get("title"))
    series_name = clean(record.get("seriesName"))
    if title and series_name:
        title = re.sub(rf"^AEW\s+{re.escape(series_name)}\s*:\s*", "", title, flags=re.I)
    return title


def split_location(location):
    if not location:
        return None, None, None
    parts = [part.strip() for part in location.split(",")]
    if len(parts) == 1:
        return parts[0], None, None
    if len(parts) == 2:
        return parts[0], parts[1], None
    return parts[0], parts[1], ", ".join(parts[2:])


def infer_title_match(text):
    match = re.search(r"for the ([A-Z][A-Za-z0-9 '\-:&]+ Championship)", text)
    return match.group(1) if match else None


def infer_stipulation(text):
    match = re.search(r"\bin an? ([A-Z][A-Za-z0-9 '\-:&]+ match)", text)
    if match:
        return match.group(1)
    if " for the " in text:
        return "Title Match"
    return "Match"


def infer_champions_from_text(text):
    champions = []
    for name in re.findall(r"([^,;]+?)\s*\(c\)", text):
        clean_name = clean(name)
        if clean_name:
            champions.append({"id": f"person-{slug(clean_name)}", "name": clean_name, "externalIds": {}})
    return champions


def extract_last_sentence(value):
    text = clean(value)
    if not text:
        return None
    candidates = re.findall(r"[^.]*\bvs\.? [^.]*", text, flags=re.I)
    return clean(candidates[-1]) if candidates else None


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and pd.isna(value):
        return None
    text = str(value)
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\[[^\]]+\]", "", text)
    text = text.replace("�", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip() or None


def parse_number(value):
    text = clean(value)
    if not text:
        return None
    match = re.search(r"\d+", text.replace(",", ""))
    return int(match.group(0)) if match else None


def dedupe_records(records):
    seen = {}
    for record in records:
        key = (record["date"], slug(record["title"]))
        seen[key] = record
    return list(seen.values())


def upsert_record(records, record):
    for index, existing in enumerate(records):
        if existing.get("id") == record.get("id"):
            merged = {**existing, **record}
            merged["sourceIds"] = sorted(set((existing.get("sourceIds") or []) + (record.get("sourceIds") or [])))
            merged["externalIds"] = {**(existing.get("externalIds") or {}), **(record.get("externalIds") or {})}
            records[index] = merged
            return 0
    records.append(record)
    return 1


def remove_by_id(records, record_id):
    for index, record in enumerate(records):
        if record.get("id") == record_id:
            del records[index]
            return


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def slug(value):
    value = clean(value) or ""
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


if __name__ == "__main__":
    main()
