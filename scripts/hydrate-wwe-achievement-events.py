import argparse
import importlib.util
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import lxml.html


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "src" / "wrestling-reference.generated.json"
CACHE_DIR = ROOT / "cache" / "sdh-wwe-achievement-events"
SOURCE_ID = "sdh-wwe-achievement-event-details"
USER_AGENT = "Tobytube personal metadata importer (local prototype)"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all-since", type=int, default=None, help="Hydrate every SDH WWE event from this year onward, not only accomplishment-linked events.")
    args = parser.parse_args()
    db = json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))
    helpers = load_results_helpers()
    targets = collect_targets(db, args.all_since)
    target_ids = {item["id"] for item in targets}
    db["matches"] = [
        item for item in db.get("matches", [])
        if SOURCE_ID not in item.get("sourceIds", []) and item.get("eventId") not in target_ids
    ]

    hydrated = match_count = 0
    for record in targets:
        url = record.get("externalIds", {}).get("sdh", {}).get("url")
        if not url:
            continue
        try:
            document = lxml.html.fromstring(read_url(url, record["id"]))
        except Exception as error:
            print(f"Skipped {record['title']}: {error}")
            continue
        details = parse_details(document)
        for key, value in details.items():
            if value not in (None, ""):
                record[key] = value
        matches = parse_matches(document, record, url, helpers)
        db["matches"].extend(matches)
        hydrated += 1
        match_count += len(matches)

    if not any(source.get("id") == SOURCE_ID for source in db.get("sources", [])):
        db.setdefault("sources", []).append({"id": SOURCE_ID, "name": "The SmackDown Hotel WWE accomplishment event details"})
    db["generatedAt"] = now_utc()
    REFERENCE_PATH.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Hydrated {hydrated} WWE accomplishment events with {match_count} match-card records.")


def load_results_helpers():
    path = ROOT / "scripts" / "import-wwe-sdh-results.py"
    spec = importlib.util.spec_from_file_location("wwe_sdh_results", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def collect_targets(db, all_since=None):
    requested = []
    for tournament in db.get("tournaments", []):
        if not re.match(r"wwe-(?:royal-rumble|money-in-the-bank|elimination-chamber)", tournament.get("id", "")):
            continue
        for row in tournament.get("results", []):
            requested.append((row.get("event"), row.get("date") or row.get("dateWon")))
            cash_in = row.get("cashIn") or {}
            requested.append((cash_in.get("event"), cash_in.get("date")))
            match = row.get("championshipMatch") or {}
            if isinstance(match, dict):
                requested.append((match.get("event"), match.get("date")))

    candidates = [
        item for item in db.get("events", [])
        if SOURCE_ID not in item.get("sourceIds", [])
        and item.get("promotionId") == "wwe"
        and "sdh-wwe-ppv-history" in item.get("sourceIds", [])
        and item.get("externalIds", {}).get("sdh", {}).get("url")
    ]
    if all_since is not None:
        return list({item["id"]: item for item in candidates if str(item.get("date", ""))[:4].isdigit() and int(str(item["date"])[:4]) >= all_since}.values())
    targets = {}
    for name, date in requested:
        if not name or not date:
            continue
        key = canonical_event_key(name)
        match = next((item for item in candidates if item.get("date") == date and event_keys_match(key, canonical_event_key(item.get("title")))), None)
        if match:
            targets[match["id"]] = match
    return list(targets.values())


def parse_details(document):
    body = clean(" ".join(document.xpath("//body//text()")))
    description = clean(document.xpath("string(//meta[@name='description']/@content)"))
    details = {
        "venue": extract(body, r"Arena\s+(.+?)\s+(?:Event Series|Attendance|Network|The main event)"),
        "location": extract(body, r"Location\s+(.+?)\s+(?:Notes|Arena|Event Series)"),
        "attendance": integer_value(extract(body, r"Attendance\s+([\d,]+)")),
        "mainEvent": extract(body, r"The main event of the show was\s+(.+?)\.\s+(?:Below|The)") or extract(body, r"Main Event\s+(.+?)\s+(?:Network|Attendance|Arena)"),
        "summary": description,
    }
    # A failed boundary must never turn the remainder of a webpage into metadata.
    return {key: value for key, value in details.items() if not isinstance(value, str) or len(value) <= 500}


def parse_matches(document, record, url, helpers):
    panel = document.xpath("//*[@id='rlta-panel-match-card']")
    root = panel[0] if panel else document
    matches = []
    seen = set()
    night = None
    for element in root.xpath(".//h2|.//li"):
        text = clean(" ".join(element.itertext()))
        if element.tag == "h2":
            if re.search(r"Night\s*1|Saturday", text, re.I):
                night = 1
            elif re.search(r"Night\s*2|Sunday", text, re.I):
                night = 2
            continue
        if not element.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' match-wrestlers ')]"):
            continue
        if element.xpath(".//li[.//*[contains(concat(' ', normalize-space(@class), ' '), ' match-wrestlers ')]]"):
            continue
        match = helpers.build_match_from_card_node(element, record["id"], len(matches) + 1, night, url)
        if match:
            key = (normalize(match.get("displayText")), match.get("night"))
            if key in seen:
                continue
            seen.add(key)
            match["sourceIds"] = [SOURCE_ID]
            matches.append(match)
    return matches


def read_url(url, record_id):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{record_id}.html"
    if path.exists():
        return path.read_bytes()
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        content = response.read()
    path.write_bytes(content)
    return content


def canonical_event_key(value):
    key = normalize(value)
    key = re.sub(r"^(?:wwf|wwe)\s+", "", key)
    key = re.sub(r"\b(?:19|20)\d{2}\b", "", key)
    key = re.sub(r"\bnight\s+(?:1|2|one|two)\b", "", key)
    return re.sub(r"\s+", " ", key).strip()


def event_keys_match(left, right):
    return left == right or left in right or right in left


def extract(text, pattern):
    match = re.search(pattern, text, re.I)
    return clean(match.group(1)) if match else None


def integer_value(value):
    try:
        return int(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize(value):
    return re.sub(r"[^a-z0-9]+", " ", clean(value).lower()).strip()


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


if __name__ == "__main__":
    main()
