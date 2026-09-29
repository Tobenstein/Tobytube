import json
import re
import urllib.request
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "src" / "wrestling-reference.generated.json"
USER_AGENT = "Tobytube personal metadata importer (local prototype)"
SOURCES = {
    "royal_rumble": "https://en.wikipedia.org/wiki/Royal_Rumble_match",
    "money_in_the_bank": "https://en.wikipedia.org/wiki/List_of_Money_in_the_Bank_ladder_matches",
    "king_of_the_ring": "https://en.wikipedia.org/wiki/King_of_the_Ring_tournament",
    "queen_of_the_ring": "https://en.wikipedia.org/wiki/Queen_of_the_Ring_tournament",
    "elimination_chamber": "https://en.wikipedia.org/wiki/Elimination_Chamber",
}


def main():
    db = json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))
    pages = {key: fetch_tables(url) for key, url in SOURCES.items()}

    rumble = parse_royal_rumble(pages["royal_rumble"], db)
    mitb = parse_money_in_the_bank(pages["money_in_the_bank"], db)
    chamber = parse_elimination_chamber(pages["elimination_chamber"], db)
    king = parse_crown_tournament(pages["king_of_the_ring"], "king", db)
    queen = parse_crown_tournament(pages["queen_of_the_ring"], "queen", db)

    tournaments = [
        list_page("wwe-royal-rumble-men", "Men's Royal Rumble", "royal-rumble-list", rumble["men"], "1988-01-24", "wwe-mens-royal-rumble.png", SOURCES["royal_rumble"], "Royal Rumble Winners"),
        list_page("wwe-royal-rumble-women", "Women's Royal Rumble", "royal-rumble-list", rumble["women"], "2018-01-28", "wwe-womens-royal-rumble.png", SOURCES["royal_rumble"], "Royal Rumble Winners"),
        list_page("wwe-money-in-the-bank-men", "Men's Money in the Bank", "money-in-the-bank-list", mitb["men"], "2005-04-03", "wwe-mitb.jpg", SOURCES["money_in_the_bank"], "Money in the Bank Winners"),
        list_page("wwe-money-in-the-bank-women", "Women's Money in the Bank", "money-in-the-bank-list", mitb["women"], "2017-06-18", "wwe-mitb.jpg", SOURCES["money_in_the_bank"], "Money in the Bank Winners"),
        list_page("wwe-elimination-chamber-men", "Men's Elimination Chamber", "elimination-chamber-list", chamber["men"], "2002-11-17", "wwe-mens-ec.png", SOURCES["elimination_chamber"], "Elimination Chamber Matches"),
        list_page("wwe-elimination-chamber-women", "Women's Elimination Chamber", "elimination-chamber-list", chamber["women"], "2018-02-25", "wwe-womens-ec.png", SOURCES["elimination_chamber"], "Elimination Chamber Matches"),
        tournament_page("wwe-king-of-the-ring", "King of the Ring", king, "1985-07-08", "wwe-mens-kotr.png", SOURCES["king_of_the_ring"]),
        tournament_page("wwe-queen-of-the-ring", "Queen of the Ring", queen, "2021-10-21", "wwe-qotr.webp", SOURCES["queen_of_the_ring"]),
    ]

    ids = {item["id"] for item in tournaments}
    db["tournaments"] = [item for item in db.get("tournaments", []) if item.get("id") not in ids] + tournaments
    if not any(source.get("id") == "wikipedia-wwe-achievements" for source in db.get("sources", [])):
        db.setdefault("sources", []).append({"id": "wikipedia-wwe-achievements", "name": "Wikipedia WWE accomplishment histories"})
    db["generatedAt"] = now_utc()
    REFERENCE_PATH.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Imported WWE accomplishments: " + ", ".join(f"{item['name']} ({len(item.get('results', []))})" for item in tournaments))


