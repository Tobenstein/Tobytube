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
CACHE_DIR = ROOT / "cache" / "sdh-wwe-results"
SOURCE_ID = "sdh-wwe-results"
BASE_URL = "https://www.thesmackdownhotel.com/events-results/wwe/"
PPV_BASE_URL = "https://www.thesmackdownhotel.com/events-results/"
USER_AGENT = "Tobytube metadata prototype (personal use)"

SHOWS = [
    {"name": "Raw", "slug": "raw", "path": "raw/", "series_id": "wwe-raw", "short": "RAW", "start": "1993-01-11", "end": None},
    {"name": "SmackDown", "slug": "smackdown", "path": "smackdown/", "series_id": "wwe-smackdown", "short": "SD", "start": "1999-04-29", "end": None},
    {"name": "NXT", "slug": "nxt", "path": "nxt/", "series_id": "wwe-nxt", "short": "NXT", "start": "2010-02-23", "end": None},
    {"name": "NXT UK", "slug": "nxt-uk", "path": "nxt-uk/", "series_id": "wwe-nxt-uk", "short": "NXTUK", "start": "2018-10-17", "end": "2022-09-01"},
    {"name": "Main Event", "slug": "main-event", "path": "main-event/", "series_id": "wwe-main-event", "short": "ME", "start": "2012-10-03", "end": None},
    {"name": "205 Live", "slug": "205-live", "path": "205-live/", "series_id": "wwe-205-live", "short": "205", "start": "2016-11-29", "end": "2022-02-11"},
    {"name": "Superstars", "slug": "superstars", "path": "superstars/", "series_id": "wwe-superstars", "short": "SST", "start": "2009-04-16", "end": "2016-11-25"},
    {"name": "ECW", "slug": "ecw", "path": "ecw/", "series_id": "wwe-ecw", "short": "ECW", "start": "2006-06-13", "end": "2010-02-16"},
    {"name": "Heat", "slug": "heat", "path": "heat/", "series_id": "wwe-heat", "short": "HEAT", "start": "1998-08-02", "end": "2008-05-30"},
    {"name": "Velocity", "slug": "velocity", "path": "velocity/", "series_id": "wwe-velocity", "short": "VEL", "start": "2002-05-25", "end": "2006-06-10"},
    {"name": "Jakked/Metal", "slug": "jakked-metal", "path": "jakked-metal/", "series_id": "wwe-jakked-metal", "short": "JAK", "start": "1999-08-28", "end": "2002-05-18"},
    {"name": "Shotgun Saturday Night", "slug": "shotgun-saturday-night", "path": "shotgun-saturday-night/", "series_id": "wwe-shotgun-saturday-night", "short": "SSN", "start": "1997-01-04", "end": "1999-08-21"},
]

