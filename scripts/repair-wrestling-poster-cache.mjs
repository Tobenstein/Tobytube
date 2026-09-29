import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const posterPath = path.join(root, "src", "tmdb-posters.generated.json");
const posters = JSON.parse(await readFile(posterPath, "utf8"));
let removed = 0;

for (const [key, poster] of Object.entries(posters)) {
  const genericSeason = key.startsWith("season-wwe-") && poster?.source === "tmdb";
  const genericEpisode =
    /^wrestling-wwe-(?:raw|smackdown)-\d{4}-\d{2}-\d{2}$/.test(key) &&
    poster?.source === "tmdb" &&
    [4656, 1549].includes(Number(poster.tmdbId));
  if (!genericSeason && !genericEpisode) continue;
  delete posters[key];
  removed += 1;
}

await writeFile(posterPath, `${JSON.stringify(posters, null, 2)}\n`);
console.log(`Removed ${removed} generic WWE show posters incorrectly stored as season artwork.`);
