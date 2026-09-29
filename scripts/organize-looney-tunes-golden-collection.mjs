import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import https from "node:https";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const sourceRoot = path.resolve(process.env.LOONEY_SOURCE_ROOT || "Z:/Other/Looney Tunes Golden Collection");
const destinationRoot = path.resolve(process.env.LOONEY_DESTINATION_ROOT || "M:/Collections/Boxed Sets/Animation/Shorts/Looney Tunes Golden Collection");
const videoExtensions = new Set([".avi", ".mkv", ".mp4", ".m4v", ".mov", ".webm"]);

const discMap = [];
for (let volume = 1; volume <= 6; volume += 1) {
  const html = await fetchWikipediaVolume(volume);
  const tables = [...html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];
  if (tables.length < 4) throw new Error(`Wikipedia returned only ${tables.length} disc tables for volume ${volume}`);
  const discTables = volume === 6 ? [tables[0], tables[2], tables[4], tables[6]] : tables.slice(0, 4);
  discTables.forEach((table, index) => {
    const disc = index + 1;
    for (const row of table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
      if (cells.length < 2) continue;
      const title = htmlText(cells[1][1]);
      const yearCell = cells.map((cell) => htmlText(cell[1])).find((value) => /^(?:19|20)\d{2}$/.test(value));
      if (!title) continue;
      discMap.push({ volume, disc, title, year: yearCell ? Number(yearCell) : null, key: normalize(title) });
    }
  });
}

if (discMap.length !== 356) {
  const counts = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [index + 1, discMap.filter((item) => item.volume === index + 1).length]));
  throw new Error(`Expected 356 main-program cartoons from Wikipedia, received ${discMap.length}: ${JSON.stringify(counts)}`);
}

const files = (await walk(sourceRoot)).filter((file) => videoExtensions.has(path.extname(file).toLowerCase()));
const mainFiles = files.filter((file) => !/[\\/]extras?[\\/]/i.test(file));
const extras = files.filter((file) => /[\\/]extras?[\\/]/i.test(file));
const candidatesByKey = new Map();
for (const item of discMap) {
  const values = candidatesByKey.get(item.key) ?? [];
  values.push(item);
  candidatesByKey.set(item.key, values);
}

const used = new Set();
const moves = [];
const unresolved = [];
for (const file of mainFiles) {
  const parsed = parseFilename(file);
  const exact = (candidatesByKey.get(parsed.key) ?? []).filter((item) => !used.has(mapIdentity(item)));
  const sameYear = exact.filter((item) => !parsed.year || !item.year || item.year === parsed.year);
  let match = sameYear.length === 1 ? sameYear[0] : exact.length === 1 ? exact[0] : null;
  let distance = 0;
  if (!match) {
    const pool = discMap.filter((item) => !used.has(mapIdentity(item)) && (!parsed.year || !item.year || item.year === parsed.year));
    const ranked = pool.map((item) => ({ item, distance: levenshtein(parsed.key, item.key) / Math.max(parsed.key.length, item.key.length, 1) })).sort((a, b) => a.distance - b.distance);
    if (ranked[0] && ranked[0].distance <= 0.18 && (!ranked[1] || ranked[1].distance - ranked[0].distance >= 0.04)) {
      match = ranked[0].item;
      distance = ranked[0].distance;
    }
  }
  if (!match) {
    unresolved.push({ file, parsed });
    continue;
  }
  used.add(mapIdentity(match));
  const series = parsed.series || inferSeriesFromFile(file);
  const date = parsed.date || (match.year ? `${match.year}` : "Unknown date");
  const destination = path.join(destinationRoot, `Volume ${match.volume}`, `Disc ${match.disc}`, `${date} - ${series} - ${sanitize(match.title)}${path.extname(file).toLowerCase()}`);
  moves.push({ source: file, destination, volume: match.volume, disc: match.disc, title: match.title, series, date, fuzzyDistance: Number(distance.toFixed(3)) });
}

