import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadEnvFile } from "./env.mjs";

loadEnvFile();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "src", "mcu-collection.generated.json");

if (!hasTmdbCredentials()) {
  throw new Error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY before running this script.");
}

const phases = [
  {
    id: "phase-one",
    title: "Phase One",
    saga: "infinity",
    items: movies([
      [2008, "Iron Man"],
      [2008, "The Incredible Hulk"],
      [2010, "Iron Man 2"],
      [2011, "Thor"],
      [2011, "Captain America: The First Avenger"],
      [2012, "The Avengers"],
    ]),
  },
  {
    id: "phase-two",
    title: "Phase Two",
    saga: "infinity",
    items: movies([
      [2013, "Iron Man 3"],
      [2013, "Thor: The Dark World"],
      [2014, "Captain America: The Winter Soldier"],
      [2014, "Guardians of the Galaxy"],
      [2015, "Avengers: Age of Ultron"],
      [2015, "Ant-Man"],
    ]),
  },
  {
    id: "phase-three",
    title: "Phase Three",
    saga: "infinity",
    items: movies([
      [2016, "Captain America: Civil War"],
      [2016, "Doctor Strange"],
      [2017, "Guardians of the Galaxy Vol. 2"],
      [2017, "Spider-Man: Homecoming"],
      [2017, "Thor: Ragnarok"],
      [2018, "Black Panther"],
      [2018, "Avengers: Infinity War"],
      [2018, "Ant-Man and the Wasp"],
      [2019, "Captain Marvel"],
      [2019, "Avengers: Endgame"],
      [2019, "Spider-Man: Far From Home"],
    ]),
  },
  {
    id: "phase-four",
    title: "Phase Four",
    saga: "multiverse",
    items: [
      tv(2021, "WandaVision", 1),
      tv(2021, "The Falcon and the Winter Soldier", 1),
      movie(2021, "Black Widow"),
      tv(2021, "Loki", 1),
      movie(2021, "Shang-Chi and the Legend of the Ten Rings"),
      movie(2021, "Eternals"),
      tv(2021, "What If...?", 1),
      movie(2021, "Spider-Man: No Way Home"),
      tv(2021, "Hawkeye", 1),
      movie(2022, "Doctor Strange in the Multiverse of Madness"),
      tv(2022, "Moon Knight", 1),
      tv(2022, "Ms. Marvel", 1),
      movie(2022, "Thor: Love and Thunder"),
      tv(2022, "She-Hulk: Attorney at Law", 1),
      movie(2022, "Werewolf by Night"),
      movie(2022, "Black Panther: Wakanda Forever"),
      movie(2022, "The Guardians of the Galaxy Holiday Special"),
    ],
  },
  {
    id: "phase-five",
    title: "Phase Five",
    saga: "multiverse",
    items: [
      movie(2023, "Ant-Man and the Wasp: Quantumania"),
      movie(2023, "Guardians of the Galaxy Vol. 3"),
      tv(2023, "Secret Invasion", 1),
      movie(2023, "The Marvels"),
      tv(2023, "Loki", 2),
      tv(2023, "What If...?", 2),
      tv(2024, "Echo", 1),
      movie(2024, "Deadpool & Wolverine"),
      tv(2024, "Agatha All Along", 1),
      tv(2024, "What If...?", 3),
      movie(2025, "Captain America: Brave New World"),
      tv(2025, "Your Friendly Neighborhood Spider-Man", 1),
      tv(2025, "Daredevil: Born Again", 1),
      movie(2025, "Thunderbolts*"),
      tv(2025, "Ironheart", 1),
    ],
  },
  {
    id: "phase-six",
    title: "Phase Six",
    saga: "multiverse",
    items: [
      movie(2025, "The Fantastic Four: First Steps"),
      tv(2025, "Eyes of Wakanda", 1),
      tv(2025, "Marvel Zombies", 1),
      tv(2026, "Wonder Man", 1),
      tv(2026, "Daredevil: Born Again", 2),
      tv(2026, "VisionQuest", 1),
      movie(2026, "Spider-Man: Brand New Day"),
      movie(2026, "The Punisher: One Last Kill"),
      movie(2026, "Avengers: Doomsday"),
      tv(2026, "Your Friendly Neighborhood Spider-Man", 2),
      tv(2027, "Daredevil: Born Again", 3),
      movie(2027, "Avengers: Secret Wars"),
    ],
  },
];