def fetch_tables(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        html = response.read().decode("utf-8", errors="replace")
    html = re.sub(r'(?:rowspan|colspan)="(\d+)\'"', lambda match: match.group(0).replace("'\"", "\""), html)
    return pd.read_html(StringIO(html))


def parse_royal_rumble(tables, db):
    table = find_table(tables, ["event", "date", "venue", "winner"])
    result = {"men": [], "women": []}
    opportunity = championship_opportunities(tables)
    for _, row in table.iterrows():
        date = date_value(row.iloc[1])
        event = clean(row.iloc[0])
        location = clean(row.iloc[2])
        venue = clean(row.iloc[3])
        winners = [("men", row.iloc[4], row.iloc[5]), ("women", row.iloc[6], row.iloc[7])]
        for division, winner, number in winners:
            winner = clean(winner)
            if not valid_value(winner):
                continue
            if not winner or winner.lower() in {"nan", "n/a", "—", "-"}:
                continue
            for individual in split_co_winners(winner):
                result[division].append({
                    "date": date,
                    "winner": individual,
                    "personId": wrestler_id(individual),
                    "entryNumber": clean(number),
                    "location": location,
                    "venue": venue,
                    "event": event,
                    "eventId": find_archive_event(db, event, str(date)[:4], date).get("id") if find_archive_event(db, event, str(date)[:4], date) else None,
                    "championshipMatch": parse_rumble_championship_match(opportunity.get((str(date)[:4], normalize(individual))), date, db),
                    "notes": opportunity.get((str(date)[:4], normalize(individual))) or "",
                })
    return result


def championship_opportunities(tables):
    output = {}
    for table in tables:
        columns = " ".join(flat_columns(table)).lower()
        if "winner" not in columns or "championship match" not in columns or "year" not in columns:
            continue
        for _, row in table.iterrows():
            values = row_values(row)
            winner = clean(pick(values, "winner"))
            year = clean(pick(values, "year"))
            match = clean(pick(values, "championship match"))
            if winner and year and match:
                output[(year[:4], normalize(winner))] = match
    return output


def parse_money_in_the_bank(tables, db):
    matches = find_table(tables, ["year", "event", "prize", "winner", "other competitors"])
    cash_tables = [table for table in tables if has_columns(table, ["case holder", "championship", "date", "location", "event"])]
    cash_by_holder = {}
    women_holders = set()
    for table_index, table in enumerate(cash_tables):
        is_women_table = table_index == len(cash_tables) - 1
        for _, row in table.iterrows():
            values = row_values(row)
            holder = clean(pick(values, "case holder", "holder"))
            if not holder:
                continue
            if is_women_table:
                women_holders.add(normalize(holder))
            cash_by_holder.setdefault(normalize(holder), []).append({
                "date": date_value(pick(values, "date")),
                "location": clean(pick(values, "location")),
                "event": clean(pick(values, "event")),
                "championship": clean(pick(values, "championship")),
                "notes": clean(pick(values, "results", "result")),
            })
    output = {"men": [], "women": []}
    seen_holder = {}
    rows = list(matches.iterrows())
    for row_index, (_, row) in enumerate(rows):
        values = row_values(row)
        year = clean(pick(values, "year"))[:4]
        winner = clean(pick(values, "winner"))
        time = clean(pick(values, "time"))
        event = clean(pick(values, "event"))
        prize = clean(pick(values, "prize"))
        if not re.fullmatch(r"\d{4}", year) or not winner or not re.match(r"^\d{1,2}:\d{2}", time):
            continue
        source_notes = []
        for _, following in rows[row_index + 1:]:
            following_values = row_values(following)
            if re.match(r"^\d{1,2}:\d{2}", clean(pick(following_values, "time"))):
                break
            note = clean(following.iloc[0])
            if valid_value(note) and note not in source_notes:
                source_notes.append(note)
        archive = find_archive_event(db, event, year)
        key = normalize(winner)
        index = seen_holder.get(key, 0)
        cash_options = cash_by_holder.get(key, [])
        cash = cash_options[index] if index < len(cash_options) else None
        seen_holder[key] = index + 1
        date_won = archive.get("date") if archive else f"{year}-01-01"
        held_for = duration_text(date_won, cash.get("date") if cash else None)
        division = "women" if key in women_holders or re.search(r"women|female", prize, re.I) else "men"
        cash_archive = find_archive_event(db, cash.get("event"), str(cash.get("date") or "")[:4], cash.get("date")) if cash else None
        championship = cash.get("championship") if cash else prize.replace(" match", "")
        output[division].append({
            "year": int(year),
            "winner": winner,
            "personId": wrestler_id(winner),
            "dateWon": date_won,
            "location": archive_location(archive),
            "event": event,
            "eventId": archive.get("id") if archive else None,
            "heldFor": held_duration_from_notes(source_notes) or held_for,
            "cashIn": {"date": cash.get("date"), "location": cash.get("location"), "event": cash.get("event"), "eventId": cash_archive.get("id") if cash_archive else None} if cash else None,
            "championship": championship,
            "championshipId": wwe_championship_id(championship, cash.get("date") if cash else date_won),
            "notes": " ".join(filter(None, source_notes + ([cash.get("notes")] if cash else []))) or "No completed cash-in is listed in the source table.",
        })
    return output


def parse_elimination_chamber(tables, db):
    table = find_table(tables, ["winner", "date", "event", "prize"])
    grouped = {}
    for _, row in table.iterrows():
        winner = clean_champion(row.iloc[4])
        prize = clean(row.iloc[5])
        participants = clean(row.iloc[7])
        date = date_value(row.iloc[2])
        event = clean(row.iloc[1])
        if not valid_value(winner) or not date or not valid_value(event):
            continue
        number = clean(row.iloc[0])
        key = (number, date, normalize(winner))
        current = grouped.get(key)
        if current:
            current["participants"] = merge_names(current["participants"], participants)
            continue
        archive = find_archive_event(db, event, str(date or "")[:4], date)
        parsed_prize = parse_chamber_prize(prize, event, date, db)
        division = "women" if re.search(r"women|female", " ".join([prize, participants]), re.I) else "men"
        grouped[key] = {
            "division": division,
            "number": number,
            "winner": winner,
            "personId": wrestler_id(winner),
            "date": date,
            "location": archive_location(archive),
            "event": event,
            "eventId": archive.get("id") if archive else None,
            "prize": parsed_prize.get("championship"),
            "prizeChampionshipId": parsed_prize.get("championshipId"),
            "championshipMatch": parsed_prize.get("match"),
            "participants": participants,
            "notes": "",
        }
    output = {"men": [], "women": []}
    for item in grouped.values():
        division = item.pop("division")
        output[division].append(item)
    return output


def parse_crown_tournament(tables, division, db):
    table = find_table(tables, ["year", "winner", "runner-up"])
    results = []
    editions = []
    opportunities = crown_opportunities(tables)
    for _, row in table.iterrows():
        values = row_values(row)
        year_text = clean(pick(values, "year"))[:4]
        winner = clean(pick(values, "winner"))
        runner_up = clean(pick(values, "runner-up", "runner up"))
        if not year_text or not winner:
            continue
        event = clean(pick(values, "event"))
        date = date_value(pick(values, "date"))
        location = clean(pick(values, "location", "venue"))
        year = int(year_text)
        archive = find_archive_event(db, event, year_text, date)
        final = {"date": date, "event": event, "venue": location, "eventId": archive.get("id") if archive else None}
        results.append({"year": year, "winner": winner, "winnerPersonId": wrestler_id(winner), "runnerUp": runner_up, "runnerUpPersonId": wrestler_id(runner_up), "final": final, "worldTitleMatch": {"text": clean(pick(values, "championship opportunity", "prize")) or "—"}})
        results[-1]["worldTitleMatch"] = link_crown_opportunity(opportunities.get(normalize(winner), {"text": "—"}), year, db)
        editions.append({"year": year, "rounds": [{"name": "Final", "matches": [{"match": f"{winner} vs. {runner_up}", "winner": winner, "date": date, "event": event, "eventId": archive.get("id") if archive else None}]}]})
    if division == "king":
        bracket_editions = fetch_crown_brackets(results)
        bracket_editions.setdefault(2021, fallback_2021_king_bracket())
        editions = [bracket_editions.get(item["year"], item) for item in editions]
    return {"results": results, "editions": editions}


def link_crown_opportunity(opportunity, year, db):
    text = clean(opportunity.get("text"))
    event = extract_match_event(text) or {
        1994: "SummerSlam 1994",
        1995: "SummerSlam 1995",
        2002: "SummerSlam 2002",
        2006: "SummerSlam 2006",
        2019: "Extreme Rules 2019",
        2024: "SummerSlam 2024",
        2025: "SummerSlam 2025",
    }.get(year) if text and text != "—" else None
    if not event:
        return {"text": text or "—"}
    archive = find_archive_event(db, event, str(year))
    championship = extract_wwe_championship(text)
    return {
        "text": f"{championship or 'World championship'} match at {event}",
        "championship": championship,
        "championshipId": wwe_championship_id(championship, archive.get("date") if archive else str(year)) if championship else None,
        "event": event,
        "date": archive.get("date") if archive else None,
        "eventId": archive.get("id") if archive else None,
    }


def fetch_crown_brackets(results):
    editions = {}
    for result in results:
        year = result["year"]
        urls = [
            f"https://en.wikipedia.org/wiki/{year}_King_of_the_Ring_tournament",
            f"https://en.wikipedia.org/wiki/King_of_the_Ring_({year})",
            f"https://en.wikipedia.org/wiki/{year}_King_and_Queen_of_the_Ring",
        ]
        for url in urls:
            try:
                tables = fetch_tables(url)
                rounds = parse_bracket_tables(tables, result)
                if len(rounds) >= 2:
                    editions[year] = {"year": year, "rounds": rounds, "sourceUrl": url}
                    break
            except Exception:
                continue
    return editions


def fallback_2021_king_bracket():
    return {
        "year": 2021,
        "sourceUrl": "https://en.wikipedia.org/wiki/King_of_the_Ring_(2021)",
        "rounds": [
            {"name": "Quarterfinals", "matches": [
                {"match": "Finn Bálor vs. Cesaro", "winner": "Finn Bálor", "date": "2021-10-08", "event": "SmackDown"},
                {"match": "Sami Zayn vs. Rey Mysterio", "winner": "Sami Zayn", "date": "2021-10-08", "event": "SmackDown"},
                {"match": "Xavier Woods vs. Ricochet", "winner": "Xavier Woods", "date": "2021-10-11", "event": "Monday Night Raw"},
                {"match": "Jinder Mahal vs. Kofi Kingston", "winner": "Jinder Mahal", "date": "2021-10-11", "event": "Monday Night Raw"},
            ]},
            {"name": "Semifinals", "matches": [
                {"match": "Finn Bálor vs. Sami Zayn", "winner": "Finn Bálor", "date": "2021-10-15", "event": "SmackDown"},
                {"match": "Xavier Woods vs. Jinder Mahal", "winner": "Xavier Woods", "date": "2021-10-18", "event": "Monday Night Raw"},
            ]},
            {"name": "Final", "matches": [
                {"match": "Xavier Woods vs. Finn Bálor", "winner": "Xavier Woods", "date": "2021-10-21", "event": "Crown Jewel 2021"},
            ]},
        ],
    }


def parse_bracket_tables(tables, result):
    candidates = []
    for table in tables:
        if table.shape[1] < 6:
            continue
        first_rows = " ".join(clean(value) for value in table.head(2).to_numpy().flatten())
        score = sum(term in first_rows.lower() for term in ["qualifier", "first round", "quarterfinal", "semifinal", "final"])
        if score >= 2:
            candidates.append((score, table))
    if not candidates:
        return []
    table = max(candidates, key=lambda entry: (entry[0], entry[1].shape[1]))[1]
    header_row = max(range(min(3, len(table))), key=lambda index: sum(term in " ".join(clean(value).lower() for value in table.iloc[index].tolist()) for term in ["qualifier", "round", "quarter", "semi", "final"]))
    headers = [clean(value) for value in table.iloc[header_row].tolist()]
    round_columns = []
    handled_headers = set()
    for index, header in enumerate(headers):
        if not re.search(r"qualifier|first round|quarterfinal|semifinal|final", header, re.I):
            continue
        header_key = normalize(header)
        if header_key in handled_headers:
            continue
        handled_headers.add(header_key)
        repeated = [position for position, value in enumerate(headers) if normalize(value) == header_key]
        best_column = max(repeated, key=lambda position: sum(bracket_competitor(clean(value)) for value in table.iloc[header_row + 1:, position].tolist()))
        round_columns.append((best_column, header))
    rounds = []
    for round_index, (column, header) in enumerate(round_columns):
        names = []
        for raw in table.iloc[header_row + 1:, column].tolist():
            name = clean(raw)
            if not bracket_competitor(name):
                continue
            if names and normalize(names[-1]) == normalize(name):
                continue
            names.append(name)
        matches = []
        for index in range(0, len(names) - 1, 2):
            left, right = names[index], names[index + 1]
            next_names = []
            if round_index + 1 < len(round_columns):
                next_column = round_columns[round_index + 1][0]
                next_names = [clean(value) for value in table.iloc[header_row + 1:, next_column].tolist() if bracket_competitor(clean(value))]
            winner = next((name for name in [left, right] if normalize(name) in {normalize(value) for value in next_names}), None)
            if round_index == len(round_columns) - 1:
                winner = result.get("winner")
            matches.append({
                "match": f"{left} vs. {right}",
                "winner": winner,
                "date": result.get("final", {}).get("date") if round_index == len(round_columns) - 1 else None,
                "event": result.get("final", {}).get("event") if round_index == len(round_columns) - 1 else header,
                "eventId": result.get("final", {}).get("eventId") if round_index == len(round_columns) - 1 else None,
            })
        if matches:
            rounds.append({"name": header, "matches": matches})
    return rounds


def bracket_competitor(value):
    text = clean(value)
    if not valid_value(text) or len(text) > 80:
        return False
    if re.fullmatch(r"(?:Raw|SmackDown|WWE Live|NXT|Main Event|Heat|Velocity|Bye|Pin|Sub|DQ|Countout|Forfeit)", text, re.I):
        return False
    if re.fullmatch(r"(?:\d{1,2}:\d{2}|\d+)(?:\[[^]]+\])?", text):
        return False
    return bool(re.search(r"[A-Za-z]", text))


def list_page(item_id, name, page_type, results, established, image_name, url, table_title):
    return {"id": item_id, "promotionId": "wwe", "name": name, "pageType": page_type, "established": established, "format": name, "imageUrl": f"./assets/championships/{image_name}", "summary": f"{name} history linked to Tobytube's WWE event archive.", "results": results, "tableTitle": table_title, "externalIds": {"wikipedia": url}, "sourceIds": ["wikipedia-wwe-achievements"]}


def tournament_page(item_id, name, parsed, established, image_name, url):
    return {"id": item_id, "promotionId": "wwe", "name": name, "pageType": "king-of-the-ring", "established": established, "format": "Single-elimination tournament", "imageUrl": f"./assets/championships/{image_name}", "summary": f"{name} tournament history linked to Tobytube's WWE event archive.", "results": parsed["results"], "editions": sorted(parsed["editions"], key=lambda item: item["year"], reverse=True), "externalIds": {"wikipedia": url}, "sourceIds": ["wikipedia-wwe-achievements"]}


def find_table(tables, required):
    for table in tables:
        if has_columns(table, required):
            return table
    raise RuntimeError(f"No Wikipedia table matched columns: {required}")


def has_columns(table, required):
    text = " ".join(flat_columns(table)).lower()
    return all(term.lower() in text for term in required)


def flat_columns(table):
    output = []
    for column in table.columns:
        parts = column if isinstance(column, tuple) else (column,)
        clean_parts = [clean(part) for part in parts if clean(part) and not clean(part).lower().startswith("unnamed")]
        output.append(" ".join(dict.fromkeys(clean_parts)).lower())
    return output


def row_values(row):
    return {name: row.iloc[index] for index, name in enumerate(flat_columns(row.to_frame().T))}


def pick(values, *needles):
    for needle in needles:
        for key, value in values.items():
            if needle.lower() in key.lower() and clean(value).lower() != "nan":
                return value
    return None


def find_archive_event(db, event, year, date=None):
    key = canonical_event_key(event)
    candidates = [item for item in db.get("events", []) + db.get("episodes", []) if str(item.get("date", "")).startswith(year) and item.get("promotionId") == "wwe"]
    matching = [item for item in candidates if key == canonical_event_key(item.get("title")) or key in canonical_event_key(item.get("title")) or canonical_event_key(item.get("title")) in key]
    if date:
        exact_date = [item for item in matching if item.get("date") == date]
        if exact_date:
            matching = exact_date
    return max(matching, key=event_completeness, default=None)


def canonical_event_key(value):
    key = normalize(value)
    key = re.sub(r"^(?:wwf|wwe)\s+", "", key)
    key = re.sub(r"\b(?:19|20)\d{2}\b", "", key)
    key = re.sub(r"\bnight\s+(?:1|2|one|two)\b", "", key)
    match = re.search(r"\bwrestlemania\s+([ivxlcdm]+)\b", key)
    if match:
        key = key[:match.start(1)] + str(roman_to_int(match.group(1))) + key[match.end(1):]
    return re.sub(r"\s+", " ", key).strip()


def roman_to_int(value):
    values = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100, "d": 500, "m": 1000}
    total = previous = 0
    for character in reversed(str(value).lower()):
        current = values.get(character, 0)
        total += -current if current < previous else current
        previous = max(previous, current)
    return total


