import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const sourceId = "wrestlingdata-events";
const inputPath = process.argv[2];

if (!inputPath) {
  throw new Error("Usage: node scripts/import-wrestlingdata-export.mjs <wrestlingdata-export.json>");
}

const db = await readJson(referencePath, emptyDb());
const exportData = JSON.parse(await readFile(path.resolve(root, inputPath), "utf8"));

for (const promotion of exportData.promotions ?? []) {
  upsertPromotion(db, promotion);
}

let eventCount = 0;
let episodeCount = 0;
let matchCount = 0;
let peopleCount = 0;
let titleCount = 0;

for (const event of exportData.events ?? []) {
  const normalized = normalizeEvent(event);
  const table = normalized.recordType === "episode" ? db.episodes : db.events;
  const otherTable = normalized.recordType === "episode" ? db.events : db.episodes;
  removeById(otherTable, normalized.id);
  upsertById(table, normalized);
  normalized.recordType === "episode" ? (episodeCount += 1) : (eventCount += 1);

  for (const person of collectPeople(event.matches ?? [])) {
    if (upsertById(db.people, person)) peopleCount += 1;
  }

  for (const championship of collectChampionships(event.matches ?? [], normalized.promotionId)) {
    if (upsertById(db.championships, championship)) titleCount += 1;
  }

  for (const match of normalizeMatches(event, normalized)) {
    upsertById(db.matches, match);
    matchCount += 1;
  }
}

upsertSource(db.sources, sourceId, exportData.source);
db.generatedAt = new Date().toISOString();
await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);

console.log(
  `Imported Wrestlingdata export: ${eventCount} events, ${episodeCount} episodes, ${matchCount} matches, ${peopleCount} people, ${titleCount} championships.`,
);

function normalizeEvent(event) {
  const showId = String(event.wrestlingdataId ?? event.id);
  const recordType = isTelevisionEvent(event) ? "episode" : "event";
  const id = `wrestlingdata-show-${showId}`;
  const date = parseWrestlingdataDate(event.date);

  return {
    id,
    title: cleanText(event.title),
    promotionId: event.promotionId ?? slug(event.promotion ?? "unknown"),
    promotion: cleanText(event.promotion ?? event.promotionName) ?? null,
    date,
    dateDisplay: cleanText(event.dateDisplay ?? event.date) ?? null,
    venue: cleanText(event.venue) ?? null,
    city: cleanText(event.city) ?? null,
    region: cleanText(event.region) ?? null,
    country: cleanText(event.country) ?? null,
    location: compactLocation([event.city, event.region, event.country]),
    attendance: parseNumber(event.audience ?? event.attendance),
    announcers: (event.announcers ?? []).map(cleanText).filter(Boolean),
    eventType: cleanText(event.eventType) ?? null,
    seriesName: cleanText(event.seriesName) ?? null,
    seriesId: event.seriesName ? `${event.promotionId ?? slug(event.promotion ?? "unknown")}-${slug(event.seriesName)}` : null,
    episodeNumber: parseEpisodeNumber(event.title),
    recordType,
    sourceIds: [sourceId],
    externalIds: {
      wrestlingdata: {
        showId,
        url: event.url ?? event.sourceUrl ?? null,
        cardUrl: event.cardUrl ?? null,
        resultsUrl: event.resultsUrl ?? null,
        sourcePage: event.sourcePage ?? null,
      },
    },
    importedAt: new Date().toISOString(),
  };
}

function normalizeMatches(event, normalizedEvent) {
  const matches = event.matches ?? [];
  return matches.map((match, index) => {
    const order = Number.isFinite(match.order) ? match.order : index + 1;
    return {
      id: `${normalizedEvent.id}-match-${order}`,
      eventId: normalizedEvent.id,
      eventRecordType: normalizedEvent.recordType,
      promotionId: normalizedEvent.promotionId,
      order,
      label: cleanText(match.label) ?? String(order),
      raw: cleanText(match.raw),
      displayText: cleanText(match.raw),
      stipulation: cleanText(match.stipulation) ?? null,
      titleMatch: cleanText(match.titleMatch) ?? null,
      championshipId: match.titleMatch ? `${normalizedEvent.promotionId}-${slug(match.titleMatch.replace(/\s+Match$/i, ""))}` : null,
      participants: normalizeParticipants(match.participants ?? []).map((person) => ({
        id: personId(person),
        name: person.name,
        externalIds: { wrestlingdata: person.wrestlingdataId ?? null },
      })),
      teams: match.teams ?? [],
      champions: inferChampions(match),
      championMarked: Boolean(match.championMarked),
      spoilerSafe: true,
      sourceIds: [sourceId],
      externalIds: {
        wrestlingdata: {
          showId: String(event.wrestlingdataId ?? event.id),
        },
      },
    };
  });
}

function collectPeople(matches) {
  const seen = new Map();
  for (const match of matches) {
    for (const person of normalizeParticipants(match.participants ?? [])) {
      const id = personId(person);
      if (!seen.has(id)) {
        seen.set(id, {
          id,
          name: person.name,
          externalIds: { wrestlingdata: person.wrestlingdataId ?? null },
          sourceIds: [sourceId],
        });
      }
    }
  }
  return [...seen.values()];
}