const sections = [
  {
    id: "defenders",
    title: "Defenders Saga",
    items: ["Daredevil", "Jessica Jones", "Luke Cage", "Iron Fist", "The Punisher", "The Defenders"].map((title) =>
      tv(null, title, 1),
    ),
  },
  {
    id: "legacy-films",
    title: "Legacy Films",
    groups: [
      { id: "x-men", title: "X-Men", items: movies([[2000, "X-Men"], [2003, "X2"], [2006, "X-Men: The Last Stand"], [2009, "X-Men Origins: Wolverine"], [2011, "X-Men: First Class"], [2013, "The Wolverine"], [2014, "X-Men: Days of Future Past"], [2016, "Deadpool"], [2016, "X-Men: Apocalypse"], [2017, "Logan"], [2018, "Deadpool 2"], [2019, "Dark Phoenix"], [2020, "The New Mutants"]]) },
      { id: "spider-man", title: "Spider-Man", items: movies([[2002, "Spider-Man"], [2004, "Spider-Man 2"], [2007, "Spider-Man 3"], [2012, "The Amazing Spider-Man"], [2014, "The Amazing Spider-Man 2"]]) },
      { id: "blade", title: "Blade", items: movies([[1998, "Blade"], [2002, "Blade II"], [2004, "Blade: Trinity"]]) },
      { id: "fantastic-four", title: "Fantastic Four", items: movies([[2005, "Fantastic Four"], [2007, "Fantastic Four: Rise of the Silver Surfer"], [2015, "Fantastic Four"]]) },
      { id: "street-heroes", title: "Street Heroes", items: movies([[1989, "The Punisher"], [2003, "Daredevil"], [2004, "The Punisher"], [2005, "Elektra"], [2008, "Punisher: War Zone"]]) },
      { id: "misfits", title: "Misfits", items: movies([[1986, "Howard the Duck"], [1990, "Captain America"], [2003, "Hulk"], [2007, "Ghost Rider"], [2011, "Ghost Rider: Spirit of Vengeance"], [2018, "Venom"], [2022, "Morbius"], [2024, "Kraven the Hunter"]]) },
    ],
  },
  {
    id: "legacy-tv",
    title: "Legacy TV",
    items: [
      tv(null, "Agents of S.H.I.E.L.D.", 1),
      tv(null, "Agent Carter", 1),
      tv(null, "Runaways", 1),
      tv(null, "Cloak & Dagger", 1),
      tv(2017, "Inhumans", 1),
    ],
  },
  {
    id: "animation",
    title: "Animation",
    items: [
      tv(1966, "The Marvel Super Heroes", 1),
      tv(1967, "Spider-Man", 1),
      tv(1967, "Fantastic Four", 1),
      tv(1978, "The Fantastic Four", 1),
      tv(1979, "Spider-Woman", 1),
      tv(1981, "Spider-Man", 1),
      tv(1981, "Spider-Man and His Amazing Friends", 1),
      tv(1982, "The Incredible Hulk", 1),
      tv(1989, "Pryde of the X-Men", 1),
      tv(1992, "X-Men", 1),
      tv(1994, "Iron Man", 1),
      tv(1994, "Fantastic Four", 1),
      tv(1994, "Spider-Man", 1),
      tv(1996, "The Incredible Hulk", 1),
      tv(1998, "Silver Surfer", 1),
      tv(1999, "The Avengers: United They Stand", 1),
      tv(1999, "Spider-Man Unlimited", 1),
      tv(2000, "X-Men: Evolution", 1),
      tv(2001, "Mutant X", 1),
      tv(2003, "Spider-Man: The New Animated Series", 1),
      tv(2006, "Fantastic Four: World's Greatest Heroes", 1),
      tv(2008, "The Spectacular Spider-Man", 1),
      tv(2009, "Wolverine and the X-Men", 1),
      tv(2010, "The Avengers: Earth's Mightiest Heroes", 1),
      tv(2010, "Marvel Anime: Iron Man", 1),
      tv(2011, "Marvel Anime: Wolverine", 1),
      tv(2011, "Marvel Anime: X-Men", 1),
      tv(2011, "Marvel Anime: Blade", 1),
      tv(2012, "Ultimate Spider-Man", 1),
      tv(2013, "Avengers Assemble", 1),
      tv(2013, "Hulk and the Agents of S.M.A.S.H.", 1),
      tv(2015, "Guardians of the Galaxy", 1),
      tv(2017, "Marvel's Spider-Man", 1),
      tv(2021, "M.O.D.O.K.", 1),
      tv(2021, "Hit-Monkey", 1),
      tv(2021, "What If...?", 1),
      tv(2023, "Moon Girl and Devil Dinosaur", 1),
      tv(2024, "X-Men '97", 1),
      tv(2025, "Your Friendly Neighborhood Spider-Man", 1),
      tv(2025, "Eyes of Wakanda", 1),
      tv(2025, "Marvel Zombies", 1),
    ],
  },
];