for (const file of [...extras, ...unresolved.map((item) => item.file)]) {
  const relative = path.relative(sourceRoot, file).replace(/^extras?[\\/]/i, "");
  moves.push({ source: file, destination: path.join(destinationRoot, "extras", relative), extra: true });
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceRoot,
  destinationRoot,
  expectedCartoons: discMap.length,
  sourceVideos: files.length,
  matchedCartoons: moves.filter((item) => !item.extra).length,
  extras: moves.filter((item) => item.extra).length,
  unresolvedMainFiles: unresolved.map((item) => ({ path: item.file, parsed: item.parsed })),
  missingDiscEntries: discMap.filter((item) => !used.has(mapIdentity(item))),
  moves,
};

await writeFile(path.resolve("config/looney-tunes-golden-collection-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (apply) {
  for (const move of moves) {
    await mkdir(path.dirname(move.destination), { recursive: true });
    if (await exists(move.destination)) throw new Error(`Refusing to overwrite ${move.destination}`);
    await rename(move.source, move.destination);
  }
}
console.log(JSON.stringify({ apply, sourceVideos: files.length, matchedCartoons: report.matchedCartoons, extras: report.extras, unresolved: unresolved.length, missing: report.missingDiscEntries.length, report: "config/looney-tunes-golden-collection-report.json" }, null, 2));

function fetchWikipediaVolume(volume) {
  const title = encodeURIComponent(`Looney Tunes Golden Collection: Volume ${volume}`);
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${title}&prop=text&format=json&formatversion=2`;
  return new Promise((resolve, reject) => https.get(url, { headers: { "user-agent": "TobyTube/1.0 catalogue organizer" } }, (response) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => {
      try { resolve(JSON.parse(body).parse.text); } catch (error) { reject(error); }
    });
  }).on("error", reject));
}

function htmlText(value) {
  return String(value ?? "")
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&ndash;|&mdash;/g, "-").replace(/&nbsp;/g, " ").replace(/&#(d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function parseFilename(file) {
  const stem = path.basename(file, path.extname(file));
  const dateMatch = stem.match(/^(\d{2})(\d{2})(\d{2})(?:DVD)?\s*/i);
  let date = null;
  let year = null;
  if (dateMatch) {
    year = Number(dateMatch[3]) >= 20 ? 1900 + Number(dateMatch[3]) : 2000 + Number(dateMatch[3]);
    date = `${year}-${dateMatch[1]}-${dateMatch[2]}`;
  }
  const seriesMatch = stem.match(/\b(LT|MM)\b(?:\s+BR)?\s*$/i);
  const title = stem.replace(/^\d{6}(?:DVD)?\s*/i, "").replace(/\s+\b(?:LT|MM)\b(?:\s+BR)?\s*$/i, "").trim();
  const rawKey = normalize(title);
  const aliases = {
    "gee whiz z z": "gee whiz z z z z z z",
    "dover boys": "dover boys at pimento university",
    "eatin on cuff": "eatin on cuff or moth who came to dinner",
    "page miss glory": "miss glory",
    "nurdy gurdy hare": "hurdy gurdy hare",
  };
  return { title, key: aliases[rawKey] ?? rawKey, series: seriesMatch?.[1]?.toUpperCase() ?? null, date, year };
}

function inferSeriesFromFile(file) {
  const name = path.basename(file);
  return /\bMM\b/i.test(name) ? "MM" : /\bLT\b/i.test(name) ? "LT" : "Unclassified";
}

function mapIdentity(item) { return `${item.volume}:${item.disc}:${item.key}`; }
function normalize(value) { return String(value ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").replace(/\bthe\b/g, " ").replace(/\s+/g, " ").trim(); }
function sanitize(value) { return String(value).replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim(); }
async function exists(file) { return Boolean(await stat(file).catch(() => null)); }
async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(fullPath));
    else if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}
