import { readFile, writeFile } from "node:fs/promises";

const tmdbEvents = JSON.parse(await readFile("tmp-shimmer-tmdb-events.json", "utf8"));
let data = await readFile("src/data.js", "utf8");
const match = data.match(/const shimmerVolumeEvents = ([\s\S]*?);\n\nexport const years = /);
if (!match) throw new Error("Could not find shimmerVolumeEvents block.");

const events = JSON.parse(match[1]);
const byTitle = new Map(tmdbEvents.map((event) => [slug(event.title), event]));
const merged = events.map((event) => {
  const tmdb = byTitle.get(slug(event.title));
  if (!tmdb) return event;
  return {
    ...event,
    tmdbId: tmdb.tmdbId,
    metadataSource: "Wikipedia + TMDB",
    summary: tmdb.summary || event.summary,
    posterUrl: tmdb.posterUrl || event.posterUrl,
    backdropUrl: tmdb.backdropUrl || event.backdropUrl,
    voteAverage: tmdb.voteAverage ?? event.voteAverage,
  };
});

const block = `const shimmerVolumeEvents = ${JSON.stringify(merged, null, 2)};\n\n`;
data = data.replace(/const shimmerVolumeEvents = [\s\S]*?\n\nexport const years = /, `${block}export const years = `);
await writeFile("src/data.js", data);
console.log(`Applied TMDB art to ${merged.filter((event) => event.posterUrl).length}/${merged.length} SHIMMER events.`);

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