TWO_NIGHT_EVENT_SLUGS = [
    "wwe-wrestlemania-36",
    "wwe-wrestlemania-37",
    "wwe-wrestlemania-38",
    "wwe-wrestlemania-39",
    "wwe-wrestlemania-xl",
    "wwe-wrestlemania-41",
    "wwe-wrestlemania-42",
    "wwe-summerslam-2025",
    "wwe-summerslam-2026",
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    db = read_json(REFERENCE_PATH)
    ensure_reference_shape(db)
    ensure_source(db)
    ensure_promotion(db)
    ensure_series(db)
    purge_previous_pass(db)

    imported_records = 0
    imported_matches = 0
    discovered_pages = 0

    for show in SHOWS:
        index_url = f"{BASE_URL}{show['path']}"
        index_html = read_url(index_url, f"{show['slug']}-index.html", args.refresh)
        year_urls = discover_show_year_urls(index_html, show)
        discovered_pages += len(year_urls)
        for url in year_urls:
            html = read_url(url, cache_name_from_url(url), args.refresh)
            records, matches = parse_show_year(html, url, show)
            db["episodes"].extend(records)
            db["matches"].extend(matches)
            imported_records += len(records)
            imported_matches += len(matches)

    imported_events = 0
    imported_event_matches = 0
    for event_slug in TWO_NIGHT_EVENT_SLUGS:
        url = f"https://www.thesmackdownhotel.com/events-results/ppv-special/{event_slug}"
        try:
            html = read_url(url, f"{event_slug}.html", args.refresh)
        except Exception:
            continue
        event, matches = parse_two_night_event(html, url, event_slug)
        if not event:
            continue
        db["events"].append(event)
        db["matches"].extend(matches)
        imported_events += 1
        imported_event_matches += len(matches)

    db["generatedAt"] = now_utc()
    REFERENCE_PATH.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(
        "Imported WWE SDH results: "
        f"{imported_records} TV records, {imported_matches} TV match records, "
        f"{imported_events} two-night events, {imported_event_matches} event match records, "
        f"{discovered_pages} show-year pages."
    )


def parse_show_year(html_bytes, source_url, show):
    document = lxml.html.fromstring(html_bytes)
    records = []
    matches = []

    for header in document.xpath("//h3"):
        header_text = clean(" ".join(header.itertext()))
        parsed_header = parse_episode_header(header_text, show)
        if not parsed_header:
            continue

        episode_number, date, episode_title = parsed_header
        record_id = f"sdh-wwe-{slug(show['name'])}-{episode_number or date}"
        title = f"WWE {show['name']} #{episode_number}" if episode_number else f"WWE {show['name']} ({date})"
        if episode_title:
            title = f"{title}: {episode_title}"

        result_lines = collect_result_lines(header)
        is_special_event = show["slug"] == "nxt-uk" and bool(
            episode_title and re.search(r"\b(?:TakeOver|Prelude)\b", episode_title, flags=re.I)
        )
        records.append(
            {
                "id": record_id,
                "title": title,
                "promotionId": "wwe",
                "promotion": "World Wrestling Entertainment",
                "date": date,
                "dateDisplay": date,
                "venue": None,
                "city": None,
                "region": None,
                "country": None,
                "location": None,
                "attendance": None,
                "eventType": "Special Event" if is_special_event else "TV Show",
                "seriesName": show["name"],
                "seriesId": show["series_id"],
                "episodeNumber": episode_number,
                "recordType": "event" if is_special_event else "episode",
                "summary": episode_title,
                "sourceIds": [SOURCE_ID],
                "externalIds": {"sdh": {"url": source_url, "episodeHeader": header_text}},
                "importedAt": now_utc(),
            }
        )

        for index, line in enumerate(result_lines, start=1):
            matches.append(build_match(record_id, "event" if is_special_event else "episode", line, index, source_url))

    return records, matches


def parse_episode_header(header_text, show):
    if not header_text:
        return None
    text = clean(header_text)
    patterns = [
        r"^(?:WWE|WWF)?\s*[^#:\n]+#(?P<number>\d+):\s+(?P<date>[A-Za-z]+\s+\d{1,2},\s+\d{4})(?:\s+\(episode\s+\d+\))?(?:\s+-\s+(?P<title>.+))?$",
        r"^(?:RAW|Raw|SmackDown|NXT UK|NXT|ECW|Heat|Velocity|Superstars|Main Event|205 Live|Jakked/Metal|Shotgun Saturday Night)\s+#?(?P<number>\d+)?:?\s+(?P<date>[A-Za-z]+\s+\d{1,2},\s+\d{4})(?:\s+\(episode\s+\d+\))?(?:\s+-\s+(?P<title>.+))?$",
    ]
    for pattern in patterns:
        match = re.match(pattern, text, flags=re.I)
        if not match:
            continue
        date = parse_date(match.group("date"))
        if not date:
            continue
        number = match.groupdict().get("number")
        return (int(number) if number else None, date, clean(match.groupdict().get("title")))
    return None


def collect_result_lines(header):
    lines = []
    for sibling in header.itersiblings():
        if sibling.tag in {"h2", "h3"}:
            break
        if sibling.tag == "ul":
            for item in sibling.xpath("./li"):
                text = clean(" ".join(item.itertext()))
                if text and looks_like_match_line(text):
                    lines.append(text)
    return lines


def parse_two_night_event(html_bytes, source_url, event_slug):
    document = lxml.html.fromstring(html_bytes)
    h1 = document.xpath("string(//h1)")
    title = clean(h1)
    if not title:
        return None, []

    body_text = clean(" ".join(document.xpath("//body//text()"))) or ""
    date_match = re.search(r"Event Date\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})", body_text)
    end_match = re.search(r"End Date\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})", body_text)
    location_match = re.search(r"Location\s+(.+?)\s+Notes\s+", body_text)
    arena_match = re.search(r"Arena\s+(.+?)\s+Event Series\s+", body_text)
    main_event_match = re.search(r"The main event of the show was\s+(.+?)\.\s+Below", body_text)
    date = parse_date(date_match.group(1)) if date_match else None
    if not date:
        return None, []

    record_id = f"sdh-{event_slug}"
    matches = parse_two_night_card(document, record_id, source_url)
    event = {
        "id": record_id,
        "title": title,
        "promotionId": "wwe",
        "promotion": "World Wrestling Entertainment",
        "date": date,
        "endDate": parse_date(end_match.group(1)) if end_match else None,
        "dateDisplay": date,
        "venue": clean(arena_match.group(1)) if arena_match else None,
        "city": None,
        "region": None,
        "country": "United States",
        "location": clean(location_match.group(1)) if location_match else None,
        "attendance": None,
        "eventType": "Pay Per View",
        "recordType": "event",
        "summary": None,
        "mainEvent": clean(main_event_match.group(1)) if main_event_match else None,
        "nightCount": 2,
        "sourceIds": [SOURCE_ID],
        "externalIds": {"sdh": {"url": source_url}},
        "importedAt": now_utc(),
    }
    return event, matches


def parse_two_night_card(document, record_id, source_url):
    matches = []
    current_night = None
    order = 0

    panel = document.xpath("//*[@id='rlta-panel-match-card']")
    root = panel[0] if panel else document

    for element in root.xpath(".//h2|.//li"):
        text = clean(" ".join(element.itertext()))
        if not text:
            continue
        if element.tag == "h2" and re.search(r"Night\s*1|Saturday", text, flags=re.I):
            current_night = 1
            continue
        if element.tag == "h2" and re.search(r"Night\s*2|Sunday", text, flags=re.I):
            current_night = 2
            continue
        if element.tag != "li" or not current_night or not element.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' match-wrestlers ')]"):
            continue
        match = build_match_from_card_node(element, record_id, order + 1, current_night, source_url)
        if not match:
            continue
        order += 1
        matches.append(match)
    return matches