const oneShots = [
  oneShot(2011, "The Consultant", "Thor"),
  oneShot(2011, "A Funny Thing Happened on the Way to Thor's Hammer", "Captain America: The First Avenger"),
  oneShot(2012, "Item 47", "The Avengers"),
  oneShot(2013, "Agent Carter", "Iron Man 3"),
  oneShot(2014, "All Hail the King", "Thor: The Dark World"),
  oneShot(2016, "Team Thor", "Captain America: Civil War"),
  oneShot(2017, "Team Thor: Part 2", "Doctor Strange"),
  oneShot(2018, "Team Darryl", "Thor: Ragnarok"),
];

const allEntries = [
  ...phases.flatMap((phase) => phase.items),
  ...sections.flatMap(getSectionItems),
  ...oneShots,
];
const byKey = new Map();
for (const entry of allEntries) byKey.set(`${entry.type}:${entry.title}:${entry.year ?? ""}:${entry.seasonNumber ?? ""}`, entry);

const detailById = {};
for (const entry of byKey.values()) {
  const result = await hydrateEntry(entry);
  detailById[entry.id] = result;
}

for (const shot of oneShots) {
  const shotDetail = detailById[shot.id];
  const releaseEntry = [...phases.flatMap((phase) => phase.items), ...sections.flatMap(getSectionItems)].find(
    (entry) => entry.type === "movie" && entry.title === shot.releaseTitle,
  );
  if (!releaseEntry || !shotDetail) continue;
  detailById[releaseEntry.id].oneShots = [...(detailById[releaseEntry.id].oneShots ?? []), shotDetail];
}

const collection = {
  id: "mcu",
  title: "Marvel Cinematic Library",
  description: "A curated Marvel shelf for sagas, legacy branches, defenders, animation, and timeline wandering.",
  heroImage: "./assets/collections/mcu/mcu-hero.png",
  buttonImage: "./assets/collections/mcu/mcu-button.png",
  phases,
  sections,
  oneShots,
};