def event_completeness(item):
    return sum([
        10 if item.get("matches") else 0,
        4 if item.get("posterUrl") or item.get("imageUrl") else 0,
        2 if item.get("synopsis") or item.get("summary") else 0,
        1 if item.get("venue") else 0,
        1 if item.get("location") else 0,
        1 if item.get("attendance") else 0,
    ])


def parse_rumble_championship_match(notes, rumble_date, db):
    if not notes:
        return None
    championship = extract_wwe_championship(notes)
    event = extract_match_event(notes)
    year = int(str(rumble_date or "0000")[:4] or 0)
    if championship and not event and year >= 1993:
        event = f"WrestleMania {year - 1984}"
    if not championship or not event:
        return None
    archive = find_archive_event(db, event, str(year))
    return {
        "text": f"{championship} match at {event}",
        "championship": championship,
        "championshipId": wwe_championship_id(championship, archive.get("date") if archive else rumble_date),
        "event": event,
        "date": archive.get("date") if archive else None,
        "eventId": archive.get("id") if archive else None,
    }


def parse_chamber_prize(prize, chamber_event, chamber_date, db):
    championship = extract_wwe_championship(prize)
    if not championship:
        return {"championship": clean(prize) or None, "championshipId": None, "match": None}
    match_event = extract_match_event(prize) or chamber_event
    year = str(chamber_date or "")[:4]
    archive = find_archive_event(db, match_event, year, chamber_date if normalize(match_event) == normalize(chamber_event) else None)
    match_date = archive.get("date") if archive else (chamber_date if normalize(match_event) == normalize(chamber_event) else None)
    return {
        "championship": championship,
        "championshipId": wwe_championship_id(championship, match_date or chamber_date),
        "match": {
            "text": f"{championship} match at {match_event}",
            "championship": championship,
            "championshipId": wwe_championship_id(championship, match_date or chamber_date),
            "event": match_event,
            "date": match_date,
            "eventId": archive.get("id") if archive else None,
        },
    }