def build_match_from_card_node(node, event_id, order, night, source_url):
    header = clean(" ".join(node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' match-header ')]//h3//text()")))
    subtitle = clean(" ".join(node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' match-header ')]//strong//text()")))
    prefix = clean(" ".join([part for part in [header, subtitle] if part])) or None
    winning_side = extract_side_from_card(node, "winning-side")
    losing_side = extract_side_from_card(node, "losing-side")
    if not winning_side or not losing_side:
        return None

    display_sides = order_sides_for_display(winning_side["display"], losing_side["display"], prefix, f"{event_id}-{order}")
    display = f"{display_sides[0]} vs. {display_sides[1]}"
    if prefix:
        display = f"{prefix}: {display}"

    participants = extract_participants([winning_side["display"], losing_side["display"]])
    champions = extract_champions([winning_side["display"], losing_side["display"]])
    return {
        "id": f"{event_id}-match-{order}",
        "eventId": event_id,
        "eventRecordType": "event",
        "promotionId": "wwe",
        "order": order,
        "label": str(order),
        "raw": clean(" ".join(node.itertext())),
        "displayText": display,
        "stipulation": prefix or "Match",
        "titleMatch": infer_title_match(prefix, prefix or ""),
        "championshipId": f"wwe-{slug(prefix)}" if prefix and re.search(r"championship|title", prefix, flags=re.I) else None,
        "participants": participants,
        "teams": [
            {"name": winning_side["display"], "side": "winner"},
            {"name": losing_side["display"], "side": "opponent"},
        ],
        "champions": champions,
        "championMarked": bool(champions),
        "spoilerSafe": True,
        "winner": winning_side["display"],
        "result": "defeats",
        "night": night,
        "sourceIds": [SOURCE_ID],
        "externalIds": {"sdh": {"url": source_url}},
    }


