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
CACHE_DIR = ROOT / "cache" / "sdh-tna-results"
SOURCE_ID = "sdh-tna-results"
BASE_URL = "https://www.thesmackdownhotel.com/events-results/tna/"
USER_AGENT = "Tobytube metadata prototype (personal use)"

SHOWS = [
    {
        "name": "Impact",
        "title_prefix": "TNA Impact",
        "slug": "impact",
        "list_path": "impact-wrestling/",
        "url_terms": ["impact", "impact-wrestling", "tna-impact"],
        "series_id": "tna-impact",
        "short_name": "IMPACT",
        "start_date": "2004-06-04",
        "end_date": None,
    },
    {
        "name": "Xplosion",
        "title_prefix": "TNA Xplosion",
        "slug": "xplosion",
        "list_path": "xplosion/",
        "url_terms": ["xplosion", "impact-xplosion", "tna-xplosion"],
        "series_id": "tna-xplosion",
        "short_name": "XPLOSION",
        "start_date": "2002-11-27",
        "end_date": None,
    },
    {
        "name": "Before the Impact",
        "title_prefix": "TNA Before the Impact",
        "slug": "before-the-impact",
        "list_path": "tna-before-the-impact-results-list/",
        "url_terms": ["before-the-impact"],
        "series_id": "tna-before-the-impact",
        "short_name": "BTI",
        "start_date": "2021-02-16",
        "end_date": "2023-02-16",
    },
    {
        "name": "NWA-TNA Weekly PPV",
        "title_prefix": "NWA-TNA Weekly PPV",
        "slug": "weekly-ppv",
        "list_path": "weekly-ppv/",
        "url_terms": ["nwa-total-nonstop-action"],
        "series_id": "tna-weekly-ppv",
        "short_name": "WEEKLY PPV",
        "start_date": "2002-06-19",
        "end_date": "2004-09-08",
    },
]

