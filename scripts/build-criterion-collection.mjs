import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "assets", "collections", "criterion", "eclipse-series.txt");
const eclipseCoverMapPath = path.join(root, "assets", "collections", "criterion", "eclipse", "eclipse-cover-map.json");
const eclipseMetadataPath = path.join(root, "assets", "collections", "criterion", "eclipse-metadata.json");
const outputPath = path.join(root, "src", "criterion-collection.generated.json");
loadDotEnv(path.join(root, ".env"));

const criterionProgress = {
  "jp-seven-samurai": 28,
  "fr-portrait": 54,
  "criterion-videodrome-1983": 18,
};

const criterionMovies = [
  movie(1954, "Seven Samurai", "jp-seven-samurai", "Japanese", "Action", "Akira Kurosawa"),
  movie(1959, "The 400 Blows", "fr-400-blows", "French", "Drama", "François Truffaut"),
  movie(1960, "Breathless", "fr-breathless", "French", "Crime", "Jean-Luc Godard"),
  movie(1967, "Playtime", "fr-playtime", "French", "Comedy", "Jacques Tati"),
  movie(1993, "Naked", "uk-naked", "British", "Drama", "Mike Leigh"),
  movie(2019, "Portrait of a Lady on Fire", "fr-portrait", "French", "Drama", "Céline Sciamma"),
  movie(1986, "The Fly", "criterion-the-fly-1986", "Canadian/American", "Horror", "David Cronenberg"),
  movie(1983, "Videodrome", "criterion-videodrome-1983", "Canadian", "Horror", "David Cronenberg"),
  movie(1991, "Naked Lunch", "criterion-naked-lunch-1991", "Canadian/British/Japanese", "Drama", "David Cronenberg"),
  movie(1998, "Rushmore", "criterion-rushmore-1998", "American", "Comedy", "Wes Anderson"),
  movie(2014, "The Grand Budapest Hotel", "criterion-grand-budapest-hotel-2014", "American/German", "Comedy", "Wes Anderson"),
  movie(2023, "Asteroid City", "criterion-asteroid-city-2023", "American", "Comedy", "Wes Anderson"),
  movie(1957, "The Seventh Seal", "criterion-the-seventh-seal-1957", "Swedish", "Drama", "Ingmar Bergman"),
  movie(1957, "Wild Strawberries", "criterion-wild-strawberries-1957", "Swedish", "Drama", "Ingmar Bergman"),
  movie(1966, "Persona", "criterion-persona-1966", "Swedish", "Drama", "Ingmar Bergman"),
  movie(1962, "The Tale of Zatoichi", "criterion-the-tale-of-zatoichi-1962", "Japanese", "Action", "Kenji Misumi"),
  movie(1964, "Zatoichi and the Chest of Gold", "criterion-zatoichi-and-the-chest-of-gold-1964", "Japanese", "Action", "Kazuo Ikehiro"),
  movie(1970, "Zatoichi Goes to the Fire Festival", "criterion-zatoichi-goes-to-the-fire-festival-1970", "Japanese", "Action", "Kenji Misumi"),
  movie(1950, "Rashomon", "criterion-rashomon-1950", "Japanese", "Drama", "Akira Kurosawa"),
  movie(1952, "Ikiru", "criterion-ikiru-1952", "Japanese", "Drama", "Akira Kurosawa"),
  movie(1981, "Thief", "criterion-thief-1981", "American", "Crime", "Michael Mann"),
  movie(1983, "Risky Business", "criterion-risky-business-1983", "American", "Comedy", "Paul Brickman"),
  movie(1977, "Sorcerer", "criterion-sorcerer-1977", "American", "Thriller", "William Friedkin"),
  movie(1990, "Paris Is Burning", "criterion-paris-is-burning-1990", "American", "Documentary", "Jennie Livingston"),
  movie(1996, "The Watermelon Woman", "criterion-the-watermelon-woman-1996", "American", "Comedy", "Cheryl Dunye"),
  movie(1977, "House", "criterion-house-1977", "Japanese", "Horror", "Nobuhiko Obayashi"),
  movie(1960, "Eyes Without a Face", "criterion-eyes-without-a-face-1960", "French", "Horror", "Georges Franju"),
  movie(1968, "Kuroneko", "criterion-kuroneko-1968", "Japanese", "Horror", "Kaneto Shindo"),
  movie(1962, "Jules and Jim", "criterion-jules-and-jim-1962", "French", "Drama", "Francois Truffaut"),
  movie(1962, "Cleo from 5 to 7", "criterion-cleo-from-5-to-7-1962", "French", "Drama", "Agnes Varda"),
  movie(1948, "Bicycle Thieves", "criterion-bicycle-thieves-1948", "Italian", "Drama", "Vittorio De Sica"),
  movie(1945, "Rome, Open City", "criterion-rome-open-city-1945", "Italian", "Drama", "Roberto Rossellini"),
  movie(1952, "Umberto D.", "criterion-umberto-d-1952", "Italian", "Drama", "Vittorio De Sica"),
  movie(1949, "The Third Man", "criterion-the-third-man-1949", "British", "Noir", "Carol Reed"),
  movie(1945, "Detour", "criterion-detour-1945", "American", "Noir", "Edgar G. Ulmer"),
  movie(1950, "Night and the City", "criterion-night-and-the-city-1950", "British/American", "Noir", "Jules Dassin"),
  movie(1997, "Insomnia", "criterion-insomnia-1997", "Norwegian", "Noir", "Erik Skjoldbjaerg"),
  movie(2009, "The Girl with the Dragon Tattoo", "criterion-the-girl-with-the-dragon-tattoo-2009", "Swedish", "Noir", "Niels Arden Oplev"),
  movie(2011, "Headhunters", "criterion-headhunters-2011", "Norwegian", "Noir", "Morten Tyldum"),
  movie(1996, "Bound", "criterion-bound-1996", "American", "Noir", "The Wachowskis"),
  movie(2013, "Stranger by the Lake", "criterion-stranger-by-the-lake-2013", "French", "Noir", "Alain Guiraudie"),
  movie(2018, "Knife+Heart", "criterion-knife-heart-2018", "French", "Noir", "Yann Gonzalez"),
];

