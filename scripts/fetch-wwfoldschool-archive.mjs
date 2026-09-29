import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, "cache");
const args = parseArgs(process.argv.slice(2));

const profiles = {
  wwe: {
    id: "wwe",
    promotion: "World Wrestling Entertainment",
    indexUrl: "https://wwfoldschool.com/tv-event-guide/wwf-wwe/",
    indexCache: "cache/wwfoldschool-wwe-index.html",
  },
  wcw: {
    id: "wcw",
    promotion: "World Championship Wrestling",
    indexUrl: "https://wwfoldschool.com/tv-event-guide/nwa-wcw/",
    indexCache: "cache/wwfoldschool-wcw-index.html",
  },
  ecw: {
    id: "ecw",
    promotion: "Extreme Championship Wrestling",
    indexUrl: "https://wwfoldschool.com/tv-event-guide/ecw/",
    indexCache: "cache/wwfoldschool-ecw-index.html",
  },
};

const selectedProfiles = args.promotions === "all" ? Object.values(profiles) : args.promotions.split(",").map((id) => profiles[id.trim()]).filter(Boolean);
if (!selectedProfiles.length) throw new Error(`No matching promotions for: ${args.promotions}`);

await mkdir(cacheDir, { recursive: true });

const allRecords = [];
const failures = [];
const fetchedPages = [];

for (const profile of selectedProfiles) {
  const indexHtml = await fetchOrRead(args.useIndexCache ? profile.indexCache : profile.indexUrl);
  if (!args.useIndexCache) await writeFile(path.join(root, profile.indexCache), indexHtml);

  const links = extractArchiveLinks(indexHtml, profile)
    .filter((link) => !shouldSkipSection(link.section))
    .filter((link) => yearInRange(link.years, args.startYear, args.endYear));

  for (const link of links) {
    try {
      const html = await fetchOrRead(link.url);
      fetchedPages.push(link);
      const parsed = parseArchivePage(html, link);
      allRecords.push(...parsed);
      console.log(`Parsed ${profile.id.toUpperCase()} ${link.section} ${link.label}: ${parsed.length} records`);
      await sleep(args.delayMs);
    } catch (error) {
      failures.push({ ...link, error: error.message });
      console.warn(`Failed ${profile.id.toUpperCase()} ${link.section} ${link.label}: ${error.message}`);
    }
  }
}

