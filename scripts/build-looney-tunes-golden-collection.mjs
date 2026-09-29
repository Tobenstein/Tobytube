import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = JSON.parse(await readFile(path.join(root, "config", "looney-tunes-golden-collection-report.json"), "utf8"));
const detailSource = JSON.parse(await readFile(path.join(root, "src", "movie-detail.generated.json"), "utf8")).movies ?? {};
const details = Object.values(detailSource);
const tmdb = {
  1: { id: 465022, year: 2003, posterUrl: "https://image.tmdb.org/t/p/w342/eY5WcyMaFptdOYuIu9J7yhxdpPj.jpg", backdropUrl: "https://image.tmdb.org/t/p/w780/41DCFSPOuZoy1VNBMsJJdICBzCn.jpg", summary: "The first four-disc Golden Collection, featuring 56 restored Looney Tunes and Merrie Melodies shorts plus archival supplements." },
  2: { id: 285151, year: 2004, posterUrl: "https://image.tmdb.org/t/p/w342/t8J5deRBjdNsyYLkuwKfXU3oorK.jpg", backdropUrl: "https://image.tmdb.org/t/p/w780/l913Y9rBlb0SVFuStDgNkFUvSbo.jpg", summary: "The second four-disc Golden Collection, bringing together Bugs Bunny, Road Runner, Tweety, Sylvester, Daffy and Porky." },
  3: { id: 370026, year: 2005, posterUrl: "https://image.tmdb.org/t/p/w342/2swAuvkNIM12D524CFpPWU6YDKZ.jpg", backdropUrl: null, summary: "Sixty theatrical shorts across Bugs Bunny classics, Hollywood parodies, Porky Pig and an all-stars cartoon party." },
  4: { id: 419817, year: 2006, posterUrl: "https://image.tmdb.org/t/p/w342/nJl7HhzONHPEd2fn8FeTqsB1b11.jpg", backdropUrl: null, summary: "Four discs of Bugs Bunny favourites, Frank Tashlin cartoons, Speedy Gonzales and feline mischief." },
  5: { id: 419819, year: 2007, posterUrl: "https://image.tmdb.org/t/p/w342/Aw4A1SzsOhXuTjsu4ECfW2XVAPB.jpg", backdropUrl: "https://image.tmdb.org/t/p/w780/aJ6sGidUAtKchG3XvxFFSildBVW.jpg", summary: "A four-disc collection of Bugs and Daffy, fractured fairy tales, Bob Clampett cartoons and early black-and-white shorts." },
  6: { id: 419821, year: 2008, posterUrl: "https://image.tmdb.org/t/p/w342/rmIxQiH3qmnI1cGJLACV8g6BXYd.jpg", backdropUrl: null, summary: "The concluding four-disc Golden Collection: all-stars, wartime cartoons, early Bosko and Buddy films, and requested one-shots." },
};

const normalize = (value) => String(value ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const shorts = [];
for (const move of report.moves.filter((item) => !item.extra)) {
  if (!(await stat(move.destination).catch(() => null))?.isFile()) throw new Error(`Organized cartoon is missing: ${move.destination}`);
  const year = Number(String(move.date).slice(0, 4)) || null;
  const detail = details.find((item) => normalize(item.title) === normalize(move.title) && (!year || Number(String(item.releaseDate ?? item.year ?? "").slice(0, 4)) === year))
    ?? details.find((item) => normalize(item.title) === normalize(move.title))
    ?? {};
  shorts.push({
    id: `looney-golden-v${move.volume}-d${move.disc}-${normalize(move.title).replace(/\s+/g, "-")}`,
    collectionId: `looney-tunes-golden-collection-volume-${move.volume}`,
    mediaType: "looney-tunes-short",
    title: move.title,
    year,
    releaseDate: move.date,
    series: move.series === "MM" ? "Merrie Melodies" : move.series === "LT" ? "Looney Tunes" : "Unclassified",
    volume: move.volume,
    disc: move.disc,
    discOrder: report.moves.filter((item) => !item.extra && item.volume === move.volume && item.disc === move.disc).findIndex((item) => item.destination === move.destination) + 1,
    summary: detail.summary ?? "A restored theatrical Warner Bros. animated short.",
    runtime: detail.runtime ?? null,
    genres: detail.genres ?? ["Animation", "Short", "Comedy"],
    posterUrl: detail.posterUrl ?? tmdb[move.volume].posterUrl,
    backdropUrl: detail.backdropUrl ?? tmdb[move.volume].backdropUrl,
    tmdbId: detail.tmdbId ?? null,
    files: [{ path: move.destination }],
  });
}

const volumes = Array.from({ length: 6 }, (_, index) => {
  const volume = index + 1;
  const metadata = tmdb[volume];
  const items = shorts.filter((item) => item.volume === volume).sort((a, b) => a.disc - b.disc || a.discOrder - b.discOrder);
  return {
    id: `looney-tunes-golden-collection-volume-${volume}`,
    title: `Looney Tunes Golden Collection, Vol. ${volume}`,
    mediaType: "looney-tunes-volume",
    year: metadata.year,
    summary: metadata.summary,
    genres: ["Animation", "Comedy", "Short"],
    posterUrl: metadata.posterUrl,
    backdropUrl: metadata.backdropUrl,
    tmdbId: metadata.id,
    shortCount: items.length,
    shorts: items,
  };
});

await writeFile(path.join(root, "src", "looney-tunes-golden-collection.generated.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), collection: { id: "looney-tunes-golden-collection", title: "Looney Tunes Golden Collection", mediaType: "looney-tunes-series", volumes }, volumes }, null, 2)}\n`, "utf8");
console.log(`Wrote ${volumes.length} Golden Collection volumes with ${shorts.length} cartoons.`);
