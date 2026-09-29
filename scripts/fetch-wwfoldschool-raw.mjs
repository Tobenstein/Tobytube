import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexUrl = "https://wwfoldschool.com/tv-event-guide/wwf-wwe/";
const outputPath = path.join(root, "cache", "wwfoldschool-raw-1993-2014.json");
const args = parseArgs(process.argv.slice(2));

const indexHtml = await fetchOrRead(args.index ?? indexUrl);
const rawLinks = extractRawLinks(indexHtml)
  .filter((link) => link.year >= args.startYear && link.year <= args.endYear)
  .sort((a, b) => a.year - b.year);

const source = {
  id: "wwfoldschool-raw",
  name: "WWF Old School Raw archive",
  url: indexUrl,
  notes:
    "Text archive for WWE/WWF TV cards. Raw pages include both messy fan-summary blocks and cleaner numbered card blocks; parser prefers cleaner duplicate dates.",
};

const records = [];
const failures = [];

for (const link of rawLinks) {
  try {
    const html = await fetchOrRead(link.url);
    const parsed = parseRawPage(html, link);
    records.push(...parsed);
    console.log(`Parsed Raw ${link.year}: ${parsed.length} episodes`);
    await sleep(args.delayMs);
  } catch (error) {
    failures.push({ ...link, error: error.message });
    console.warn(`Raw ${link.year} failed: ${error.message}`);
  }
}

