import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const args = parseArgs(process.argv.slice(2));
const profiles = {
  njpw: { nr: 7, name: "New Japan Pro-Wrestling", prefix: "NJPW" },
  ajpw: { nr: 6, name: "All Japan Pro Wrestling", prefix: "AJPW" },
  roh: { nr: 4, name: "Ring of Honor", prefix: "ROH" },
  wwe: { nr: 1, name: "World Wrestling Entertainment", prefix: "WWE" },
  aew: { nr: 2287, name: "All Elite Wrestling", prefix: "AEW" },
  tna: { nr: 5, name: "Total Nonstop Action Wrestling", prefix: "TNA" },
};
const profile = profiles[args.promotion];
const cookie = process.env.CAGEMATCH_COOKIE ?? args.cookie;
if (!profile) throw new Error("Use --promotion njpw, ajpw, roh, wwe, aew, or tna.");
if (!cookie) throw new Error("Set CAGEMATCH_COOKIE or pass --cookie.");

const db = JSON.parse(await readFile(referencePath, "utf8"));
const importedAt = new Date().toISOString();
const collected = [];
for (let offset = 0; offset <= args.maxOffset; offset += 100) {
  const url = `https://www.cagematch.net/en/?id=8&nr=${profile.nr}&page=4&s=${offset}`;
  const html = await fetchPage(url, cookie);
  const rows = parseRows(html);
  if (!rows.length) break;
  collected.push(...rows.filter((event) => Number(event.date.slice(0, 4)) >= args.fromYear));
  const oldestYear = Math.min(...rows.map((event) => Number(event.date.slice(0, 4))));
  console.log(`${profile.prefix} listing ${offset + 1}-${offset + rows.length}: oldest ${oldestYear}.`);
  if (oldestYear < args.fromYear) break;
  await delay(args.delay);
}

const events = dedupe(collected).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
let inserted = 0;
let updated = 0;
for (const event of events) {
  const index = findExisting(db.events, event);
  if (index >= 0) {
    db.events[index] = mergeListing(db.events[index], event);
    updated += 1;
  } else {
    db.events.push(toReferenceEvent(event));
    inserted += 1;
  }
}
const broadcastCount = normalizeBroadcasts(db);
const hiddenHouseShows = normalizeHouseShowVisibility(db);

const sourceId = `cagematch-${args.promotion}-events`;
if (!db.sources.some((source) => source.id === sourceId)) db.sources.push({ id: sourceId, name: `Cagematch ${profile.prefix} event archive`, url: `https://www.cagematch.net/en/?id=8&nr=${profile.nr}&page=4` });
db.generatedAt = importedAt;
await writeFile(referencePath, `${JSON.stringify(db, null, 2)}\n`);
const tapings = events.filter((event) => event.isTaping).length;
console.log(`${profile.prefix}: ${events.length} listings from ${args.fromYear}-present (${inserted} new, ${updated} updated, ${tapings} tapings retained as hidden reference notes, ${broadcastCount} aired TV records normalized as episodes, ${hiddenHouseShows} house shows hidden).`);

function normalizeHouseShowVisibility(database) {
  if (args.promotion !== "wwe") return 0;
  const houseShows = database.events.filter((event) =>
    event.promotionId === "wwe" &&
    (event.eventType === "House Show" || /^WWE NXT Live$/i.test(event.title ?? "") || /^WWE (?:Live |European |Summer |Holiday )?.*Tour\b/i.test(event.title ?? "") || /^WWE Road To\b/i.test(event.title ?? "")),
  );
  houseShows.forEach((event) => { event.libraryVisible = false; });
  return houseShows.length;
}