const worldCinemaProjectVolumes = [
  worldCinemaVolume(1, [
    worldCinemaMovie(1, 1, "Touki Bouki", 1973, { country: "Senegal", director: "Djibril Diop Mambety" }),
    worldCinemaMovie(1, 2, "Redes", 1936, { country: "Mexico", director: "Fred Zinnemann and Emilio Gomez Muriel" }),
    worldCinemaMovie(1, 3, "A River Called Titas", 1973, { country: "Bangladesh/India", director: "Ritwik Ghatak" }),
    worldCinemaMovie(1, 4, "Dry Summer", 1964, { country: "Turkey", director: "Metin Erksan" }),
    worldCinemaMovie(1, 5, "Trances", 1981, { country: "Morocco", director: "Ahmed El Maanouni" }),
    worldCinemaMovie(1, 6, "The Housemaid", 1960, { country: "South Korea", director: "Kim Ki-young" }),
  ]),
  worldCinemaVolume(2, [
    worldCinemaMovie(2, 1, "Insiang", 1976, { country: "Philippines", director: "Lino Brocka" }),
    worldCinemaMovie(2, 2, "Mysterious Object at Noon", 2000, { country: "Thailand", director: "Apichatpong Weerasethakul" }),
    worldCinemaMovie(2, 3, "Revenge", 1989, { country: "Soviet Union", director: "Ermek Shinarbaev" }),
    worldCinemaMovie(2, 4, "Limite", 1931, { country: "Brazil", director: "Mario Peixoto" }),
    worldCinemaMovie(2, 5, "Law of the Border", 1966, { country: "Turkey", director: "Lutfi O. Akad" }),
    worldCinemaMovie(2, 6, "Taipei Story", 1985, { country: "Taiwan", director: "Edward Yang" }),
  ]),
  worldCinemaVolume(3, [
    worldCinemaMovie(3, 1, "Lucia", 1968, { country: "Cuba", director: "Humberto Solas", displayTitle: "Lucía", sourceFileTitle: "Lucía" }),
    worldCinemaMovie(3, 2, "After the Curfew", 1954, { country: "Indonesia", director: "Usmar Ismail", searchTitle: "Lewat Djam Malam" }),
    worldCinemaMovie(3, 3, "Pixote", 1980, { country: "Brazil", director: "Hector Babenco" }),
    worldCinemaMovie(3, 4, "Two Monks", 1934, { country: "Mexico", director: "Juan Bustillo Oro", searchTitle: "Dos monjes", sourceFileTitle: "Dos monjes" }),
    worldCinemaMovie(3, 5, "Soleil O", 1970, { country: "Mauritania", director: "Med Hondo", displayTitle: "Soleil Ô", sourceFileTitle: "Soleil Ô", searchTitle: "Soleil O" }),
    worldCinemaMovie(3, 6, "Downpour", 1972, { country: "Iran", director: "Bahram Beyzaie", searchTitle: "Ragbar" }),
  ]),
  worldCinemaVolume(4, [
    worldCinemaMovie(4, 1, "Sambizanga", 1972, { country: "Angola", director: "Sarah Maldoror" }),
    worldCinemaMovie(4, 2, "Prisoners of the Land", 1939, { country: "Argentina", director: "Mario Soffici", searchTitle: "Prisioneros de la tierra", sourceFileTitle: "Prisioneros de la tierra" }),
    worldCinemaMovie(4, 3, "Chess of the Wind", 1976, { country: "Iran", director: "Mohammad Reza Aslani" }),
    worldCinemaMovie(4, 4, "Muna Moto", 1975, { country: "Cameroon", director: "Dikongue-Pipa" }),
    worldCinemaMovie(4, 5, "Two Girls on the Street", 1939, { country: "Hungary", director: "Andre de Toth" }),
    worldCinemaMovie(4, 6, "Kalpana", 1948, { country: "India", director: "Uday Shankar" }),
  ]),
  worldCinemaVolume(5, [
    worldCinemaMovie(5, 1, "Chronicle of the Years of Fire", 1975, { country: "Algeria", director: "Mohammed Lakhdar-Hamina" }),
    worldCinemaMovie(5, 2, "Yam daabo", 1987, { country: "Burkina Faso", director: "Idrissa Ouedraogo", searchTitle: "The Choice", sourceFileTitle: "Yam daabo" }),
    worldCinemaMovie(5, 3, "Kummatty", 1979, { country: "India", director: "G. Aravindan" }),
    worldCinemaMovie(5, 4, "The Fall of Otrar", 1991, { country: "Kazakhstan", director: "Ardak Amirkulov", sourceOrder: 5 }),
  ]),
];

