import argparse
import json
import re
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import lxml.html
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "src" / "wrestling-reference.generated.json"
CACHE_DIR = ROOT / "cache" / "sdh-ecw-results"
SOURCE_ID = "sdh-ecw-results"
BASE_URL = "https://www.thesmackdownhotel.com/events-results/ecw/"
USER_AGENT = "Tobytube metadata prototype (personal use)"

SHOWS = [
    {
        "name": "Hardcore TV",
        "slug": "hardcore-tv",
        "list_path": "hardcore-tv/",
        "series_id": "ecw-hardcore-tv",
        "short_name": "HCTV",
        "start_date": "1993-04-06",
        "end_date": "2000-12-31",
    },
    {
        "name": "ECW on TNN",
        "slug": "ecw-on-tnn",
        "list_path": "ecw-on-tnn/",
        "series_id": "ecw-ecw-on-tnn",
        "short_name": "TNN",
        "start_date": "1999-08-27",
        "end_date": "2000-10-06",
    },
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Re-download SDH pages.")
    args = parser.parse_args()

    db = read_json(REFERENCE_PATH)
    ensure_reference_shape(db)
    ensure_source(db)
    ensure_promotion(db)
    ensure_series(db)
    purge_previous_ecw_tv_pass(db)

    imported_records = 0
    imported_matches = 0
    discovered_pages = []

    for show in SHOWS:
        list_url = f"{BASE_URL}{show['list_path']}"
        list_html = read_url(list_url, f"{show['slug']}-index.html", args.refresh)
        year_urls = discover_year_urls(list_html, show)
        discovered_pages.extend(year_urls)

        for url in year_urls:
            html = read_url(url, cache_name_from_url(url), args.refresh)
            records, matches = parse_show_year(html, url, show)
            db["episodes"].extend(records)
            db["matches"].extend(matches)
            imported_records += len(records)
            imported_matches += len(matches)

    db["generatedAt"] = now_utc()
    REFERENCE_PATH.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(
        "Imported ECW SDH results: "
        f"{imported_records} TV records, {imported_matches} spoiler-safe match records, "
        f"{len(discovered_pages)} year pages."
    )


def parse_show_year(html_bytes, source_url, show):
    document = lxml.html.fromstring(html_bytes)
    records = []
    matches = []
    header_pattern = re.compile(
        rf"^(?:ECW\s+)?{re.escape(show['name'])}\s+#(?P<number>\d+):\s+(?P<date>.+)$",
        flags=re.I,
    )

    for header in document.xpath("//h3"):
        header_text = clean(" ".join(header.itertext()))
        match = header_pattern.match(header_text or "")
        if not match:
            continue

        episode_number = int(match.group("number"))
        date = parse_date(match.group("date"))
        if not date:
            continue

        record_id = f"sdh-ecw-{slug(show['name'])}-{episode_number}"
        result_lines = collect_result_lines(header)
        records.append(
            {
                "id": record_id,
                "title": f"ECW {show['name']} #{episode_number}",
                "promotionId": "ecw",
                "promotion": "Extreme Championship Wrestling",
                "date": date,
                "dateDisplay": date,
                "venue": None,
                "city": None,
                "region": None,
                "country": None,
                "location": None,
                "attendance": None,
                "eventType": "TV Show",
                "seriesName": show["name"],
                "seriesId": show["series_id"],
                "episodeNumber": episode_number,
                "recordType": "episode",
                "summary": None,
                "sourceIds": [SOURCE_ID],
                "externalIds": {
                    "sdh": {
                        "url": source_url,
                        "episodeHeader": header_text,
                    }
                },
                "importedAt": now_utc(),
            }
        )

        for index, line in enumerate(result_lines, start=1):
            matches.append(build_match(record_id, line, index, source_url))

    return records, matches


def collect_result_lines(header):
    lines = []
    for sibling in header.itersiblings():
        if sibling.tag in {"h2", "h3"}:
            break
        if sibling.tag == "ul":
            for item in sibling.xpath(".//li"):
                text = clean(" ".join(item.itertext()))
                if text:
                    lines.append(text)
    return lines


def build_match(event_id, line, order, source_url):
    parsed = parse_result_line(line, f"{event_id}-{order}")
    return {
        "id": f"{event_id}-match-{order}",
        "eventId": event_id,
        "eventRecordType": "episode",
        "promotionId": "ecw",
        "order": order,
        "label": str(order),
        "raw": line,
        "displayText": parsed["display"],
        "stipulation": parsed["stipulation"],
        "titleMatch": parsed["title_match"],
        "championshipId": f"ecw-{slug(parsed['title_match'])}" if parsed["title_match"] else None,
        "participants": parsed["participants"],
        "teams": parsed["teams"],
        "champions": parsed["champions"],
        "championMarked": bool(parsed["champions"]),
        "spoilerSafe": True,
        "winner": parsed["winner"],
        "result": parsed["result"],
        "sourceIds": [SOURCE_ID],
        "externalIds": {"sdh": {"url": source_url}},
    }


def parse_result_line(line, seed):
    prefix = None
    core = line
    if ":" in line:
        candidate, rest = line.split(":", 1)
        if re.search(r"championship|match|contender|eliminator|tournament|challenge", candidate, flags=re.I):
            prefix = clean(candidate)
            core = clean(rest)

    no_contest = re.match(r"(?P<a>.+?)\s+vs\.?\s+(?P<b>.+?)\s+ends?\s+in\s+(?P<result>.+)$", core, flags=re.I)
    if no_contest:
        side_a = clean(no_contest.group("a"))
        side_b = clean(no_contest.group("b"))
        display_core = f"{side_a} vs. {side_b}"
        return parsed_result(prefix, display_core, None, clean(no_contest.group("result")), [side_a, side_b], line)

    result_match = re.match(r"(?P<winner>.+?)\s+defeats?\s+(?P<loser>.+?)(?P<tail>\s+via\s+.+|\s+to\s+.+)?$", core, flags=re.I)
    if result_match:
        winner = clean(result_match.group("winner"))
        loser = clean(result_match.group("loser"))
        tail = clean(result_match.group("tail"))
        ordered = order_sides_for_display(winner, loser, prefix, seed)
        display_core = f"{ordered[0]} vs. {ordered[1]}"
        return parsed_result(prefix, display_core, winner, f"defeats{(' ' + tail) if tail else ''}", [winner, loser], line)

    return parsed_result(prefix, f"{prefix}: {core}" if prefix else core, None, None, [core], line, already_prefixed=True)


def parsed_result(prefix, display_core, winner, result, sides, line, already_prefixed=False):
    return {
        "display": display_core if already_prefixed or not prefix else f"{prefix}: {display_core}",
        "stipulation": prefix or infer_stipulation(line),
        "title_match": infer_title_match(prefix, line),
        "winner": winner,
        "result": result,
        "participants": extract_participants(sides),
        "teams": [{"name": side, "side": "winner" if side == winner else "opponent"} for side in sides if side],
        "champions": extract_champions(sides),
    }


def order_sides_for_display(winner, loser, prefix, seed):
    sides = [winner, loser]
    if prefix and "championship" in prefix.lower():
        champion_index = next((index for index, side in enumerate(sides) if "(c)" in side.lower()), None)
        if champion_index == 1:
            return [loser, winner]
        if champion_index == 0:
            return [winner, loser]
    return sides if stable_bit(seed) else [loser, winner]


def extract_participants(sides):
    seen = {}
    for side in sides:
        cleaned = re.sub(r"\([^)]*\)", "", side or "")
        pieces = re.split(r"\s+&\s+|,\s+|\sand\s+|\svs\.?\s+", cleaned)
        for piece in pieces:
            name = clean(re.sub(r"^(The|Team)\s+", "", piece))
            if not name or len(name) < 2:
                continue
            seen[slug(name)] = {"id": f"person-{slug(name)}", "name": name, "externalIds": {}}
    return list(seen.values())


def extract_champions(sides):
    champions = []
    for side in sides:
        if "(c)" not in (side or "").lower():
            continue
        name = clean(re.sub(r"\s*\(c\)", "", side, flags=re.I))
        if name:
            champions.append({"id": f"person-{slug(name)}", "name": name, "externalIds": {}})
    return champions


def infer_title_match(prefix, line):
    if prefix and "championship" in prefix.lower() and not re.search(r"contender|eliminator|shot", prefix, flags=re.I):
        return prefix
    match = re.search(r"([A-Z][A-Za-z'’\s]+ Championship)", line)
    return clean(match.group(1)) if match else None


def infer_stipulation(line):
    match = re.search(r"([A-Z#\" ][^:]+ Match)", line)
    if match:
        return clean(match.group(1).strip('" '))
    return "Match"


def discover_year_urls(html_bytes, show):
    document = lxml.html.fromstring(html_bytes)
    urls = []
    pattern = re.compile(rf"/events-results/ecw/(?:ecw-)?{re.escape(show['slug'])}-(?:19|20)\d{{2}}/?$", flags=re.I)
    for href in document.xpath("//a/@href"):
        absolute = urljoin(BASE_URL, href)
        if pattern.search(absolute) and absolute not in urls:
            urls.append(absolute)
    return sorted(urls, reverse=True)


def read_url(url, cache_name, refresh=False):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / cache_name
    if refresh or not target.exists():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=45) as response:
            target.write_bytes(response.read())
    return target.read_bytes()


