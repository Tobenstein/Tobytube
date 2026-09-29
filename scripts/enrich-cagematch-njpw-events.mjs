import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const args = parseArgs(process.argv.slice(2));
const cookie = process.env.CAGEMATCH_COOKIE ?? args.cookie;
if (!cookie) throw new Error("Set CAGEMATCH_COOKIE or pass --cookie with the session cookie issued by Cagematch.");

const db = JSON.parse(await readFile(referencePath, "utf8"));
const targets = [...(db.events ?? []), ...(db.episodes ?? [])]
  .filter((event) => event.promotionId === args.promotion && Number((event.date ?? "").slice(0, 4)) >= args.fromYear)
  .filter((event) => event.externalIds?.cagematch)
  .filter((event) => !args.id || event.id === `cagematch-${args.promotion}-${args.id}` || String(event.externalIds.cagematch).includes(`nr=${args.id}`))
  .filter((event) => args.refresh || !event.cagematchDetailFetchedAt)
  .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
  .slice(0, args.limit);

let completed = 0;
let failed = 0;
let matchCount = 0;
for (let start = 0; start < targets.length; start += args.concurrency) {
  const batch = targets.slice(start, start + args.concurrency);
  await Promise.all(batch.map(async (event) => {
    try {
      const html = await fetchPage(event.externalIds.cagematch, cookie);
      const detail = parseDetail(html, event);
      Object.assign(event, detail, { cagematchDetailFetchedAt: new Date().toISOString() });
      replaceMatches(db.matches, event.id, detail.matches);
      matchCount += detail.matches.length;
      completed += 1;
    } catch (error) {
      failed += 1;
      console.warn(`Failed ${event.title}: ${error.message}`);
    }
  }));
  if ((completed + failed) % 40 < args.concurrency) {
    await save(db);
    console.log(`Checkpoint ${completed + failed}/${targets.length}: ${completed} enriched, ${failed} failed.`);
  }
  await delay(args.delay);
}

await save(db);
console.log(`Cagematch detail enrichment complete: ${completed}/${targets.length} events, ${matchCount} matches, ${failed} failures.`);

async function fetchPage(url, sessionCookie) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Tobytube cataloguing", cookie: sessionCookie } });
    const html = await response.text();
    if (response.ok && /InformationBoxTable/.test(html) && !/You are being redirected/.test(html)) return html;
    if (attempt === 3) throw new Error(`HTTP ${response.status}; detail page unavailable`);
    await delay(1000 * attempt);
  }
}

function parseDetail(html, event) {
  const info = Object.fromEntries([...html.matchAll(/<div class="InformationBoxRow"><div class="InformationBoxTitle">([\s\S]*?):<\/div><div class="InformationBoxContents">([\s\S]*?)<\/div><\/div>/gi)].map((match) => [text(match[1]), text(match[2])]));
  const matches = [...html.matchAll(/<div class="Match">([\s\S]*?)(?=<div class="Match">|<\/div><\/div><hr class="ContentDivider")/gi)].map((match, index) => parseMatch(match[1], index + 1)).filter(Boolean);
  return {
    title: localizeNumberedDay(info["Name of the event"] || event.title),
    sourceTitle: info["Name of the event"] || event.sourceTitle,
    date: parseGermanDate(info.Date) ?? event.date,
    eventType: info.Type || event.eventType,
    location: info.Location || event.location,
    city: info.Location || event.city,
    country: inferCountry(info.Location || event.location),
    venue: info.Arena || event.venue,
    attendance: parseAttendance(info.Attendance) ?? event.attendance,
    broadcastType: info["Broadcast type"] || null,
    broadcastDate: parseGermanDate(info["Broadcast date"]),
    network: info["TV station/network"] || null,
    commentary: splitPeople(info["Commentary by"]),
    matches,
    matchCount: matches.length,
    mainEvent: matches.at(-1)?.displayText ?? event.mainEvent ?? null,
  };
}