const worldCinemaProjectFilms = worldCinemaProjectVolumes.flatMap((set) => set.films);

const subCollections = [
  seedCollection("criterion-bergman-cinema", "Bergman Cinema", "Boxed Sets", ["criterion-the-seventh-seal-1957", "criterion-wild-strawberries-1957", "criterion-persona-1966"]),
  seedCollection("criterion-zatoichi", "Zatoichi", "Boxed Sets", ["criterion-the-tale-of-zatoichi-1962", "criterion-zatoichi-and-the-chest-of-gold-1964", "criterion-zatoichi-goes-to-the-fire-festival-1970"]),
  seedCollection("criterion-world-cinema-project", "Martin Scorsese's World Cinema Project", "Boxed Sets", [], {
    description: "Restored films from around the world, arranged across five Criterion volumes.",
    buttonImage: "./assets/collections/criterion/world-cinema-project-button-v2-display.webp",
    heroImage: "./assets/collections/criterion/world-cinema-project/volume-1.jpg",
    posterA: "#050505",
    posterB: "#f05f4a",
    setIds: worldCinemaProjectVolumes.map((set) => set.id),
  }),
  seedCollection("criterion-ak-100", "AK 100: The Works of Akira Kurosawa", "Boxed Sets", ["criterion-rashomon-1950", "criterion-ikiru-1952", "jp-seven-samurai"]),
  seedCollection("criterion-cronenberg", "David Cronenberg", "Director Showcase", ["criterion-the-fly-1986", "criterion-videodrome-1983", "criterion-naked-lunch-1991"], {
    description: "Body horror, media hallucination, and literary mutation.",
    buttonImage: "./assets/collections/criterion/director-showcase/david-cronenberg-square-button-display.webp",
    posterA: "#261d18",
    posterB: "#9a4637",
  }),
  seedCollection("criterion-wes-anderson", "Wes Anderson", "Director Showcase", ["criterion-rushmore-1998", "criterion-grand-budapest-hotel-2014", "criterion-asteroid-city-2023"], {
    description: "Symmetry, grief, storybooks, and elaborate little worlds.",
    buttonImage: "./assets/collections/criterion/director-showcase/wes-anderson-square-button-display.webp",
    posterA: "#3b2c2a",
    posterB: "#d0a26a",
  }),
  seedCollection("criterion-synth-soundtracks", "Synth Soundtracks", "Criterion Channel Collections", ["criterion-thief-1981", "criterion-risky-business-1983", "criterion-sorcerer-1977"], {
    buttonImage: "./assets/collections/criterion/channel-collections/synth-soundtracks-button.png",
  }),
  seedCollection("criterion-lgbtq-favorites", "LGBTQ+ Favorites", "Criterion Channel Collections", ["fr-portrait", "criterion-paris-is-burning-1990", "criterion-the-watermelon-woman-1996"]),
  seedCollection("criterion-art-house-horror", "Art-House Horror", "Criterion Channel Collections", ["criterion-house-1977", "criterion-eyes-without-a-face-1960", "criterion-kuroneko-1968"]),
  seedCollection("criterion-french-new-wave", "French New Wave", "Movements", ["fr-breathless", "criterion-jules-and-jim-1962", "criterion-cleo-from-5-to-7-1962"], {
    buttonImage: "./assets/collections/criterion/french-new-wave-button.png",
  }),
  seedCollection("criterion-italian-neorealism", "Italian Neorealism", "Movements", ["criterion-bicycle-thieves-1948", "criterion-rome-open-city-1945", "criterion-umberto-d-1952"], {
    buttonImage: "./assets/collections/criterion/italian-neorealism-button.png",
  }),
  seedCollection("criterion-classic-noir", "Classic Noir", "Noir Collections", ["criterion-the-third-man-1949", "criterion-detour-1945", "criterion-night-and-the-city-1950"], {
    buttonImage: "./assets/collections/criterion/classic-noir-button.png",
  }),
  seedCollection("criterion-nordic-noir", "Nordic Noir", "Noir Collections", ["criterion-insomnia-1997", "criterion-the-girl-with-the-dragon-tattoo-2009", "criterion-headhunters-2011"], {
    buttonImage: "./assets/collections/criterion/nordic-noir-button.png",
  }),
  seedCollection("criterion-queer-noir", "Queer Noir", "Noir Collections", ["criterion-bound-1996", "criterion-stranger-by-the-lake-2013", "criterion-knife-heart-2018"], {
    buttonImage: "./assets/collections/criterion/queer-noir-button.png",
  }),
];