# SDH includes three recap/special broadcasts in its continuous numbering. They
# are useful reference records, but they are not part of the canonical 111-show
# Weekly PPV run.  Removing them and numbering by air date reconciles the source
# with TNA's published weekly-PPV chronology.
WEEKLY_PPV_EXCLUDED_DATES = {
    "2003-09-10",  # One Cent Special
    "2003-12-24",  # Best of the X Division in 2003
    "2003-12-31",  # Best of TNA 2003
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Re-download SDH pages.")
    args = parser.parse_args()

    db = read_json(REFERENCE_PATH)
    ensure_reference_shape(db)
    ensure_source(db)
    ensure_promotion(db)
    ensure_series(db)
    purge_previous_tna_sdh_pass(db)

    imported_records = 0
    imported_matches = 0
    discovered_pages = []
    seen_record_ids = set()
    seen_match_ids = set()

    for show in SHOWS:
        list_url = f"{BASE_URL}{show['list_path']}"
        list_html = read_url(list_url, f"{show['slug']}-index.html", args.refresh)
        year_urls = discover_year_urls(list_html, show)
        discovered_pages.extend(year_urls)

        for url in year_urls:
            html = read_url(url, cache_name_from_url(url), args.refresh)
            records, matches = parse_show_year(html, url, show)
            for record in records:
                if record["id"] in seen_record_ids:
                    continue
                seen_record_ids.add(record["id"])
                table = db["events"] if record["recordType"] == "event" else db["episodes"]
                table.append(record)
                imported_records += 1
            for match in matches:
                if match["id"] in seen_match_ids:
                    continue
                seen_match_ids.add(match["id"])
                db["matches"].append(match)
                imported_matches += 1

    db["generatedAt"] = now_utc()
    write_json_atomic(REFERENCE_PATH, db)

    print(
        "Imported TNA SDH results: "
        f"{imported_records} show records, {imported_matches} spoiler-safe match records, "
        f"{len(discovered_pages)} year pages."
    )


def parse_show_year(html_bytes, source_url, show):
    document = lxml.html.fromstring(html_bytes)
    records = []
    matches = []
    show_names = [show["name"]]
    if show["slug"] == "weekly-ppv":
        show_names.append("Total Nonstop Action")
    show_name_pattern = "(?:" + "|".join(re.escape(name).replace("\\ ", "\\s+") for name in show_names) + ")"
    header_pattern = re.compile(
        rf"^(?:TNA\s+|Impact\s+)?{show_name_pattern}\s+#(?P<number>\d+):\s+(?P<date>[^-]+?)(?:\s+-\s+(?P<title>.+))?$",
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

        if show["slug"] == "weekly-ppv" and date in WEEKLY_PPV_EXCLUDED_DATES:
            continue

        special_title = clean(match.group("title"))
        if show["slug"] == "weekly-ppv":
            episode_number = canonical_weekly_ppv_number(date, episode_number)
        record_type = "episode" if show["slug"] == "weekly-ppv" else ("event" if special_title else "episode")
        title_prefix = show.get("title_prefix", f"TNA {show['name']}")
        title = f"{title_prefix} #{episode_number}"
        if special_title and show["slug"] != "weekly-ppv":
            title = f"{title_prefix}: {special_title}"
        record_id = f"sdh-tna-{slug(show['name'])}-{episode_number}" if show["slug"] == "weekly-ppv" else (
            f"sdh-tna-tv-special-{slug(show['name'])}-{date}-{slug(special_title)}"
            if special_title
            else f"sdh-tna-{slug(show['name'])}-{episode_number}"
        )
        result_lines = collect_result_lines(header)
        episode_note = collect_episode_note(header)
        is_recap_without_card = bool(
            not result_lines and special_title and
            re.search(r"\bbest of\b|\bthanksgiving special\b", special_title, flags=re.I)
        )
        if is_recap_without_card and not episode_note:
            episode_note = "Recap/special episode; no original match card is listed by the source."

        records.append(
            {
                "id": record_id,
                "title": title,
                "promotionId": "tna",
                "promotion": "Total Nonstop Action Wrestling",
                "date": date,
                "dateDisplay": date,
                "venue": None,
                "city": None,
                "region": None,
                "country": None,
                "location": None,
                "attendance": None,
                "eventType": "TV Special" if special_title else "TV Show",
                "seriesName": show["name"],
                "seriesId": show["series_id"],
                "episodeNumber": episode_number,
                "recordType": record_type,
                "summary": episode_note,
                "matchCardStatus": "no-matches" if (
                    is_recap_without_card or
                    (episode_note and re.search(r"no match disputed", episode_note, flags=re.I))
                ) else None,
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
            matches.append(build_match(record_id, record_type, line, index, source_url))

    return records, matches


def canonical_weekly_ppv_number(date, source_number):
    if date < "2003-09-10":
        return source_number
    if date < "2003-12-24":
        return source_number - 1
    if date < "2004-01-01":
        return source_number - 2
    return source_number - 3


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
        elif sibling.tag == "p":
            text = clean(" ".join(sibling.itertext()))
            # A handful of Xplosion pages put their sole result in an italic
            # paragraph instead of a list.  Treat result-shaped paragraphs as
            # matches while leaving recap/no-match notices to the summary path.
            if text and re.search(r"\bdefeats?\b|\bvs\.?\b", text, flags=re.I):
                lines.append(text)
    return lines


def collect_episode_note(header):
    tail = clean(header.tail)
    if tail:
        return tail
    for sibling in header.itersiblings():
        if sibling.tag in {"h2", "h3"}:
            break
        if sibling.tag == "p":
            text = clean(" ".join(sibling.itertext()))
            if text:
                return text
    return None


def build_match(event_id, record_type, line, order, source_url):
    parsed = parse_result_line(line, f"{event_id}-{order}")
    return {
        "id": f"{event_id}-match-{order}",
        "eventId": event_id,
        "eventRecordType": record_type,
        "promotionId": "tna",
        "order": order,
        "label": str(order),
        "raw": line,
        "displayText": parsed["display"],
        "stipulation": parsed["stipulation"],
        "titleMatch": parsed["title_match"],
        "championshipId": f"tna-{slug(parsed['title_match'])}" if parsed["title_match"] else None,
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

    result_match = re.match(r"(?P<winner>.+?)\s+defeats?\s+(?P<loser>.+?)(?P<tail>\s+via\s+.+|\s+to\s+.+)?$", core, flags=re.I)
    if result_match:
        winner = clean(result_match.group("winner"))
        loser = clean(result_match.group("loser"))
        tail = clean(result_match.group("tail"))
        ordered = order_sides_for_display(winner, loser, prefix, seed)
        display_core = f"{ordered[0]} vs. {ordered[1]}"
        participants = extract_participants([winner, loser])
        champions = extract_champions([winner, loser])
        teams = [
            {"name": winner, "side": "winner"},
            {"name": loser, "side": "opponent"},
        ]
        return {
            "display": f"{prefix}: {display_core}" if prefix else display_core,
            "stipulation": prefix or infer_stipulation(line),
            "title_match": infer_title_match(prefix, line),
            "winner": winner,
            "result": f"defeats{(' ' + tail) if tail else ''}",
            "participants": participants,
            "teams": teams,
            "champions": champions,
        }

    participants = extract_participants([core])
    return {
        "display": f"{prefix}: {core}" if prefix else core,
        "stipulation": prefix or infer_stipulation(line),
        "title_match": infer_title_match(prefix, line),
        "winner": None,
        "result": None,
        "participants": participants,
        "teams": [],
        "champions": extract_champions([core]),
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
        cleaned = re.sub(r"\([^)]*\)", "", side)
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
        if "(c)" not in side.lower():
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
    if " Match" in line:
        match = re.search(r"([A-Z#\" ][^:]+ Match)", line)
        if match:
            return clean(match.group(1).strip('" '))
    return "Match"


def discover_year_urls(html_bytes, show):
    document = lxml.html.fromstring(html_bytes)
    urls = []
    terms = show.get("url_terms") or [show["slug"]]
    for href in document.xpath("//a/@href"):
        absolute = urljoin(BASE_URL, href)
        lower = absolute.lower().rstrip("/")
        if (
            "/events-results/tna/" in lower
            and re.search(r"(?:19|20)\d{2}$", lower)
            and any(term in lower for term in terms)
            and absolute not in urls
        ):
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
        "name": "TheSmackDownHotel TNA results archive",
        "type": "events",
        "url": BASE_URL,
        "priority": 10,
        "notes": "TNA show result pages with spoiler-safe display text and winner/result stored separately.",
    }
    upsert_record(db["sources"], source)


def ensure_promotion(db):
    promotion = {
        "id": "tna",
        "name": "Total Nonstop Action Wrestling",
        "summary": "TNA archive imported from TheSmackDownHotel show result pages.",
        "sourceIds": [SOURCE_ID],
        "externalIds": {"sdh": {"url": BASE_URL}},
    }
    upsert_record(db["promotions"], promotion)


def ensure_series(db):
    for show in SHOWS:
        series = {
            "id": show["series_id"],
            "promotionId": "tna",
            "name": show["name"],
            "shortName": show["short_name"],
            "startDate": show["start_date"],
            "endDate": show["end_date"],
            "sourceIds": [SOURCE_ID],
            "externalIds": {"sdh": {"url": f"{BASE_URL}{show['list_path']}"}},
        }
        upsert_record(db["series"], series)


def purge_previous_tna_sdh_pass(db):
    for table_name in ("events", "episodes"):
        db[table_name] = [
            record
            for record in db[table_name]
            if not (record.get("promotionId") == "tna" and SOURCE_ID in (record.get("sourceIds") or []))
        ]

    db["matches"] = [
        record
        for record in db["matches"]
        if not (record.get("promotionId") == "tna" and SOURCE_ID in (record.get("sourceIds") or []))
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
    text = re.sub(r"\s+", " ", text)
    parsed = pd.to_datetime(text, errors="coerce")
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


def write_json_atomic(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


if __name__ == "__main__":
    main()