await writeFile(
  outputPath,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), source: "TMDB", collection, detailById }, null, 2)}\n`,
);

console.log(`Wrote ${Object.keys(detailById).length} MCU records to ${outputPath}`);

function movies(rows) {
  return rows.map(([year, title]) => movie(year, title));
}

function movie(year, title) {
  return { type: "movie", id: `mcu-movie-${slugify(title)}-${year ?? "tba"}`, title, year, mediaType: "movie" };
}

function tv(year, title, seasonNumber = 1) {
  return {
    type: "tv",
    id: `mcu-tv-${slugify(title)}-${year ?? "tba"}-s${String(seasonNumber).padStart(2, "0")}`,
    title,
    year,
    seasonNumber,
    mediaType: "tv",
  };
}

function oneShot(year, title, releaseTitle) {
  return { ...movie(year, title), id: `mcu-one-shot-${slugify(title)}-${year ?? "tba"}`, mediaType: "one-shot", releaseTitle };
}

function getSectionItems(section) {
  return section.groups ? section.groups.flatMap((group) => group.items) : section.items;
}

async function hydrateEntry(entry) {
  const override = getTmdbOverride(entry);
  const result = override ? { id: override } : await search(entry);
  if (!result) return normalizeFallback(entry);
  const details = await fetchDetails(entry, result.id);
  return entry.type === "movie" ? normalizeMovie(entry, details) : normalizeTv(entry, details);
}

async function search(entry) {
  const withYear = await searchWithYear(entry, true);
  return withYear ?? searchWithYear(entry, false);
}

async function searchWithYear(entry, includeYear) {
  const url = new URL(`https://api.themoviedb.org/3/search/${entry.type === "movie" ? "movie" : "tv"}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("query", entry.title);
  if (includeYear && entry.year) {
    if (entry.type === "movie") url.searchParams.set("year", String(entry.year));
    else url.searchParams.set("first_air_date_year", String(entry.year));
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB search failed for ${entry.title}: ${response.status}`);
  const json = await response.json();
  return json.results?.[0] ?? null;
}

function getTmdbOverride(entry) {
  const key = `${entry.type}:${entry.title}:${entry.year ?? ""}:${entry.seasonNumber ?? ""}`;
  const overrides = {
    "tv:Loki:2021:1": 84958,
    "tv:Loki:2023:2": 84958,
    "tv:What If...?:2021:1": 91363,
    "tv:What If...?:2023:2": 91363,
    "tv:What If...?:2024:3": 91363,
    "tv:Daredevil::1": 61889,
    "tv:The Defenders::1": 62285,
    "tv:Marvel Anime: Blade:2011:1": 62798,
    "movie:X-Men:2000:": 36657,
    "movie:X2:2003:": 36658,
    "movie:Fantastic Four:2005:": 9738,
    "movie:The Punisher:1989:": 8867,
  };
  return overrides[key] ?? null;
}

async function fetchDetails(entry, tmdbId) {
  const endpoint = entry.type === "movie" ? "movie" : "tv";
  const url = new URL(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("append_to_response", entry.type === "movie" ? "credits,release_dates,external_ids" : `credits,content_ratings,season/${entry.seasonNumber}`);
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB detail fetch failed for ${entry.title}: ${response.status}`);
  return response.json();
}

function normalizeMovie(entry, details) {
  const director = details.credits?.crew?.find((person) => person.job === "Director");
  const certification = getCertification(details.release_dates?.results, "US") ?? getCertification(details.release_dates?.results) ?? "NR";
  return {
    ...entry,
    matched: true,
    tmdbId: details.id,
    title: details.title ?? entry.title,
    year: details.release_date ? Number(details.release_date.slice(0, 4)) : entry.year,
    country: details.production_countries?.map((country) => country.name).filter(Boolean).join(", ") || "Marvel",
    genre: details.genres?.[0]?.name ?? "Superhero",
    genres: details.genres?.map((genre) => genre.name) ?? ["Superhero"],
    status: "complete",
    posterCode: buildPosterCode(details.title ?? entry.title),
    posterUrl: details.poster_path ? image("w342", details.poster_path) : null,
    backdropUrl: details.backdrop_path ? image("w780", details.backdrop_path) : null,
    summary: details.overview ?? "",
    releaseDate: details.release_date ?? entry.year,
    rating: certification,
    runtime: details.runtime ?? null,
    director: director?.name ?? null,
    ratings: { tmdb: details.vote_average ?? null, imdb: null, rottenTomatoesCritic: null, rottenTomatoesAudience: null },
    cast: (details.credits?.cast ?? []).slice(0, 30).map(normalizePerson),
  };
}