const collectionGroups = [
  { id: "boxed-sets", title: "Boxed Sets", collectionIds: subCollections.filter((item) => item.category === "Boxed Sets").map((item) => item.id) },
  { id: "director-showcase", title: "Director Showcase", collectionIds: subCollections.filter((item) => item.category === "Director Showcase").map((item) => item.id) },
  { id: "criterion-channel", title: "Criterion Channel Collections", collectionIds: subCollections.filter((item) => item.category === "Criterion Channel Collections").map((item) => item.id) },
  { id: "movements", title: "Movements", collectionIds: subCollections.filter((item) => item.category === "Movements").map((item) => item.id) },
  { id: "noir", title: "Noir Collections", collectionIds: subCollections.filter((item) => item.category === "Noir Collections").map((item) => item.id) },
];

const collection = {
  id: "criterion",
  title: "The Criterion Collection",
  description: "A curated archive for world cinema, boxed sets, Eclipse discoveries, and director shelves.",
  heroImage: "./assets/collections/criterion/landing-hero.png",
  buttonImage: "./assets/collections/criterion/criterion-button.png",
  archiveHero: "./assets/collections/criterion/archive-hero.png",
  collectionsHero: "./assets/collections/criterion/collections-hero.png",
  eclipseHero: "./assets/collections/criterion/eclipse-hero.png",
};