def cache_name_from_url(url):
    return re.sub(r"[^a-z0-9]+", "-", url.lower()).strip("-") + ".html"


def ensure_reference_shape(db):
    for key in ["sources", "promotions", "series", "events", "episodes", "venues", "people", "matches", "championships", "titleReigns", "externalIds"]:
        db.setdefault(key, [])
    db.setdefault("schemaVersion", 1)


def ensure_source(db):
    upsert_record(db["sources"], {
        "id": SOURCE_ID,
        "name": "TheSmackDownHotel ECW results archive",
        "type": "events",
        "url": BASE_URL,
        "priority": 10,
        "notes": "ECW TV show result pages with spoiler-safe display text and winner/result stored separately.",
    })


def ensure_promotion(db):
    upsert_record(db["promotions"], {
        "id": "ecw",
        "name": "Extreme Championship Wrestling",
        "summary": "ECW archive imported from TheSmackDownHotel show result pages.",
        "sourceIds": [SOURCE_ID],
        "externalIds": {"sdh": {"url": BASE_URL}},
    })


def ensure_series(db):
    for show in SHOWS:
        upsert_record(db["series"], {
            "id": show["series_id"],
            "promotionId": "ecw",
            "name": show["name"],
            "shortName": show["short_name"],
            "startDate": show["start_date"],
            "endDate": show["end_date"],
            "sourceIds": [SOURCE_ID],
            "externalIds": {"sdh": {"url": f"{BASE_URL}{show['list_path']}"}},
        })


