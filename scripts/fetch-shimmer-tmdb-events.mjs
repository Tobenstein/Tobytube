import { writeFile } from "node:fs/promises";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const companyId = 99659;
const headers = process.env.TMDB_READ_ACCESS_TOKEN
  ? { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}` }
  : {};
const events = mergeEvents([...(await fetchCompanyEvents()), ...(await fetchSearchEvents())]);

events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
await writeFile("tmp-shimmer-tmdb-events.json", JSON.stringify(events, null, 2));
console.log(`Wrote ${events.length} SHIMMER TMDB events.`);

async function fetchCompanyEvents() {
  const events = [];
  for (let page = 1; page <= 10; page += 1) {
    const payload = await tmdbJson(`company/${companyId}/movies`, { page });
    events.push(...(payload.results ?? []).map(movieToEvent).filter(Boolean));
    if (page >= (payload.total_pages ?? 1)) break;
    await delay(120);
  }
  return events;
}

async function fetchSearchEvents() {
  const first = await tmdbJson("search/movie", { query: "SHIMMER Women Athletes", page: 1 });
  const pageCount = Math.min(first.total_pages ?? 1, 10);
  const events = (first.results ?? []).map(movieToEvent).filter(Boolean);

  for (let page = 2; page <= pageCount; page += 1) {
    const payload = await tmdbJson("search/movie", { query: "SHIMMER Women Athletes", page });
    events.push(...(payload.results ?? []).map(movieToEvent).filter(Boolean));
    await delay(120);
  }

  return events;
}

async function tmdbJson(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set("language", "en-US");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  if (!headers.Authorization && process.env.TMDB_API_KEY) url.searchParams.set("api_key", process.env.TMDB_API_KEY);

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB ${path} fetch failed: ${response.status}`);
  return response.json();
}

function movieToEvent(movie) {
  const rawTitle = movie.title ?? movie.name ?? "";
  if (!movie.release_date || !/shimmer/i.test(rawTitle)) return null;
  const volume = rawTitle.match(/volume\s*(\d+)/i)?.[1];
  const title = volume ? `Volume ${Number(volume)}` : rawTitle.replace(/^SHIMMER(?: Women Athletes)?\s*:?\s*/i, "").trim();

  return {
    tmdbId: movie.id,
    title,
    date: movie.release_date,
    year: Number(movie.release_date.slice(0, 4)),
    summary: movie.overview || null,
    posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null,
    backdropUrl: movie.backdrop_path ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` : null,
    voteAverage: movie.vote_average ?? null,
  };
}

function mergeEvents(events) {
  const byKey = new Map();
  for (const event of events) {
    const key = slug(event.title);
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...existing, ...compact(event) } : event);
  }
  return [...byKey.values()];
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ""));
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
