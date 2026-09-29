import argparse
import concurrent.futures
import json
import re
import unicodedata
import urllib.request
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import lxml.html
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "src" / "wrestling-reference.generated.json"
INDEX_PATH = ROOT / "cache" / "sdh-tna-events" / "index.json"
CACHE_DIR = ROOT / "cache" / "sdh-tna-events" / "pages"
SOURCE_ID = "sdh-tna-events"
BASE_URL = "https://www.thesmackdownhotel.com/events-results/ppv-special/tna/"
EXTRA_EVENT_URLS = [
    f"https://www.thesmackdownhotel.com/events-results/ppv-special/one-night-only-gfw-amped-anthology-part-{part}"
    for part in range(1, 5)
]
USER_AGENT = "Mozilla/5.0 (compatible; Tobytube personal metadata catalogue)"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    index = read_json(INDEX_PATH)
    urls = list(dict.fromkeys([item["url"] for item in index.get("events", [])] + EXTRA_EVENT_URLS))
    if args.limit:
        urls = urls[: args.limit]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        pages = list(executor.map(lambda url: safe_fetch_page(url, args.refresh), urls))

    db = read_json(REFERENCE_PATH)
    ensure_reference_shape(db)
    ensure_source(db)
    purge_previous_pass(db)

    records = []
    matches = []
    errors = []
    for url, page in zip(urls, pages):
        if isinstance(page, Exception):
            errors.append(f"{url}: {page}")
            continue
        try:
            record, card = parse_event(page, url)
            if record:
                records.append(record)
                matches.extend(card)
        except Exception as error:
            errors.append(f"{url}: {error}")

    db["events"].extend(records)
    db["matches"].extend(matches)
    db["generatedAt"] = now_utc()
    write_json_atomic(REFERENCE_PATH, db)
    print(f"Imported {len(records)} TNA events and {len(matches)} matches from {len(urls)} pages.")
    if errors:
        print(f"Skipped {len(errors)} pages:")
        print("\n".join(errors[:20]))


def fetch_page(url, refresh=False):
    filename = slug(urlparse(url).path.rstrip("/").split("/")[-1]) + ".html"
    target = CACHE_DIR / filename
    if refresh or not target.exists():
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=45) as response:
            target.write_bytes(response.read())
    return target.read_bytes()


def safe_fetch_page(url, refresh=False):
    for attempt in range(3):
        try:
            return fetch_page(url, refresh)
        except Exception as error:
            if attempt == 2:
                return error
            time.sleep(1.5 * (attempt + 1))


def parse_event(html_bytes, source_url):
    document = lxml.html.fromstring(html_bytes)
    title = first_text(document.xpath("//h1[1]"))
    if not title:
        return None, []
    fields = {}
    for entry in document.xpath("//li[contains(concat(' ', normalize-space(@class), ' '), ' field-entry ')]"):
        label = first_text(entry.xpath("./*[contains(concat(' ', normalize-space(@class), ' '), ' field-label ')]"))
        value = first_text(entry.xpath("./*[contains(concat(' ', normalize-space(@class), ' '), ' field-value ')]"))
        if label and value:
            fields[label.lower()] = value

    date = parse_date(fields.get("event date"))
    if not date:
        return None, []
    record_id = f"sdh-tna-event-{slug(urlparse(source_url).path.rstrip('/').split('/')[-1])}"
    location = fields.get("location")
    city, region, country_from_location = split_location(location)
    country = fields.get("country") or country_from_location
    summary = extract_summary(document, title)
    poster_url = first_attribute(document.xpath("//meta[@property='og:image'][1]"), "content")
    record = {
        "id": record_id,
        "title": clean(re.sub(r"^(?:Impact Wrestling|Total Nonstop Action Wrestling)\s+", "TNA ", title, flags=re.I)),
        "promotionId": "tna",
        "promotion": "Total Nonstop Action Wrestling",
        "date": date,
        "dateDisplay": date,
        "venue": fields.get("arena"),
        "city": city,
        "region": region,
        "country": country,
        "location": location,
        "attendance": parse_integer(fields.get("attendance")),
        "eventType": fields.get("event type") or "Special Event",
        "recordType": "event",
        "seriesName": None,
        "seriesId": None,
        "summary": summary,
        "network": fields.get("network"),
        "runtime": fields.get("running time"),
        "commentary": split_people(fields.get("commentary")),
        "mainEvent": fields.get("main event"),
        "posterUrl": poster_url,
        "art": {"posterUrl": poster_url, "source": "sdh-event"} if poster_url else None,
        "sourceIds": [SOURCE_ID],
        "externalIds": {"sdh": {"url": source_url}},
        "importedAt": now_utc(),
    }
    card_nodes = leaf_match_nodes(document, "rlta-panel-match-card")
    result_nodes = leaf_match_nodes(document, "rlta-panel-results")
    if card_nodes:
        matches = [build_match(record_id, node, result_nodes[index] if index < len(result_nodes) else None, index + 1, source_url)
                   for index, node in enumerate(card_nodes)]
    else:
        # SDH's older pages alternate between "Results" and "Match Card"
        # headings, and a few contain a self-closing event-results div that
        # leaves the heading/list as siblings.  Accept both shapes and then
        # de-duplicate the selected list items in document order.
        legacy_nodes = document.xpath(
            "//div[contains(concat(' ', normalize-space(@class), ' '), ' event-results ')]//ul[1]/li"
            " | //h2[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'results')"
            " or contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'match card')]"
            "/following-sibling::ul[1]/li"
        )
        legacy_nodes = list(dict.fromkeys(legacy_nodes))
        matches = [build_legacy_match(record_id, node, index + 1, source_url) for index, node in enumerate(legacy_nodes)]
    return record, matches


