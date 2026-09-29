import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const db = JSON.parse(await readFile(referencePath, "utf8"));

// The programming import briefly assigned the June 28 San Jose event to 2027.
// The archived tournament results establish it as the 2026 Forbidden Door.
const mistakenForbiddenDoorId = "wikipedia-aew-ppv-2027-06-28-forbidden-door";
const correctedForbiddenDoorId = "wikipedia-aew-ppv-2026-06-28-forbidden-door";
const forbiddenDoor = db.events?.find((event) => event.id === mistakenForbiddenDoorId);
if (forbiddenDoor && !db.events.some((event) => event.id === correctedForbiddenDoorId)) {
  Object.assign(forbiddenDoor, {
    id: correctedForbiddenDoorId,
    date: "2026-06-28",
    broadcastDate: "2026-06-28",
    year: 2026,
    season: 2026,
  });
  for (const match of db.matches ?? []) {
    if (match.eventId === mistakenForbiddenDoorId) match.eventId = correctedForbiddenDoorId;
    if (match.episodeId === mistakenForbiddenDoorId) match.episodeId = correctedForbiddenDoorId;
  }
}
const parents = new Map([...(db.events ?? []), ...(db.episodes ?? [])].map((item) => [item.id, item]));

const summaries = {
  women: [
    summary(2022, "Dr. Britt Baker, D.M.D.", "Ruby Soho", "2022-05-29", "Double or Nothing", "T-Mobile Arena, Paradise, Nevada", "None"),
    summary(2023, "Willow Nightingale", "Ruby Soho", "2023-07-15", "Collision", "Scotiabank Saddledome, Calgary, Alberta", "None"),
    summary(2024, "Mariah May", "Willow Nightingale", "2024-07-10", "Dynamite", "Scotiabank Saddledome, Calgary, Alberta", "Defeated “Timeless” Toni Storm at All In London", "2024-08-25", "All In London"),
    summary(2025, "Mercedes Moné", "Jamie Hayter", "2025-05-25", "Double or Nothing", "Desert Diamond Arena, Glendale, Arizona", "Was defeated by “Timeless” Toni Storm at All In: Texas", "2025-07-12", "All In: Texas"),
    summary(2026, "Mercedes Moné", "Maya World", "2026-06-28", "Forbidden Door", "SAP Center, San Jose, California", "TBD"),
  ],
  men: [
    summary(2022, "Adam Cole", "Samoa Joe", "2022-05-29", "Double or Nothing", "T-Mobile Arena, Paradise, Nevada", "None"),
    summary(2023, "Ricky Starks", "CM Punk", "2023-07-15", "Collision", "Scotiabank Saddledome, Calgary, Alberta", "None"),
    summary(2024, "Bryan Danielson", '“Hangman” Adam Page', "2024-07-10", "Dynamite", "Scotiabank Saddledome, Calgary, Alberta", "Defeated Swerve Strickland in a Title vs. Career match at All In London", "2024-08-25", "All In London"),
    summary(2025, '“Hangman” Adam Page', "Will Ospreay", "2025-05-25", "Double or Nothing", "Desert Diamond Arena, Glendale, Arizona", "Defeated Jon Moxley in a Texas Deathmatch at All In: Texas", "2025-07-12", "All In: Texas"),
    summary(2026, "Will Ospreay", "Swerve Strickland", "2026-06-28", "Forbidden Door", "SAP Center, San Jose, California", "TBD"),
  ],
};

const bracketMatches = (db.matches ?? [])
  .filter((match) => /owen hart/i.test(`${match.stipulation ?? ""} ${match.titleMatch ?? ""} ${match.match ?? ""}`))
  .map((match) => enrichMatch(match))
  .filter((match) => match.year >= 2022 && match.year <= 2026 && match.division && match.round);

