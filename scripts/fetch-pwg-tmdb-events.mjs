import { readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const headers = process.env.TMDB_READ_ACCESS_TOKEN
  ? { Authorization: `Bearer ${process.env.TMDB_READ_ACCESS_TOKEN}` }
  : {};
const companyEvents = await fetchCompanyEvents();
const searchEvents = await fetchSearchEvents();
const events = mergeEvents([...companyEvents, ...searchEvents]);
const fandomEvents = await readJsonIfExists("tmp-pwg-events.json", []);

const mergedEvents = events.map((event) => mergeMetadata(event, fandomEvents));

mergedEvents.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
await writeFile("tmp-pwg-tmdb-events.json", JSON.stringify(mergedEvents, null, 2));
console.log(`Wrote ${mergedEvents.length} PWG TMDB events.`);

async function fetchCompanyEvents() {
  const events = [];
  for (let page = 1; page <= 20; page += 1) {
    const payload = await tmdbJson(`company/42404/movies`, { page });
    events.push(...(payload.results ?? []).map(movieToEvent).filter(Boolean));
    if (page >= (payload.total_pages ?? 1)) break;
    await delay(120);
  }
  return events;
}

async function fetchSearchEvents() {
  const first = await tmdbJson("search/movie", { query: "PWG", page: 1 });
  const pageCount = Math.min(first.total_pages ?? 1, 25);
  const events = (first.results ?? []).map(movieToEvent).filter(Boolean);

  for (let page = 2; page <= pageCount; page += 1) {
    const payload = await tmdbJson("search/movie", { query: "PWG", page });
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
  if (!movie.release_date || !/^PWG(?::|\s+-|\s)/i.test(rawTitle)) return null;
  const title = rawTitle
    .replace(/^PWG\s*:\s*/i, "")
    .replace(/^PWG\s+-\s+/i, "")
    .replace(/^PWG\s+/i, "")
    .trim();
  if (!title) return null;

  return {
    id: `pwg-${slug(title)}-${movie.release_date}`,
    tmdbId: movie.id,
    title,
    date: movie.release_date,
    year: Number(movie.release_date.slice(0, 4)),
    type: "special",
    posterCode: "PWG",
    eventLabel: "Event",
    metadataSource: "TMDB",
    summary: movie.overview || null,
    posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : null,
    backdropUrl: movie.backdrop_path ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` : null,
    voteAverage: movie.vote_average ?? null,
  };
}

function mergeEvents(events) {
  const byKey = new Map();
  for (const event of events) {
    const key = `${event.date}|${slug(event.title)}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...event, ...existing, ...compact(event) } : event);
  }
  return [...byKey.values()];
}

function mergeMetadata(event, metadataEvents) {
  const metadata =
    metadataEvents.find((item) => item.date === event.date && similarTitle(item.title, event.title)) ??
    metadataEvents.find((item) => similarTitle(item.title, event.title));
  if (!metadata) return event;

  return {
    ...event,
    venue: metadata.venue || event.venue,
    location: metadata.location || event.location,
    attendance: metadata.attendance || event.attendance,
    matchCount: metadata.matchCount || event.matchCount,
    metadataSource: "TMDB + Fandom",
  };
}

function similarTitle(a, b) {
  const left = slug(a);
  const right = slug(b);
  return left === right || left.includes(right) || right.includes(left);
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ""));
}

async function readJsonIfExists(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
