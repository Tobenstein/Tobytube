import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src", "disney-shorts.generated.json");
const matchesPath = path.join(root, "config", "disney-shorts-matches.json");
const reportPath = path.join(root, "cache", "disney-shorts-match-report.json");
const apply = process.argv.includes("--apply");
const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
const apiKey = process.env.TMDB_API_KEY;
if (!token && !apiKey) throw new Error("TMDB credentials are not configured.");

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const existing = JSON.parse(await readFile(matchesPath, "utf8").catch(() => "{}"));
const shorts = (source.collections ?? []).flatMap((collection) => collection.shorts ?? []);
const pending = shorts.filter((short) => !existing[short.id]?.metadata?.tmdbId);
const outcomes = [];
let cursor = 0;

const titleAliases = new Map(Object.entries({
  "Barn Dance": "The Barn Dance",
  "Chain Gang": "The Chain Gang",
  "Chip 'n' Dale": "Chip an' Dale",
  "Dumbell Of The Yukon": "Dumb Bell of the Yukon",
  "Flying Jalopy": "The Flying Jalopy",
  "Hockey Champ": "The Hockey Champ",
  "Inferior Decorators": "Inferior Decorator",
  "Mickey's Gala Premier": "Mickey's Gala Premiere",
  "Musical Farmer": "The Musical Farmer",
  "Pluto's Judgment Day": "Pluto's Judgement Day",
  "The Bears and Bees": "The Bears and the Bees",
  "The Gallopin Guacho": "The Gallopin' Gaucho",
  "The Whoopiee Party": "The Whoopee Party",
  "Ye Tolden Days": "Ye Olden Days",
}));

// These records were manually disambiguated from TMDB's returned candidates.
// IDs are durable provider identities; comments explain why title/year alone
// was insufficient for this small residue.
const fixedProviderIds = new Map(Object.entries({
  "Adventures in Music - Melody": 73602, // TMDB title: Melody (1953)
  "Just Mickey": 166528, // TMDB title: Fiddling Around (1930)
  "The Opry House": 190232, // Mickey short; duplicate is a live music film
  "The Prince and the Pauper": 25831, // Disney original; duplicate is Croatian version
  "Tricks of Our Trade (1957) [excerpt]": 1056336,
  "Two Weeks Vacation": 67704, // source filename says 1949; TMDB release is 1952
}));

await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < pending.length) {
    const short = pending[cursor++];
    try {
      outcomes.push(await findExactMatch(short));
    } catch (error) {
      outcomes.push({ status: "error", id: short.id, title: short.title, year: short.year, error: error.message });
    }
    if (outcomes.length % 25 === 0) console.log(`Checked ${outcomes.length}/${pending.length} shorts...`);
  }
}));

outcomes.sort((a, b) => a.title.localeCompare(b.title) || Number(a.year ?? 0) - Number(b.year ?? 0));
const matched = outcomes.filter((outcome) => outcome.status === "matched");
const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? "apply" : "dry-run",
  total: shorts.length,
  previouslyMatched: shorts.length - pending.length,
  matched: matched.length,
  unmatched: outcomes.filter((outcome) => outcome.status === "unmatched").length,
  ambiguous: outcomes.filter((outcome) => outcome.status === "ambiguous").length,
  errors: outcomes.filter((outcome) => outcome.status === "error").length,
  outcomes,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeJsonAtomic(reportPath, report);

if (apply && matched.length) {
  const now = new Date().toISOString();
  const next = { ...existing };
  for (const outcome of matched) {
    next[outcome.id] = {
      match: { provider: "TMDB", providerId: String(outcome.providerId), title: outcome.matchedTitle, year: outcome.year, mediaType: "movie", matchedAt: now },
      metadata: outcome.metadata,
    };
  }
  await mkdir(path.dirname(matchesPath), { recursive: true });
  await copyFile(matchesPath, `${matchesPath}.backup-${Date.now()}`).catch(() => {});
  await writeJsonAtomic(matchesPath, next);
}

console.log(JSON.stringify({ report: reportPath, mode: report.mode, matched: report.matched, unmatched: report.unmatched, ambiguous: report.ambiguous, errors: report.errors }, null, 2));
if (!apply) console.log("Dry run only. Re-run with --apply after reviewing the report.");