const eclipseSets = parseEclipseSeries(await readFile(sourcePath, "utf8"));
applyEclipseCovers(eclipseSets, readOptionalJson(eclipseCoverMapPath, { sets: {}, films: {} }));
applyEclipseMetadata(eclipseSets, readOptionalJson(eclipseMetadataPath, { sets: {}, films: {} }));
const eclipseFilms = eclipseSets.flatMap((set) => set.films);
const hydratedCriterionMovies = await hydrateMovies([...criterionMovies, ...worldCinemaProjectFilms]);
const hydratedWorldCinemaFilmsById = Object.fromEntries(hydratedCriterionMovies.filter((item) => item.worldCinemaProject).map((item) => [item.id, item]));
const worldCinemaProjectSets = worldCinemaProjectVolumes.map((set) => ({
  ...set,
  films: set.films.map((film) => hydratedWorldCinemaFilmsById[film.id] ?? film),
}));
const detailById = Object.fromEntries([...hydratedCriterionMovies, ...eclipseFilms, ...worldCinemaProjectSets].map((item) => [item.id, item]));

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "Tobytube Criterion seed",
      collection,
      filters: ["Year", "Director", "Genre", "Country", "Actor", "Decade", "Language", "Runtime", "Format", "Spine number"],
      archiveItems: hydratedCriterionMovies,
      subCollections,
      collectionGroups,
      eclipseSets,
      worldCinemaProjectSets,
      detailById,
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${hydratedCriterionMovies.length} Criterion archive records and ${eclipseSets.length} Eclipse sets to ${outputPath}`);

function parseEclipseSeries(text) {
  const sets = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line === "Criterion Eclipse Series") continue;

    const setMatch = line.match(/^(\d+)\.\s+(.+?)(?:\s+\((\d{4})\))?$/);
    if (setMatch) {
      current = {
        id: `criterion-eclipse-${String(setMatch[1]).padStart(2, "0")}-${slugify(setMatch[2])}`,
        number: Number(setMatch[1]),
        title: setMatch[2],
        year: setMatch[3] ? Number(setMatch[3]) : null,
        mediaType: "criterion-eclipse-set",
        status: "complete",
        posterCode: `E${String(setMatch[1]).padStart(2, "0")}`,
        posterA: "#171410",
        posterB: "#c5a46a",
        summary: `Official Criterion synopsis pending for Eclipse ${String(setMatch[1]).padStart(2, "0")}: ${setMatch[2]}.`,
        productUrl: null,
        films: [],
      };
      sets.push(current);
      continue;
    }

    if (!current) continue;
    const filmLine = line.replace(/^[•*-]\s*/, "");
    const filmMatch = filmLine.match(/^(.+?)\s+\((\d{4})(?:,[^)]+)?\)$/);
    const title = filmMatch ? filmMatch[1] : filmLine;
    const year = filmMatch ? Number(filmMatch[2]) : current.year;
    current.films.push(movie(year, title, `criterion-eclipse-${String(current.number).padStart(2, "0")}-${slugify(title)}-${year ?? "tba"}`, "Criterion", "World Cinema", null, current.id));
  }

  return sets;
}

function applyEclipseCovers(sets, coverMap) {
  for (const set of sets) {
    const setCover = coverMap.sets?.[String(set.number)];
    if (setCover?.path) {
      set.posterUrl = setCover.path;
      set.posterCode = null;
      set.coverSourceName = setCover.sourceName ?? null;
    }

    const filmCovers = coverMap.films?.[String(set.number)] ?? [];
    if (filmCovers.length) {
      set.films = filmCovers.map((cover) => {
        const existing = findEclipseSeedFilm(cover, set.films);
        const film =
          existing ??
          movie(cover.year, cover.title, `criterion-eclipse-${String(set.number).padStart(2, "0")}-${slugify(cover.title)}-${cover.year ?? "tba"}`, "Criterion", "World Cinema", null, set.id);
        return {
          ...film,
          title: cover.title,
          year: cover.year ?? film.year,
          posterUrl: cover.path,
          posterCode: null,
          coverSourceName: cover.sourceName ?? null,
        };
      });
    }

    set.films.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title));
  }
}

function applyEclipseMetadata(sets, metadata) {
  for (const set of sets) {
    const setMetadata = metadata.sets?.[String(set.number)];
    if (setMetadata) {
      set.summary = setMetadata.summary ?? setMetadata.description ?? set.summary ?? null;
      set.productUrl = setMetadata.productUrl ?? set.productUrl ?? null;
      set.metadataSource = setMetadata.source ?? set.metadataSource ?? null;
    }

    const filmMetadata = metadata.films?.[String(set.number)] ?? [];
    for (const film of set.films) {
      const match = findEclipseFilmMetadata(film, filmMetadata);
      if (!match) continue;
      Object.assign(film, {
        summary: match.summary ?? match.description ?? film.summary,
        country: match.country ?? film.country,
        director: match.director ?? film.director,
        runtime: match.runtime ?? match.length ?? film.runtime,
        language: match.language ?? film.language,
        aspectRatio: match.aspectRatio ?? film.aspectRatio ?? null,
        colorFormat: match.colorFormat ?? match.color ?? film.colorFormat ?? null,
        productUrl: match.productUrl ?? film.productUrl ?? null,
        metadataSource: match.source ?? film.metadataSource ?? null,
      });
    }
  }
}

function findEclipseFilmMetadata(film, entries) {
  const filmTitle = looseTitle(film.title);
  return (
    entries.find((entry) => entry.year === film.year && looseTitle(entry.title) === filmTitle) ??
    entries.find((entry) => entry.year === film.year && (looseTitle(entry.title).includes(filmTitle) || filmTitle.includes(looseTitle(entry.title)))) ??
    null
  );
}

function findEclipseSeedFilm(cover, films) {
  const coverTitle = looseTitle(cover.title);
  return (
    films.find((film) => film.year === cover.year && looseTitle(film.title) === coverTitle) ??
    films.find((film) => film.year === cover.year && (looseTitle(film.title).includes(coverTitle) || coverTitle.includes(looseTitle(film.title)))) ??
    null
  );
}

function readOptionalJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function movie(year, title, id = null, country = "Criterion", genre = "World Cinema", director = null, eclipseSetId = null, options = {}) {
  return {
    id: id ?? `criterion-${slugify(title)}-${year ?? "tba"}`,
    mediaType: "movie",
    collectionTags: ["Criterion"],
    eclipseSetId,
    title,
    year,
    country,
    genre,
    status: "complete",
    posterA: "#181512",
    posterB: "#c0a06a",
    posterUrl: options.posterUrl ?? null,
    posterCode: buildPosterCode(title),
    watchProgress: criterionProgress[id] ?? 0,
    inWatchlist: false,
    addedAt: year ? `${year}-01-01` : "2000-01-01",
    tmdbType: "movie",
    summary: director ? `${title} sits in the Criterion proof-of-concept archive under ${director}.` : `${title} is seeded for the Criterion collection archive.`,
    director,
    language: "Unknown",
    runtime: null,
    rating: "NR",
    genres: [genre],
    ratings: {},
    cast: [],
    ...options,
  };
}

function seedCollection(id, title, category, itemIds, options = {}) {
  return {
    id,
    title,
    category,
    description: options.description ?? `${title} is a Criterion proof-of-concept shelf.`,
    itemIds,
    buttonImage: options.buttonImage ?? null,
    heroImage: options.heroImage ?? null,
    posterA: options.posterA ?? "#201a14",
    posterB: options.posterB ?? "#c5a46a",
    setIds: options.setIds ?? null,
  };
}

async function hydrateMovies(items) {
  if (!hasTmdbAuth()) return items;
  const hydrated = [];
  for (const item of items) {
    hydrated.push(await hydrateMovie(item));
    await sleep(80);
  }
  return hydrated;
}

async function hydrateMovie(item) {
  const result = await searchMovie(item.searchTitle ?? item.title, item.year);
  if (!result?.id) return item;
  const details = await fetchMovieDetails(result.id);
  return {
    ...item,
    title: item.displayTitle ?? item.title,
    summary: details.overview || item.summary,
    tagline: details.tagline || null,
    releaseDate: details.release_date || item.year,
    posterUrl: item.preservePoster ? item.posterUrl : details.poster_path ? `https://image.tmdb.org/t/p/w342${details.poster_path}` : item.posterUrl,
    backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}` : null,
    tmdbId: details.id,
    imdbId: details.external_ids?.imdb_id ?? null,
    runtime: details.runtime ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m` : item.runtime,
    rating: getCertification(details.release_dates?.results) ?? item.rating,
    genres: details.genres?.map((genre) => genre.name) ?? item.genres,
    language: details.original_language?.toUpperCase() ?? item.language,
    country: details.production_countries?.[0]?.name ?? item.country,
    director: details.credits?.crew?.find((person) => person.job === "Director")?.name ?? item.director,
    cast:
      details.credits?.cast?.slice(0, 12).map((person) => ({
        name: person.name,
        role: person.character,
        imageUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
      })) ?? item.cast,
  };
}