function normalizeParticipants(participants) {
  const uniquePeople = [];
  for (const participant of participants) {
    participant.name = cleanText(participant.name);
    if (!participant.name) continue;
    if (
      uniquePeople.some(
        (person) =>
          person.name === participant.name ||
          (person.wrestlingdataId && participant.wrestlingdataId && person.wrestlingdataId === participant.wrestlingdataId),
      )
    ) {
      continue;
    }
    uniquePeople.push(participant);
  }

  return uniquePeople.filter((participant) => {
    const name = participant.name.toLowerCase();
    return !uniquePeople.some((other) => other !== participant && other.name.toLowerCase().includes(name) && other.name.length > participant.name.length);
  });
}

function collectChampionships(matches, promotionId) {
  const seen = new Map();
  for (const match of matches) {
    if (!match.titleMatch) continue;
    const name = match.titleMatch.replace(/\s+Match$/i, "");
    const id = `${promotionId ?? "unknown"}-${slug(name)}`;
    if (!seen.has(id)) {
      seen.set(id, {
        id,
        name,
        promotionId: promotionId ?? null,
        sourceIds: [sourceId],
        externalIds: {},
      });
    }
  }
  return [...seen.values()];
}

function inferChampions(match) {
  const raw = match.raw ?? "";
  const champions = [];
  for (const person of match.participants ?? []) {
    if (new RegExp(`${escapeRegex(person.name)}\\s*\\(c\\)`, "i").test(raw)) {
      champions.push({
        id: personId(person),
        name: person.name,
        externalIds: { wrestlingdata: person.wrestlingdataId ?? null },
      });
    }
  }
  for (const team of match.teams ?? []) {
    if (new RegExp(`${escapeRegex(team.name)}\\s*\\(c\\)`, "i").test(raw)) {
      champions.push({
        id: team.wrestlingdataId ? `wrestlingdata-team-${team.wrestlingdataId}` : `team-${slug(team.name)}`,
        name: team.name,
        externalIds: { wrestlingdata: team.wrestlingdataId ?? null },
      });
    }
  }
  return champions;
}

function upsertPromotion(db, promotion) {
  const id = promotion.id ?? slug(promotion.name);
  const existing = db.promotions.find((item) => item.id === id || item.name === promotion.name);
  const record = {
    id,
    name: promotion.name,
    eventCount: promotion.eventCount ?? null,
    sourceIds: unique([...(existing?.sourceIds ?? []), sourceId]),
    externalIds: {
      ...(existing?.externalIds ?? {}),
      wrestlingdata: {
        id: promotion.wrestlingdataId ?? null,
        url: promotion.url ?? null,
      },
    },
  };
  if (existing) Object.assign(existing, { ...record, summary: existing.summary ?? promotion.summary ?? null });
  else db.promotions.push(record);
}

function isTelevisionEvent(event) {
  const type = `${event.eventType ?? ""} ${event.title ?? ""}`;
  return /tv[-\s]?show|television|internet broadcast|webcast|weekly|episode|#\d+/i.test(type);
}

function parseEpisodeNumber(title = "") {
  const match = title.match(/#\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseWrestlingdataDate(value = "") {
  const match = String(value).match(/(\d{4})\/(\d{2})\/(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function parseNumber(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/\./g, "").replace(/,/g, "").match(/\d+/)?.[0];
  return cleaned ? Number(cleaned) : null;
}

function personId(person) {
  return person.wrestlingdataId ? `wrestlingdata-person-${person.wrestlingdataId}` : `person-${slug(person.name)}`;
}

function compactLocation(parts) {
  const value = parts.map(cleanText).filter(Boolean).join(", ");
  return value || null;
}

function cleanText(value) {
  if (value == null) return null;
  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function upsertById(records, record) {
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    records[index] = mergeRecord(records[index], record);
    return false;
  }
  records.push(record);
  return true;
}

function removeById(records, id) {
  const index = records.findIndex((record) => record.id === id);
  if (index >= 0) records.splice(index, 1);
}

function mergeRecord(existing, next) {
  return {
    ...existing,
    ...next,
    sourceIds: unique([...(existing.sourceIds ?? []), ...(next.sourceIds ?? [])]),
    externalIds: {
      ...(existing.externalIds ?? {}),
      ...(next.externalIds ?? {}),
    },
  };
}

function upsertSource(sources, id, source = {}) {
  const existing = sources.find((item) => item.id === id);
  const record = {
    id,
    name: source.name ?? "Wrestlingdata event archive",
    type: "events",
    url: source.url ?? "https://www.wrestlingdata.com/index.php?befehl=shows&sort=liga",
    priority: 15,
    notes:
      "Browser/session-aware archive source for event dates, types, attendance, venues, announcers, spoiler-safe cards, stipulations, title matches, champions, and participants.",
  };
  if (existing) Object.assign(existing, record);
  else sources.push(record);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function emptyDb() {
  return {
    schemaVersion: 1,
    generatedAt: null,
    sources: [],
    promotions: [],
    series: [],
    events: [],
    episodes: [],
    venues: [],
    people: [],
    matches: [],
    championships: [],
    titleReigns: [],
    externalIds: [],
  };
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