def extract_wwe_championship(value):
    text = clean(value)
    aliases = [
        (r"Undisputed WWE Universal Championship|Undisputed WWE Championship|Undisputed title", "Undisputed WWE Championship"),
        (r"WWE Universal Championship|Universal Championship", "WWE Universal Championship"),
        (r"SmackDown Women's Championship", "WWE Women's Championship"),
        (r"Raw Women's Championship", "Women's World Championship"),
        (r"Women's World Championship", "Women's World Championship"),
        (r"WWE Women's Championship", "WWE Women's Championship"),
        (r"World Heavyweight Championship", "World Heavyweight Championship"),
        (r"(?:WWF|WWE) Championship", "WWE Championship"),
        (r"Divas Championship", "WWE Divas Championship"),
        (r"ECW Championship", "ECW World Heavyweight Championship"),
        (r"Intercontinental Championship", "WWE Intercontinental Championship"),
        (r"United States Championship", "WWE United States Championship"),
    ]
    return next((name for pattern, name in aliases if re.search(pattern, text, re.I)), None)


def extract_match_event(value):
    text = clean(value)
    patterns = [
        r"\b(WrestleMania\s+(?:\d+|[IVXL]+))\b",
        r"\b(SummerSlam(?:\s+Night\s+[12])?)\b",
        r"\b(Royal Rumble(?:\s+\d{4})?)\b",
    ]
    return next((clean(match.group(1)) for pattern in patterns if (match := re.search(pattern, text, re.I))), None)


