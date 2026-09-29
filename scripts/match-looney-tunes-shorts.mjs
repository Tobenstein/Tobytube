import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cataloguePath = path.join(root, "src", "looney-tunes-golden-collection.generated.json");
const reportPath = path.join(root, "config", "looney-tunes-short-match-report.json");
const payload = JSON.parse(await readFile(cataloguePath, "utf8"));
const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
const apiKey = process.env.TMDB_API_KEY;
if (!token && !apiKey) throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY before matching Looney Tunes shorts.");

const volumeById = new Map((payload.volumes ?? []).map((volume) => [volume.id, volume]));
const shorts = [...volumeById.values()].flatMap((volume) => volume.shorts ?? []);
const pending = shorts.filter((short) => !short.tmdbId || short.matched !== true);
const results = [];
const MATCH_OVERRIDES = new Map([
  ["looney-golden-v2-d2-the-dover-boys-at-pimento-university", { queryTitle: "The Dover Boys at Pimento University or The Rivals of Roquefort Hall", queryYear: 1942 }],
  ["looney-golden-v4-d3-the-wild-chase", { queryTitle: "The Wild Chase", queryYear: 1965, releaseDate: "1965-02-27" }],
  ["looney-golden-v5-d2-the-bear-s-tale", { queryTitle: "The Bear's Tale", queryYear: 1940, releaseDate: "1940-04-13" }],
  ["looney-golden-v6-d4-miss-glory", { queryTitle: "Page Miss Glory", queryYear: 1936, canonicalTitle: "Page Miss Glory", releaseDate: "1936-03-07" }],
  ["looney-golden-v6-d4-martian-through-georgia", { queryTitle: "Martian Through Georgia", queryYear: 1962, releaseDate: "1962-12-29" }],
]);

for (let index = 0; index < pending.length; index += 5) {
  const batch = pending.slice(index, index + 5);
  const batchResults = await Promise.all(batch.map(matchShort));
  results.push(...batchResults);
  if ((index + batch.length) % 50 === 0 || index + batch.length === pending.length) {
    console.log(`Matched ${index + batch.length}/${pending.length} pending shorts`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  source: "TMDB exact title/year matching",
  total: shorts.length,
  attempted: pending.length,
  matched: shorts.filter((short) => short.matched === true && short.tmdbId).length,
  unmatched: shorts.filter((short) => !short.tmdbId).map((short) => ({ id: short.id, title: short.title, year: short.year, filePath: short.files?.[0]?.path ?? null })),
  results,
};

payload.generatedAt = new Date().toISOString();
payload.collection = { ...(payload.collection ?? {}), volumes: payload.volumes };
await writeFile(cataloguePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Looney Tunes metadata: ${report.matched}/${report.total} matched; ${report.unmatched.length} require manual matching.`);

async function matchShort(short) {
  try {
    const override = MATCH_OVERRIDES.get(short.id);
    const queryTitle = override?.queryTitle ?? short.title;
    const queryYear = override?.queryYear ?? short.year;
    let candidates = await tmdb(`/search/movie`, { query: queryTitle, year: queryYear });
    let candidate = selectExactCandidate(candidates.results ?? [], { title: queryTitle, year: queryYear });
    if (!candidate && override) {
      candidates = await tmdb(`/search/movie`, { query: queryTitle });
      candidate = selectExactCandidate(candidates.results ?? [], { title: queryTitle, year: queryYear });
    }
    if (!candidate) return { id: short.id, title: short.title, year: short.year, matched: false, reason: "No exact title/year result" };
    const details = await tmdb(`/movie/${candidate.id}`, { append_to_response: "credits,external_ids" });
    const crew = (details.credits?.crew ?? []).filter((person) => /Directing|Writing|Production/i.test(person.department ?? ""));
    short.tmdbId = details.id;
    short.imdbId = details.external_ids?.imdb_id ?? null;
    short.matched = true;
    short.status = "complete";
    short.metadataSource = "TMDB";
    if (override?.canonicalTitle) short.title = override.canonicalTitle;
    if (override?.queryYear) short.year = override.queryYear;
    if (override?.releaseDate) short.releaseDate = override.releaseDate;
    short.summary = details.overview || short.summary;
    short.runtime = details.runtime ?? short.runtime;
    short.posterUrl = details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : short.posterUrl;
    short.backdropUrl = details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : short.backdropUrl;
    short.director = crew.find((person) => person.job === "Director")?.name ?? null;
    short.cast = (details.credits?.cast ?? []).slice(0, 20).map((person) => ({ id: `tmdb-person-${person.id}`, tmdbId: person.id, name: person.name, role: person.character || "Cast", imageUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null }));
    short.crew = crew.map((person) => ({ id: `tmdb-person-${person.id}`, tmdbId: person.id, name: person.name, job: person.job, department: person.department, imageUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null }));
    short.writers = [...new Set(short.crew.filter((person) => /Writing/i.test(person.department) || /Writer|Screenplay|Story/i.test(person.job)).map((person) => person.name))];
    short.producers = [...new Set(short.crew.filter((person) => /Production/i.test(person.department) || /Producer/i.test(person.job)).map((person) => person.name))];
    return { id: short.id, title: short.title, year: short.year, matched: true, tmdbId: short.tmdbId };
  } catch (error) {
    return { id: short.id, title: short.title, year: short.year, matched: false, reason: error.message };
  }
}

function selectExactCandidate(candidates, short) {
  const title = normalize(short.title);
  return candidates.find((candidate) => {
    if (![candidate.title, candidate.original_title].some((value) => normalize(value) === title)) return false;
    const candidateYear = Number(String(candidate.release_date ?? "").slice(0, 4));
    return !short.year || !candidateYear || Math.abs(candidateYear - Number(short.year)) <= 1;
  }) ?? null;
}

async function tmdb(route, params) {
  const url = new URL(`https://api.themoviedb.org/3${route}`);
  Object.entries(params).forEach(([key, value]) => { if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, String(value)); });
  if (!token) url.searchParams.set("api_key", apiKey);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 4) throw new Error(`TMDB request failed: ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error("TMDB request failed");
}

function normalize(value) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}