def purge_previous_ecw_tv_pass(db):
    tv_series = {show["name"].lower() for show in SHOWS}
    removed_ids = {
        record["id"]
        for record in db["episodes"]
        if record.get("promotionId") == "ecw"
        and (
            SOURCE_ID in (record.get("sourceIds") or [])
            or str(record.get("seriesName") or "").lower() in tv_series
        )
    }
    db["episodes"] = [record for record in db["episodes"] if record.get("id") not in removed_ids]
    db["matches"] = [
        record
        for record in db["matches"]
        if not (
            record.get("promotionId") == "ecw"
            and (
                SOURCE_ID in (record.get("sourceIds") or [])
                or record.get("eventId") in removed_ids
            )
        )
    ]


def upsert_record(records, record):
    for index, existing in enumerate(records):
        if existing.get("id") == record.get("id"):
            merged = {**existing, **record}
            merged["sourceIds"] = sorted(set((existing.get("sourceIds") or []) + (record.get("sourceIds") or [])))
            merged["externalIds"] = {**(existing.get("externalIds") or {}), **(record.get("externalIds") or {})}
            records[index] = merged
            return
    records.append(record)


def parse_date(value):
    parsed = pd.to_datetime(clean(value), errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def clean(value):
    if value is None:
        return None
    text = unicodedata.normalize("NFKC", str(value))
    text = re.sub(r"\[[^\]]+\]", "", text)
    text = text.replace("\xa0", " ").replace("�", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip() or None


def slug(value):
    text = (clean(value) or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def stable_bit(seed):
    return sum(ord(char) for char in seed) % 2 == 0


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