function normalizeTv(entry, details) {
  const season = details[`season/${entry.seasonNumber}`] ?? {};
  const rating = details.content_ratings?.results?.find((item) => item.iso_3166_1 === "US")?.rating ?? "";
  return {
    ...entry,
    matched: true,
    tmdbId: details.id,
    title: details.name ?? entry.title,
    year: details.first_air_date ? Number(details.first_air_date.slice(0, 4)) : entry.year,
    years: details.first_air_date ? `${details.first_air_date.slice(0, 4)}-` : entry.year ? String(entry.year) : "TBA",
    country: details.origin_country?.join("/") || "Marvel",
    genre: details.genres?.[0]?.name ?? "TV",
    genres: details.genres?.map((genre) => genre.name) ?? ["TV"],
    status: "complete",
    posterCode: `S${entry.seasonNumber}`,
    posterUrl: season.poster_path ? image("w342", season.poster_path) : details.poster_path ? image("w342", details.poster_path) : null,
    showPosterUrl: details.poster_path ? image("w342", details.poster_path) : null,
    backdropUrl: details.backdrop_path ? image("w780", details.backdrop_path) : null,
    summary: season.overview || details.overview || "",
    firstAirDate: details.first_air_date ?? null,
    rating,
    averageRuntime: details.episode_run_time?.[0] ?? null,
    season: {
      seasonNumber: entry.seasonNumber,
      title: season.name ?? `Season ${entry.seasonNumber}`,
      airDate: season.air_date ?? details.first_air_date ?? null,
      overview: season.overview || details.overview || "",
      posterUrl: season.poster_path ? image("w342", season.poster_path) : details.poster_path ? image("w342", details.poster_path) : null,
      episodes: (season.episodes ?? []).map((episode) => ({
        id: `${entry.id}-e${String(episode.episode_number).padStart(2, "0")}`,
        episodeNumber: episode.episode_number,
        title: episode.name ?? `Episode ${episode.episode_number}`,
        overview: episode.overview ?? "",
        airDate: episode.air_date ?? null,
        runtime: episode.runtime ?? null,
        voteAverage: episode.vote_average ?? null,
        stillUrl: episode.still_path ? image("w500", episode.still_path) : null,
      })),
    },
    ratings: { tmdb: details.vote_average ?? null, imdb: null, rottenTomatoesCritic: null, rottenTomatoesAudience: null },
    cast: (details.credits?.cast ?? []).slice(0, 30).map(normalizePerson),
  };
}

function normalizeFallback(entry) {
  return { ...entry, matched: false, status: "missing-poster", posterCode: buildPosterCode(entry.title), country: "Marvel", genre: "Marvel" };
}

function normalizePerson(person) {
  return {
    id: `tmdb-person-${person.id}`,
    tmdbId: person.id,
    name: person.name,
    role: person.character || person.job || "Cast",
    imageUrl: person.profile_path ? image("w185", person.profile_path) : null,
  };
}

function getCertification(releaseCountries = [], countryCode = null) {
  const country = countryCode
    ? releaseCountries.find((entry) => entry.iso_3166_1 === countryCode)
    : releaseCountries.find((entry) => entry.release_dates?.some((release) => release.certification));
  return country?.release_dates?.find((release) => release.certification)?.certification || null;
}

function image(size, path) {
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function buildPosterCode(title) {
  return title
    .split(/\s+/)
    .filter((word) => !/^(the|and|of|in|a|an)$/i.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function slugify(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replaceAll(" ", "-");
}

function hasTmdbCredentials() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY);
}

function tmdbHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