function parseMatch(block, order) {
  const type = text(block.match(/<div class="MatchType">([\s\S]*?)<\/div>/i)?.[1] ?? "Match");
  const raw = sanitizeEditorialMarkers(
    text(block.match(/<div class="MatchResults">([\s\S]*?)<\/div>/i)?.[1] ?? ""),
  );
  if (!raw) return null;
  const ratingText = text(block.match(/Matchguide Rating:\s*([\s\S]*?)<\/a>/i)?.[1] ?? "");
  const rating = Number(ratingText.match(/[\d.]+/)?.[0]);
  const votes = Number(ratingText.match(/based on\s+(\d+)/i)?.[1]);
  return {
    id: null,
    order,
    raw,
    displayText: spoilerSafe(raw),
    stipulation: type || "Match",
    titleMatch: /championship|title/i.test(type) ? type : null,
    winner: extractWinner(raw),
    result: raw,
    duration: raw.match(/\((\d{1,2}:\d{2})\)\s*$/)?.[1] ?? null,
    rating: Number.isFinite(rating) ? rating : null,
    votes: Number.isFinite(votes) ? votes : null,
    source: "cagematch",
  };
}

function replaceMatches(matches, eventId, parsed) {
  for (let index = matches.length - 1; index >= 0; index -= 1) if (matches[index].eventId === eventId && matches[index].source === "cagematch") matches.splice(index, 1);
  parsed.forEach((match) => matches.push({ ...match, id: `cagematch-${eventId}-match-${match.order}`, eventId }));
}

function spoilerSafe(raw) {
  return raw
    .replace(/\s*\(\d{1,2}:\d{2}\)\s*$/, "")
    .replace(/\bdefeats?\b/i, "vs.")
    .replace(/\bdef\.\b/i, "vs.")
    .replace(/\bwins?\s+by\s+.+$/i, "vs. opponent")
    .replace(/\s+by\s+(?:pinfall|submission|disqualification|count out|countout).+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeEditorialMarkers(value = "") {
  return String(value)
    .replace(/\s*-\s*TITLE CHANGE\s*!+\s*$/i, "")
    .trim();
}

function extractWinner(raw) { return raw.match(/^(.+?)\s+(?:defeats?|def\.)\s+/i)?.[1]?.trim() ?? null; }
function splitPeople(value = "") { return value ? value.split(/\s*(?:,|&| and )\s*/i).filter(Boolean) : []; }
function parseAttendance(value = "") { const digits = String(value).replace(/[^0-9]/g, ""); return digits ? Number(digits) : null; }
function parseGermanDate(value = "") { const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : null; }
function inferCountry(location = "") { const value = String(location).split(",").at(-1)?.trim(); return /^Mexiko$/i.test(value) ? "Mexico" : value || null; }
function localizeNumberedDay(title = "") { return title.replace(/(\s-\s)Tag(\s+\d+\b)/gi, "$1Day$2"); }
function text(html = "") { return decode(String(html).replace(/<br\s*\/?\s*>/gi, ", ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); }
function decode(value = "") { return String(value).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function save(database) { database.generatedAt = new Date().toISOString(); await writeFile(referencePath, `${JSON.stringify(database, null, 2)}\n`); }
function parseArgs(raw) { const parsed = { cookie: null, delay: 200, refresh: false, limit: Number.POSITIVE_INFINITY, id: null, promotion: "njpw", fromYear: 2010, concurrency: 4 }; for (let i = 0; i < raw.length; i += 1) { if (raw[i] === "--cookie") parsed.cookie = raw[++i]; if (raw[i] === "--delay") parsed.delay = Number(raw[++i]); if (raw[i] === "--limit") parsed.limit = Number(raw[++i]); if (raw[i] === "--id") parsed.id = raw[++i]; if (raw[i] === "--promotion") parsed.promotion = raw[++i]; if (raw[i] === "--from-year") parsed.fromYear = Number(raw[++i]); if (raw[i] === "--concurrency") parsed.concurrency = Number(raw[++i]); if (raw[i] === "--refresh") parsed.refresh = true; } return parsed; }
