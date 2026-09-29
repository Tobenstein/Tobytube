import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const cacheDir = path.join(root, "cache", `sdh-${args.promotion}-ppv-history`);
const sourceId = `sdh-${args.promotion}-ppv-history`;
const baseUrl = new URL(args.indexUrl).origin;

await fs.mkdir(cacheDir, { recursive: true });

const reference = await readJson(referencePath, {});
const posters = await readJson(posterPath, {});
ensureShape(reference);
upsert(reference.sources, {
  id: sourceId,
  name: `TheSmackDownHotel ${args.promotion.toUpperCase()} PPV history pages`,
  type: "events",
  url: args.indexUrl,
  priority: 10,
  notes: "Series history pages used for event shells, dates, venues, and poster thumbnails.",
});

const indexHtml = await readUrl(args.indexUrl, "index.html");
let historyUrls = unique(
  [...indexHtml.matchAll(/href="([^"]*\/events-results\/ppv-history\?show=[^"]+)"/g)].map((match) =>
    absoluteUrl(match[1]),
  ),
);
if (!historyUrls.length && args.startYear && args.endYear) {
  historyUrls = Array.from(
    { length: args.endYear - args.startYear + 1 },
    (_, index) => `https://www.thesmackdownhotel.com/events-results/wwe-ppv-list-pay-per-views-special-events-schedule?year=${args.startYear + index}`,
  );
}

const previousIds = new Set(
  [...reference.events, ...reference.episodes].filter((event) => event.sourceIds?.includes(sourceId)).map((event) => event.id),
);
reference.events = reference.events.filter(
  (event) => !event.sourceIds?.includes(sourceId),
);
reference.episodes = reference.episodes.filter((event) => !event.sourceIds?.includes(sourceId));