def wwe_championship_id(name, date=None):
    key = normalize(name)
    year = int(str(date or "0000")[:4] or 0)
    if "undisputed wwe" in key: return "wwe-wwe-championship"
    if "universal" in key: return "wwe-wwe-universal"
    if "world heavyweight" in key: return "wwe-wwe-world-heavyweight-2002" if year and year <= 2013 else "wwe-wwe-world-heavyweight"
    if key in {"wwe championship", "wwf championship"}: return "wwe-wwe-championship"
    if "womens world" in key: return "wwe-wwe-womens-world"
    if "wwe womens championship" in key: return "wwe-wwe-womens-championship"
    if "divas" in key: return "wwe-wwe-divas"
    if "ecw" in key: return "wwe-ecw-world-heavyweight"
    if "intercontinental" in key: return "wwe-wwe-intercontinental"
    if "united states" in key: return "wwe-wwe-united-states"
    return None


def clean_champion(value):
    return re.sub(r"\s*\((?:c|w)\)\s*$", "", clean(value), flags=re.I).strip()


def merge_names(left, right):
    names = []
    for value in [left, right]:
        for name in re.split(r",\s*", clean(value)):
            if valid_value(name) and normalize(name) not in {normalize(item) for item in names}:
                names.append(name)
    return ", ".join(names)