def leaf_match_nodes(document, panel_id):
    nodes = document.xpath(
        f"//div[@id='{panel_id}']//li[.//div[contains(concat(' ', normalize-space(@class), ' '), ' match-wrestlers ')]]"
    )
    return [node for node in nodes if not node.xpath(".//li[.//div[contains(concat(' ', normalize-space(@class), ' '), ' match-wrestlers ')]]")]


def build_match(event_id, card_node, result_node, order, source_url):
    header = card_node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' match-header ')]")
    stipulation = first_text(header[0].xpath(".//h3|.//strong")) if header else None
    sides = card_node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' match-wrestlers ')]/*[contains(@class,'side')]")
    side_names = [side_name(side) for side in sides]
    side_names = [name for name in side_names if name]
    if len(side_names) < 2:
        raw = first_text(card_node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' match-wrestlers ')]"))
        side_names = re.split(r"\s+vs\.?\s+", raw or "", maxsplit=1, flags=re.I)
    if len(side_names) >= 2 and not stable_bit(f"{event_id}-{order}"):
        side_names = [side_names[1], side_names[0], *side_names[2:]]
    display = " vs. ".join(side_names) if side_names else "Match card pending"
    participants = extract_participants(card_node, side_names)
    title_match = infer_title_match(stipulation)
    result_text = first_text(result_node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' match-description ')]")) if result_node is not None else None
    winner = first_text(result_node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' winning-side ')]")) if result_node is not None else None
    return {
        "id": f"{event_id}-match-{order}",
        "eventId": event_id,
        "eventRecordType": "event",
        "promotionId": "tna",
        "order": order,
        "label": str(order),
        "raw": first_text(card_node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' match-wrestlers ')]")),
        "displayText": display,
        "stipulation": stipulation or "Match",
        "titleMatch": title_match,
        "championshipId": f"tna-{slug(title_match)}" if title_match else None,
        "participants": participants,
        "teams": [{"name": name, "side": f"side-{index + 1}"} for index, name in enumerate(side_names)],
        "champions": extract_champions(card_node),
        "championMarked": bool(extract_champions(card_node)),
        "spoilerSafe": True,
        "winner": winner,
        "result": result_text,
        "sourceIds": [SOURCE_ID],
        "externalIds": {"sdh": {"url": source_url}},
    }


def build_legacy_match(event_id, node, order, source_url):
    stipulation = first_text(node.xpath("./h3[1]"))
    raw = clean(" ".join(node.itertext())) or ""
    core = clean(re.sub(r"^" + re.escape(stipulation or "") + r"\s*", "", raw, count=1)) or raw
    winner_label = re.search(r"Winner:\s*(.+?)(?:Participants:|$)", core, flags=re.I)
    participants_label = re.search(r"Participants:\s*(.+)$", core, flags=re.I)
    winner = clean(winner_label.group(1)) if winner_label else None
    result = None
    sides = []
    if participants_label:
        participant_names = [clean(name) for name in participants_label.group(1).split(",") if clean(name)]
        sides = participant_names
        display = ", ".join(participant_names)
        result = "wins" if winner else None
    else:
        result_match = re.match(r"(.+?)\s+defeats?\s+(.+)$", core, flags=re.I)
        if result_match:
            winner = clean(result_match.group(1))
            loser_and_tail = clean(result_match.group(2))
            loser = clean(re.split(r"\s+(?:to (?:win|retain)|via |by )", loser_and_tail or "", maxsplit=1, flags=re.I)[0])
            sides = [winner, loser]
            if not stable_bit(f"{event_id}-{order}"):
                sides.reverse()
            display = " vs. ".join(side for side in sides if side)
            result = clean(core[len(result_match.group(1)):])
        else:
            display = core
            sides = re.split(r"\s+vs\.?\s+", core, flags=re.I)
    title_match = infer_title_match(stipulation)
    participant_names = []
    for side in sides:
        cleaned_side = re.sub(r"\s*\(c\)", "", side or "", flags=re.I)
        participant_names.extend(re.split(r"\s+&\s+|,\s+|\s+and\s+", cleaned_side))
    participants = [
        {"id": f"person-{slug(name)}", "name": clean(name), "externalIds": {}}
        for name in participant_names if clean(name)
    ]
    champions = [
        {"id": f"person-{slug(name)}", "name": clean(re.sub(r"\s*\(c\)", "", name, flags=re.I)), "externalIds": {}}
        for name in sides if "(c)" in (name or "").lower()
    ]
    return {
        "id": f"{event_id}-match-{order}",
        "eventId": event_id,
        "eventRecordType": "event",
        "promotionId": "tna",
        "order": order,
        "label": str(order),
        "raw": raw,
        "displayText": display,
        "stipulation": stipulation or "Match",
        "titleMatch": title_match,
        "championshipId": f"tna-{slug(title_match)}" if title_match else None,
        "participants": participants,
        "teams": [{"name": side, "side": f"side-{index + 1}"} for index, side in enumerate(sides)],
        "champions": champions,
        "championMarked": bool(champions),
        "spoilerSafe": True,
        "winner": winner,
        "result": result,
        "sourceIds": [SOURCE_ID],
        "externalIds": {"sdh": {"url": source_url}},
    }


def side_name(side):
    clone = lxml.html.fromstring(lxml.html.tostring(side))
    for unwanted in clone.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' manager ')]"):
        unwanted.drop_tree()
    return clean(" ".join(clone.itertext()))


def extract_participants(node, side_names):
    names = []
    for item in node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' wrestler-name ')]"):
        name = first_text([item])
        if name and name not in names:
            names.append(name)
    if not names:
        for side in side_names:
            names.extend(re.split(r"\s+&\s+|,\s+|\s+and\s+", re.sub(r"\s*\(c\)", "", side, flags=re.I)))
    return [{"id": f"person-{slug(name)}", "name": clean(name), "externalIds": {}} for name in names if clean(name)]


def extract_champions(node):
    champions = []
    for marker in node.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' champion ')]"):
        parent = marker.getparent()
        name = clean(" ".join(parent.itertext())) if parent is not None else None
        name = clean(re.sub(r"\s*\(c\)", "", name or "", flags=re.I))
        if name and name not in [item["name"] for item in champions]:
            champions.append({"id": f"person-{slug(name)}", "name": name, "externalIds": {}})
    return champions


def infer_title_match(stipulation):
    match = re.search(r"((?:NWA\s+)?(?:TNA\s+)?[A-Za-z'’ -]+ Championship)", stipulation or "", flags=re.I)
    return clean(match.group(1)) if match else None


def extract_summary(document, title):
    for paragraph in document.xpath("//h1[1]/following::p[position() <= 5]"):
        text = first_text([paragraph])
        if text and len(text) > 60 and title.lower() not in text.lower():
            return text
    return None


def split_location(value):
    parts = [clean(part) for part in (value or "").split(",") if clean(part)]
    return (parts + [None, None, None])[:3]


def split_people(value):
    return [clean(part) for part in re.split(r"\s*;\s*|\s*,\s*", value or "") if clean(part)]


def parse_integer(value):
    match = re.search(r"[\d,]+", value or "")
    return int(match.group(0).replace(",", "")) if match else None


def first_text(nodes):
    if not nodes:
        return None
    return clean(" ".join(nodes[0].itertext()))


def first_attribute(nodes, attribute):
    return clean(nodes[0].get(attribute)) if nodes else None


def parse_date(value):
    parsed = pd.to_datetime(clean(value), errors="coerce")
    return None if pd.isna(parsed) else parsed.date().isoformat()


def clean(value):
    if value is None:
        return None
    text = unicodedata.normalize("NFKC", str(value)).replace("\xa0", " ").replace("ï¿½", "'").replace("�", "°")
    text = re.sub(r"\s+", " ", text)
    return text.strip() or None


def slug(value):
    text = (clean(value) or "").lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def stable_bit(seed):
    return sum(ord(char) for char in seed) % 2 == 0


def ensure_reference_shape(db):
    for key in ["sources", "promotions", "series", "events", "episodes", "venues", "people", "matches", "championships", "titleReigns", "externalIds"]:
        db.setdefault(key, [])


def ensure_source(db):
    source = {"id": SOURCE_ID, "name": "TheSmackDownHotel TNA event archive", "type": "events", "url": BASE_URL, "priority": 10,
              "notes": "TNA PPV and special-event pages; spoiler-safe cards with outcomes stored separately."}
    for index, existing in enumerate(db["sources"]):
        if existing.get("id") == SOURCE_ID:
            db["sources"][index] = source
            return
    db["sources"].append(source)


def purge_previous_pass(db):
    removed = {record["id"] for record in db["events"] if SOURCE_ID in (record.get("sourceIds") or [])}
    db["events"] = [record for record in db["events"] if record.get("id") not in removed]
    db["matches"] = [match for match in db["matches"] if SOURCE_ID not in (match.get("sourceIds") or []) and match.get("eventId") not in removed]


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


if __name__ == "__main__":
    main()
