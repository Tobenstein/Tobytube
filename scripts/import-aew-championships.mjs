import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTitleReigns } from "./import-wikipedia-title-reigns.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referencePath = path.join(root, "src", "wrestling-reference.generated.json");

const sources = [
  title("aew-aew-womens-world", "AEW Women's World Championship", "List_of_AEW_Women%27s_World_Champions", "2019-10-02", "./assets/championships/aew-womens-world.png", {
    youngestChampion: rec("Riho", 22, "years"), oldestChampion: rec("Nyla Rose", 37, "years"),
  }),
  title("aew-aew-international", "AEW International Championship", "List_of_AEW_International_Champions", "2022-06-08", "./assets/championships/aew-international.png", {
    youngestChampion: rec("MJF", 28, "years"), oldestChampion: rec("Kenny Omega", 41, "years"),
  }),
  title("aew-aew-continental", "AEW Continental Championship", "AEW_Continental_Championship", "2023-11-18", "./assets/championships/aew-continental.png", {
    youngestChampion: rec("Kazuchika Okada", 37, "years"), oldestChampion: rec("Eddie Kingston", 42, "years"),
  }),
  title("aew-aew-national", "AEW National Championship", "AEW_National_Championship", "2025-11-05", "https://upload.wikimedia.org/wikipedia/en/thumb/5/5a/AEW_National_Title.png/330px-AEW_National_Title.png", {
    youngestChampion: rec("Jack Perry", "28 years, 272 days"), oldestChampion: rec("Ricochet", "37 years, 42 days"),
  }),
  title("aew-aew-tnt", "AEW TNT Championship", "List_of_AEW_TNT_Champions", "2020-03-30", "./assets/championships/aew-tnt.png", {
    youngestChampion: rec("Daniel Garcia", "26 years, 67 days"), oldestChampion: rec("Dustin Rhodes", 56, "years"),
    shortestReign: rec("Adam Copeland", "3 minutes, 30 seconds"),
  }),
  title("aew-aew-tbs", "AEW TBS Championship", "AEW_TBS_Championship", "2021-10-06", "./assets/championships/aew-tbs.png", {
    youngestChampion: rec("Julia Hart", "22 years, 10 days"), oldestChampion: rec("Hikaru Shida", "38 years, 20 days"),
  }),
  title("aew-aew-tag-team", "AEW World Tag Team Championship", "List_of_AEW_World_Tag_Team_Champions", "2019-10-30", "./assets/championships/aew-tag-team.png", {
    youngestChampion: rec("Jungle Boy", 24, "years"), oldestChampion: rec("Sting", 64, "years"),
  }),
  title("aew-aew-trios", "AEW World Trios Championship", "List_of_AEW_World_Trios_Champions", "2022-09-04", "./assets/championships/aew-trios.png", {
    youngestChampion: rec("Nick Wayne", 19, "years"), oldestChampion: rec("Billy Gunn", 59, "years"),
  }),
  title("aew-aew-womens-tag-team", "AEW Women's World Tag Team Championship", "AEW_Women%27s_World_Tag_Team_Championship", "2025-09-24", "./assets/championships/aew-womens-tag-team.jpg", {
    youngestChampion: rec("Megan Bayne", "27 years, 287 days"), oldestChampion: rec("Harley Cameron", "31 years, 347 days"),
  }),
  title("aew-aew-unified", "AEW Unified Championship", "AEW_Unified_Championship", "2025-06-11", "./assets/championships/aew-unified.jpg", {
    retired: "2025-12-27", status: "inactive", longestReign: rec("Kazuchika Okada", 168, "days"), shortestReign: rec("Kazuchika Okada", 168, "days"),
  }),
];

const db = JSON.parse(await readFile(referencePath, "utf8"));
const fetched = await Promise.all(sources.map(async (source) => {
  const response = await fetch(source.url, { headers: { "user-agent": "Tobytube personal metadata importer (local prototype)" } });
  if (!response.ok) throw new Error(`${source.name}: Wikipedia returned ${response.status}`);
  const reigns = parseTitleReigns(await response.text(), source.id);
  return { source, reigns };
}));

for (const { source, reigns } of fetched) {
  if (!reigns.length) {
    console.warn(`Skipped ${source.name}: no reign table was found.`);
    continue;
  }
  const enrichedReigns = reigns.map((reign) => ({
    ...reign,
    personId: /vacat/i.test(reign.champion) ? null : slug(reign.champion),
  }));
  db.titleReigns = db.titleReigns.filter((reign) => reign.championshipId !== source.id);
  db.titleReigns.push(...enrichedReigns);
  const computed = computeStats(enrichedReigns);
  upsert(db.championships, {
    id: source.id,
    promotionId: "aew",
    name: source.name,
    established: source.established,
    retired: source.stats.retired ?? null,
    status: source.stats.status ?? "active",
    imageUrl: source.imageUrl,
    currentChampion: computed.currentChampion,
    summary: `${source.name} history maintained by Tobytube's wrestling reference database. AEW event data remains authoritative when linked to title changes.`,
    recordStats: { ...computed.recordStats, ...source.stats },
    externalIds: { wikipedia: source.url },
    sourceIds: ["wikipedia-aew-championships"],
  });
  console.log(`${source.name}: ${enrichedReigns.length} entries`);
}

if (!db.sources.some((source) => source.id === "wikipedia-aew-championships")) db.sources.push({ id: "wikipedia-aew-championships" });
db.generatedAt = new Date().toISOString();
const tempPath = `${referencePath}.importing-aew`;
await writeFile(tempPath, `${JSON.stringify(db, null, 2)}\n`);
await rename(tempPath, referencePath);

function title(id, name, page, established, imageUrl, stats = {}) {
  return { id, name, established, imageUrl, stats, url: `https://en.wikipedia.org/wiki/${page}` };
}

function rec(champion, value, unit = null) {
  return { champion, value, unit };
}

function computeStats(reigns) {
  const valid = reigns.filter((reign) => !/vacat/i.test(reign.champion));
  const daysByChampion = new Map();
  const reignsByChampion = new Map();
  for (const reign of valid) {
    daysByChampion.set(reign.champion, (daysByChampion.get(reign.champion) ?? 0) + (Number(reign.days) || 0));
    reignsByChampion.set(reign.champion, Math.max(reignsByChampion.get(reign.champion) ?? 0, Number(reign.reign) || 1));
  }
  const longest = valid.filter((reign) => Number.isFinite(reign.days)).sort((a, b) => b.days - a.days)[0];
  const shortest = valid.filter((reign) => Number.isFinite(reign.days)).sort((a, b) => a.days - b.days)[0];
  const mostReigns = maxEntry(reignsByChampion);
  const longestCombined = maxEntry(daysByChampion);
  return {
    currentChampion: valid.at(-1)?.champion ?? null,
    recordStats: {
      inauguralChampion: valid[0]?.champion ?? null,
      mostReigns: mostReigns ? rec(mostReigns[0], mostReigns[1], "reigns") : null,
      longestReign: longest ? rec(longest.champion, longest.days, "days") : null,
      shortestReign: shortest ? rec(shortest.champion, shortest.days, "days") : null,
      longestCombinedReign: longestCombined ? rec(longestCombined[0], longestCombined[1], "days") : null,
    },
  };
}

function maxEntry(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
}

function upsert(records, next) {
  const index = records.findIndex((record) => record.id === next.id);
  if (index >= 0) records[index] = { ...records[index], ...next };
  else records.push(next);
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