let eventCount = 0;
let posterCount = 0;
for (const historyUrl of historyUrls) {
  const html = await readUrl(historyUrl, `${slug(historyUrl)}.html`);
  const records = parseHistoryPage(html, historyUrl);
  for (const record of records) {
    const promotionId = inferPromotionId(record.title, args.promotion);
    const isWeeklyEpisode = promotionId === "evolve" && /^WWE\s+EVOLVE\s+#?\d+/i.test(record.title);
    const id = `${sourceId}-${slug(record.title)}`;
    const importedRecord = {
      id,
      title: record.title,
      promotionId,
      promotion: promotionName(promotionId, args.promotionName),
      date: record.date,
      dateDisplay: record.date,
      venue: record.venue,
      city: record.city,
      region: null,
      country: null,
      location: [record.city, record.venue].filter(Boolean).join(" - ") || null,
      attendance: null,
      eventType: isWeeklyEpisode ? "TV Show" : record.seriesName ? `${record.seriesName} Event` : "Special Event",
      seriesName: isWeeklyEpisode ? "Evolve" : record.seriesName,
      seriesId: isWeeklyEpisode ? "evolve-weekly" : record.seriesName ? `${promotionId}-${slug(record.seriesName)}` : null,
      episodeNumber: isWeeklyEpisode ? Number(record.title.match(/#(\d+)/)?.[1] ?? 0) || null : null,
      recordType: isWeeklyEpisode ? "episode" : "event",
      summary: null,
      sourceIds: [sourceId],
      externalIds: { sdh: { url: record.href, historyUrl } },
      importedAt: new Date().toISOString(),
    };
    upsert(isWeeklyEpisode ? reference.episodes : reference.events, importedRecord);
    eventCount += 1;

    if (record.posterUrl) {
      posters[id] = { source: "sdh", posterUrl: record.posterUrl, query: record.title, matchedTitle: record.title };
      posters[`library-${id}`] = posters[id];
      posterCount += 1;
    }
    previousIds.delete(id);
  }
  await delay(80);
}

function inferPromotionId(title, fallback) {
  const text = decode(title).trim();
  const rules = [
    [/^(?:WWE\s+)?EVOLVE\b/i, "evolve"],
    [/^AEW\b/i, "aew"],
    [/^NJPW\b/i, "njpw"],
    [/^AJPW\b/i, "ajpw"],
    [/^(?:TNA|IMPACT WRESTLING)\b/i, "tna"],
    [/^ROH\b/i, "roh"],
    [/^AAA\b/i, "aaa"],
    [/^NWA\b/i, "nwa"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? fallback;
}

function promotionName(promotionId, fallback) {
  return {
    evolve: "Evolve", aew: "All Elite Wrestling", njpw: "New Japan Pro Wrestling",
    ajpw: "All Japan Pro Wrestling", tna: "Total Nonstop Action Wrestling",
    roh: "Ring of Honor", aaa: "Lucha Libre AAA Worldwide", nwa: "National Wrestling Alliance",
  }[promotionId] ?? fallback;
}

await fs.writeFile(referencePath, `${JSON.stringify(reference, null, 2)}\n`);
await fs.writeFile(posterPath, `${JSON.stringify(posters, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      sourceId,
      historyPages: historyUrls.length,
      importedEvents: eventCount,
      posterMappings: posterCount,
      replacedPrevious: previousIds.size,
    },
    null,
    2,
  ),
);

function parseHistoryPage(html, historyUrl) {
  const seriesName = decode(
    (html.match(/<h2 class="section-title">Full List of\s+(.+?)\s+Events/i)?.[1] ?? "")
      .replace(/^TNA\s+/i, "")
      .replace(/^NJPW\s+/i, "")
      .trim(),
  );
  const rows = html.match(/<div class="items-row" data-id="blogPost">[\s\S]*?(?=<div class="items-row" data-id="blogPost">|<\/div>\s*<\/p>|<div class="pagination|$)/g) ?? [];
  return rows
    .map((row) => {
      const href = absoluteUrl(row.match(/<h3 class="contentheading">[\s\S]*?<a href="([^"]+)"/)?.[1] ?? row.match(/<a href="([^"]+)"/)?.[1]);
      const title = decode(row.match(/<h3 class="contentheading">[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "");
      const posterUrl = absoluteUrl(row.match(/<img src="([^"]+)"/)?.[1]);
      const date = parseDate(decode(row.match(/icon-calendar[\s\S]*?<span class="field-value ">(.*?)<\/span>/)?.[1] ?? ""));
      const place = decode(row.match(/<dd><strong><span>(.*?)<\/span><\/strong>\s*-\s*<span>(.*?)<\/span><\/dd>/)?.[1] ?? "");
      const venue = decode(row.match(/<dd><strong><span>.*?<\/span><\/strong>\s*-\s*<span>(.*?)<\/span><\/dd>/)?.[1] ?? "");
      return { href, title, posterUrl, date, city: place, venue, seriesName };
    })
    .filter((record) => record.title && record.date);
}

function parseDate(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

async function readUrl(url, cacheName) {
  const target = path.join(cacheDir, cacheName);
  try {
    return await fs.readFile(target, "utf8");
  } catch {
    const response = await fetch(url, { headers: { "user-agent": "Tobytube metadata prototype" } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    const text = await response.text();
    await fs.writeFile(target, text);
    return text;
  }
}

function absoluteUrl(value) {
  if (!value) return null;
  return value.startsWith("http") ? value : `${baseUrl}${value}`;
}

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureShape(db) {
  for (const key of ["sources", "promotions", "series", "events", "episodes", "venues", "people", "matches", "championships", "titleReigns", "externalIds"]) {
    db[key] = db[key] ?? [];
  }
}

function upsert(records, record) {
  const index = records.findIndex((item) => item.id === record.id);
  if (index === -1) records.push(record);
  else records[index] = { ...records[index], ...record };
}

function readJson(filePath, fallback) {
  return fs.readFile(filePath, "utf8").then(JSON.parse).catch(() => fallback);
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--promotion") parsed.promotion = rawArgs[++index];
    if (arg === "--promotion-name") parsed.promotionName = rawArgs[++index];
    if (arg === "--index-url") parsed.indexUrl = rawArgs[++index];
    if (arg === "--start-year") parsed.startYear = Number(rawArgs[++index]);
    if (arg === "--end-year") parsed.endYear = Number(rawArgs[++index]);
  }
  if (!parsed.promotion || !parsed.promotionName || !parsed.indexUrl) {
    throw new Error("Usage: import-sdh-ppv-history-events --promotion <id> --promotion-name <name> --index-url <url>");
  }
  return parsed;
}