function normalizeBroadcasts(database) {
  const sourceId = `cagematch-${args.promotion}-events`;
  const broadcasts = database.events.filter((event) =>
    event.promotionId === args.promotion &&
    (event.sourceIds ?? []).includes(sourceId) &&
    !event.isTaping &&
    (event.eventType === "TV Show" || isKnownBroadcastTitle(event.title)),
  );
  for (const event of broadcasts) {
    const seriesName = seriesFromTitle(event.title);
    const episodeNumber = Number(event.title.match(/#\s*(\d+)/)?.[1]) || null;
    const episode = { ...event, recordType: "episode", seriesName, seriesId: `${args.promotion}-${normalize(seriesName).replaceAll(" ", "-")}`, episodeNumber, libraryVisible: true };
    const existingIndex = database.episodes.findIndex((item) => String(item.externalIds?.cagematch ?? "") === String(event.externalIds?.cagematch ?? "") || (item.promotionId === args.promotion && item.date === event.date && normalize(item.title) === normalize(event.title)));
    if (existingIndex >= 0) database.episodes[existingIndex] = { ...database.episodes[existingIndex], ...episode };
    else database.episodes.push(episode);
  }
  const ids = new Set(broadcasts.map((event) => event.id));
  database.events = database.events.filter((event) => !ids.has(event.id));
  return broadcasts.length;
}

function seriesFromTitle(title = "") {
  const rules = [
    [/Honor\s*Club/i, "ROH on HonorClub"], [/Ring Of Honor Wrestling|ROH Wrestling/i, "Ring of Honor Wrestling"],
    [/Monday Night RAW|\bRAW\b/i, "Monday Night Raw"], [/Friday Night SmackDown|\bSmackDown\b/i, "SmackDown"],
    [/Saturday Night's Main Event/i, "Saturday Night's Main Event"], [/\bEVOLVE\b/i, "WWE Evolve"], [/\bLFG\b/i, "WWE LFG: Legends & Future Greats"], [/\bNXT\b/i, "NXT"], [/Main Event/i, "Main Event"],
    [/Dynamite/i, "Dynamite"], [/Collision/i, "Collision"], [/Rampage/i, "Rampage"],
    [/Xplosion/i, "Xplosion"], [/Before The Impact|\bBTI\b/i, "Before the Impact"], [/\bImpact\b/i, "Impact"],
  ];
  return rules.find(([pattern]) => pattern.test(title))?.[1] ?? title.replace(/#\s*\d+.*$/, "").trim();
}

function isKnownBroadcastTitle(title = "") {
  const rules = {
    wwe: /^WWE\s+(?:Monday Night RAW|Friday Night SmackDown|Main Event|NXT\s+#|EVOLVE\s+#|LFG: Legends & Future Greats\s+#|Saturday Night's Main Event\s+#)/i,
    aew: /^AEW\s+(?:Dynamite|Collision|Rampage|Dark|Dark: Elevation)\s+#/i,
    tna: /^(?:TNA|Impact Wrestling)\s+(?:Impact|Xplosion|Before The Impact)\s+#/i,
    roh: /^ROH on HonorClub\s+#\d+/i,
  };
  return rules[args.promotion]?.test(title) ?? false;
}

function parseRows(html) {
  return [...html.matchAll(/<tr class="[^"]*\bTRow(?:1|2)\b[^\"]*">([\s\S]*?)<\/tr>/gi)].map((row) => {
    const cells = [...row[1].matchAll(/<td class="[^"]*\bTCol\b[^"]*">([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 5) return null;
    const date = parseGermanDate(text(cells[1]));
    const link = cells[3].match(/href="([^"]*\bid=1(?:&amp;|&)nr=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!date || !link) return null;
    const sourceTitle = text(link[2]);
    const title = localizeNumberedDay(sourceTitle);
    const numberedDay = /\s-\sTag\s+\d+\b/i.test(sourceTitle);
    const isTaping = /\b(?:TV|HonorClub|Honor Club)?\s*Tapings?\b/i.test(sourceTitle);
    return {
      cagematchId: link[1].match(/(?:&amp;|&)nr=(\d+)/i)?.[1] ?? null,
      sourceTitle, title, date,
      promotions: [...cells[2].matchAll(/alt="([^"]+)"/gi)].map((match) => decode(match[1])),
      location: text(cells[4]), eventType: classToEventType(row[0]),
      catalogSection: numberedDay ? "tours" : "events",
      tourName: numberedDay ? title.replace(/\s+-\s+Day\s+\d+\b.*$/i, "") : null,
      cagematchRating: numberOrNull(text(cells[7])), cagematchVotes: numberOrNull(text(cells[8])), isTaping,
    };
  }).filter(Boolean);
}

function toReferenceEvent(event) {
  const sourceId = `cagematch-${args.promotion}-events`;
  return {
    id: `cagematch-${args.promotion}-${event.cagematchId}`, title: event.title, sourceTitle: event.sourceTitle,
    promotionId: args.promotion, promotion: profile.name,
    coPromotions: event.promotions.filter((name) => normalize(name) !== normalize(profile.name)),
    date: event.date, dateDisplay: event.date, venue: null, city: event.location || null, region: null,
    country: inferCountry(event.location), location: event.location || null, attendance: null, eventType: event.eventType,
    catalogSection: event.catalogSection, tourName: event.tourName, cagematchRating: event.cagematchRating,
    cagematchVotes: event.cagematchVotes, recordType: "event", summary: null,
    isTaping: event.isTaping,
    libraryVisible: !event.isTaping && !(args.promotion === "wwe" && event.eventType === "House Show"),
    sourceIds: [sourceId], externalIds: { cagematch: `https://www.cagematch.net/en/?id=1&nr=${event.cagematchId}` }, importedAt,
  };
}

function mergeListing(existing, event) {
  const incoming = toReferenceEvent(event);
  return { ...incoming, ...existing, title: incoming.title, sourceTitle: incoming.sourceTitle,
    catalogSection: incoming.catalogSection, tourName: incoming.tourName, isTaping: incoming.isTaping,
    libraryVisible: incoming.libraryVisible, cagematchRating: incoming.cagematchRating, cagematchVotes: incoming.cagematchVotes,
    sourceIds: [...new Set([...(existing.sourceIds ?? []), ...(incoming.sourceIds ?? [])])],
    externalIds: { ...(existing.externalIds ?? {}), ...incoming.externalIds }, importedAt };
}

function findExisting(records, event) {
  return records.findIndex((record) => String(record.externalIds?.cagematch ?? "").includes(`nr=${event.cagematchId}`) || (record.promotionId === args.promotion && record.date === event.date && normalize(record.title) === normalize(event.title)));
}
async function fetchPage(url, sessionCookie) { const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Tobytube cataloguing", cookie: sessionCookie } }); const html = await response.text(); if (!response.ok || /You are being redirected/.test(html) || !/TableContents/.test(html)) throw new Error(`Cagematch listing failed: ${response.status}`); return html; }
function classToEventType(value) { if (/TRowPPV/i.test(value)) return "Pay Per View"; if (/TRowPremiumLiveEvent/i.test(value)) return "Premium Live Event"; if (/TRowOnlineStream/i.test(value)) return "Online Stream"; if (/TRowTVShow/i.test(value)) return "TV Show"; if (/TRowHouseShow/i.test(value)) return "House Show"; return "Event"; }
function parseGermanDate(value) { const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : null; }
function localizeNumberedDay(title) { return title.replace(/(\s-\s)Tag(\s+\d+\b)/gi, "$1Day$2"); }
function inferCountry(location = "") { const value = String(location).split(",").at(-1)?.trim(); return /^Mexiko$/i.test(value) ? "Mexico" : value || null; }
function normalize(value = "") { return String(value).toLowerCase().replace(/\btag(?=\s+\d+)/g, "day").replace(/[^a-z0-9]+/g, " ").trim(); }
function text(html = "") { return decode(String(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
function decode(value = "") { return String(value).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))); }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) && value !== "" ? number : null; }
function dedupe(records) { return [...new Map(records.map((record) => [record.cagematchId, record])).values()]; }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function parseArgs(raw) { const parsed = { promotion: null, fromYear: 2010, maxOffset: 6000, delay: 450, cookie: null }; for (let i = 0; i < raw.length; i += 1) { if (raw[i] === "--promotion") parsed.promotion = raw[++i]; if (raw[i] === "--from-year") parsed.fromYear = Number(raw[++i]); if (raw[i] === "--max-offset") parsed.maxOffset = Number(raw[++i]); if (raw[i] === "--delay") parsed.delay = Number(raw[++i]); if (raw[i] === "--cookie") parsed.cookie = raw[++i]; } return parsed; }