def extract_side_from_card(node, class_name):
    container = node.xpath(f".//*[contains(concat(' ', normalize-space(@class), ' '), ' {class_name} ')]")
    if not container:
        return None
    side = container[0]
    teams = []
    for row in side.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' wrestlers-row ')]"):
        team_name = clean(" ".join(row.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' team-name ')]//text()")))
        names = [clean(text) for text in row.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' wrestler-name ')]/text()")]
        names = [name for name in names if name]
        label = team_name or " & ".join(names)
        if label:
            teams.append(label)
    if not teams:
        names = [clean(text) for text in side.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' wrestler-name ')]/text()")]
        teams = [name for name in names if name]
    display = " & ".join(teams) if len(teams) > 1 else (teams[0] if teams else None)
    if not display:
        return None
    if side.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' champion ')]"):
        display = f"{display} (c)"
    return {"display": display}


def build_match(event_id, record_type, line, order, source_url):
    parsed = parse_result_line(line, f"{event_id}-{order}")
    return {
        "id": f"{event_id}-match-{order}",
        "eventId": event_id,
        "eventRecordType": record_type,
        "promotionId": "wwe",
        "order": order,
        "label": str(order),
        "raw": line,
        "displayText": parsed["display"],
        "stipulation": parsed["stipulation"],
        "titleMatch": parsed["title_match"],
        "championshipId": f"wwe-{slug(parsed['title_match'])}" if parsed["title_match"] else None,
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
    core = clean(line)
    if ":" in core:
        candidate, rest = core.split(":", 1)
        if re.search(r"championship|match|contender|eliminator|tournament|challenge|battle royal|rumble", candidate, flags=re.I):
            prefix = clean(candidate)
            core = clean(rest)

    no_contest = re.match(r"(?P<a>.+?)\s+vs\.?\s+(?P<b>.+?)\s+ends?\s+in\s+(?P<result>.+)$", core, flags=re.I)
    if no_contest:
        sides = [clean(no_contest.group("a")), clean(no_contest.group("b"))]
        return parsed_result(prefix, f"{sides[0]} vs. {sides[1]}", None, clean(no_contest.group("result")), sides, line)

    result_match = re.match(r"(?P<winner>.+?)\s+def(?:\.|eats?)\s+(?P<loser>.+?)(?P<tail>\s+via\s+.+|\s+to\s+.+)?$", core, flags=re.I)
    if result_match:
        winner = clean(result_match.group("winner"))
        loser = clean(result_match.group("loser"))
        tail = clean(result_match.group("tail"))
        ordered = order_sides_for_display(winner, loser, prefix, seed)
        return parsed_result(prefix, f"{ordered[0]} vs. {ordered[1]}", winner, f"defeats{(' ' + tail) if tail else ''}", [winner, loser], line)

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
    champion_index = next((index for index, side in enumerate(sides) if re.search(r"\(c\)|©|\bC$", side, flags=re.I)), None)
    if champion_index == 1:
        return [loser, winner]
    if champion_index == 0:
        return [winner, loser]
    return sides if stable_bit(seed) else [loser, winner]


def extract_participants(sides):
    seen = {}
    for side in sides:
        cleaned = re.sub(r"\([^)]*\)|\bC\b|©", "", side or "")
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
        if not re.search(r"\(c\)|©|\bC$", side or "", flags=re.I):
            continue
        name = clean(re.sub(r"\s*(?:\(c\)|©|\bC$)", "", side, flags=re.I))
        if name:
            champions.append({"id": f"person-{slug(name)}", "name": name, "externalIds": {}})
    return champions


def infer_title_match(prefix, line):
    if prefix and re.search(r"championship|title", prefix, flags=re.I) and not re.search(r"contender|eliminator|shot", prefix, flags=re.I):
        return prefix
    match = re.search(r"([A-Z][A-Za-z'’\s]+ (?:Championship|Title))", line)
    return clean(match.group(1)) if match else None


def infer_stipulation(line):
    match = re.search(r"([A-Z#\" ][^:]+ Match)", line)
    if match:
        return clean(match.group(1).strip('" '))
    return "Match"


def looks_like_match_line(text):
    if not text:
        return False
    return bool(re.search(r"\b(def(?:\.|eats?)|vs\.?|ends in)\b", text, flags=re.I))


def discover_show_year_urls(html_bytes, show):
    document = lxml.html.fromstring(html_bytes)
    urls = []
    for href in document.xpath("//a/@href"):
        absolute = urljoin(BASE_URL, href)
        if not absolute.startswith(BASE_URL):
            continue
        if not re.search(r"(?:19|20)\d{2}/?$", absolute):
            continue
        slug_pattern = re.escape(show["slug"]).replace("\\-", ".*")
        if not re.search(slug_pattern, slug(absolute)):
            continue
        if absolute not in urls:
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
        "name": "TheSmackDownHotel WWE results archive",
        "type": "events",
        "url": BASE_URL,
        "priority": 10,
        "notes": "WWE show result pages with spoiler-safe display text and winner/result stored separately.",
    })