const deduped = dedupeRawRecords(records);
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source,
      filters: { startYear: args.startYear, endYear: args.endYear },
      fetchedPages: rawLinks.length,
      failures,
      events: deduped,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${deduped.length} Raw records to ${path.relative(root, outputPath)}.`);
if (failures.length) console.log(`Failures: ${failures.length}`);

function extractRawLinks(html) {
  const content = html.slice(html.indexOf("WWF / WWE Monday Night RAW"), html.indexOf("WWF / WWE SmackDown!"));
  return [...content.matchAll(/<a\s+href="([^"]+)"[^>]*>\s*(\d{4})\s*<\/a>/gi)].map((match) => ({
    url: new URL(match[1], indexUrl).href,
    year: Number(match[2]),
  }));
}

function parseRawPage(html, link) {
  const title = cleanText(matchOne(html, /<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ?? "");
  const content = matchOne(html, /<div id="content-main"[\s\S]*?>([\s\S]*?)<div class="com-bot-wrap/i) ?? html;
  const paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => htmlToLines(match[1]))
    .filter((lines) => lines.length);

  const records = [];
  for (const lines of paragraphs) {
    const header = parseRawHeader(lines[0], link.year);
    if (!header) continue;

    const items = lines.slice(1).map(parseRawItem).filter(Boolean);
    const matches = items.filter((item) => item.kind === "match");
    const segments = items.filter((item) => item.kind === "segment");
    const ignored = items.filter((item) => item.kind === "ignored");

    records.push({
      id: `wwfoldschool-raw-${header.date}`,
      wrestlingdataId: null,
      promotionId: "wwe",
      promotion: header.brand === "WWF" ? "World Wrestling Federation" : "World Wrestling Entertainment",
      title: `${header.brand} ${header.seriesName}${header.episodeNumber ? ` #${header.episodeNumber}` : ""}`,
      seriesName: header.seriesName,
      date: header.date.replaceAll("-", "/"),
      dateIso: header.date,
      eventType: "TV Show",
      episodeNumber: header.episodeNumber,
      sourcePage: { year: link.year, url: link.url, pageTitle: title },
      url: link.url,
      matches: matches.map((item, index) => ({
        order: index + 1,
        label: String(item.originalOrder ?? index + 1),
        raw: item.displayText,
        displayText: item.displayText,
        stipulation: item.stipulation,
        titleMatch: item.titleMatch,
        championMarked: /\(c\)|©|\[c\]/i.test(item.displayText),
        participants: parseParticipants(item.displayText),
        teams: [],
        winner: null,
        result: null,
      })),
      segments: segments.map((item, index) => ({
        order: index + 1,
        label: String(item.originalOrder ?? index + 1),
        text: item.displayText,
        segmentType: item.segmentType,
      })),
      ignoredLines: ignored.map((item) => item.displayText),
      parserQuality: header.cleanFormat ? "clean-numbered" : "messy-summary",
      sourceIds: ["wwfoldschool-raw"],
    });
  }

  return records;
}

function parseRawHeader(value, fallbackYear) {
  const text = cleanText(value);
  const clean = text.match(/^(WWE|WWF)\s+[–-]\s+(\d{4})\/(\d{2})\/(\d{2})\s+[–-]\s+RAW\s*#\s*(\d+)/i);
  if (clean) {
    return {
      brand: clean[1].toUpperCase(),
      seriesName: "Monday Night Raw",
      date: `${clean[2]}-${clean[3]}-${clean[4]}`,
      episodeNumber: Number(clean[5]),
      cleanFormat: true,
    };
  }

  const messy = text.match(
    /^(WWE|WWF)\s+Raw(?:\s+Is\s+War)?(?:\s+Special)?(?:\s+\d{2,4})?(?:\s+[^-–]+[-–])?\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i,
  );
  if (messy) {
    return {
      brand: messy[1].toUpperCase(),
      seriesName: /is war/i.test(text) ? "RAW is WAR" : "Monday Night Raw",
      date: `${messy[4]}-${monthNumber(messy[2])}-${messy[3].padStart(2, "0")}`,
      episodeNumber: null,
      cleanFormat: false,
    };
  }

  const yearOnly = text.match(/^(WWE|WWF)\s+Raw(?:\s+Is\s+War)?\s+([A-Za-z]+)\s+(\d{1,2})/i);
  if (yearOnly) {
    return {
      brand: yearOnly[1].toUpperCase(),
      seriesName: /is war/i.test(text) ? "RAW is WAR" : "Monday Night Raw",
      date: `${fallbackYear}-${monthNumber(yearOnly[2])}-${yearOnly[3].padStart(2, "0")}`,
      episodeNumber: null,
      cleanFormat: false,
    };
  }

  return null;
}

function parseRawItem(value) {
  const text = cleanText(value)
    .replace(/^\d+\s*:\s*/, "")
    .replace(/^Match\s*#?\s*\d+\s*/i, "")
    .replace(/^\d{1,2}\.\s*/, "")
    .trim();
  if (!text) return null;

  const orderText = matchOne(value, /^\s*(?:Match\s*#?\s*)?(\d+)[\.:]?/i);
  const order = orderText ? Number(orderText) : null;
  const normalized = text.replace(/\bv(?:s)?\.?\s+/gi, "vs. ");
  const hasMatch = /\bvs\.?/i.test(normalized) && !/^(the saga|the story)\b/i.test(normalized);

  if (hasMatch) {
    const prefix = normalized.split(/\bvs\./i)[0] ?? "";
    const label = matchOne(prefix, /^(.+?):\s*[^:]+$/) ?? matchOne(prefix, /^(.+?)\s+[–-]\s+[^–-]+$/);
    const stipulation = label ? cleanText(label) : inferStipulation(normalized);
    return {
      kind: "match",
      originalOrder: order,
      displayText: normalized,
      stipulation,
      titleMatch: /title|championship/i.test(stipulation ?? "") ? stipulation : null,
    };
  }

  const segmentType = classifySegment(normalized);
  if (segmentType) {
    return {
      kind: "segment",
      originalOrder: order,
      displayText: normalized,
      segmentType,
    };
  }

  return {
    kind: "ignored",
    originalOrder: order,
    displayText: normalized,
  };
}

function inferStipulation(text) {
  const beforeColon = matchOne(text, /^([^:]{3,80}):/);
  if (beforeColon && /match|title|championship|contender|cage|street|ladder|table|hardcore|handicap|triple threat|no dq|falls count/i.test(beforeColon)) {
    return cleanText(beforeColon);
  }
  const beforeDash = matchOne(text, /^([^–-]{3,80})\s+[–-]\s+/);
  if (beforeDash && /match|title|championship|contender|cage|street|ladder|table|hardcore|handicap|triple threat|no dq|falls count/i.test(beforeDash)) {
    return cleanText(beforeDash);
  }
  if (/title|championship/i.test(text)) return "Title Match";
  return null;
}

function classifySegment(text) {
  if (/\breturn\b|\breturns\b/i.test(text)) return "return";
  if (/\batt\b|\battaq(?:ue|u)?d\b|\battack(?:s|ed|ing|er)?\b|beat(?:s|en)? (?:down|up)|ambush/i.test(text)) return "attack";
  if (/\bturn\b|\bbetray(?:s|ed|al)?\b/i.test(text)) return "betrayal";
  if (/\bsegment\b|\bpromo\b|\binterview\b|\bthis is your life\b/i.test(text)) return "segment";
  return null;
}

function parseParticipants(matchText) {
  const withoutPrefix = matchText.replace(/^.*?:\s*/, "").replace(/^.*\s+[–-]\s+/, "");
  const sides = withoutPrefix.split(/\bvs\.?/i);
  if (sides.length < 2) return [];
  return sides
    .slice(0, 2)
    .flatMap((side) =>
      side
        .replace(/\([^)]*\)/g, "")
        .replace(/\[[^\]]*\]/g, "")
        .split(/\s+&\s+|\s+and\s+|,\s*/)
        .map((name) => cleanText(name.replace(/\bfor\s+the\s+.+$/i, "").replace(/\bw\/.*$/i, "")))
        .filter((name) => name && !/^(the|a|an)$/i.test(name)),
    )
    .map((name) => ({ name }));
}

function dedupeRawRecords(records) {
  const byDate = new Map();
  for (const record of records) {
    const existing = byDate.get(record.dateIso);
    if (!existing || scoreRecord(record) > scoreRecord(existing)) {
      byDate.set(record.dateIso, mergeRelatedRawRecords(record, existing));
    } else {
      byDate.set(record.dateIso, mergeRelatedRawRecords(existing, record));
    }
  }
  return [...byDate.values()].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
}

function mergeRelatedRawRecords(primary, secondary) {
  if (!secondary) return primary;
  const mergedSegments = [...(primary.segments ?? []), ...(secondary.segments ?? [])]
    .filter((segment, index, all) => index === all.findIndex((item) => item.text === segment.text));
  const mergedIgnored = [...(primary.ignoredLines ?? []), ...(secondary.ignoredLines ?? [])].filter(
    (line, index, all) => index === all.indexOf(line),
  );
  return {
    ...primary,
    segments: mergedSegments.map((segment, index) => ({ ...segment, order: index + 1, label: String(index + 1) })),
    ignoredLines: mergedIgnored,
  };
}

function scoreRecord(record) {
  return (record.parserQuality === "clean-numbered" ? 1000 : 0) + record.matches.length * 10 + record.segments.length;
}

function htmlToLines(html) {
  return decodeEntities(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map(cleanText)
    .filter(Boolean);
}

async function fetchOrRead(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: { "user-agent": "Tobytube personal metadata importer (local prototype)" },
    });
    if (!response.ok) throw new Error(`${source} failed: ${response.status}`);
    return response.text();
  }
  return readFile(path.resolve(root, source), "utf8");
}

function parseArgs(rawArgs) {
  const parsed = {
    startYear: 1993,
    endYear: 2014,
    delayMs: 500,
    index: null,
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--start-year") parsed.startYear = Number(rawArgs[++index]);
    if (arg === "--end-year") parsed.endYear = Number(rawArgs[++index]);
    if (arg === "--delay-ms") parsed.delayMs = Number(rawArgs[++index]);
    if (arg === "--index") parsed.index = rawArgs[++index];
  }
  return parsed;
}

function monthNumber(month) {
  const number = {
    january: "01",
    february: "02",
    febrary: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  }[String(month).toLowerCase()];
  if (!number) throw new Error(`Unknown month: ${month}`);
  return number;
}

function decodeEntities(value = "") {
  return String(value)
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8212;|&mdash;/g, "-")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8243;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/©/g, "(c)");
}

function cleanText(value = "") {
  return decodeEntities(value).replace(/\s+/g, " ").trim();
}

function matchOne(value, regex) {
  return String(value).match(regex)?.[1] ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