for (const division of ["men", "women"]) {
  const id = `aew-owen-hart-cup-${division}`;
  const editions = [2026, 2025, 2024, 2023, 2022].map((year) => ({
    year,
    rounds: ["Qualifiers", "Quarterfinals", "Semifinals", "Final"].map((round) => ({
      name: round,
      matches: bracketMatches
        .filter((match) => match.division === division && match.year === year && match.round === round)
        .sort((a, b) => `${a.date}-${String(a.order).padStart(2, "0")}`.localeCompare(`${b.date}-${String(b.order).padStart(2, "0")}`)),
    })).filter((round) => round.matches.length),
  }));
  const tournament = {
    id,
    promotionId: "aew",
    name: `${division === "men" ? "Men's" : "Women's"} Owen Hart Cup`,
    division,
    established: "2022-05-29",
    format: "Single-elimination tournament",
    imageUrl: `./assets/championships/${id}.png`,
    summary: "The Owen Hart Foundation Tournament is an annual AEW single-elimination competition. Since 2024, the winner earns a world championship match at All In.",
    results: summaries[division].map(linkSummaryEvents),
    editions,
    externalIds: { wikipedia: "https://en.wikipedia.org/wiki/Owen_Hart_Cup" },
    sourceIds: ["wikipedia-owen-hart-cup", "tobytube-match-archive"],
  };
  db.tournaments ??= [];
  upsert(db.tournaments, tournament);
  upsert(db.championships, {
    id,
    promotionId: "aew",
    name: tournament.name,
    cardType: "achievement",
    imageUrl: tournament.imageUrl,
    summary: tournament.summary,
    externalIds: tournament.externalIds,
  });
}

if (!db.sources.some((source) => source.id === "wikipedia-owen-hart-cup")) db.sources.push({ id: "wikipedia-owen-hart-cup" });
db.generatedAt = new Date().toISOString();
const tempPath = `${referencePath}.owen`;
await writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`);
await rename(tempPath, referencePath);
console.log(`Generated Owen Hart Cup data: ${bracketMatches.length} archived tournament matches across 10 brackets.`);

function enrichMatch(match) {
  const parentId = match.eventId ?? match.episodeId;
  const parent = parents.get(parentId) ?? {};
  const text = `${match.stipulation ?? ""} ${match.match ?? ""}`;
  const date = parent.date ?? parent.broadcastDate ?? "";
  return {
    id: match.id,
    match: cleanMatchName(match.match),
    winner: match.winner ?? null,
    result: match.result ?? null,
    time: match.time ?? null,
    date,
    year: Number(date.slice(0, 4)) || Number(text.match(/20\d{2}/)?.[0]),
    division: /women/i.test(text) ? "women" : /men/i.test(text) ? "men" : null,
    round: /qualif/i.test(text) ? "Qualifiers" : /quarter/i.test(text) ? "Quarterfinals" : /semi/i.test(text) ? "Semifinals" : /final/i.test(text) ? "Final" : null,
    order: match.order ?? 0,
    event: parent.name ?? parent.title ?? parent.displayTitle ?? "",
    eventId: parentId,
    location: parent.location ?? [parent.city, parent.region, parent.country].filter(Boolean).join(", "),
  };
}

function cleanMatchName(value = "") {
  return value.replace(/^.*?Tournament\s*(?:-|:)?\s*(?:Qualifier|Quarterfinal|Semifinal|Final)?(?:\s+[^:]+ Match)?\s*:\s*/i, "").trim();
}

function summary(year, winner, runnerUp, date, event, venue, worldTitleMatch, titleDate = null, titleEvent = null) {
  return { year, winner, winnerPersonId: slug(winner), runnerUp, runnerUpPersonId: slug(runnerUp), final: { date, event, venue }, worldTitleMatch: { text: worldTitleMatch, date: titleDate, event: titleEvent } };
}

function linkSummaryEvents(record) {
  return {
    ...record,
    final: { ...record.final, eventId: findParent(record.final.date, record.final.event)?.id ?? null },
    worldTitleMatch: { ...record.worldTitleMatch, eventId: record.worldTitleMatch.date ? findParent(record.worldTitleMatch.date, record.worldTitleMatch.event)?.id ?? null : null },
  };
}

function findParent(date, eventName) {
  const candidates = [...parents.values()].filter((item) => (item.date ?? item.broadcastDate) === date && item.promotionId === "aew");
  const key = normalize(eventName);
  return candidates.find((item) => {
    const title = normalize(item.name ?? item.title ?? item.displayTitle);
    return title.includes(key) || key.includes(title) || (key === "dynamite" && title.includes("dynamite")) || (key === "collision" && title.includes("collision"));
  }) ?? candidates[0];
}

function normalize(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function upsert(records, next) {
  const index = records.findIndex((record) => record.id === next.id);
  if (index >= 0) records[index] = { ...records[index], ...next };
  else records.push(next);
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