const records = dedupeRecords(allRecords).filter((record) => {
  const year = Number(record.dateIso.slice(0, 4));
  return year >= args.startYear && year <= args.endYear;
});
const outputPath = path.join(root, args.output);
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: {
        id: "wwfoldschool-archive",
        name: "WWF Old School TV and event guide archive",
        urls: selectedProfiles.map((profile) => profile.indexUrl),
        notes:
          "Text archive parsed for spoiler-safe cards. Match winners are not inferred from this source; winner/result fields are reserved for later sources.",
      },
      filters: {
        promotions: selectedProfiles.map((profile) => profile.id),
        startYear: args.startYear,
        endYear: args.endYear,
      },
      fetchedPages: fetchedPages.length,
      failures,
      records,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${records.length} archive records to ${path.relative(root, outputPath)}.`);
if (failures.length) console.log(`Failures: ${failures.length}`);

function extractArchiveLinks(html, profile) {
  const sections = [...html.matchAll(/<div class="su-spoiler-title"[^>]*>[\s\S]*?<\/span>(.*?)<\/div><div class="su-spoiler-content[\s\S]*?<ul>([\s\S]*?)<\/ul>/g)];
  return sections.flatMap((sectionMatch) => {
    const section = cleanText(sectionMatch[1]);
    const seriesName = normalizeSeriesName(section);
    const recordType = classifyRecordType(section);
    return [...sectionMatch[2].matchAll(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gi)].map((match) => {
      const label = cleanText(match[2]);
      return {
        promotionId: profile.id,
        promotion: profile.promotion,
        indexUrl: profile.indexUrl,
        section,
        seriesName,
        recordType,
        eventType: recordType === "event" ? "Special Event" : "TV Show",
        label,
        years: extractYears(`${section} ${label}`),
        url: new URL(match[1], profile.indexUrl).href,
      };
    });
  });
}

function parseArchivePage(html, link) {
  const pageTitle = cleanText(matchOne(html, /<h1[^>]*class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ?? "");
  const content = matchOne(html, /<div id="content-main"[\s\S]*?>([\s\S]*?)<div class="com-bot-wrap/i) ?? html;
  const paragraphs = [...content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => htmlToLines(match[1]))
    .filter((lines) => lines.length && !isSeparator(lines[0]));

  const records = [];
  for (const lines of paragraphs) {
    const cleanHeader = parseCleanNumberedHeader(lines[0], link);
    const eventHeader = link.recordType === "event" ? parseEventDatedHeader(lines[0], link) : null;
    const dateHeader = cleanHeader ?? eventHeader ?? parseDateHeader(lines[0], link);
    if (dateHeader) {
      records.push(buildRecord({ ...dateHeader, title: dateHeader.title ?? buildEpisodeTitle(link, dateHeader) }, lines.slice(1), link, pageTitle));
      continue;
    }

    if (lines.length >= 2) {
      const eventDate = parseLooseDate(lines[1], inferFallbackYear(link));
      if (eventDate) {
        records.push(
          buildRecord(
            {
              date: eventDate,
              title: cleanText(lines[0]),
              seriesName: link.recordType === "event" ? null : link.seriesName,
              episodeNumber: null,
              cleanFormat: false,
            },
            lines.slice(2),
            link,
            pageTitle,
          ),
        );
      }
    }
  }

  return records;
}

function buildRecord(header, bodyLines, link, pageTitle) {
  const items = bodyLines.map(parseCardItem).filter(Boolean);
  const matches = items.filter((item) => item.kind === "match");
  const segments = items.filter((item) => item.kind === "segment");
  const ignored = items.filter((item) => item.kind === "ignored");
  const recordType = header.recordType ?? link.recordType;
  const seriesName = header.seriesName ?? (recordType === "episode" ? link.seriesName : null);
  const title = normalizeTitle(header.title);
  const recordId = `wwfoldschool-${link.promotionId}-${slug(seriesName ?? title)}-${header.date}`;

  return {
    id: recordId,
    promotionId: promotionOverride(link, seriesName),
    promotion: promotionOverride(link, seriesName) === "wwe" ? "World Wrestling Entertainment" : link.promotion,
    title,
    seriesName,
    date: header.date.replaceAll("-", "/"),
    dateIso: header.date,
    eventType: link.eventType,
    recordType,
    episodeNumber: header.episodeNumber ?? null,
    sourcePage: { section: link.section, label: link.label, url: link.url, pageTitle },
    url: link.url,
    matches: matches.map((item, index) => ({
      order: index + 1,
      label: String(item.originalOrder ?? index + 1),
      raw: item.displayText,
      displayText: item.displayText,
      stipulation: item.stipulation,
      titleMatch: item.titleMatch,
      championMarked: /\(c\)|©|\[c\]|champion/i.test(item.displayText),
      participants: parseParticipants(item.displayText),
      teams: [],
      champions: [],
      winner: null,
      result: null,
      spoilerSafe: true,
    })),
    segments: segments.map((item, index) => ({
      order: index + 1,
      label: String(item.originalOrder ?? index + 1),
      text: item.displayText,
      segmentType: item.segmentType,
    })),
    ignoredLines: ignored.map((item) => item.displayText),
    parserQuality: header.cleanFormat ? "clean-numbered" : "archive-block",
    sourceIds: ["wwfoldschool-archive"],
  };
}

function parseCleanNumberedHeader(value, link) {
  const text = cleanText(value);
  const clean = text.match(/^(WWE|WWF|WCW|ECW)\s+[-–]\s+(\d{4})\/(\d{2})\/(\d{2})\s+[-–]\s+(.+?)(?:\s+#\s*(\d+))?(?:\s+[-–]\s+.+)?$/i);
  if (!clean) return null;
  return {
    date: `${clean[2]}-${clean[3]}-${clean[4]}`,
    title: `${clean[1].toUpperCase()} ${clean[5].trim()}${clean[6] ? ` #${clean[6]}` : ""}`,
    seriesName: normalizeSeriesName(clean[5]) || link.seriesName,
    recordType: "episode",
    episodeNumber: clean[6] ? Number(clean[6]) : null,
    cleanFormat: true,
  };
}

function parseDateHeader(value, link) {
  const date = parseLooseDate(value, inferFallbackYear(link));
  if (!date) return null;
  return {
    date,
    title: buildEpisodeTitle(link, { date }),
    seriesName: link.seriesName,
    recordType: link.recordType,
    episodeNumber: null,
    cleanFormat: false,
  };
}

function parseEventDatedHeader(value, link) {
  const text = cleanText(value);
  const ymd = text.match(/\b(19\d{2}|20\d{2})\/(\d{1,2})\/(\d{1,2})\b/);
  if (!ymd) return null;
  const quotedTitle =
    matchOne(text, /["“”�]+([^"“”�]+)["“”�]+[^"“”�]*$/) ??
    matchOne(text, /[-–]\s*([A-Z0-9][A-Z0-9 '&!.:-]+)$/);
  return {
    date: `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`,
    title: cleanText(quotedTitle ?? link.seriesName),
    seriesName: null,
    recordType: "event",
    episodeNumber: null,
    cleanFormat: true,
  };
}

function parseCardItem(value) {
  const text = cleanText(value)
    .replace(/^[-•]\s*/, "")
    .replace(/^\d+\s*:\s*/, "")
    .replace(/^Match\s*#?\s*\d+\s*/i, "")
    .replace(/^\d{1,2}\.\s*/, "")
    .trim();
  if (!text || isSeparator(text)) return null;

  const orderText = matchOne(value, /^\s*(?:[-•]\s*)?(?:Match\s*#?\s*)?(\d+)[\.:]?/i);
  const order = orderText ? Number(orderText) : null;
  const normalized = normalizeMatchText(text);
  const hasMatch = hasMatchSyntax(normalized);

  if (hasMatch) {
    const stipulation = inferStipulation(normalized);
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
    return { kind: "segment", originalOrder: order, displayText: normalized, segmentType };
  }

  return { kind: "ignored", originalOrder: order, displayText: normalized };
}

function parseLooseDate(value, fallbackYear) {
  const text = cleanText(value).replace(/(\d+)(st|nd|rd|th)\b/gi, "$1");

  const ymd = text.match(/\b(19\d{2}|20\d{2})\/(\d{1,2})\/(\d{1,2})\b/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;

  const mdyNumeric = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (mdyNumeric) {
    const year = normalizeYear(mdyNumeric[3], fallbackYear);
    return `${year}-${mdyNumeric[1].padStart(2, "0")}-${mdyNumeric[2].padStart(2, "0")}`;
  }

  const mdy = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(19\d{2}|20\d{2})\b/);
  if (mdy) {
    const month = monthNumber(mdy[1]);
    return month ? `${mdy[3]}-${month}-${mdy[2].padStart(2, "0")}` : null;
  }

  const monthDay = text.match(/^\s*([A-Za-z]+)\s+(\d{1,2})\s*$/);
  if (monthDay && fallbackYear) {
    const month = monthNumber(monthDay[1]);
    return month ? `${fallbackYear}-${month}-${monthDay[2].padStart(2, "0")}` : null;
  }

  return null;
}

function dedupeRecords(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = `${record.promotionId}|${record.recordType}|${record.seriesName ?? record.title}|${record.dateIso}`;
    const existing = byKey.get(key);
    if (!existing || scoreRecord(record) > scoreRecord(existing)) {
      byKey.set(key, mergeRelatedRecord(record, existing));
    } else {
      byKey.set(key, mergeRelatedRecord(existing, record));
    }
  }
  return [...byKey.values()].sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.title.localeCompare(b.title));
}

function mergeRelatedRecord(primary, secondary) {
  if (!secondary) return primary;
  const segments = uniqueBy([...(primary.segments ?? []), ...(secondary.segments ?? [])], (item) => item.text).map((segment, index) => ({
    ...segment,
    order: index + 1,
    label: String(index + 1),
  }));
  const ignoredLines = uniqueBy([...(primary.ignoredLines ?? []), ...(secondary.ignoredLines ?? [])], (line) => line);
  return { ...primary, segments, ignoredLines };
}

function scoreRecord(record) {
  return (record.parserQuality === "clean-numbered" ? 1000 : 0) + record.matches.length * 10 + record.segments.length;
}

function classifyRecordType(section) {
  return /ppv|special|event|clash|saturday night|main event|slammy/i.test(section) ? "event" : "episode";
}

function shouldSkipSection(section) {
  return /houseshow|house show|fancam/i.test(section);
}

function promotionOverride(link, seriesName) {
  if (link.promotionId === "ecw" && /scyfy/i.test(link.section)) return "wwe";
  return link.promotionId;
}

function buildEpisodeTitle(link, header) {
  const year = header.date?.slice(0, 4) ?? inferFallbackYear(link);
  return `${link.seriesName}${year ? ` (${year})` : ""}`;
}

function normalizeSeriesName(value = "") {
  const text = cleanText(value)
    .replace(/^(WWF|WWE|WCW|NWA|ECW)\s+[-–]\s+/i, "")
    .replace(/^WWF \/ WWE\s+/i, "")
    .replace(/^NWA \/ WCW\s+/i, "")
    .replace(/&amp;/g, "&");
  if (/monday night raw|raw\b/i.test(text)) return "Monday Night Raw";
  if (/smackdown/i.test(text)) return "SmackDown";
  if (/nitro/i.test(text)) return "Monday Nitro";
  if (/thunder/i.test(text)) return "Thunder";
  if (/hardcore tv/i.test(text)) return "Hardcore TV";
  if (/on tnn/i.test(text)) return "ECW on TNN";
  if (/scyfy/i.test(text)) return "ECW";
  if (/sunday night heat|heat/i.test(text)) return "Sunday Night Heat";
  if (/jakked|metal/i.test(text)) return "Jakked / Metal";
  if (/velocity/i.test(text)) return "Velocity";
  if (/superstars/i.test(text)) return "Superstars of Wrestling";
  if (/saturday night/i.test(text) && /wcw|world championship/i.test(text)) return "Saturday Night";
  return text.replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

function normalizeTitle(title = "") {
  return cleanText(title).replace(/\s+[-–]\s+$/, "");
}

function normalizeMatchText(value) {
  return cleanText(value)
    .replace(/\b[Vv](?:s)?\.?\s+/g, "vs. ")
    .replace(/\s+for\s+the\s+(.+?)\s*,\s+vs\.\s+/i, " vs. ")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ");
}

function hasMatchSyntax(text) {
  if (/^(the saga|the story)\b/i.test(text)) return false;
  return /\bvs\.?\b|\bbattled\b|\bfought\b|\bno-contest\b|\bbattle royal\b/i.test(text);
}

function inferStipulation(text) {
  const beforeColon = matchOne(text, /^([^:]{3,100}):/);
  if (beforeColon && /match|title|championship|contender|cage|street|ladder|table|hardcore|handicap|triple threat|no dq|falls count|battle royal|tournament/i.test(beforeColon)) {
    return cleanText(beforeColon);
  }
  const parenthetical = matchOne(text, /\(([^)]*(?:match|title|championship|cage|street|ladder|table|hardcore|battle royal|tournament)[^)]*)\)/i);
  if (parenthetical) return cleanText(parenthetical);
  if (/title|championship/i.test(text)) return "Title Match";
  if (/battle royal/i.test(text)) return "Battle Royal";
  return null;
}

function classifySegment(text) {
  if (/\breturn\b|\breturns\b/i.test(text)) return "return";
  if (/\batt\b|\battaq(?:ue|u)?d\b|\battack(?:s|ed|ing|er)?\b|beat(?:s|en)? (?:down|up)|ambush/i.test(text)) return "attack";
  if (/\bturn\b|\bbetray(?:s|ed|al)?\b/i.test(text)) return "betrayal";
  if (/\bsegment\b|\bpromo\b|\binterview\b|\bthis is your life\b|\bvideo package\b|\bhighlight video\b/i.test(text)) return "segment";
  return null;
}

function parseParticipants(matchText) {
  const withoutPrefix = matchText.replace(/^.*?:\s*/, "").replace(/^.*\s+[-–]\s+/, "");
  const sides = withoutPrefix.split(/\bvs\.?\b|\bbattled\b|\bfought\b/i);
  if (sides.length < 2) return [];
  return sides
    .slice(0, 2)
    .flatMap((side) =>
      side
        .replace(/\([^)]*\)/g, "")
        .replace(/\[[^\]]*\]/g, "")
        .split(/\s+&\s+|\s+and\s+|,\s*|\//)
        .map((name) => cleanText(name.replace(/\bfor\s+the\s+.+$/i, "").replace(/\bw\/.*$/i, "").replace(/\bchampion\b,?\s*/i, "")))
        .filter((name) => name && !/^(the|a|an|for)$/i.test(name)),
    )
    .map((name) => ({ name }));
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

function extractYears(value = "") {
  return [...String(value).matchAll(/\b(19\d{2}|20\d{2}|\d{2})\b/g)]
    .map((match) => normalizeYear(match[1], null))
    .filter((year) => year >= 1900 && year <= 2099);
}

function yearInRange(years, startYear, endYear) {
  if (!years.length) return true;
  return years.some((year) => year >= startYear && year <= endYear);
}

function inferFallbackYear(link) {
  const years = link.years?.filter((year) => year >= 1900) ?? [];
  return years.length === 1 ? years[0] : null;
}

function normalizeYear(value, fallbackYear) {
  const number = Number(value);
  if (number > 99) return number;
  if (fallbackYear) return Math.floor(fallbackYear / 100) * 100 + number;
  return number >= 70 ? 1900 + number : 2000 + number;
}

function monthNumber(month) {
  const number = {
    january: "01",
    jan: "01",
    february: "02",
    febrary: "02",
    feb: "02",
    march: "03",
    mar: "03",
    april: "04",
    apr: "04",
    may: "05",
    june: "06",
    jun: "06",
    july: "07",
    jul: "07",
    august: "08",
    aug: "08",
    september: "09",
    sept: "09",
    sep: "09",
    october: "10",
    ocotber: "10",
    octobr: "10",
    oct: "10",
    november: "11",
    nov: "11",
    december: "12",
    dec: "12",
  }[String(month).toLowerCase()];
  return number ?? null;
}

function isSeparator(value = "") {
  return /^[-_—–\s]+$/.test(cleanText(value).replace(/&#8212;/g, "-"));
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function parseArgs(rawArgs) {
  const parsed = {
    promotions: "all",
    startYear: 1900,
    endYear: 2014,
    delayMs: 300,
    output: "cache/wwfoldschool-archive.json",
    useIndexCache: false,
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--promotions") parsed.promotions = rawArgs[++index];
    if (arg === "--start-year") parsed.startYear = Number(rawArgs[++index]);
    if (arg === "--end-year") parsed.endYear = Number(rawArgs[++index]);
    if (arg === "--delay-ms") parsed.delayMs = Number(rawArgs[++index]);
    if (arg === "--output") parsed.output = rawArgs[++index];
    if (arg === "--use-index-cache") parsed.useIndexCache = true;
  }
  return parsed;
}

function decodeEntities(value = "") {
  return String(value)
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8212;|&mdash;/g, "-")
    .replace(/&#8216;|&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8243;/g, '"')
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/Â©|©/g, "(c)");
}

function cleanText(value = "") {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/([A-Za-z])�s\b/g, "$1's")
    .replace(/([A-Za-z])´s\b/g, "$1's")
    .replace(/\s+/g, " ")
    .trim();
}

function matchOne(value, regex) {
  return String(value).match(regex)?.[1] ?? null;
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