function worldCinemaVolume(number, films) {
  return {
    id: `criterion-world-cinema-project-${number}`,
    number,
    title: `World Cinema Project No. ${number}`,
    mediaType: "criterion-eclipse-set",
    seriesLabel: "World Cinema Project",
    status: "complete",
    posterCode: `WCP${number}`,
    posterA: "#050505",
    posterB: number === 5 ? "#e7a90e" : number === 4 ? "#0aa071" : number === 3 ? "#df3e6a" : number === 2 ? "#67c7ca" : "#f05f4a",
    posterUrl: `./assets/collections/criterion/world-cinema-project/volume-${number}.jpg`,
    heroImage: `./assets/collections/criterion/world-cinema-project/volume-${number}.jpg`,
    summary: `Martin Scorsese's World Cinema Project No. ${number} gathers ${films.length} restored films from the Criterion Collection.`,
    films: films.map((film) => ({ ...film, eclipseSetId: `criterion-world-cinema-project-${number}` })),
  };
}

function worldCinemaMovie(volume, order, title, year, options = {}) {
  const displayTitle = options.displayTitle ?? title;
  const sourceTitle = options.sourceFileTitle ?? displayTitle;
  const sourceOrder = options.sourceOrder ?? order;
  return movie(
    year,
    displayTitle,
    `criterion-world-cinema-project-${volume}-${String(order).padStart(2, "0")}-${slugify(displayTitle)}-${year}`,
    options.country ?? "World Cinema",
    "World Cinema",
    options.director ?? null,
    `criterion-world-cinema-project-${volume}`,
    {
      order,
      worldCinemaProject: true,
      searchTitle: options.searchTitle ?? title,
      displayTitle,
      posterUrl: `./assets/collections/criterion/world-cinema-project/${volume}.${sourceOrder} ${sourceTitle} (${year}).jpg`,
      posterCode: null,
      preservePoster: true,
      coverSourceName: `${volume}.${sourceOrder} ${sourceTitle} (${year}).jpg`,
    },
  );
}