async function findExactMatch(short) {
  const fixedProviderId = fixedProviderIds.get(short.title);
  if (fixedProviderId) {
    const details = await tmdbJson(new URL(`https://api.themoviedb.org/3/movie/${fixedProviderId}?append_to_response=credits,release_dates,external_ids&language=en-US`));
    return { status: "matched", id: short.id, title: short.title, year: short.year, providerId: details.id, matchedTitle: details.title, matchRule: "reviewed-provider-id", metadata: normalizeMovie(details) };
  }
  const queryTitle = titleAliases.get(short.title) ?? short.title;
  const target = new URL("https://api.themoviedb.org/3/search/movie");
  target.searchParams.set("query", queryTitle);
  if (short.year) target.searchParams.set("year", String(short.year));
  target.searchParams.set("include_adult", "false");
  target.searchParams.set("language", "en-US");
  const payload = await tmdbJson(target);
  const exact = (payload.results ?? []).filter((candidate) =>
    normalize(candidate.title ?? candidate.original_title) === normalize(queryTitle)
      && String(candidate.release_date ?? "").startsWith(String(short.year)),
  );
  let eligible = exact;
  let matchRule = "exact-title-year";
  if (!eligible.length) {
    // Several archival filenames use the production/copyright year while
    // TMDB uses the public release year. Permit only a one-year difference,
    // and still require an exact normalized title and one unique record.
    target.searchParams.delete("year");
    const broadPayload = await tmdbJson(target);
    eligible = (broadPayload.results ?? []).filter((candidate) => {
      if (normalize(candidate.title ?? candidate.original_title) !== normalize(queryTitle)) return false;
      if (!short.year) return true;
      const candidateYear = Number(String(candidate.release_date ?? "").slice(0, 4));
      return candidateYear && Math.abs(candidateYear - Number(short.year)) <= 1;
    });
    matchRule = short.year ? "exact-title-year-within-one" : "exact-title-unique";
  }
  if (!eligible.length) return { status: "unmatched", id: short.id, title: short.title, year: short.year, reason: "no-safe-title-result" };
  const ids = [...new Set(eligible.map((candidate) => candidate.id))];
  if (ids.length !== 1) return { status: "ambiguous", id: short.id, title: short.title, year: short.year, candidateIds: ids };
  const details = await tmdbJson(new URL(`https://api.themoviedb.org/3/movie/${ids[0]}?append_to_response=credits,release_dates,external_ids&language=en-US`));
  return { status: "matched", id: short.id, title: short.title, year: short.year, providerId: details.id, matchedTitle: details.title, matchRule, metadata: normalizeMovie(details) };
}

async function tmdbJson(url, attempt = 0) {
  const headers = token ? { accept: "application/json", authorization: `Bearer ${token}` } : { accept: "application/json" };
  if (!token) url.searchParams.set("api_key", apiKey);
  const response = await fetch(url, { headers });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) {
    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    return tmdbJson(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
  return response.json();
}

function normalizeMovie(details) {
  const director = details.credits?.crew?.find((person) => person.job === "Director");
  const certification = getCertification(details.release_dates?.results) ?? "NR";
  return {
    title: details.title,
    year: Number(String(details.release_date ?? "").slice(0, 4)) || null,
    releaseDate: details.release_date || null,
    summary: details.overview || "Synopsis pending.",
    tagline: details.tagline || null,
    genres: (details.genres ?? []).map((genre) => genre.name),
    runtime: details.runtime ?? null,
    rating: certification,
    ratings: { tmdb: details.vote_average ?? null },
    director: director?.name ?? null,
    cast: (details.credits?.cast ?? []).slice(0, 20).map((person) => ({ name: person.name, character: person.character, profileUrl: image(person.profile_path, "w185") })),
    posterUrl: image(details.poster_path, "w342"),
    backdropUrl: image(details.backdrop_path, "w780"),
    tmdbId: details.id,
    externalIds: details.external_ids ?? {},
  };
}

function getCertification(results = []) {
  const releases = results.find((entry) => entry.iso_3166_1 === "US")?.release_dates ?? [];
  return releases.map((entry) => entry.certification).find(Boolean) ?? null;
}

function image(value, size) {
  return value ? `https://image.tmdb.org/t/p/${size}${value}` : null;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKD").replace(/[’']/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

async function writeJsonAtomic(target, value) {
  const temporary = `${target}.pending-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}