def ensure_promotion(db):
    upsert_record(db["promotions"], {
        "id": "wwe",
        "name": "World Wrestling Entertainment",
        "summary": "WWE archive imported from TheSmackDownHotel show result pages.",
        "sourceIds": [SOURCE_ID],
        "externalIds": {"sdh": {"url": BASE_URL}},
    })


def ensure_series(db):
    for show in SHOWS:
        upsert_record(db["series"], {
            "id": show["series_id"],
            "promotionId": "wwe",
            "name": show["name"],
            "shortName": show["short"],
            "startDate": show["start"],
            "endDate": show["end"],
            "sourceIds": [SOURCE_ID],
            "externalIds": {"sdh": {"url": f"{BASE_URL}{show['path']}"}},
        })


def purge_previous_pass(db):
    removed_ids = {
        record["id"]
        for record in db["events"] + db["episodes"]
        if record.get("promotionId") == "wwe" and SOURCE_ID in (record.get("sourceIds") or [])
    }
    for table_name in ("events", "episodes"):
        db[table_name] = [record for record in db[table_name] if record.get("id") not in removed_ids]
    db["matches"] = [
        match for match in db["matches"]
        if not (match.get("promotionId") == "wwe" and (SOURCE_ID in (match.get("sourceIds") or []) or match.get("eventId") in removed_ids))
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
    text = clean(value)
    if not text:
        return None
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()


def clean(value):
    if value is None:
        return None
    text = unicodedata.normalize("NFKC", str(value))
    text = re.sub(r"\[[^\]]+\]", "", text)
    text = text.replace("\xa0", " ").replace("ï¿½", " ").replace("©", "(c)")
    text = re.sub(r"\s+", " ", text)
    return text.strip() or None


def slug(value):
    text = clean(value) or ""
    text = text.lower().replace("&", " and ")
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
