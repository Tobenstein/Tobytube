import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.DISNEY_SHORTS_ROOT || "M:/Collections/Vaults/Disney/Shorts";
const outputPath = path.join(projectRoot, "src", "disney-shorts.generated.json");
const matchesPath = path.join(projectRoot, "config", "disney-shorts-matches.json");
const artworkRoot = path.join(projectRoot, "assets", "collections", "disney", "shorts");
const videoExtensions = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm", ".wmv"]);

const collectionSpecs = [
  { folder: "Mickey Mouse", title: "Mickey Mouse", metadataTitle: "Walt Disney Treasures - Mickey Mouse in Living Color", nestedCover: "Mickey Mouse in Living Color/cover.webp" },
  { folder: "The Chronological Donald Duck", title: "The Chronological Donald Duck", metadataTitle: "Walt Disney Treasures - The Chronological Donald, Volume One" },
  { folder: "The Complete Goofy (1938-1961)", title: "The Complete Goofy", metadataTitle: "Walt Disney Treasures - The Complete Goofy" },
  { folder: "The Complete Pluto", title: "The Complete Pluto", metadataTitle: "Walt Disney Treasures - The Complete Pluto, Volume 1" },
  { folder: "Silly Symphonies", title: "Silly Symphonies", metadataTitle: "Silly Symphonies Souvenirs" },
  { folder: "Disney Rarities", title: "Disney Rarities", metadataTitle: "Disney Rarities: Celebrated Shorts, 1920s-1960s" },
];

const movieDetails = JSON.parse(await readFile(path.join(projectRoot, "src", "movie-detail.generated.json"), "utf8")).movies ?? {};
const detailRecords = Object.values(movieDetails);
const savedMatches = JSON.parse(await readFile(matchesPath, "utf8").catch(() => "{}"));
const normalize = (value) => String(value ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const slugify = (value) => normalize(value).replace(/\s+/g, "-");

const collections = [];
for (const spec of collectionSpecs) {
  const folderPath = path.join(sourceRoot, spec.folder);
  const folderStats = await stat(folderPath).catch(() => null);
  if (!folderStats?.isDirectory()) continue;
  const detail = detailRecords.find((record) => normalize(record.title) === normalize(spec.metadataTitle)) ?? {};
  const files = (await walk(folderPath)).filter((filePath) => videoExtensions.has(path.extname(filePath).toLowerCase()));
  const shorts = files.map((filePath) => {
    const short = buildShort(filePath, folderPath, spec, detailRecords);
    return { ...short, ...(savedMatches[short.id]?.metadata ?? {}) };
  }).sort(compareShorts);
  const id = `disney-shorts-${slugify(spec.title)}`;
  const localCover = spec.nestedCover ? path.join(folderPath, spec.nestedCover) : path.join(folderPath, "cover.webp");
  const coverExists = Boolean((await stat(localCover).catch(() => null))?.isFile());
  const posterUrl = coverExists ? `./assets/collections/disney/shorts/${slugify(spec.title)}.webp` : detail.posterUrl ?? null;
  if (coverExists) {
    await mkdir(artworkRoot, { recursive: true });
    await copyFile(localCover, path.join(artworkRoot, `${slugify(spec.title)}.webp`));
  }
  collections.push({
    id,
    title: spec.title,
    mediaType: "disney-shorts-collection",
    summary: detail.summary ?? `${shorts.length} animated shorts from the Disney archive.`,
    tagline: detail.tagline ?? null,
    releaseDate: detail.releaseDate ?? null,
    year: String(detail.releaseDate ?? "").slice(0, 4) || null,
    genres: detail.genres ?? ["Animation", "Family"],
    ratings: detail.ratings ?? {},
    cast: detail.cast ?? [],
    posterUrl,
    backdropUrl: detail.backdropUrl ?? null,
    tmdbId: detail.tmdbId ?? null,
    shortCount: shorts.length,
    shorts,
  });
}

if (collections.length !== collectionSpecs.length || collections.some((collection) => !collection.shorts.length)) {
  throw new Error(`Disney Shorts source is incomplete at ${sourceRoot}; refusing to replace the catalogue (${collections.length}/${collectionSpecs.length} collections found).`);
}

await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), sourceRoot: path.resolve(sourceRoot), collections }, null, 2)}\n`, "utf8");
console.log(`Wrote ${collections.length} Disney shorts collections with ${collections.reduce((sum, item) => sum + item.shortCount, 0)} films.`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(fullPath));
    else if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

function buildShort(filePath, collectionRoot, spec, details) {
  const stem = path.basename(filePath, path.extname(filePath));
  const match = stem.match(/^(.*?)\s*\((\d{4})\)$/);
  const title = (match?.[1] ?? stem)
    .replace(/^\s*(?:[a-z]?\d+[a-z]?[. -]+)+/i, "")
    .replace(/\s+\($/, "")
    .trim();
  const year = match?.[2] ? Number(match[2]) : null;
  const detail = details.find((record) => normalize(record.title) === normalize(title) && (!year || Number(String(record.releaseDate ?? "").slice(0, 4)) === year))
    ?? details.find((record) => normalize(record.title) === normalize(title))
    ?? {};
  return {
    id: `disney-short-${slugify(spec.title)}-${slugify(path.relative(collectionRoot, filePath))}`,
    collectionId: `disney-shorts-${slugify(spec.title)}`,
    mediaType: "disney-short",
    title,
    year,
    releaseDate: detail.releaseDate ?? (year ? `${year}` : null),
    summary: detail.summary ?? "Synopsis pending.",
    tagline: detail.tagline ?? null,
    genres: detail.genres ?? ["Animation", "Short"],
    runtime: detail.runtime ?? null,
    rating: detail.rating ?? "NR",
    ratings: detail.ratings ?? {},
    director: detail.director ?? null,
    cast: detail.cast ?? [],
    posterUrl: detail.posterUrl ?? null,
    backdropUrl: detail.backdropUrl ?? null,
    tmdbId: detail.tmdbId ?? null,
    files: [{ path: filePath }],
  };
}

function compareShorts(a, b) {
  return String(a.releaseDate ?? `${a.year ?? 9999}-12-31`).localeCompare(String(b.releaseDate ?? `${b.year ?? 9999}-12-31`)) || a.title.localeCompare(b.title);
}