async function searchMovie(title, year) {
  const url = new URL("https://api.themoviedb.org/3/search/movie");
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("query", title);
  if (year) url.searchParams.set("year", String(year));
  const response = await fetch(url, { headers });
  if (!response.ok) return null;
  const payload = await response.json();
  return (payload.results ?? []).find((result) => result.poster_path) ?? payload.results?.[0] ?? null;
}

async function fetchMovieDetails(tmdbId) {
  const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);
  const headers = tmdbHeaders();
  if (!headers.Authorization) url.searchParams.set("api_key", process.env.TMDB_API_KEY);
  url.searchParams.set("append_to_response", "credits,release_dates,external_ids");
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`TMDB detail fetch failed for ${tmdbId}: ${response.status}`);
  return response.json();
}

function getCertification(releaseDates = []) {
  const us = releaseDates.find((entry) => entry.iso_3166_1 === "US");
  return us?.release_dates?.find((entry) => entry.certification)?.certification ?? null;
}

function hasTmdbAuth() {
  return Boolean(process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_BEARER_TOKEN || process.env.TMDB_API_KEY);
}

function tmdbHeaders() {
  const token = process.env.TMDB_READ_ACCESS_TOKEN ?? process.env.TMDB_BEARER_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function loadDotEnv(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // Optional local file.
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildPosterCode(title) {
  return title
    .split(/\s+/)
    .filter((word) => !/^(the|and|of|in|a|an|or)$/i.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function looseTitle(value = "") {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value = "") {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(" ", "-");
}