def crown_opportunities(tables):
    output = {}
    for table in tables:
        if not has_columns(table, ["winner", "championship", "result"]):
            continue
        for _, row in table.iterrows():
            values = row_values(row)
            winner = clean(pick(values, "winner"))
            championship = clean(pick(values, "championship"))
            result = clean(pick(values, "result"))
            if winner:
                output[normalize(winner)] = {"text": ": ".join(filter(None, [championship, result])) or "—"}
    return output


def held_duration_from_notes(notes):
    match = re.search(r"held (?:the )?(?:contract|briefcase) for ([^.]+)", " ".join(notes), re.I)
    return clean(match.group(1)) if match else None


def valid_value(value):
    return normalize(value) not in {"", "nan", "n a"}


def archive_location(record):
    if not record:
        return None
    return record.get("location") or ", ".join(filter(None, [record.get("city"), record.get("region"), record.get("country")])) or None


def duration_text(start, end):
    try:
        days = (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days
        return f"{days} days"
    except (TypeError, ValueError):
        return "Not listed"


def date_value(value):
    if value is None or clean(value).lower() == "nan":
        return None
    parsed = pd.to_datetime(clean(value), errors="coerce")
    return None if pd.isna(parsed) else parsed.strftime("%Y-%m-%d")


def split_co_winners(value):
    return [clean(item) for item in re.split(r"\s+(?:and|&)\s+", value) if clean(item)]


def wrestler_id(name):
    return None if not clean(name) else f"wrestler-{slug(name)}"


def normalize(value):
    return re.sub(r"[^a-z0-9]+", " ", clean(value).lower()).strip()


def slug(value):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", clean(value).lower()))


def clean(value):
    if value is None:
        return ""
    return re.sub(r"\[[^]]+\]", "", re.sub(r"\s+", " ", str(value))).strip()


def now_utc():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


if __name__ == "__main__":
    main()
