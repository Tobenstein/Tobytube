import {
  formatDisplayDate,
  getPromotion,
  getPromotionYears,
  getShowEpisodes,
  getYearEvents,
  mediaCollections,
  movies,
  promotions,
  tvShows,
  wweDocumentaries,
} from "./data.js";

const state = {
  section: "home",
  promotionId: null,
  selectedTitleId: null,
  selectedPersonId: null,
  selectedChampionshipId: null,
  selectedTvSeason: null,
  selectedTvSubcollection: null,
  selectedTvEpisodeId: null,
  selectedTvGuideItemId: null,
  selectedCollectionId: null,
  selectedCuratedShelfId: null,
  resetCuratedJumpRail: false,
  playbackOriginCollectionId: null,
  selectedMcuSeasonId: null,
  selectedMcuShowId: null,
  selectedCriterionView: "home",
  selectedCriterionEclipseId: null,
  selectedCriterionSubCollectionId: null,
  selectedIndiaView: "home",
  selectedIndiaLanguageId: null,
  selectedYear: 2001,
  view: "overview",
  subView: "home",
  wrestlingMode: "media",
  libraryMode: "media",
  eventSort: "date-desc",
  championshipSort: "date-asc",
  collectionSort: "az",
  batcaveView: "overview",
  batcaveWrestlingMode: "live",
  batcaveWrestlingPromotionId: null,
  batcaveCollectionId: null,
  batcaveCollectionDraft: null,
  batcaveCollectionDeleteChecks: 0,
  batcaveMediaSort: "title-az",
  batcaveMediaTags: new Set(["movie", "tv"]),
  batcaveMediaOpenSections: new Set(),
  batcaveUnmatchedOpenSections: new Set(),
  batcaveMetadataDraft: null,
  titleCardView: "full",
  query: "",
  returnPage: null,
  navigationStack: [],
  powerOffMode: null,
  tvGuideTheaterMode: false,
  castOverlay: null,
  notesOverlay: null,
  defenseOverlay: null,
  preserveScrollOnRender: false,
  pendingScrollRestore: null,
  metadataMenu: null,
  metadataOverlay: null,
  metadataToast: null,
  mergeSelection: new Set(),
  playbackQueue: [],
  player: null,
};

const app = document.querySelector("#app");
let tmdbPosters = {};
const personFilmographyIndex = new Map();
let generatedMetadata = { records: [], unmatchedFiles: [] };
let metadataOverrides = { version: 1, items: {} };
let batcaveUnmatchedItemIndex = new Map();
let collectionOverrides = { version: 1, collections: {} };
let metadataIndex = {};
let mediaPreflightIndex = { movieFilesById: new Map(), tvFilesByEpisodeId: new Map(), titleItemsById: new Map(), cacheKey: "" };
let wrestlingMetadataIndex = {};
let wrestlingReferenceIndex = { championships: [], titleReigns: [], tournaments: [] };
let ecwExtremeFancamItems = [];
let ecwExtremeFancamById = new Map();
let wweDocumentaryCategoryIndex = { categories: [], assignments: [] };
let batcaveWrestlingObjectIndex = new Map();
let generatedWrestlingLibrary = [];
let generatedWrestlingById = new Map();
let generatedWrestlingByPromotion = new Map();
let generatedWrestlingByPromotionYear = new Map();
let loadedGeneratedPromotionIds = new Set();
let generatedPromotionLoadPromises = new Map();
let generatedPromotionYearIndexes = new Map();
let generatedPromotionYearVersions = new Map();
let loadedGeneratedPromotionYears = new Set();
let generatedPromotionYearLoadPromises = new Map();
let generatedPromotionBackgroundWarmups = new Set();
let pendingPromotionId = null;
let wrestlingMatchDetailsIndex = {};
const wrestlingMatchDetailScopes = new Set();
const wrestlingMatchDetailsPending = new Map();
let metadataStatus = null;
let tvDetailIndex = {};
let movieDetailIndex = {};
let mcuCollectionIndex = null;
let mcuDetailIndex = {};
let criterionCollectionIndex = null;
let criterionDetailIndex = {};
let curatedManifestIndex = { collections: {} };
let teebeeShuffleTimer = null;
let movieHotspotResizeObserver = null;
let tvGuideClockTimer = null;
let playerAutoplayTimer = null;
let playerAutoplayInterval = null;
let metadataToastTimer = null;
let hydrationRenderTimer = null;
let gamepadNavigationFrame = null;
let gamepadNavigationState = { direction: null, actionPressed: false, backPressed: false, repeatedAt: 0 };
let movieDetailLoadPromise = null;
let tvDetailLoadPromise = null;
const sidebarMediaCounts = { movies: null, tv: null };
let tvCanonicalIdByAlias = new Map();
let itemOverrideCache = new Map();
let metadataAliasCache = new Map();
let overrideIdsByIdentityTitle = null;
let curatedHydrationIndex = null;
const RESUME_THRESHOLD_SECONDS = 60;
const TV_CURRENT_EPISODE_THRESHOLD_SECONDS = 3 * 60;
const PLAYBACK_BUILD_ID = "playback-hls-026";
const RESUME_SCHEMA_VERSION = 3;
const PERF_WARN_MS = 80;

function scheduleHydrationRender(delay = 2500) {
  if (hydrationRenderTimer) clearTimeout(hydrationRenderTimer);
  hydrationRenderTimer = setTimeout(() => {
    hydrationRenderTimer = null;
    render();
  }, delay);
}

async function ensureMovieDetailIndex() {
  if (movieDetailLoadPromise) return movieDetailLoadPromise;
  movieDetailLoadPromise = fetch("./src/movie-detail.generated.json", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : { movies: {} }))
    .then((data) => { movieDetailIndex = data.movies ?? {}; })
    .catch(() => {});
  return movieDetailLoadPromise;
}

async function ensureTvDetailIndex() {
  if (tvDetailLoadPromise) return tvDetailLoadPromise;
  tvDetailLoadPromise = fetch("./src/tv-detail.generated.json", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : { shows: {} }))
    .then((data) => { tvDetailIndex = data.shows ?? {}; })
    .catch(() => {});
  return tvDetailLoadPromise;
}

function timed(label, fn, warnMs = PERF_WARN_MS) {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  if (elapsed > warnMs) console.debug(`[Tobytube perf] ${label}: ${Math.round(elapsed)}ms`);
  return result;
}

function invalidateMediaCaches() {
  if (getMovieLibraryItems.cache?.items) sidebarMediaCounts.movies = getMovieLibraryItems.cache.items.length;
  if (getTvLibraryItems.cache?.items) sidebarMediaCounts.tv = getTvLibraryItems.cache.items.length;
  mediaPreflightIndex = { movieFilesById: new Map(), tvFilesByEpisodeId: new Map(), titleItemsById: new Map(), cacheKey: "" };
  getScannedMovieItems.cache = null;
  getMovieLibraryItems.cache = null;
  getTvLibraryItems.cache = null;
  getVisibleCollections.cache = null;
  getAllTvTitleItems.cache = null;
  getAvailableTvSeasons.cache = new Map();
  getTvDetails.cache = new Map();
  findAvailableTvEpisode.cache = new Map();
  itemOverrideCache = new Map();
  metadataAliasCache = new Map();
  overrideIdsByIdentityTitle = null;
  curatedHydrationIndex = null;
}

function getMetadataCacheKey() {
  return `${generatedMetadata.generatedAt ?? "none"}:${generatedMetadata.records?.length ?? 0}:${generatedMetadata.unmatchedFiles?.length ?? 0}:${metadataOverrides.updatedAt ?? "no-overrides"}:${state.libraryMode}`;
}

function ensureMediaPreflightIndex() {
  const cacheKey = getMetadataCacheKey();
  if (mediaPreflightIndex.cacheKey === cacheKey) return mediaPreflightIndex;
  const movieFilesById = new Map();
  const tvFilesByEpisodeId = new Map();
  (generatedMetadata.records ?? []).forEach((record) => {
    const files = record.files ?? [];
    if (record.mediaType === "movie" && files.length) movieFilesById.set(record.id, files);
    if (record.mediaType === "tv") {
      files.forEach((file) => {
        const parsed = file.parsed ?? {};
        const episodeId = file.episodeId ?? parsed.episodeId ?? buildEpisodeId(record.id, parsed.season, parsed.episode);
        if (!episodeId) return;
        const list = tvFilesByEpisodeId.get(episodeId) ?? [];
        list.push(file);
        tvFilesByEpisodeId.set(episodeId, list);
      });
    }
  });
  mediaPreflightIndex = { movieFilesById, tvFilesByEpisodeId, titleItemsById: new Map(), cacheKey };
  return mediaPreflightIndex;
}

function buildEpisodeId(showId, season, episode) {
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  if (!showId || !seasonNumber || !episodeNumber) return null;
  return `${showId}-s${seasonNumber}-e${episodeNumber}`;
}


resetResumeStateForNewPlaybackBuild();

function resetResumeStateForNewPlaybackBuild() {
  try {
    const storedBuild = localStorage.getItem("tobytube.playbackBuildId");
    if (storedBuild === PLAYBACK_BUILD_ID) return;
    Object.keys(localStorage)
      .filter((key) => key.startsWith("tobytube.resume."))
      .forEach((key) => localStorage.removeItem(key));
    localStorage.setItem("tobytube.playbackBuildId", PLAYBACK_BUILD_ID);
  } catch {}
}

const TOBY_TV_LOGO_FALLBACK = "./assets/banners/tobytube-tv-logo-4.png";

const tvGuideChannels = [
  { number: "001", title: "Featured", color: "gold", mode: "recent" },
  { number: "002", title: "BBC", color: "cyan", shows: ["Little Britain", "Mighty Boosh", "Upstart Crow", "BBC Shakespeare", "Red Dwarf", "Luther", "Citizen Khan", "Gavin & Stacey", "Nighty Night", "Chewin' the Fat", "Still Game", "Mrs. Brown's Boys", "Doctor Who", "Doctor Who Classic", "Father Brown", "Man Like Mobeen"] },
  { number: "003", title: "ITV", color: "green", shows: ["The Chase", "Mr. Bean", "Byker Grove", "Downton Abbey", "George & Mildred", "The Jewel in the Crown", "Worzel Gummidge", "Bagpuss", "The New Statesman"] },
  { number: "004", title: "Channel 4", color: "orange", shows: ["Toast of London", "Desmond's", "Two Pints of Lager and a Packet of Crisps", "The Cockfields", "Derry Girls", "Red Dwarf", "Taskmaster", "London Irish", "Hollyoaks", "The Great British Bake Off", "Stath Lets Flats", "The Pharmacy", "The World of Lee Evans", "Year of the Rabbit", "Garth Marenghi's Darkplace", "Friday Night Dinner", "Father Ted", "Spaced", "Black Books", "The IT Crowd", "Chewing Gum"] },
  { number: "005", title: "The Movie Channel", color: "red", mode: "movies" },
  { number: "006", title: "Global", color: "blue", shows: ["Flight of the Conchords", "Deutschland 83", "Deutschland 86", "Deutschland 89", "Pokemon"] },
  { number: "007", title: "CBC", subtitle: "Canadian", color: "teal", shows: ["Corner Gas", "The Red Green Show", "Royal Canadian Air Farce", "Kim's Convenience", "Schitt's Creek", "Radio Free Roscoe"] },
  { number: "008", title: "CTV", color: "magenta", mode: "random-shows" },
  { number: "009", title: "ATV", color: "lime", mode: "random-shows" },
  { number: "011", title: "Collections", color: "purple", mode: "collections" },
  { number: "030", title: "YTV", subtitle: "Kids & Family", color: "gold", shows: ["Goosebumps", "Are You Afraid of the Dark?"] },
  { number: "033", title: "Showcase", color: "cyan", shows: ["Trailer Park Boys", "Red Shoe Diaries"] },
  { number: "034", title: "Much", color: "pink", mode: "random-shows" },
  { number: "036", title: "Weather Channel", color: "green", mode: "random-shows" },
  { number: "037", title: "HBO", color: "blue", shows: ["The Sopranos", "Oz", "Game of Thrones", "The Wire", "The Last of Us", "Succession", "Euphoria", "House of the Dragon"] },
  { number: "038", title: "Comedy", color: "orange", shows: ["Friends", "Seinfeld", "Murphy Brown", "Frasier", "Becker"] },
  { number: "039", title: "Cartoon Network", color: "magenta", shows: ["The Powerpuff Girls", "Dexter's Laboratory", "Johnny Bravo", "Courage the Cowardly Dog"] },
  { number: "040", title: "Animation", color: "lime", shows: ["Bob's Burgers", "Futurama", "The Simpsons", "Enchanted", "Aqua Teen Hunger Force", "Ren & Stimpy"] },
  { number: "041", title: "Sci-Fi & Fantasy", color: "purple", shows: ["The 10th Kingdom", "Buffy the Vampire Slayer", "Angel", "Charmed", "Grimm", "Once Upon a Time", "Merlin", "Good Omens", "Wednesday"] },
  { number: "043", title: "Documentary", color: "cyan", shows: ["Something from Nothing: The Art of Rap", "Apocalypse"] },
  { number: "048", title: "Reality & Competition", color: "gold", mode: "random-shows" },
  { number: "051", title: "Crime", color: "red", shows: ["Mare of Easttown", "Broadchurch", "Criminal Minds", "Law & Order", "Law & Order: Special Victims Unit"] },
  { number: "052", title: "Classics", color: "blue", shows: ["The Brady Bunch", "Gilligan's Island", "The Partridge Family", "The Andy Griffith Show", "Mama's Family"] },
  { number: "092", title: "Library", color: "teal", mode: "library" },
  { number: "099", title: "Toby After Dark", color: "pink", mode: "random-shows" },
];

fetch("./src/tmdb-posters.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : {}))
  .then((data) => {
    tmdbPosters = data;
    scheduleHydrationRender();
  })
  .catch(() => {});

loadGeneratedMetadata();
loadMetadataOverrides();
loadCollectionOverrides();
startGamepadNavigation();

fetch("./src/wrestling-metadata.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : {}))
  .then((data) => {
    wrestlingMetadataIndex = data;
    scheduleHydrationRender();
  })
  .catch(() => {});

fetch("./src/wrestling-library-home.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : { records: [] }))
  .then((data) => {
    // The home shelf may finish after a promotion page. Merge it instead of
    // replacing an archive year that has already loaded.
    addGeneratedWrestlingRecords(data.records ?? []);
    scheduleHydrationRender();
  })
  .catch(() => {});

fetch("./src/ecw-extreme-fancam.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : { items: [] }))
  .then((data) => {
    ecwExtremeFancamItems = data.items ?? [];
    ecwExtremeFancamById = new Map(ecwExtremeFancamItems.map((item) => [item.id, item]));
    scheduleHydrationRender();
  })
  .catch(() => {});

fetch("./src/wrestling-reference-ui.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : { championships: [], titleReigns: [], tournaments: [] }))
  .then((data) => {
    wrestlingReferenceIndex = {
      championships: data.championships ?? [],
      titleReigns: data.titleReigns ?? [],
      tournaments: data.tournaments ?? [],
    };
    scheduleHydrationRender();
  })
  .catch(() => {});

fetch("./src/wwe-documentary-categories.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : { categories: [], assignments: [] }))
  .then((data) => {
    wweDocumentaryCategoryIndex = data;
    scheduleHydrationRender();
  })
  .catch(() => {});

fetch("./src/mcu-collection.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : { collection: null, detailById: {} }))
  .then((data) => {
    mcuCollectionIndex = data.collection ?? null;
    mcuDetailIndex = data.detailById ?? {};
    scheduleHydrationRender();
  })
  .catch(() => {});

fetch("./src/criterion-collection.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : { collection: null, detailById: {} }))
  .then((data) => {
    criterionCollectionIndex = data;
    criterionDetailIndex = data.detailById ?? {};
    scheduleHydrationRender();
  })
  .catch(() => {});

fetch("./src/curated-manifest.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : { collections: {} }))
  .then((data) => {
    curatedManifestIndex = data ?? { collections: {} };
    scheduleHydrationRender();
  })
  .catch(() => {});

refreshMetadataStatus();
setInterval(refreshMetadataStatus, 5000);

const peopleIndex = {
  "michael-mann": {
    name: "Michael Mann",
    libraryIds: ["usa-heat"],
  },
  "al-pacino": {
    name: "Al Pacino",
    libraryIds: ["usa-heat"],
  },
  "robert-de-niro": {
    name: "Robert De Niro",
    libraryIds: ["usa-heat"],
  },
  "audrey-tautou": {
    name: "Audrey Tautou",
    libraryIds: ["fr-amelie"],
  },
  "bob-odenkirk": {
    name: "Bob Odenkirk",
    libraryIds: ["bobs-burgers"],
  },
  "stone-cold": {
    name: "Stone Cold Steve Austin",
    libraryIds: ["home-wrestling-wwe-ppv-2001-04-01"],
  },
  "the-rock": {
    name: "The Rock",
    libraryIds: ["home-wrestling-wwe-ppv-2001-04-01"],
  },
  "hulk-hogan": {
    name: "Hollywood Hogan",
    libraryIds: ["home-wrestling-wcw-ppv-1997-12-28"],
  },
  sting: {
    name: "Sting",
    libraryIds: ["home-wrestling-wcw-ppv-1997-12-28"],
  },
};

const movieMockCollections = [
  {
    id: "lord-of-the-rings",
    scope: "movie",
    title: "The Lord of the Rings",
    description: "A trilogy shelf for long walks, older maps, and the kind of quest that takes all weekend.",
    itemIds: ["uk-trainspotting", "jp-seven-samurai", "jp-spirited-away"],
    posterA: "#203b2f",
    posterB: "#c49a4e",
  },
  {
    id: "back-to-the-future",
    scope: "movie",
    title: "Back to the Future",
    description: "Time machines, small-town neon, and the trilogy loop that always snaps back into place.",
    itemIds: ["usa-matrix", "usa-boogie", "fr-playtime"],
    posterA: "#1e4058",
    posterB: "#df7e3f",
  },
  {
    id: "despicable-me",
    scope: "movie",
    title: "Despicable Me",
    description: "Bright chaos, tiny henchmen energy, and family-night mischief.",
    itemIds: ["jp-spirited-away", "jp-tampopo", "jp-akira"],
    posterA: "#2a5c8a",
    posterB: "#e2c34c",
  },
  {
    id: "pirates-of-the-caribbean",
    scope: "movie",
    title: "Pirates of the Caribbean",
    description: "Cursed gold, damp maps, sea fog, and blockbuster adventure stacked by voyage.",
    itemIds: ["uk-in-bruges", "fr-amelie", "jp-house"],
    posterA: "#2f2620",
    posterB: "#b58248",
  },
];

const tvMockCollections = [
  {
    id: "tv-comedy",
    scope: "tv",
    title: "Comedy",
    description: "The Mighty Boosh, Toast of London, Peep Show, and other comfort nonsense.",
    itemIds: ["mighty-boosh", "toast", "peep-show"],
    posterA: "#3a2f46",
    posterB: "#d1a05c",
  },
  {
    id: "tv-animation",
    scope: "tv",
    title: "Animation",
    description: "Bob's Burgers, Spider-Man, Doug, and the Saturday-afternoon shelf.",
    itemIds: ["bobs-burgers", "spider-man-animated", "doug"],
    posterA: "#2f4d69",
    posterB: "#d94b42",
  },
  {
    id: "tv-anime",
    scope: "tv",
    title: "Anime",
    description: "Pokemon, Dragon Ball, Naruto, and gateway-show nostalgia.",
    itemIds: ["pokemon", "dragon-ball", "naruto"],
    posterA: "#2f5f86",
    posterB: "#e28a35",
  },
];

const tvPlaylistIds = ["mighty-boosh", "bobs-burgers", "pokemon", "toast", "spider-man-animated"];

const movieGenreCollectionSpecs = [
  {
    id: "action",
    title: "Action",
    heroImage: "./assets/collections/action/action-banner-display-2.png?v=20260803c",
    buttonImage: "./assets/collections/action/button.png",
    posterA: "#171010",
    posterB: "#ff8b2d",
    sections: [
      "Adventure",
      "Thriller",
      "Martial Arts",
      "Cops & Crime",
      "CAR GO VROOM",
      "Spies & Espionage",
      "Military & War",
      "Action Comedy",
      "High Terror",
      "Disaster & Survival",
      "Vigilantes & Revenge",
      "Action Sci-Fi",
    ],
    seed: [
      "Raiders of the Lost Ark",
      "Speed",
      "Enter the Dragon",
      "Heat",
      "Mad Max: Fury Road",
      "Mission: Impossible",
      "The Dirty Dozen",
      "Beverly Hills Cop",
      "Predator",
      "The Poseidon Adventure",
      "Death Wish",
      "Terminator 2: Judgment Day",
    ],
  },
  {
    id: "comedy",
    title: "Comedy",
    heroImage: "./assets/collections/comedy/comedy-banner-display.png?v=20260803",
    buttonImage: "./assets/collections/comedy/button.png",
    posterA: "#21140c",
    posterB: "#f0b55a",
    sections: [
      "Marx Brothers",
      "Buddy Comedies",
      "Odd Couples",
      "Fish-out-of-Water",
      "Black Excellence",
      "Slapstick",
      "Indefensible Stupidity",
      "Road Trips",
      "Satire",
      "Dark Comedy",
      "Farce",
      "Observational",
      "Mockumentary",
      "Parody",
      "Stoner Comedy",
      "Teen",
      "Family",
    ],
    seed: [
      "Duck Soup",
      "Planes, Trains and Automobiles",
      "The Odd Couple",
      "Coming to America",
      "Friday",
      "The General",
      "Dumb and Dumber",
      "Sideways",
      "Dr. Strangelove",
      "Heathers",
      "A Fish Called Wanda",
      "Annie Hall",
      "This Is Spinal Tap",
      "Airplane!",
      "Half Baked",
      "Clueless",
      "Paddington 2",
    ],
  },
  {
    id: "documentary",
    title: "Documentary",
    heroImage: "./assets/collections/documentary/documentary-banner-display.png?v=20260803b",
    buttonImage: "./assets/collections/documentary/button.png",
    posterA: "#12171a",
    posterB: "#d0d8df",
    sections: [
      "True Crime",
      "Biography",
      "Historical",
      "Social & Cultural",
      "Nature & Wildlife",
      "Expose",
      "Observational",
      "Participatory",
      "Music",
      "Political",
      "Sports",
      "Science & Technology",
      "Travel & Exploration",
      "Experimental/Essay",
    ],
    seed: [
      "The Thin Blue Line",
      "Senna",
      "The Civil War",
      "Hoop Dreams",
      "Planet Earth",
      "Blackfish",
      "Salesman",
      "Sherman's March",
      "Stop Making Sense",
      "The Fog of War",
      "When We Were Kings",
      "Apollo 11",
      "Baraka",
      "Sans Soleil",
    ],
  },
  {
    id: "drama",
    title: "Drama",
    heroImage: "./assets/collections/drama/drama-banner-display.png?v=20260803b",
    buttonImage: "./assets/collections/drama/button.png",
    posterA: "#20140f",
    posterB: "#e0a43f",
    sections: [
      "Prestige (Oscar Bait)",
      "Historical",
      "Period",
      "Character-Driven",
      "Coming-of-Age",
      "Romantic Drama",
      "Social Drama",
      "Working-Class",
      "Family Drama",
      "Melodrama",
      "Tragedy",
      "Biopics",
      "Crime & Legal",
      "Psychological",
      "War",
    ],
    seed: [
      "The King's Speech",
      "Casablanca",
      "The Age of Innocence",
      "There Will Be Blood",
      "The 400 Blows",
      "All That Heaven Allows",
      "Do the Right Thing",
      "Kes",
      "The Godfather",
      "All That Heaven Allows",
      "Manchester by the Sea",
      "Malcolm X",
      "12 Angry Men",
      "Persona",
      "Paths of Glory",
    ],
  },
  {
    id: "fantasy",
    title: "Fantasy",
    heroImage: "./assets/collections/fantasy/fantasy-banner-7.0.png?v=20260802f",
    buttonImage: "./assets/collections/fantasy/button.png",
    posterA: "#211233",
    posterB: "#c868ff",
    sections: ["Grand Epics", "Science Fantasy", "Sword & Sorcery", "Fairy Tales", "Dark Fantasy", "Urban Fantasy", "Mythology", "Portals to Other Worlds", "Comic Fantasy"],
    seed: ["The Lord of the Rings: The Fellowship of the Ring", "Star Wars", "Conan the Barbarian", "The Princess Bride", "Pan's Labyrinth", "Big Trouble in Little China", "Jason and the Argonauts", "Labyrinth", "Monty Python and the Holy Grail"],
  },
  {
    id: "romance",
    title: "Romance",
    heroImage: "./assets/collections/romance/romance-banner-display.png?v=20260803b",
    buttonImage: "./assets/collections/romance/button.png",
    posterA: "#2b1117",
    posterB: "#ff6c8b",
    sections: ["RomComs", "RomDrams", "Historical", "Paranormal & Fantasy", "Action & Thriller", "Coming-of-Age & YA", "LGBTQ+", "Musicals", "Erotica"],
    seed: ["When Harry Met Sally...", "Before Sunrise", "A Room with a View", "The Shape of Water", "Romancing the Stone", "The Spectacular Now", "Portrait of a Lady on Fire", "Moulin Rouge!", "Secretary"],
  },
  {
    id: "sci-fi",
    title: "Sci-Fi",
    heroImage: "./assets/collections/sci-fi/scifi-banner-display.png?v=20260803",
    buttonImage: "./assets/collections/sci-fi/button.png",
    posterA: "#071822",
    posterB: "#75f08a",
    sections: [
      "Alien Invaders",
      "Science Experiments Gone Wrong",
      "Devils in the Machine",
      "Space Opera",
      "Hard Sci-Fi",
      "Cyberpunk",
      "Steampunk",
      "Military Sci-Fi",
      "Climate Disasters",
      "Dystopia",
      "Time Travel",
      "Post-Apocalypse",
      "Weird New Worlds",
    ],
    seed: ["The War of the Worlds", "The Fly", "The Terminator", "Dune", "Arrival", "Blade Runner", "Brazil", "Starship Troopers", "Snowpiercer", "Children of Men", "Back to the Future", "Mad Max", "Annihilation"],
  },
  {
    id: "sports",
    title: "Sport",
    heroImage: "./assets/collections/sports/sports-banner-display.png?v=20260803b",
    buttonImage: "./assets/collections/sports/button.png",
    posterA: "#111b35",
    posterB: "#5aa8ff",
    sections: ["Biopic", "Documentary", "Comedy", "Drama", "Combat Sports", "Extreme Sports", "Racing", "Teams", "Underdogs", "Individual Excellence"],
    seed: ["Raging Bull", "Hoop Dreams", "Caddyshack", "Friday Night Lights", "The Wrestler", "Dogtown and Z-Boys", "Le Mans", "A League of Their Own", "The Bad News Bears", "The Loneliness of the Long Distance Runner"],
  },
  {
    id: "western",
    title: "Western",
    heroImage: "./assets/collections/western/western-banner-display.png?v=20260803b",
    buttonImage: "./assets/collections/western/button.png",
    posterA: "#24180e",
    posterB: "#d99c56",
    sections: [
      "Indigenous Heroes",
      "Manifest Destiny",
      "Singing Cowboys",
      "Spaghetti Westerns",
      "Oosterns",
      "Revisionist Westerns",
      "Anti-Western",
      "Outlaws",
      "Survivalism",
      "Neo-Western",
      "Borderlands",
      "Weird Westerns",
      "Eastern Influence",
    ],
    seed: ["Smoke Signals", "The Searchers", "The Singing Cowboy", "The Good, the Bad and the Ugly", "White Sun of the Desert", "McCabe & Mrs. Miller", "Dead Man", "The Wild Bunch", "The Revenant", "No Country for Old Men", "Lone Star", "El Topo", "Yojimbo"],
  },
];

const profileCollectionSpecs = [
  {
    id: "martin-scorseses-world-cinema-project",
    title: "Martin Scorsese's World Cinema Project",
    description: "Five Criterion volumes of restored films from around the world.",
    heroImage: "./assets/collections/criterion/world-cinema-project/volume-1.jpg",
    buttonImage: "./assets/collections/criterion/world-cinema-project-button.png",
    posterA: "#050505",
    posterB: "#f05f4a",
    continueTitle: "Continue watching",
    sections: [
      curatedSection("World Cinema Project No. 1", [
        curatedItem("Touki Bouki", 1973),
        curatedItem("Redes", 1936),
        curatedItem("A River Called Titas", 1973),
        curatedItem("Dry Summer", 1964),
        curatedItem("Trances", 1981),
        curatedItem("The Housemaid", 1960),
      ]),
      curatedSection("World Cinema Project No. 2", [
        curatedItem("Insiang", 1976),
        curatedItem("Mysterious Object at Noon", 2000),
        curatedItem("Revenge", 1989),
        curatedItem("Limite", 1931),
        curatedItem("Law of the Border", 1966),
        curatedItem("Taipei Story", 1985),
      ]),
      curatedSection("World Cinema Project No. 3", [
        curatedItem("LucÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­a", 1968),
        curatedItem("After the Curfew", 1954),
        curatedItem("Pixote", 1980),
        curatedItem("Two Monks", 1934),
        curatedItem("Soleil ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â", 1970),
        curatedItem("Downpour", 1972),
      ]),
      curatedSection("World Cinema Project No. 4", [
        curatedItem("Sambizanga", 1972),
        curatedItem("Prisoners of the Land", 1939),
        curatedItem("Chess of the Wind", 1976),
        curatedItem("Muna Moto", 1975),
        curatedItem("Two Girls on the Street", 1939),
        curatedItem("Kalpana", 1948),
      ]),
      curatedSection("World Cinema Project No. 5", [
        curatedItem("Chronicle of the Years of Fire", 1975),
        curatedItem("The Choice", 1987),
        curatedItem("Kummatty", 1979),
        curatedItem("The Fall of Otrar", 1991),
      ]),
    ],
  },
  {
    id: "david-cronenberg",
    title: "David Cronenberg",
    description: "Body horror, media rot, identity slippage, and the new flesh as a director shelf.",
    heroImage: "./assets/collections/criterion/cronenberg-button.png",
    buttonImage: "./assets/collections/criterion/cronenberg-button.png",
    posterA: "#120d0e",
    posterB: "#b54a34",
    continueTitle: "Continue watching",
    menuRows: [["the-david-cronenberg-archive", "cronenbergs-favourites", "criterion-closet-picks"]],
    sections: [
      curatedSection("The David Cronenberg Archive", [
        curatedItem("Stereo", 1969),
        curatedItem("Crimes of the Future", 1970),
        curatedItem("Shivers", 1975),
        curatedItem("Rabid", 1977),
        curatedItem("Fast Company", 1979),
        curatedItem("The Brood", 1979),
        curatedItem("Scanners", 1981),
        curatedItem("Videodrome", 1983),
        curatedItem("The Dead Zone", 1983),
        curatedItem("The Fly", 1986),
        curatedItem("Dead Ringers", 1988),
        curatedItem("Naked Lunch", 1991),
        curatedItem("M. Butterfly", 1993),
        curatedItem("Crash", 1996),
        curatedItem("eXistenZ", 1999),
        curatedItem("Spider", 2002),
        curatedItem("A History of Violence", 2005),
        curatedItem("Eastern Promises", 2007),
        curatedItem("A Dangerous Method", 2011),
        curatedItem("Cosmopolis", 2012),
        curatedItem("Maps to the Stars", 2014),
        curatedItem("Crimes of the Future", 2022),
        curatedItem("The Shrouds", 2024),
      ]),
      curatedSection("Cronenberg's Favourites", [
        curatedItem("The Texas Chain Saw Massacre", 1974),
        curatedItem("Peeping Tom", 1959),
        curatedItem("Invasion of the Body Snatchers", 1956),
        curatedItem("Eyes Without a Face", 1959),
        curatedItem("Night of the Living Dead", 1968),
        curatedItem("Psycho", 1960),
        curatedItem("Don't Look Now", 1973),
        curatedItem("Hour of the Wolf", 1968),
        curatedItem("Freaks", 1932),
        curatedItem("Kwaidan", 1964),
        curatedItem("The Incredible Shrinking Man", 1957),
        curatedItem("Diabolique", 1955),
        curatedItem("The Little Shop of Horrors", 1960),
        curatedItem("The Innocents", 1963),
        curatedItem("Suddenly, Last Supper", null),
        curatedItem("Spirits of the Dead", 1968),
        curatedItem("The Wicker Man", 1973),
        curatedItem("Forbidden Planet", 1955),
        curatedItem("The Blue Lagoon", 1949),
        curatedItem("The Flame and the Arrow", 1950),
        curatedItem("Gertrud", 1964),
        curatedItem("Shane", 1951),
        curatedItem("McCabe & Mrs Miller", 1971),
        curatedItem("Pickpocket", 1959),
        curatedItem("Touch of Evil", 1957),
        curatedItem("High Noon", 1951),
        curatedItem("Elmer Gantry", 1960),
        curatedItem("M", 1931),
        curatedItem("Week-end", 1967),
        curatedItem("Napoleon", 1925),
        curatedItem("Battleship Potemkin", 1925),
        curatedItem("Rashomon", 1950),
        curatedItem("Modern Times", 1936),
        curatedItem("Chelsea Girls", 1966),
      ]),
      curatedSection("Criterion Closet Picks", [
        curatedItem("La Strada", 1954),
        curatedItem("Odd Man Out", 1947),
        curatedItem("Eraserhead", 1977),
        curatedItem("Ingmar Bergman's Cinema", null, "movie", "Box Set"),
      ]),
    ],
  },
  {
    id: "wes-anderson",
    title: "Wes Anderson",
    description: "Symmetry, family systems, little rooms, soft melancholy, and precisely packed luggage.",
    heroImage: "./assets/collections/criterion/wes-anderson-button.png",
    buttonImage: "./assets/collections/criterion/wes-anderson-button.png",
    posterA: "#263622",
    posterB: "#d49b64",
    continueTitle: "Continue",
    menuRows: [["the-wes-anderson-archive", "wes-favourite-films", "greatest-films-nominations"]],
    sections: [
      curatedSection("The Wes Anderson Archive", [
        curatedItem("Bottle Rocket", 1996),
        curatedItem("Rushmore", 1998),
        curatedItem("The Royal Tenenbaums", 2001),
        curatedItem("The Life Aquatic with Steve Zissou", 2004),
        curatedItem("The Darjeeling Limited", 2007),
        curatedItem("Fantastic Mr. Fox", 2009),
        curatedItem("Moonrise Kingdom", 2012),
        curatedItem("The Grand Budapest Hotel", 2014),
        curatedItem("Isle of Dogs", 2018),
        curatedItem("The French Dispatch", 2021),
        curatedItem("Asteroid City", 2023),
        curatedItem("The Wonderful Story of Henry Sugar and Three More", 2024),
        curatedItem("The Phoenician Scheme", 2025),
      ]),
      curatedSection("Wes' Favourite Films", [
        curatedItem("The Earrings of Madame de...", 1953),
        curatedItem("Au hasard Balthazar", 1966),
        curatedItem("Pigs and Battleships", 1961),
        curatedItem("The Insect Woman", 1963),
        curatedItem("Unholy Desire", 1964),
        curatedItem("The Taking of Power by Louis XIV", 1966),
        curatedItem("The Spy Who Came in from the Cold", 1965),
        curatedItem("The Friends of Eddie Coyle", 1973),
        curatedItem("Classe tous risques", 1960),
        curatedItem("Naked Childhood", 1968),
        curatedItem("Mishima: A Life in Four Chapters", 1985),
        curatedItem("The Exterminating Angel", 1962),
      ]),
      curatedSection("Greatest Films Nominations", [
        curatedItem("La Grande Illusion", 1937),
        curatedItem("Quai des OrfÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨vres", 1947),
        curatedItem("The Earrings of Madame de...", 1953),
        curatedItem("Vivre sa vie", 1962),
        curatedItem("The Man Who Loved Women", 1977),
        curatedItem("Loulou", 1980),
        curatedItem("Vagabond", 1985),
        curatedItem("Olivier, Olivier", 1993),
        curatedItem("It All Starts Today", 1999),
        curatedItem("Rois et reine", 2004),
      ]),
    ],
  },
  {
    id: "tom-hanks",
    title: "Tom Hanks",
    description: "America's movie uncle, war stories, romcom warmth, survival oddities, and very serious typing.",
    heroImage: "./assets/collections/tom-hanks/hero.png",
    buttonImage: "./assets/collections/tom-hanks/button.png",
    posterA: "#1d1711",
    posterB: "#d6a76b",
    sections: ["Oscar-Worthy", "Tom in Love", "Tom at War", "TomTV", "Younger Hanks", "Adventures Abroad", "The Whole Tom Hanks"],
    seed: ["Philadelphia", "You've Got Mail", "Saving Private Ryan", "Bosom Buddies", "Big", "The Terminal", "Forrest Gump"],
  },
];

function horrorFranchiseItem(id, title, posterFile, options = {}) {
  return {
    ...curatedItem(title, null, "franchise", "Horror Franchise"),
    id: `horror-franchise-${id}`,
    posterUrl: `./assets/collections/horror/killers/${posterFile}`,
    targetCollectionId: options.targetCollectionId ?? null,
    franchiseCarousels: options.franchiseCarousels ?? [],
    summary: options.summary ?? `${title} franchise hub.`
  };
}

function horrorKillerFranchiseItems() {
  return [
    horrorFranchiseItem("freddy-vs-jason", "Freddy vs Jason", "friday-the-13th-nightmare-on-elm-street.png", {
      franchiseCarousels: ["Friday the 13th", "A Nightmare on Elm Street", "Crossovers and More"],
      summary: "Combo franchise hub for Friday the 13th, A Nightmare on Elm Street, Freddy vs Jason, related TV, and documentaries."
    }),
    horrorFranchiseItem("alien-vs-predator", "Alien vs Predator", "alien-vs-predator-button.png", {
      franchiseCarousels: ["Alien", "Predator", "Crossovers and More"],
      summary: "Combo franchise hub for Alien, Predator, Alien vs Predator crossovers, Alien: Earth, and related documentaries."
    }),
    horrorFranchiseItem("tales-from-the-creepshow", "Tales from the Creepshow", "tales-from-the-creepshow-button.png", {
      franchiseCarousels: ["Creepshow", "Tales from the Crypt"],
      summary: "Creepshow, Tales from the Crypt, and their gruesomely good television and film relatives."
    }),
    horrorFranchiseItem("universal-monsters", "Universal Monsters", "universal-monsters-button.png", { targetCollectionId: "universal-monsters" }),
    horrorFranchiseItem("hammer", "The House of Hammer", "hammer-button.png", { targetCollectionId: "hammer" }),
    horrorFranchiseItem("candyman", "Candyman", "candyman-button.png"),
    horrorFranchiseItem("children-of-the-corn", "Children of the Corn", "children-of-the-corn-button.png"),
    horrorFranchiseItem("evil-dead", "The Evil Dead", "evil-dead-button.png"),
    horrorFranchiseItem("childs-play", "Child's Play", "childs-play-button.png"),
    horrorFranchiseItem("exorcist", "The Exorcist", "exorcist-button.png"),
    horrorFranchiseItem("halloween", "Halloween", "halloween-button.png"),
    horrorFranchiseItem("the-omen", "The Omen", "the-omen-button.png"),
    horrorFranchiseItem("texas-chainsaw-massacre", "Texas Chainsaw Massacre", "texas-chainsaw-massacre-button.png"),
    horrorFranchiseItem("phantasm", "Phantasm", "phantasm-button.png"),
    horrorFranchiseItem("psycho", "Psycho", "psycho-button.png"),
    horrorFranchiseItem("hellraiser", "Hellraiser", "hellrasier-button.png"),
    horrorFranchiseItem("saw", "Saw", "saw-button.png"),
    horrorFranchiseItem("scream", "Scream", "scream-button.png")
  ];
}

const curatedCollectionPages = [
  ...buildMovieGenreCollections(),
  {
    id: "disney",
    title: "Disney",
    description: "Animated shelves, family rentals, studio eras, Pixar routes, and shorts.",
    heroImage: "./assets/collections/disney/disney-vault-banner.png?v=20260807b",
    buttonImage: "./assets/collections/disney/button.png",
    continueTitle: "Current Rentals",
    posterA: "#243d54",
    posterB: "#f0b35b",
    menuRows: [
      ["new-arrivals", "animated-classics", "live-action-classics", "renaissance", "post-renaissance", "modern-times"],
      ["pixar", "animated-tv", "muppetmania", "shorts", "blast-from-the-past", "other-animated-films"],
    ],
    sections: [
      curatedSection("New Arrivals", [curatedItem("Wish", 2023, "movie", "Animation")], { id: "new-arrivals" }),
      curatedSection("Animated Classics", [curatedItem("Snow White and the Seven Dwarfs", 1937, "movie", "Animation")]),
      curatedSection("Live-Action Classics", [curatedItem("Mary Poppins", 1964, "movie", "Family")]),
      curatedSection("Renaissance", [curatedItem("The Lion King", 1994, "movie", "Animation")]),
      curatedSection("Post-Renaissance", [curatedItem("Lilo & Stitch", 2002, "movie", "Animation")]),
      curatedSection("Modern Times", [curatedItem("Moana", 2016, "movie", "Animation")]),
      curatedSection("Pixar", [curatedItem("Toy Story", 1995, "movie", "Animation")]),
      curatedSection("Animated TV", [curatedItem("DuckTales", 1987, "tv", "Animation")]),
      curatedSection("MuppetMania", [curatedItem("The Muppet Movie", 1979, "movie", "Family")]),
      curatedSection("Shorts", [curatedItem("Steamboat Willie", 1928, "movie", "Short")]),
      curatedSection("Blast from the Past", [curatedItem("The Parent Trap", 1961, "movie", "Family")]),
      curatedSection("Other Animated Films", [curatedItem("The Nightmare Before Christmas", 1993, "movie", "Animation")]),
    ],
  },
  {
    id: "star-wars",
    title: "Star Wars",
    description: "Sagas, side quests, desert broadcasts, animation, and distant transmissions.",
    heroImage: "./assets/collections/star-wars/hero.png",
    buttonImage: "./assets/collections/star-wars/button.png",
    posterA: "#46321f",
    posterB: "#e8a755",
    menuRows: [["skywalker-saga", "solo-adventures", "live-action-series", "animated-series"]],
    sections: [
      curatedSection("Skywalker Saga", [curatedItem("Star Wars", 1977, "movie", "Sci-Fi")]),
      curatedSection("Solo Adventures", [curatedItem("Rogue One: A Star Wars Story", 2016, "movie", "Sci-Fi")]),
      curatedSection("Live-Action Series", [curatedItem("The Mandalorian", 2019, "tv", "Sci-Fi")]),
      curatedSection("Animated Series", [curatedItem("Star Wars: The Clone Wars", 2008, "tv", "Animation")]),
    ],
  },
  {
    id: "hbo",
    title: "HBO",
    description: "Prestige television, comedy rooms, documentaries, specials, and Sunday-night gravity.",
    heroImage: "./assets/collections/hbo/hbo-banner.png",
    buttonImage: "./assets/collections/hbo/button.png",
    posterA: "#151719",
    posterB: "#d0aa72",
    menuRows: [
      ["essentials", "comedies", "films", "stand-up"],
      ["limited-series", "documentaries", "more"],
    ],
    sections: [
      curatedSection("Essentials", [curatedItem("The Sopranos", 1999, "tv", "Drama")]),
      curatedSection("Comedies", [curatedItem("Curb Your Enthusiasm", 2000, "tv", "Comedy")]),
      curatedSection("Films", [curatedItem("Bessie", 2015, "movie", "Drama")]),
      curatedSection("Stand-up", [curatedItem("Chris Rock: Bring the Pain", 1996, "movie", "Stand-up")]),
      curatedSection("Limited Series", [curatedItem("Chernobyl", 2019, "tv", "Drama")]),
      curatedSection("Documentaries", [curatedItem("Paradise Lost", 1996, "movie", "Documentary")]),
      curatedSection("More", [curatedItem("The Wire", 2002, "tv", "Drama")]),
    ],
  },
  {
    id: "horror",
    title: "Horror",
    description: "Late fees, locked doors, bad weather, worse decisions, and the beautiful ugly stuff.",
    heroImage: "./assets/collections/horror/horror-banner-display.png?v=20260803",
    buttonImage: "./assets/collections/horror/button.png",
    continueTitle: "Current Rentals",
    posterA: "#1c1012",
    posterB: "#d13c2f",
    menuRows: [
      ["new-arrivals", "killers", "slashers", "creature-features", "supernatural"],
      ["sci-fi-horror", "cult-experimental", "found-footage", "evil-puppets", "relentless-pursuers"],
      ["spooky-kids-tv", "spoopy-kids-movies", "gateway-horror"],
    ],
    sections: [
      curatedSection("New Arrivals", [curatedItem("Talk to Me", 2022, "movie", "Horror")], { id: "new-arrivals" }),
      curatedSection("Killers", horrorKillerFranchiseItems()),
      curatedSection("Slashers", [curatedItem("A Nightmare on Elm Street", 1984, "movie", "Horror")]),
      curatedSection("Creature Features", [curatedItem("The Thing", 1982, "movie", "Horror")]),
      curatedSection("Supernatural", [curatedItem("The Exorcist", 1973, "movie", "Horror")]),
      curatedSection("Sci-Fi Horror", [curatedItem("Alien", 1979, "movie", "Horror")]),
      curatedSection("Cult & Experimental", [curatedItem("House", 1977, "movie", "Horror")]),
      curatedSection("Found Footage", [curatedItem("The Blair Witch Project", 1999, "movie", "Horror")]),
      curatedSection("Evil Puppets", [curatedItem("Child's Play", 1988, "movie", "Horror")]),
      curatedSection("Relentless Pursuers", [curatedItem("It Follows", 2014, "movie", "Horror")]),
      curatedSection("SpOoPy kids TV", [curatedItem("Are You Afraid of the Dark?", 1992, "tv", "Horror")], { id: "spooky-kids-tv" }),
      curatedSection("sPoOpY kids movies", [curatedItem("ParaNorman", 2012, "movie", "Horror")], { id: "spoopy-kids-movies" }),
      curatedSection("Gateway Horror", [curatedItem("Coraline", 2009, "movie", "Horror")]),
    ],
  },
  {
    id: "kaiju",
    title: "Kaiju",
    description: "Giant monsters, city-sized grudges, rubber suits, atomic scars, and cathedral-scale spectacle.",
    heroImage: "./assets/collections/kaiju/hero.png",
    buttonImage: "./assets/collections/kaiju/button.png",
    posterA: "#16140f",
    posterB: "#d07639",
    continueTitle: "Current Rentals",
    menuRows: [
      ["new-arrivals", "showa-1954-1975", "heisei-1984-1995", "millennium-1999-2004", "reiwa-2016-present"],
      ["monsterverse", "king-kong", "all-monsters-attack", "mecha", "other-encounters"],
    ],
    sections: [
      curatedSection("New Arrivals", [curatedItem("Godzilla Minus One", 2023, "movie", "Kaiju")], { id: "new-arrivals" }),
      curatedSection("Showa (1954-1975)", [curatedItem("Godzilla", 1954, "movie", "Kaiju")]),
      curatedSection("Heisei (1984-1995)", [curatedItem("The Return of Godzilla", 1984, "movie", "Kaiju")]),
      curatedSection("Millennium (1999-2004)", [curatedItem("Godzilla 2000: Millennium", 1999, "movie", "Kaiju")]),
      curatedSection("Reiwa (2016-present)", [curatedItem("Shin Godzilla", 2016, "movie", "Kaiju")]),
      curatedSection("MonsterVerse", [curatedItem("Godzilla", 2014, "movie", "Kaiju")]),
      curatedSection("King Kong", [curatedItem("King Kong", 1933, "movie", "Adventure")]),
      curatedSection("All Monsters Attack!", [curatedItem("Destroy All Monsters", 1968, "movie", "Kaiju")]),
      curatedSection("Mecha", [curatedItem("Pacific Rim", 2013, "movie", "Mecha")]),
      curatedSection("Other Encounters", [curatedItem("Gamera: Guardian of the Universe", 1995, "movie", "Kaiju")]),
    ],
  },
  {
    id: "black-excellence",
    title: "UPN",
    description: "Film, television, comedy, documentary, and performance shelves with room to grow.",
    heroImage: "./assets/collections/black-excellence/upn-banner.png?v=20260807b",
    buttonImage: "./assets/collections/black-excellence/upn-button.png?v=20260803",
    posterA: "#1b1410",
    posterB: "#c38b54",
    continueTitle: "Current Rentals",
    menuRows: [
      ["new-arrivals", "cinema", "tv-classics"],
      [
        "umoja-unity-the-prestige-collection",
        "kujichagulia-self-determination-stand-up-comedy",
        "ujima-collective-work-and-responsibility-sketches-and-animation",
        "ujamaa-cooperative-economics-horror-because-it-doesn-t-fit-anywhere-else",
        "nia-purpose-comedy",
        "kumbaaa-creativity-music-and-culture",
        "imani-faith-afrofuturism-and-sci-fi",
      ],
    ],
    sections: [
      curatedSection("New Arrivals", [curatedItem("The Woman King", 2022, "movie", "Drama")], { id: "new-arrivals" }),
      curatedSection("Cinema", [curatedItem("Do the Right Thing", 1989, "movie", "Drama")]),
      curatedSection("TV Classics", [curatedItem("The Fresh Prince of Bel-Air", 1990, "tv", "Comedy")]),
      curatedSection("The Prestige Collection", [curatedItem("Moonlight", 2016, "movie", "Drama")], { id: "umoja-unity-the-prestige-collection" }),
      curatedSection("Stand-Up Comedy", [curatedItem("Richard Pryor: Live in Concert", 1979, "movie", "Stand-up")], { id: "kujichagulia-self-determination-stand-up-comedy" }),
      curatedSection("Sketches & Animation", [curatedItem("A Black Lady Sketch Show", 2019, "tv", "Comedy")], { id: "ujima-collective-work-and-responsibility-sketches-and-animation" }),
      curatedSection("Horror", [curatedItem("Get Out", 2017, "movie", "Horror")], { id: "ujamaa-cooperative-economics-horror-because-it-doesn-t-fit-anywhere-else" }),
      curatedSection("Comedy", [curatedItem("Coming to America", 1988, "movie", "Comedy")], { id: "nia-purpose-comedy" }),
      curatedSection("Music & Culture", [curatedItem("Summer of Soul", 2021, "movie", "Documentary")], { id: "kumbaaa-creativity-music-and-culture" }),
      curatedSection("Afrofuturism & Sci-Fi", [curatedItem("Black Panther", 2018, "movie", "Sci-Fi")], { id: "imani-faith-afrofuturism-and-sci-fi" }),
    ],
  },
  {
    id: "cult-films",
    title: "The Cult Collection",
    description: "Midnight obsessions, strange rituals, audience favorites, and the movies that found their people later.",
    heroImage: "./assets/collections/cult-films/hero.png?v=20260807b",
    buttonImage: "./assets/collections/cult-films/button.png",
    posterA: "#17120f",
    posterB: "#d98d3c",
    continueTitle: "Current Rentals",
    menuRows: [["midnight-movies", "camp", "outsider-cinema", "cult-tv"]],
    sections: [
      curatedSection("Midnight Movies", [curatedItem("Eraserhead", 1977, "movie", "Cult")]),
      curatedSection("Camp", [curatedItem("Showgirls", 1995, "movie", "Cult")]),
      curatedSection("Outsider Cinema", [curatedItem("The Room", 2003, "movie", "Cult")]),
      curatedSection("Cult TV", [curatedTvItem("Bob's Burgers", 2011, "Comedy", "bobs-burgers")]),
    ],
  },
  {
    id: "exploitation",
    title: "The Exploitation Collection",
    description: "Grindhouse posters, taboo hooks, cheap thrills, righteous rage, and rough-edged genre history.",
    heroImage: "./assets/collections/exploitation/hero.png?v=20260807b",
    buttonImage: "./assets/collections/exploitation/button.png",
    posterA: "#201010",
    posterB: "#d0472f",
    continueTitle: "Current Rentals",
    menuRows: [["blaxploitation", "women-in-revolt", "revenge", "grindhouse"]],
    sections: [
      curatedSection("Blaxploitation", [curatedItem("Shaft", 1971, "movie", "Exploitation")]),
      curatedSection("Women in Revolt", [curatedItem("Coffy", 1973, "movie", "Exploitation")]),
      curatedSection("Revenge", [curatedItem("Ms. 45", 1981, "movie", "Exploitation")]),
      curatedSection("Grindhouse", [curatedItem("Switchblade Sisters", 1975, "movie", "Exploitation")]),
    ],
  },
  {
    id: "animation",
    title: "Animation",
    description: "Hand-drawn dreams, stop-motion oddities, computer-age spectacles, shorts, series, and strange little masterpieces.",
    heroImage: "./assets/collections/animation/hero.png?v=20260807b",
    buttonImage: "./assets/collections/animation/button.png",
    posterA: "#102029",
    posterB: "#53c6c8",
    continueTitle: "Current Rentals",
    menuRows: [["features", "tv", "shorts", "grown-up-animation"]],
    sections: [
      curatedSection("Features", [curatedItem("Spirited Away", 2001, "movie", "Animation")]),
      curatedSection("TV", [curatedTvItem("Bob's Burgers", 2011, "Animation", "bobs-burgers"), curatedItem("Adventure Time", 2010, "tv", "Animation")]),
      curatedSection("Shorts", [curatedItem("Steamboat Willie", 1928, "movie", "Animation")]),
      curatedSection("Grown-Up Animation", [curatedItem("Perfect Blue", 1997, "movie", "Animation")]),
    ],
  },
  {
    id: "hammer",
    title: "Hammer",
    description: "British gothic horror, crimson capes, resurrected monsters, graveyard fog, and studio menace.",
    heroImage: "./assets/collections/hammer/hammer-vault-banner.png",
    buttonImage: "./assets/collections/hammer/button.png",
    posterA: "#17090d",
    posterB: "#d94b31",
    menuRows: [["horror-icons", "vampires", "frankenstein", "graveyard-favorites"]],
    sections: [
      curatedSection("Horror Icons", [curatedItem("The Curse of Frankenstein", 1957, "movie", "Horror"), curatedItem("Dracula", 1958, "movie", "Horror")]),
      curatedSection("Vampires", [curatedItem("The Brides of Dracula", 1960, "movie", "Horror")]),
      curatedSection("Frankenstein", [curatedItem("Frankenstein Created Woman", 1967, "movie", "Horror")]),
      curatedSection("Graveyard Favorites", [curatedItem("The Mummy", 1959, "movie", "Horror")]),
    ],
  },
  {
    id: "defa",
    title: "DEFA",
    description: "Films of the German Democratic Republic: features, shorts, animation, documentary, and serial shelves.",
    heroImage: "./assets/collections/defa/hero.png",
    buttonImage: "./assets/collections/defa/button.png",
    posterA: "#180e0a",
    posterB: "#bb392e",
    menuRows: [["films", "shorts", "animations", "documentaries", "serials"]],
    sections: [
      curatedSection("Films", [curatedItem("The Legend of Paul and Paula", 1973, "movie", "Drama")]),
      curatedSection("Shorts", [curatedItem("The Rabbit Is Me", 1965, "movie", "Drama")]),
      curatedSection("Animations", [curatedItem("The Flying Windmill", 1982, "movie", "Animation")]),
      curatedSection("Documentaries", [curatedItem("Winter AdÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©", 1989, "movie", "Documentary")]),
      curatedSection("Serials", [curatedItem("Spuk unterm Riesenrad", 1979, "tv", "Family")]),
    ],
  },
  {
    id: "george-formby",
    title: "George Formby Collection",
    description: "Bright seaside songs, ukulele trouble, music-hall charm, and cheerful British screen comedy.",
    heroImage: "./assets/collections/george-formby/hero.png",
    buttonImage: "./assets/collections/george-formby/button.png",
    posterA: "#25445b",
    posterB: "#e4b36b",
    menuRows: [["features", "music-hall-favorites", "wartime-formby"]],
    sections: [
      curatedSection("Features", [curatedItem("No Limit", 1935, "movie", "Comedy"), curatedItem("Keep Your Seats Please", 1936, "movie", "Comedy")]),
      curatedSection("Music-Hall Favorites", [curatedItem("It's in the Air", 1938, "movie", "Comedy")]),
      curatedSection("Wartime Formby", [curatedItem("Spare a Copper", 1940, "movie", "Comedy"), curatedItem("Turned Out Nice Again", 1941, "movie", "Comedy")]),
    ],
  },
  {
    id: "plan-9-from-the-b-movie-aisle",
    title: "Plan 9 From the B-Movie Aisle",
    description: "Cheap thrills, cardboard spacecraft, basement legends, and movies that bite back lovingly.",
    heroImage: "./assets/collections/plan-9-from-the-b-movie-aisle/hero.png",
    buttonImage: "./assets/collections/plan-9-from-the-b-movie-aisle/button.png",
    posterA: "#070606",
    posterB: "#c73124",
    menuRows: [["outer-space", "monster-shelf", "drive-in-disasters"]],
    sections: [
      curatedSection("Outer Space", [curatedItem("Plan 9 from Outer Space", 1959, "movie", "Sci-Fi")]),
      curatedSection("Monster Shelf", [curatedItem("Attack of the Giant Leeches", 1959, "movie", "Horror")]),
      curatedSection("Drive-In Disasters", [curatedItem("Manos: The Hands of Fate", 1966, "movie", "Horror"), curatedItem("The Brain That Wouldn't Die", 1962, "movie", "Horror")]),
    ],
  },
  {
    id: "star-trek",
    title: "Star Trek",
    description: "Starships, captains, cosmic diplomacy, strange new worlds, and boldly syndicated comfort.",
    heroImage: "./assets/collections/star-trek/hero.png",
    buttonImage: "./assets/collections/star-trek/button.png",
    posterA: "#0c1231",
    posterB: "#6faeff",
    menuRows: [["original-crew", "next-generation", "kelvin-timeline", "television"]],
    sections: [
      curatedSection("Original Crew", [curatedItem("Star Trek: The Motion Picture", 1979, "movie", "Sci-Fi"), curatedItem("Star Trek II: The Wrath of Khan", 1982, "movie", "Sci-Fi")]),
      curatedSection("Next Generation", [curatedItem("Star Trek: First Contact", 1996, "movie", "Sci-Fi")]),
      curatedSection("Kelvin Timeline", [curatedItem("Star Trek", 2009, "movie", "Sci-Fi")]),
      curatedSection("Television", [curatedItem("Star Trek", 1966, "tv", "Sci-Fi"), curatedItem("Star Trek: The Next Generation", 1987, "tv", "Sci-Fi")]),
    ],
  },
  {
    id: "2010s",
    title: "2010s",
    description: "A decade shelf for the test pass, currently proving itself one burger at a time.",
    posterA: "#1a120c",
    posterB: "#f3b018",
    menuRows: [["comedy"]],
    sections: [curatedSection("Comedy", [curatedTvItem("Bob's Burgers", 2011, "Comedy", "bobs-burgers")])],
  },
  {
    id: "dc-animation",
    title: "DC Animation",
    description: "Animated universes, direct-to-video eras, continuity resets, and capes drawn with shadows.",
    heroImage: "./assets/collections/dc-animation/hero.png?v=20260807b",
    buttonImage: "./assets/collections/dc-animation/button.png",
    posterA: "#172133",
    posterB: "#5f91d6",
    menuRows: [["timmverse", "new-52", "tomorrowverse", "infinite-earths"]],
    sections: [
      curatedSection("Timmverse", [curatedItem("Batman: The Animated Series", 1992, "tv", "Animation")]),
      curatedSection("New 52", [curatedItem("Justice League: War", 2014, "movie", "Animation")]),
      curatedSection("Tomorrowverse", [curatedItem("Superman: Man of Tomorrow", 2020, "movie", "Animation")]),
      curatedSection("Infinite Earths", [curatedItem("Justice League: Crisis on Infinite Earths", 2024, "movie", "Animation")]),
    ],
  },
  {
    id: "arrowverse",
    title: "Arrowverse",
    description: "Network superhero nights, crossovers, speed-force chaos, and city-by-city melodrama.",
    heroImage: "./assets/collections/arrowverse/hero.png?v=20260807b",
    buttonImage: "./assets/collections/arrowverse/button.png",
    showHeroText: false,
    posterA: "#14241b",
    posterB: "#53a86b",
    menuRows: [
      ["arrow", "the-flash", "supergirl", "legends-of-tomorrow"],
      ["black-lightning", "batwoman", "crossover-events"],
    ],
    sections: [
      curatedSection("Arrow", [curatedItem("Arrow", 2012, "tv", "Superhero")]),
      curatedSection("The Flash", [curatedItem("The Flash", 2014, "tv", "Superhero")]),
      curatedSection("Supergirl", [curatedItem("Supergirl", 2015, "tv", "Superhero")]),
      curatedSection("Legends of Tomorrow", [curatedItem("DC's Legends of Tomorrow", 2016, "tv", "Superhero")]),
      curatedSection("Black Lightning", [curatedItem("Black Lightning", 2018, "tv", "Superhero")]),
      curatedSection("Batwoman", [curatedItem("Batwoman", 2019, "tv", "Superhero")]),
      curatedSection("Crossover Events", [curatedItem("Crisis on Infinite Earths", 2019, "tv", "Superhero")]),
    ],
  },
  {
    id: "james-bond",
    title: "James Bond",
    description: "Assignments by actor, era, gadget, tuxedo, and improbable international trouble.",
    buttonImage: "./assets/collections/james-bond/button.png",
    showHeroText: false,
    posterA: "#151514",
    posterB: "#d0b16a",
    menuRows: [
      ["all", "sean-connery", "george-lazenby", "roger-moore"],
      ["timothy-dalton", "pierce-brosnan", "daniel-craig", "other-films"],
    ],
    sections: [
      curatedSection("All", [curatedItem("Dr. No", 1962, "movie", "Spy")]),
      curatedSection("Sean Connery", [curatedItem("Goldfinger", 1964, "movie", "Spy")]),
      curatedSection("George Lazenby", [curatedItem("On Her Majesty's Secret Service", 1969, "movie", "Spy")]),
      curatedSection("Roger Moore", [curatedItem("The Spy Who Loved Me", 1977, "movie", "Spy")]),
      curatedSection("Timothy Dalton", [curatedItem("The Living Daylights", 1987, "movie", "Spy")]),
      curatedSection("Pierce Brosnan", [curatedItem("GoldenEye", 1995, "movie", "Spy")]),
      curatedSection("Daniel Craig", [curatedItem("Casino Royale", 2006, "movie", "Spy")]),
      curatedSection("Other films", [curatedItem("Never Say Never Again", 1983, "movie", "Spy")]),
    ],
  },
  {
    id: "universal-monsters",
    title: "Universal Monsters",
    description: "Classic monsters, crossovers, laboratories, crypts, lagoons, castles, and midnight howls.",
    heroImage: "./assets/collections/universal-monsters/hero.png",
    buttonImage: "./assets/collections/universal-monsters/button.png",
    posterA: "#171a19",
    posterB: "#a7b0a6",
    continueTitle: "Current Rentals",
    menuRows: [
      ["new-arrivals", "crossovers", "dracula", "frankenstein", "the-mummy", "invisible-man"],
      ["wolf-man", "creature-from-the-black-lagoon", "other-monsters", "hammer-horror"],
    ],
    sections: [
      curatedSection("New Arrivals", [curatedItem("Abbott and Costello Meet Frankenstein", 1948, "movie", "Horror")], { id: "new-arrivals" }),
      curatedSection("Crossovers", [curatedItem("House of Frankenstein", 1944, "movie", "Horror")]),
      curatedSection("Dracula", [curatedItem("Dracula", 1931, "movie", "Horror")]),
      curatedSection("Frankenstein", [curatedItem("Frankenstein", 1931, "movie", "Horror")]),
      curatedSection("The Mummy", [curatedItem("The Mummy", 1932, "movie", "Horror")]),
      curatedSection("Invisible Man", [curatedItem("The Invisible Man", 1933, "movie", "Horror")]),
      curatedSection("Wolf Man", [curatedItem("The Wolf Man", 1941, "movie", "Horror")]),
      curatedSection("Creature from the Black Lagoon", [curatedItem("Creature from the Black Lagoon", 1954, "movie", "Horror")]),
      curatedSection("Other Monsters", [curatedItem("The Phantom of the Opera", 1943, "movie", "Horror")]),
      curatedSection("Hammer Horror", [curatedItem("The Curse of Frankenstein", 1957, "movie", "Horror")]),
    ],
  },
  {
    id: "a24",
    title: "A24",
    description: "Mood shelves for the beautifully strange house down the arthouse street.",
    heroImage: "./assets/collections/a24/a24-banner.png",
    buttonImage: "./assets/collections/a24/button.png",
    showHeroText: false,
    posterA: "#101114",
    posterB: "#d8b35d",
    menuRows: [
      ["drama", "horror", "comedy", "thriller", "sci-fi"],
      ["fantasy", "romance", "documentary", "musical", "tv-series"],
    ],
    sections: [
      curatedSection("Drama", [curatedItem("Moonlight", 2016, "movie", "Drama")]),
      curatedSection("Horror", [curatedItem("Hereditary", 2018, "movie", "Horror")]),
      curatedSection("Comedy", [curatedItem("Lady Bird", 2017, "movie", "Comedy")]),
      curatedSection("Thriller", [curatedItem("Good Time", 2017, "movie", "Thriller")]),
      curatedSection("Sci-fi", [curatedItem("Ex Machina", 2014, "movie", "Sci-Fi")]),
      curatedSection("Fantasy", [curatedItem("The Green Knight", 2021, "movie", "Fantasy")]),
      curatedSection("Romance", [curatedItem("Past Lives", 2023, "movie", "Romance")]),
      curatedSection("Documentary", [curatedItem("Amy", 2015, "movie", "Documentary")]),
      curatedSection("Musical", [curatedItem("Stop Making Sense", 1984, "movie", "Musical")]),
      curatedSection("TV Series", [curatedItem("Euphoria", 2019, "tv", "Drama")]),
    ],
  },
  {
    id: "endless-anime-odyssey",
    title: "Endless Anime Odyssey",
    description: "Long-running quests, after-school blocks, midnight discoveries, and chaotic comfort watches.",
    heroImage: "./assets/collections/anime/hero.png",
    buttonImage: "./assets/collections/anime/button.png",
    showHeroText: false,
    continueTitle: "Continue Watching",
    posterA: "#1b1635",
    posterB: "#e69a4b",
    menuRows: [
      ["choose-you", "new-arrivals", "shonen-giants", "toonami-fever", "monster-collectors"],
      ["eternal-episode-abyss", "anime-midnight", "anime-chaos-energy", "extras"],
    ],
    sections: [
      curatedSection("I Choose You!", [curatedItem("Pokemon", 1997, "tv", "Adventure")], { menuOnly: true }),
      curatedSection("New Arrivals", [curatedItem("Demon Slayer: Kimetsu no Yaiba", 2019, "tv", "Action")], { id: "new-arrivals" }),
      curatedSection("Shonen Giants", [curatedItem("Dragon Ball Z", 1989, "tv", "Action")]),
      curatedSection("Toonami Fever", [curatedItem("Cowboy Bebop", 1998, "tv", "Sci-Fi")]),
      curatedSection("Monster Collectors", [curatedItem("Pokemon", 1997, "tv", "Adventure")]),
      curatedSection("Eternal Episode Abyss", [curatedItem("One Piece", 1999, "tv", "Adventure")]),
      curatedSection("Anime Midnight", [curatedItem("Death Note", 2006, "tv", "Thriller")]),
      curatedSection("Anime Chaos Energy", [curatedItem("FLCL", 2000, "tv", "Comedy")]),
      curatedSection("Extras", [curatedItem("Dragon Ball Z: Bardock - The Father of Goku", 1990, "movie", "Special")]),
    ],
  },
  {
    id: "saturday-morning-marathon",
    title: "Saturday Morning Marathon",
    description: "Cartoons, sitcom blocks, cereal-bowl television, and couch archaeology.",
    heroImage: "./assets/collections/saturday-morning-marathon/hero.png",
    buttonImage: "./assets/collections/saturday-morning-marathon/button.png",
    showHeroText: false,
    posterA: "#14223a",
    posterB: "#f2b84b",
    continueTitle: "Continue Watching",
    menuRows: [["new-arrivals", "car22ns", "tgif"]],
    sections: [
      curatedSection("New Arrivals", [curatedItem("X-Men: The Animated Series", 1992, "tv", "Animation")], { id: "new-arrivals" }),
      curatedSection("Car22ns", [curatedItem("Doug", 1991, "tv", "Animation")]),
      curatedSection("TGIF", [curatedItem("Boy Meets World", 1993, "tv", "Comedy")]),
    ],
  },
  ...buildProfileCollections(),
];

const wcwChampionshipLayout = [
  {
    ids: ["wcw-world-heavyweight-championship"],
    name: "WCW World Heavyweight Championship",
    imageUrl: "./assets/championships/wcw-world-heavyweight.png",
  },
  {
    ids: ["wcw-united-states-heavyweight-championship", "wcw-wcw-united-states-heavyweight-title"],
    name: "WCW United States Heavyweight Championship",
    imageUrl: "./assets/championships/wcw-united-states-heavyweight.png",
    imageMode: "belt-cutout",
  },
  {
    ids: ["wcw-cruiserweight-championship", "wcw-wcw-cruiserweight-title"],
    name: "WCW Cruiserweight Championship",
    imageUrl: "./assets/championships/wcw-cruiserweight.png",
    imageMode: "belt-cutout",
  },
  {
    ids: ["wcw-world-tag-team-championship", "wcw-wcw-world-tag-team-titles"],
    name: "WCW Tag Team Championship",
    imageUrl: "./assets/championships/wcw-tag-team.png",
  },
  {
    ids: ["wcw-world-television-championship"],
    name: "WCW Television Championship",
    imageUrl: "./assets/championships/wcw-television.png",
  },
  {
    ids: ["wcw-hardcore-championship", "wcw-wcw-hardcore-title"],
    name: "WCW Hardcore Championship",
    imageUrl: "./assets/championships/wcw-hardcore.png",
  },
  {
    ids: ["wcw-world-six-man-tag-team-championship"],
    name: "WCW World Six-Man Tag Team Championship",
    imageUrl: "./assets/championships/wcw-six-man-tag.png",
  },
  {
    ids: ["wcw-cruiserweight-tag-team-championship", "wcw-wcw-cruiserweight-tag-team-titles"],
    name: "WCW Cruiserweight Tag Team Championship",
    imageUrl: "./assets/championships/wcw-cruiserweight-tag.png",
  },
  {
    ids: ["wcw-united-states-tag-team-championship"],
    name: "WCW United States Tag Team Championship",
    imageUrl: "./assets/championships/wcw-us-tag.png",
  },
];

const wcwChampionshipImageMap = {
  "wcw-international-world-heavyweight-championship": "./assets/championships/wcw-world-heavyweight.png",
  "wcw-light-heavyweight-championship": "./assets/championships/wcw-light-heavyweight.png",
  "wcw-women-s-championship": "./assets/championships/wcw-womens.png",
  "wcw-women-s-cruiserweight-championship": "./assets/championships/wcw-womens-cruiserweight.png",
};

const sdhChampionshipImageMap = {
  "AAA Latin American Championship": "./assets/championships/sdh/aaa-latin-american-championship.png",
  "AAA Mega Championship": "./assets/championships/sdh/aaa-mega-championship.png",
  "AAA Mixed Tag Team Championship": "./assets/championships/sdh/aaa-mixed-tag-team-championship.png",
  "AAA Reina de Reinas Championship": "./assets/championships/sdh/aaa-reina-de-reinas-championship.png",
  "AAA Tag Team Championship": "./assets/championships/sdh/aaa-tag-team-championship.png",
  "AAA Trios Championship": "./assets/championships/sdh/aaa-trios-championship.png",
  "AAA World Cruiserweight Championship": "./assets/championships/sdh/aaa-world-cruiserweight-championship.png",
  "AJPW All Asia Tag Team Championship": "./assets/championships/sdh/ajpw-all-asia-tag-team-championship.png",
  "AJPW Gaora TV Championship": "./assets/championships/sdh/ajpw-gaora-tv-championship.png",
  "AJPW Triple Crown Heavyweight Championship": "./assets/championships/sdh/ajpw-triple-crown-heavyweight-championship.png",
  "AJPW World Junior Heavyweight Championship": "./assets/championships/sdh/ajpw-world-junior-heavyweight-championship.png",
  "AJPW World Tag Team Championship": "./assets/championships/sdh/ajpw-world-tag-team-championship.png",
  "AJPW.TV Six-Men Tag Team Championship": "./assets/championships/sdh/ajpw-tv-six-men-tag-team-championship.png",
  "CMLL Arena Coliseo Tag Team Championship": "./assets/championships/sdh/cmll-arena-coliseo-tag-team-championship.png",
  "CMLL Occidente Heavyweight Championship": "./assets/championships/sdh/cmll-occidente-heavyweight-championship.png",
  "CMLL Occidente Middleweight Championship": "./assets/championships/sdh/cmll-occidente-middleweight-championship.png",
  "CMLL Occidente Tag Team Championship": "./assets/championships/sdh/cmll-occidente-tag-team-championship.png",
  "CMLL Occidente Trios Championship": "./assets/championships/sdh/cmll-occidente-trios-championship.png",
  "CMLL Universal Amazons Championship": "./assets/championships/sdh/cmll-universal-amazons-championship.png",
  "CMLL Universal Championship": "./assets/championships/sdh/cmll-universal-championship.png",
  "CMLL Arena Puebla Barroco Championship": "./assets/championships/sdh/cmll-arena-puebla-barroco-championship.png",
  "CMLL Japan Women's Championship": "./assets/championships/sdh/cmll-japan-women-s-championship.png",
  "CMLL King of the Underworld Championship": "./assets/championships/sdh/cmll-king-of-the-underworld-championship.png",
  "CMLL Kid's Ambassador Championship": "./assets/championships/sdh/cmll-kid-s-ambassador-championship.png",
  "CMLL Occidente Women's Championship": "./assets/championships/sdh/cmll-occidente-women-s-championship.png",
  "CMLL Occidente Women's Tag Team Championship": "./assets/championships/sdh/cmll-occidente-women-s-tag-team-championship.png",
  "CMLL Vive Latino Championship": "./assets/championships/sdh/cmll-vive-latino-championship.png",
  "CMLL World Heavyweight Championship": "./assets/championships/sdh/cmll-world-heavyweight-championship.png",
  "CMLL World Light Heavyweight Championship": "./assets/championships/sdh/cmll-world-light-heavyweight-championship.png",
  "CMLL World Lightweight Championship": "./assets/championships/sdh/cmll-world-lightweight-championship.png",
  "CMLL World Micro-Stars Championship": "./assets/championships/sdh/cmll-world-micro-stars-championship.png",
  "CMLL World Middleweight Championship": "./assets/championships/sdh/cmll-world-middleweight-championship.png",
  "CMLL World Mini-Stars Championship": "./assets/championships/sdh/cmll-world-mini-stars-championship.png",
  "CMLL World Tag Team Championship": "./assets/championships/sdh/cmll-world-tag-team-championship.png",
  "CMLL World Trios Championship": "./assets/championships/sdh/cmll-world-trios-championship.png",
  "CMLL World Welterweight Championship": "./assets/championships/sdh/cmll-world-welterweight-championship.png",
  "CMLL World Women's Tag Team Championship": "./assets/championships/sdh/cmll-world-women-s-tag-team-championship.png",
  "CMLL World Women's Championship": "./assets/championships/sdh/cmll-world-women-s-championship.png",
  "GHC Heavyweight Championship": "./assets/championships/sdh/ghc-heavyweight-championship.png",
  "GHC Junior Heavyweight Championship": "./assets/championships/sdh/ghc-junior-heavyweight-championship.png",
  "GHC Junior Heavyweight Tag Team Championship": "./assets/championships/sdh/ghc-junior-heavyweight-tag-team-championship.png",
  "GHC National Championship": "./assets/championships/sdh/ghc-national-championship.png",
  "GHC Tag Team Championship": "./assets/championships/sdh/ghc-tag-team-championship.png",
  "GHC Women's Championship": "./assets/championships/sdh/ghc-women-s-championship.png",
  "IWGP Global Heavyweight Championship": "./assets/championships/sdh/iwgp-global-heavyweight-championship.png",
  "IWGP Heavyweight Championship": "./assets/championships/sdh/iwgp-heavyweight-championship.png",
  "IWGP Junior Heavyweight Championship": "./assets/championships/sdh/iwgp-junior-heavyweight-championship.png",
  "IWGP Junior Heavyweight Tag Team Championship": "./assets/championships/sdh/iwgp-junior-heavyweight-tag-team-championship.png",
  "IWGP Tag Team Championship": "./assets/championships/sdh/iwgp-tag-team-championship.png",
  "IWGP Women's Championship": "./assets/championships/sdh/iwgp-women-s-championship.webp",
  "IWA Unified Puerto Rico Heavyweight Championship": "./assets/championships/sdh/iwa-unified-puerto-rico-heavyweight-championship.png",
  "MLP International Heavyweight Championship": "./assets/championships/sdh/mlp-international-heavyweight-championship.png",
  "MLW National Openweight Championship": "./assets/championships/sdh/mlw-national-openweight-championship.png",
  "MLW World Heavyweight Championship": "./assets/championships/sdh/mlw-world-heavyweight-championship.png",
  "MLW World Middleweight Championship": "./assets/championships/sdh/mlw-world-middleweight-championship.png",
  "MLW World Tag Team Championship": "./assets/championships/sdh/mlw-world-tag-team-championship.png",
  "MLW World Women's Featherweight Championship": "./assets/championships/sdh/mlw-world-women-s-featherweight-championship.png",
  "Mexican National Heavyweight Championship": "./assets/championships/sdh/mexican-national-heavyweight-championship.png",
  "Mexican National Light Heavyweight Championship": "./assets/championships/sdh/mexican-national-light-heavyweight-championship.png",
  "Mexican National Lightweight Championship": "./assets/championships/sdh/mexican-national-lightweight-championship.png",
  "Mexican National Middleweight Championship": "./assets/championships/sdh/mexican-national-middleweight-championship.png",
  "Mexican National Tag Team Championship": "./assets/championships/sdh/mexican-national-tag-team-championship.png",
  "Mexican National Trios Championship": "./assets/championships/sdh/mexican-national-trios-championship.png",
  "Mexican National Welterweight Championship": "./assets/championships/sdh/mexican-national-welterweight-championship.png",
  "Mexican National Women's Championship": "./assets/championships/sdh/mexican-national-women-s-championship.png",
  "Mexican National Women's Tag Team Championship": "./assets/championships/sdh/mexican-national-women-s-tag-team-championship.png",
  "NEVER Openweight 6-Man Tag Team Championship": "./assets/championships/sdh/never-openweight-6-man-tag-team-championship.png",
  "NEVER Openweight Championship": "./assets/championships/sdh/never-openweight-championship.png",
  "NJPW World Television Championship": "./assets/championships/sdh/njpw-world-television-championship.webp",
  "NWA Mid-America Heavyweight Championship": "./assets/championships/sdh/nwa-mid-america-heavyweight-championship.webp",
  "NWA National Heavyweight Championship": "./assets/championships/sdh/nwa-national-heavyweight-championship.webp",
  "NWA Texas Heavyweight Championship": "./assets/championships/sdh/nwa-texas-heavyweight-championship.png",
  "NWA United States Tag Team Championship": "./assets/championships/sdh/nwa-united-states-tag-team-championship.png",
  "NWA World Junior Heavyweight Championship": "./assets/championships/sdh/nwa-world-junior-heavyweight-championship.png",
  "NWA World Tag Team Championship": "./assets/championships/sdh/nwa-world-tag-team-championship.webp",
  "NWA World Television Championship": "./assets/championships/sdh/nwa-world-television-championship.png",
  "NWA World Women's Championship": "./assets/championships/sdh/nwa-world-women-s-championship.webp",
  "NWA Worlds Heavyweight Championship": "./assets/championships/sdh/nwa-worlds-heavyweight-championship.png",
  "Open the Brave Gate Championship": "./assets/championships/sdh/open-the-brave-gate-championship.png",
  "Open the Dream Gate Championship": "./assets/championships/sdh/open-the-dream-gate-championship.png",
  "Open the Triangle Gate Championship": "./assets/championships/sdh/open-the-triangle-gate-championship.png",
  "Open the Twin Gate Championship": "./assets/championships/sdh/open-the-twin-gate-championship.png",
  "OVW Heavyweight Championship": "./assets/championships/sdh/ovw-heavyweight-championship.png",
  "OVW Media Championship": "./assets/championships/sdh/ovw-media-championship.png",
  "OVW Rush Division Championship": "./assets/championships/sdh/ovw-rush-division-championship.png",
  "OVW Tag Team Championship": "./assets/championships/sdh/ovw-tag-team-championship.png",
  "OVW United States Heavyweight Championship": "./assets/championships/sdh/ovw-united-states-heavyweight-championship.png",
  "OVW Women's Championship": "./assets/championships/sdh/ovw-women-s-championship.png",
  "ROH Pure Championship": "./assets/championships/sdh/roh-pure-championship.png",
  "ROH Women's World Championship": "./assets/championships/sdh/roh-women-s-world-championship.png",
  "ROH Women's World Television Championship": "./assets/championships/sdh/roh-women-s-world-television-championship.png",
  "ROH Women's Pure Championship": "./assets/championships/sdh/roh-women-s-pure-championship.png",
  "ROH World Championship": "./assets/championships/sdh/roh-world-championship.png",
  "ROH World Six-Man Tag Team Championship": "./assets/championships/sdh/roh-world-six-man-tag-team-championship.png",
  "ROH World Tag Team Championship": "./assets/championships/sdh/roh-world-tag-team-championship.png",
  "ROH World Television Championship": "./assets/championships/sdh/roh-world-television-championship.png",
  "Strong Women's Championship": "./assets/championships/sdh/strong-women-s-championship.webp",
  "Strong Openweight Championship": "./assets/championships/sdh/strong-openweight-championship.png",
  "Strong Openweight Tag Team Championship": "./assets/championships/sdh/strong-openweight-tag-team-championship.webp",
  "TNA International Championship": "./assets/championships/sdh/tna-international-championship.png",
  "TNA Knockouts World Championship": "./assets/championships/sdh/tna-knockouts-world-championship.png",
  "TNA Knockouts World Tag Team Championship": "./assets/championships/sdh/tna-knockouts-world-tag-team-championship.png",
  "TNA World Championship": "./assets/championships/sdh/tna-world-championship.png",
  "TNA World Tag Team Championship": "./assets/championships/sdh/tna-world-tag-team-championship.png",
  "TNA X Division Championship": "./assets/championships/sdh/tna-x-division-championship.png",
  "Wonder Of Stardom Championship": "./assets/championships/sdh/wonder-of-stardom-championship.png",
  "World of Stardom Championship": "./assets/championships/sdh/world-of-stardom-championship.png",
  "Goddesses Of Stardom Championship": "./assets/championships/sdh/goddesses-of-stardom-championship.png",
  "New Blood Tag Team Championship": "./assets/championships/sdh/new-blood-tag-team-championship.png",
  "Artist Of Stardom Championship": "./assets/championships/sdh/artist-of-stardom-championship.png",
  "High Speed Championship": "./assets/championships/sdh/high-speed-championship.png",
  "Future Of Stardom Championship": "./assets/championships/sdh/future-of-stardom-championship.png",
  "GHC Hardcore Openweight Championship": "./assets/championships/sdh/ghc-hardcore-openweight-championship.png",
  "WWE Evolve Championship": "./assets/championships/sdh/wwe-evolve-championship.png",
  "WWE Evolve Women's Championship": "./assets/championships/sdh/wwe-evolve-women-s-championship.png",
  "WWE ID Championship": "./assets/championships/sdh/wwe-id-championship.png",
  "WWE ID Women's Championship": "./assets/championships/sdh/wwe-id-women-s-championship.png",
};

const achievementImageMap = {
  "aew-owen-hart-cup-men": "./assets/championships/aew-owen-hart-cup-men.png",
  "aew-owen-hart-cup-women": "./assets/championships/aew-owen-hart-cup-women.png",
  "wwe-royal-rumble-men": "./assets/championships/wwe-mens-royal-rumble.png",
  "wwe-royal-rumble-women": "./assets/championships/wwe-womens-royal-rumble.png",
  "wwe-money-in-the-bank-men": "./assets/championships/wwe-mitb.jpg",
  "wwe-money-in-the-bank-women": "./assets/championships/wwe-mitb.jpg",
  "wwe-elimination-chamber-men": "./assets/championships/wwe-mens-ec.png",
  "wwe-elimination-chamber-women": "./assets/championships/wwe-womens-ec.png",
  "wwe-king-of-the-ring": "./assets/championships/wwe-mens-kotr.png",
  "wwe-queen-of-the-ring": "./assets/championships/wwe-qotr.webp",
};

const wweChampionshipSections = [
  {
    title: "Active Championships",
    groups: [
      {
        title: "World Championships",
        columns: 4,
        championships: [
          wweChampionship("wwe-championship", "WWE Championship"),
          wweChampionship("wwe-womens-championship", "WWE Women's Championship"),
          wweChampionship("wwe-world-heavyweight", "World Heavyweight Championship"),
          wweChampionship("wwe-womens-world", "Women's World Championship"),
        ],
      },
      {
        title: "Singles Championships",
        columns: 4,
        championships: [
          wweChampionship("wwe-united-states", "WWE United States Championship"),
          wweChampionship("wwe-womens-united-states", "WWE Women's United States Championship"),
          wweChampionship("wwe-intercontinental", "WWE Intercontinental Championship"),
          wweChampionship("wwe-womens-intercontinental", "WWE Women's Intercontinental Championship"),
        ],
      },
      {
        title: "Tag Team Championships",
        columns: 3,
        championships: [
          wweChampionship("wwe-tag-team", "WWE Tag Team Championship"),
          wweChampionship("wwe-world-tag-team", "World Tag Team Championship"),
          wweChampionship("wwe-womens-tag-team", "WWE Women's Tag Team Championship"),
        ],
      },
      {
        title: "NXT",
        columns: 2,
        championships: [
          wweChampionship("nxt-championship", "NXT Championship"),
          wweChampionship("nxt-womens", "NXT Women's Championship"),
          wweChampionship("nxt-north-american", "NXT North American Championship"),
          wweChampionship("nxt-womens-north-american", "NXT Women's North American Championship"),
          wweChampionship("nxt-tag-team", "NXT Tag Team Championship"),
          wweChampionship("nxt-heritage-cup", "NXT Heritage Cup"),
        ],
      },
    ],
  },
  {
    title: "Other Titles and Achievements",
    groups: [
      sectionGroup(
        "Royal Rumble",
        2,
        achievements("wwe", [
          ["royal-rumble-men", "Men's Royal Rumble"],
          ["royal-rumble-women", "Women's Royal Rumble"],
        ]),
      ),
      sectionGroup(
        "Money in the Bank",
        2,
        achievements("wwe", [
          ["money-in-the-bank-men", "Men's Money in the Bank"],
          ["money-in-the-bank-women", "Women's Money in the Bank"],
        ]),
      ),
      sectionGroup(
        "Elimination Chamber",
        2,
        achievements("wwe", [
          ["elimination-chamber-men", "Men's Elimination Chamber"],
          ["elimination-chamber-women", "Women's Elimination Chamber"],
        ]),
      ),
      sectionGroup(
        "King & Queen of the Ring",
        2,
        achievements("wwe", [
          ["king-of-the-ring", "King of the Ring"],
          ["queen-of-the-ring", "Queen of the Ring"],
        ]),
      ),
    ],
  },
  {
    title: "Former Championships",
    groups: [
      {
        title: "Men's Singles Championships",
        columns: 3,
        championships: [
          wweChampionship("wwe-world-heavyweight-2002", "World Heavyweight Championship (2002-2013)"),
          wweChampionship("wwe-universal", "WWE Universal Championship"),
          wweChampionship("ecw-world-heavyweight", "ECW World Heavyweight Championship"),
          wweChampionship("wwe-cruiserweight", "WCW / WWE Cruiserweight Championship"),
          wweChampionship("nxt-cruiserweight", "NXT Cruiserweight Championship"),
          wweChampionship("nxt-united-kingdom", "NXT United Kingdom Championship"),
          wweChampionship("wwe-hardcore", "WWF Hardcore Championship"),
          wweChampionship("wwe-european", "WWF European Championship"),
          wweChampionship("wwe-light-heavyweight", "WWF Light Heavyweight Championship"),
        ],
      },
      {
        title: "Women's Singles Championships",
        columns: 3,
        championships: [
          wweChampionship("wwe-womens-1956", "WWE Women's Championship (1956-2010)"),
          wweChampionship("wwe-divas", "WWE Divas Championship"),
          wweChampionship("nxt-uk-womens", "NXT UK Women's Championship"),
        ],
      },
      {
        title: "Tag Team Championships",
        columns: 3,
        championships: [
          wweChampionship("wwe-world-tag-team-1971", "World Tag Team Championship (1971-2010)"),
          wweChampionship("nxt-uk-tag-team", "NXT UK Tag Team Championship"),
          wweChampionship("nxt-womens-tag-team", "NXT Women's Tag Team Championship"),
        ],
      },
    ],
  },
];

const aewChampionshipSections = [
  {
    title: "Active Championships",
    groups: [
      {
        title: "World Championships",
        columns: 2,
        championships: [
          beltChampionship("aew", "aew-world", "AEW World Championship"),
          beltChampionship("aew", "aew-womens-world", "AEW Women's World Championship"),
        ],
      },
      {
        title: "Singles Championships",
        columns: 5,
        championships: [
          beltChampionship("aew", "aew-international", "AEW International Championship"),
          beltChampionship("aew", "aew-continental", "AEW Continental Championship"),
          {
            ...beltChampionship("aew", "aew-national", "AEW National Championship"),
            imageUrl: "https://upload.wikimedia.org/wikipedia/en/thumb/5/5a/AEW_National_Title.png/330px-AEW_National_Title.png",
          },
          beltChampionship("aew", "aew-tnt", "AEW TNT Championship"),
          beltChampionship("aew", "aew-tbs", "AEW TBS Championship"),
        ],
      },
      {
        title: "Tag Team Championships",
        columns: 3,
        championships: [
          beltChampionship("aew", "aew-tag-team", "AEW World Tag Team Championship"),
          beltChampionship("aew", "aew-trios", "AEW World Trios Championship"),
          beltChampionship("aew", "aew-womens-tag-team", "AEW Women's World Tag Team Championship"),
        ],
      },
    ],
  },
  {
    title: "Former Championships",
    groups: [
      {
        title: "Retired and Inactive Titles",
        columns: 2,
        championships: [beltChampionship("aew", "aew-unified", "AEW Unified Championship")],
      },
    ],
  },
  {
    title: "Other Titles and Achievements",
    groups: [
      sectionGroup(
        "Owen Hart Cup",
        2,
        achievements("aew", [
          ["owen-hart-cup-men", "Men's Owen Hart Cup"],
          ["owen-hart-cup-women", "Women's Owen Hart Cup"],
        ]),
      ),
      sectionGroup(
        "Annual Achievements",
        2,
        achievements("aew", [
          ["continental-classic", "Continental Classic"],
          ["dynamite-diamond-ring", "Dynamite Diamond Ring"],
        ]),
      ),
    ],
  },
];

const ecwChampionshipSections = [
  {
    title: "Championships",
    groups: [
      {
        title: "Extreme Championship Wrestling",
        columns: 3,
        championships: [
          beltChampionship("ecw", "ecw-world", "ECW World Heavyweight Championship"),
          beltChampionship("ecw", "ecw-television", "ECW World Television Championship"),
          beltChampionship("ecw", "ecw-tag-team", "ECW World Tag Team Championship"),
        ],
      },
    ],
  },
];

const njpwChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Singles Championships",
      4,
      genericTitles("njpw", [
        ["iwgp-heavyweight", "IWGP Heavyweight Championship"],
        ["iwgp-junior-heavyweight", "IWGP Junior Heavyweight Championship"],
        ["never-openweight", "NEVER Openweight Championship"],
        ["iwgp-womens", "IWGP Women's Championship"],
        ["iwgp-global", "IWGP Global Heavyweight Championship"],
        ["strong-openweight", "Strong Openweight Championship"],
        ["strong-womens", "Strong Women's Championship"],
        ["njpw-world-television", "NJPW World Television Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      4,
      genericTitles("njpw", [
        ["iwgp-tag-team", "IWGP Tag Team Championship"],
        ["iwgp-junior-tag-team", "IWGP Junior Heavyweight Tag Team Championship"],
        ["strong-openweight-tag-team", "Strong Openweight Tag Team Championship"],
        ["never-openweight-six-man", "NEVER Openweight 6-Man Tag Team Championship"],
      ]),
    ),
  ]),
  sectionBlock("Other Titles and Achievements", [
    sectionGroup(
      "Tournaments",
      3,
      achievements("njpw", [
        ["g1-climax", "G1 Climax"],
        ["best-of-the-super-juniors", "Best of the Super Juniors"],
        ["new-japan-cup", "New Japan Cup"],
        ["world-tag-league", "World Tag League"],
        ["super-junior-tag-league", "Super Junior Tag League"],
        ["young-lion-cup", "Young Lion Cup"],
        ["oceania-cup", "Oceania Cup"],
        ["njpw-academy-cup", "NJPW Academy Cup"],
      ]),
    ),
  ]),
  sectionBlock("Former Championships", [
    sectionGroup(
      "Defunct Championships",
      3,
      genericTitles("njpw", [
        ["iwgp-world-heavyweight", "IWGP World Heavyweight Championship (2021-2026)"],
        ["iwgp-intercontinental", "IWGP Intercontinental Championship"],
        ["iwgp-united-states", "IWGP United States Heavyweight Championship"],
        ["iwgp-u-30", "IWGP U-30 Openweight Championship"],
        ["j-crown", "J-Crown"],
        ["nwf-heavyweight", "NWF Heavyweight Championship"],
      ]).sort((a, b) => a.name.localeCompare(b.name)),
    ),
  ]),
];

const ajpwChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Singles Championships",
      3,
      genericTitles("ajpw", [
        ["triple-crown", "Triple Crown Heavyweight Championship"],
        ["world-junior-heavyweight", "World Junior Heavyweight Championship"],
        ["gaora-tv", "GAORA TV Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      3,
      genericTitles("ajpw", [
        ["world-tag-team", "World Tag Team Championship"],
        ["all-asia-tag-team", "All Asia Tag Team Championship"],
        ["all-asia-six-man-tag-team", "All Asia Six-Man Tag Team Championship"],
      ]),
    ),
  ]),
  sectionBlock("Other Titles and Achievements", [
    sectionGroup(
      "Tournaments",
      3,
      achievements("ajpw", [
        ["champion-carnival", "Champion Carnival"],
        ["junior-battle-of-glory", "Jr. Battle of Glory"],
        ["odo-tournament", "Odo Tournament"],
        ["worlds-strongest-tag-determination-league", "World's Strongest Tag Determination League"],
        ["junior-tag-battle-of-glory", "Jr. Tag Battle of Glory"],
      ]),
    ),
  ]),
];

const noahChampionshipSections = [
  sectionBlock("Championships", [
    sectionGroup(
      "Singles Championships",
      4,
      genericTitles("noah", [
        ["ghc-heavyweight", "GHC Heavyweight Championship"],
        ["ghc-junior-heavyweight", "GHC Junior Heavyweight Championship"],
        ["ghc-womens", "GHC Women's Championship"],
        ["ghc-national", "GHC National Championship"],
        ["ghc-hardcore", "GHC Hardcore Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      2,
      genericTitles("noah", [
        ["ghc-tag-team", "GHC Tag Team Championship"],
        ["ghc-junior-heavyweight-tag-team", "GHC Junior Heavyweight Tag Team Championship"],
      ]),
    ),
  ]),
];

const tnaChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Singles Championships",
      3,
      genericTitles("tna", [
        ["world", "TNA World Championship"],
        ["x-division", "TNA X Division Championship"],
        ["knockouts-world", "TNA Knockouts World Championship"],
        ["international", "TNA International Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      2,
      genericTitles("tna", [
        ["world-tag-team", "TNA World Tag Team Championship"],
        ["knockouts-world-tag-team", "TNA Knockouts World Tag Team Championship"],
      ]),
    ),
  ]),
  sectionBlock("Former Championships", [
    sectionGroup(
      "Former Championships",
      3,
      genericTitles("tna", [
        ["nwa-worlds-heavyweight", "NWA Worlds Heavyweight Championship"],
        ["nwa-world-tag-team", "NWA World Tag Team Championship"],
        ["king-of-the-mountain-television", "TNA King of the Mountain / Television Championship"],
        ["grand", "TNA Grand Championship"],
        ["digital-media", "TNA Digital Media Championship"],
      ]),
    ),
  ]),
];

const rohChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Men's Singles Championships",
      3,
      genericTitles("roh", [
        ["world", "ROH World Championship"],
        ["world-television", "ROH World Television Championship"],
        ["pure", "ROH Pure Championship"],
      ]),
    ),
    sectionGroup(
      "Women's Singles Championships",
      3,
      genericTitles("roh", [
        ["womens-world", "ROH Women's World Championship"],
        ["womens-world-television", "ROH Women's World Television Championship"],
        ["womens-pure", "ROH Women's Pure Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      2,
      genericTitles("roh", [
        ["world-tag-team", "ROH World Tag Team Championship"],
        ["world-six-man-tag-team", "ROH World Six-Man Tag Team Championship"],
      ]),
    ),
  ]),
  sectionBlock("Other Titles and Achievements", [
    sectionGroup(
      "Achievements",
      2,
      achievements("roh", [
        ["survival-of-the-fittest", "Survival of the Fittest"],
        ["honor-rumble", "Honor Rumble"],
      ]),
    ),
  ]),
  sectionBlock("Former Championships", [
    sectionGroup(
      "Defunct Championships",
      2,
      genericTitles("roh", [
        ["women-of-honor-world", "Women of Honor World Championship"],
        ["top-of-the-class-trophy", "Top of the Class Trophy"],
      ]),
    ),
  ]),
];

const wccwChampionshipSections = [
  sectionBlock("Championships", [
    sectionGroup(
      "Singles Championships",
      3,
      genericTitles("wccw", [
        ["wcwa-world-heavyweight", "WCWA World Heavyweight Championship"],
        ["nwa-texas-heavyweight", "NWA Texas Heavyweight Championship"],
        ["wccw-television", "WCCW Television Championship"],
        ["texas-brass-knuckles", "WCCW Texas Brass Knuckles Championship"],
        ["light-heavyweight", "WCCW Light Heavyweight Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      3,
      genericTitles("wccw", [
        ["american-tag-team", "WCCW American Tag Team Championship"],
        ["world-six-man-tag-team", "WCCW World Six-Man Tag Team Championship"],
        ["texas-tag-team", "NWA Texas Tag Team Championship"],
      ]),
    ),
  ]),
];

const awaChampionshipSections = [
  sectionBlock("Championships", [
    sectionGroup(
      "Singles Championships",
      3,
      genericTitles("awa", [
        ["world-heavyweight", "AWA World Heavyweight Championship"],
        ["world-womens", "AWA World Women's Championship"],
        ["southern-heavyweight", "AWA Southern Heavyweight Championship"],
        ["light-heavyweight", "AWA Light Heavyweight Championship"],
        ["brass-knuckles", "AWA Brass Knuckles Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      1,
      genericTitles("awa", [["world-tag-team", "AWA World Tag Team Championship"]]),
    ),
  ]),
];

const stampedeChampionshipSections = [
  sectionBlock("Championships", [
    sectionGroup(
      "Championships",
      3,
      genericTitles("stampede", [
        ["north-american-heavyweight", "Stampede North American Heavyweight Championship"],
        ["british-commonwealth-mid-heavyweight", "Stampede British Commonwealth Mid-Heavyweight Championship"],
        ["international-tag-team", "Stampede International Tag Team Championship"],
      ]),
    ),
  ]),
];

const nwaChampionshipSections = [
  sectionBlock("Championships", [
    sectionGroup(
      "World Championships",
      2,
      genericTitles("nwa", [
        ["worlds-heavyweight", "NWA Worlds Heavyweight Championship"],
        ["womens-world", "NWA Women's World Championship"],
      ]),
    ),
    sectionGroup(
      "Singles Championships",
      3,
      genericTitles("nwa", [
        ["national-heavyweight", "NWA National Heavyweight Championship"],
        ["mid-america-heavyweight", "NWA Mid-America Heavyweight Championship"],
        ["world-junior-heavyweight", "NWA World Junior Heavyweight Championship"],
        ["world-television", "NWA World Television Championship"],
        ["womens-world-television", "NWA Women's World Television Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      3,
      genericTitles("nwa", [
        ["world-tag-team", "NWA World Tag Team Championship"],
        ["world-united-states-tag-team", "NWA World United States Tag Team Championship"],
        ["world-womens-tag-team", "NWA World Women's Tag Team Championship"],
      ]),
    ),
  ]),
];

const aaaChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Singles Championships",
      4,
      genericTitles("aaa", [
        ["mega", "AAA Mega Championship"],
        ["latin-american", "AAA Latin American Championship"],
        ["world-cruiserweight", "AAA World Cruiserweight Championship"],
        ["reina-de-reinas", "AAA Reina de Reinas Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      2,
      genericTitles("aaa", [
        ["world-tag-team", "AAA Tag Team Championship"],
        ["world-trios", "AAA Trios Championship"],
        ["mixed-tag-team", "AAA Mixed Tag Team Championship"],
      ]),
    ),
  ]),
];

const cmllChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "World Championships",
      4,
      genericTitles("cmll", [
        ["world-heavyweight", "CMLL World Heavyweight Championship"],
        ["mexican-national-heavyweight", "Mexican National Heavyweight Championship"],
        ["occidente-heavyweight", "CMLL Occidente Heavyweight Championship"],
        ["universal", "CMLL Universal Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      4,
      genericTitles("cmll", [
        ["world-tag-team", "CMLL World Tag Team Championship"],
        ["mexican-national-tag-team", "Mexican National Tag Team Championship"],
        ["occidente-tag-team", "CMLL Occidente Tag Team Championship"],
        ["arena-coliseo-tag-team", "CMLL Arena Coliseo Tag Team Championship"],
      ]),
    ),
    sectionGroup(
      "Trios Championships",
      3,
      genericTitles("cmll", [
        ["world-trios", "CMLL World Trios Championship"],
        ["mexican-national-trios", "Mexican National Trios Championship"],
        ["occidente-trios", "CMLL Occidente Trios Championship"],
      ]),
    ),
    sectionGroup(
      "Weight Class Championships",
      4,
      genericTitles("cmll", [
        ["world-light-heavyweight", "CMLL World Light Heavyweight Championship"],
        ["world-middleweight", "CMLL World Middleweight Championship"],
        ["world-welterweight", "CMLL World Welterweight Championship"],
        ["world-lightweight", "CMLL World Lightweight Championship"],
        ["mexican-national-light-heavyweight", "Mexican National Light Heavyweight Championship"],
        ["mexican-national-middleweight", "Mexican National Middleweight Championship"],
        ["mexican-national-welterweight", "Mexican National Welterweight Championship"],
        ["mexican-national-lightweight", "Mexican National Lightweight Championship"],
      ]),
    ),
    sectionGroup(
      "Women's and Specialty Championships",
      4,
      genericTitles("cmll", [
        ["world-womens", "CMLL World Women's Championship"],
        ["universal-amazons", "CMLL Universal Amazons Championship"],
        ["mexican-national-womens", "Mexican National Women's Championship"],
        ["occidente-womens", "CMLL Occidente Women's Championship"],
        ["world-womens-tag-team", "CMLL World Women's Tag Team Championship"],
        ["mexican-national-womens-tag-team", "Mexican National Women's Tag Team Championship"],
        ["occidente-womens-tag-team", "CMLL Occidente Women's Tag Team Championship"],
      ]),
    ),
    sectionGroup(
      "Specialty Championships",
      4,
      genericTitles("cmll", [
        ["world-mini-stars", "CMLL World Mini-Stars Championship"],
        ["world-micro-stars", "CMLL World Micro-Stars Championship"],
        ["japan-womens", "CMLL Japan Women's Championship"],
        ["arena-puebla-barroco", "CMLL Arena Puebla Barroco Championship"],
        ["king-of-the-underworld", "CMLL King of the Underworld Championship"],
        ["kids-ambassador", "CMLL Kid's Ambassador Championship"],
        ["vive-latino", "CMLL Vive Latino Championship"],
      ]),
    ),
  ]),
];

const dragongateChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Championships",
      4,
      genericTitles("dragongate", [
        ["open-the-dream-gate", "Open the Dream Gate Championship"],
        ["open-the-brave-gate", "Open the Brave Gate Championship"],
        ["open-the-twin-gate", "Open the Twin Gate Championship"],
        ["open-the-triangle-gate", "Open the Triangle Gate Championship"],
      ]),
    ),
  ]),
];

const iwaPuertoRicoChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Championships",
      1,
      genericTitles("iwa-pr", [["unified-puerto-rico-heavyweight", "IWA Unified Puerto Rico Heavyweight Championship"]]),
    ),
  ]),
];

const mapleLeafProChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Championships",
      1,
      genericTitles("maple-leaf-pro", [["international-heavyweight", "MLP International Heavyweight Championship"]]),
    ),
  ]),
];

const mlwChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Singles Championships",
      4,
      genericTitles("mlw", [
        ["world-heavyweight", "MLW World Heavyweight Championship"],
        ["national-openweight", "MLW National Openweight Championship"],
        ["world-middleweight", "MLW World Middleweight Championship"],
        ["world-womens-featherweight", "MLW World Women's Featherweight Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      1,
      genericTitles("mlw", [["world-tag-team", "MLW World Tag Team Championship"]]),
    ),
  ]),
];

const ovwChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Championships",
      3,
      genericTitles("ovw", [
        ["heavyweight", "OVW Heavyweight Championship"],
        ["media", "OVW Media Championship"],
        ["rush-division", "OVW Rush Division Championship"],
        ["united-states-heavyweight", "OVW United States Heavyweight Championship"],
        ["womens", "OVW Women's Championship"],
        ["tag-team", "OVW Tag Team Championship"],
      ]),
    ),
  ]),
];

const stardomChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Singles Championships",
      4,
      genericTitles("stardom", [
        ["world-of-stardom", "World of Stardom Championship"],
        ["wonder-of-stardom", "Wonder Of Stardom Championship"],
        ["high-speed", "High Speed Championship"],
        ["future-of-stardom", "Future Of Stardom Championship"],
      ]),
    ),
    sectionGroup(
      "Tag Team Championships",
      3,
      genericTitles("stardom", [
        ["goddesses-of-stardom", "Goddesses Of Stardom Championship"],
        ["artist-of-stardom", "Artist Of Stardom Championship"],
        ["new-blood-tag-team", "New Blood Tag Team Championship"],
      ]),
    ),
  ]),
];

const evolveChampionshipSections = [
  sectionBlock("Active Championships", [
    sectionGroup(
      "Championships",
      2,
      genericTitles("evolve", [
        ["wwe-evolve", "WWE Evolve Championship"],
        ["wwe-evolve-womens", "WWE Evolve Women's Championship"],
        ["wwe-id", "WWE ID Championship"],
        ["wwe-id-womens", "WWE ID Women's Championship"],
      ]),
    ),
  ]),
];

const championshipSectionsByPromotion = {
  aaa: aaaChampionshipSections,
  aew: aewChampionshipSections,
  ajpw: ajpwChampionshipSections,
  awa: awaChampionshipSections,
  cmll: cmllChampionshipSections,
  dragongate: dragongateChampionshipSections,
  ecw: ecwChampionshipSections,
  evolve: evolveChampionshipSections,
  "iwa-pr": iwaPuertoRicoChampionshipSections,
  "maple-leaf-pro": mapleLeafProChampionshipSections,
  mlw: mlwChampionshipSections,
  njpw: njpwChampionshipSections,
  noah: noahChampionshipSections,
  nwa: nwaChampionshipSections,
  ovw: ovwChampionshipSections,
  roh: rohChampionshipSections,
  stampede: stampedeChampionshipSections,
  stardom: stardomChampionshipSections,
  tna: tnaChampionshipSections,
  wccw: wccwChampionshipSections,
  wwe: wweChampionshipSections,
};

function beltChampionship(promotionId, id, name) {
  return {
    id: `${promotionId}-${id}`,
    name,
    imageUrl: `./assets/championships/${id}.png`,
  };
}

function wweChampionship(id, name) {
  return beltChampionship("wwe", id, name);
}

function sdhChampionshipImageFor(promotionId, name) {
  const aliases = {
    "ajpw|All Asia Six-Man Tag Team Championship": "AJPW.TV Six-Men Tag Team Championship",
    "ajpw|All Asia Tag Team Championship": "AJPW All Asia Tag Team Championship",
    "ajpw|GAORA TV Championship": "AJPW Gaora TV Championship",
    "ajpw|Triple Crown Heavyweight Championship": "AJPW Triple Crown Heavyweight Championship",
    "ajpw|World Junior Heavyweight Championship": "AJPW World Junior Heavyweight Championship",
    "ajpw|World Tag Team Championship": "AJPW World Tag Team Championship",
    "njpw|IWGP World Heavyweight Championship": "IWGP Heavyweight Championship",
    "noah|GHC Hardcore Championship": "GHC Hardcore Openweight Championship",
    "nwa|NWA Women's World Championship": "NWA World Women's Championship",
    "nwa|NWA Women's World Television Championship": "NWA World Women's Television Championship",
    "nwa|NWA World United States Tag Team Championship": "NWA United States Tag Team Championship",
    "tna|TNA King of the Mountain / Television Championship": "TNA Television Championship",
  };
  return sdhChampionshipImageMap[name] ?? sdhChampionshipImageMap[aliases[`${promotionId}|${name}`]] ?? null;
}

function genericChampionship(promotionId, id, name) {
  const imageUrl = sdhChampionshipImageFor(promotionId, name);
  return {
    id: `${promotionId}-${id}`,
    name,
    imageUrl: imageUrl ?? championshipPlaceholderDataUri(name, "Title", promotionId),
    imageMode: imageUrl ? null : "placeholder-emblem",
  };
}

function achievementCard(promotionId, id, name) {
  const cardId = `${promotionId}-${id}`;
  const imageUrl = achievementImageMap[cardId];
  return {
    id: cardId,
    name,
    imageUrl: imageUrl ?? championshipPlaceholderDataUri(name, "Honor", promotionId),
    imageMode: imageUrl ? "belt-cutout" : "achievement-emblem",
    cardType: "achievement",
  };
}

function sectionGroup(title, columns, championships) {
  return { title, columns, championships };
}

function sectionBlock(title, groups) {
  return { title, groups };
}

function genericTitles(promotionId, items) {
  return items.map(([id, name]) => genericChampionship(promotionId, id, name));
}

function achievements(promotionId, items) {
  return items.map(([id, name]) => achievementCard(promotionId, id, name));
}

function championshipPlaceholderDataUri(name, label, promotionId) {
  const palettes = {
    aaa: ["#d82f35", "#f3f0df"],
    aew: ["#d8b35d", "#171717"],
    ajpw: ["#d84840", "#f1d36b"],
    awa: ["#2f67c7", "#f1f0e8"],
    cmll: ["#d8b35d", "#1f7c4d"],
    dragongate: ["#d84b3f", "#f1f0e8"],
    "iwa-pr": ["#d85045", "#2f67c7"],
    "maple-leaf-pro": ["#d85045", "#f4f1ea"],
    mlw: ["#d8b35d", "#202329"],
    njpw: ["#d85045", "#2f6fbd"],
    noah: ["#49a4d8", "#f4f1ea"],
    nwa: ["#cfb46a", "#171717"],
    ovw: ["#2f67c7", "#f4f1ea"],
    roh: ["#d8d8d8", "#bd2f2f"],
    stampede: ["#d85045", "#f4f1ea"],
    stardom: ["#e45a91", "#f4f1ea"],
    tna: ["#2f67c7", "#d84b3f"],
    wccw: ["#d8b35d", "#2f67c7"],
    wwe: ["#f2f0ea", "#d8b35d"],
  };
  const [primary, secondary] = palettes[promotionId] ?? ["#d8b35d", "#202329"];
  const initials =
    name
      .replace(/\([^)]*\)/g, "")
      .split(/\s+/)
      .filter((word) => !/^(the|of|and|world|championship|title|team|tag)$/i.test(word))
      .slice(0, 3)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "TT";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${secondary}"/>
          <stop offset="1" stop-color="#111317"/>
        </linearGradient>
        <linearGradient id="gold" x1="0" x2="1">
          <stop offset="0" stop-color="#8b6a2f"/>
          <stop offset="0.5" stop-color="${primary}"/>
          <stop offset="1" stop-color="#f3df9a"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" rx="24" fill="url(#bg)"/>
      <path d="M64 194c88-70 424-70 512 0v46c-126-44-386-44-512 0z" fill="#08090b" opacity=".9"/>
      <ellipse cx="320" cy="188" rx="132" ry="92" fill="url(#gold)" stroke="#f7e9b3" stroke-width="6"/>
      <ellipse cx="320" cy="188" rx="92" ry="62" fill="#17191e" opacity=".88"/>
      <text x="320" y="178" text-anchor="middle" fill="#f4f1ea" font-family="Arial, sans-serif" font-size="54" font-weight="900" letter-spacing="2">${initials}</text>
      <text x="320" y="224" text-anchor="middle" fill="${primary}" font-family="Arial, sans-serif" font-size="24" font-weight="800">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const titleDetails = {
  "usa-heat": {
    tagline: "An L.A. crime saga with a long shadow.",
    summary:
      "A professional thief and a relentless detective circle each other through Los Angeles after a major heist goes sideways.",
    releaseDate: "Dec 15, 1995",
    country: "United States",
    language: "English",
    director: "Michael Mann",
    runtime: "170 min",
    cast: [
      { id: "al-pacino", name: "Al Pacino", role: "Lt. Vincent Hanna" },
      { id: "robert-de-niro", name: "Robert De Niro", role: "Neil McCauley" },
      { id: "michael-mann", name: "Michael Mann", role: "Director" },
    ],
    settings: {
      subtitles: "English, Dutch",
      audioTracks: "5.1 / Stereo",
      resolution: "4K / 1080p",
      directPlay: "Available",
    },
  },
  "fr-amelie": {
    tagline: "She will change your life.",
    releaseDate: "Apr 25, 2001",
    country: "France",
    language: "French",
    director: "Jean-Pierre Jeunet",
    runtime: "122 min",
    cast: [{ id: "audrey-tautou", name: "Audrey Tautou", role: "Amelie Poulain" }],
  },
  "curated-the-neverending-story-1984": {
    summary:
      "Bastian discovers a mysterious book and is drawn into the world of Fantasia, where The Nothing threatens to consume everything.",
    country: "Germany",
    language: "English",
    director: "Wolfgang Petersen",
    runtime: 102,
    rating: "PG",
    genres: ["Fantasy", "Adventure"],
    ratings: {
      imdb: "7.3",
      tmdb: 7.0,
      rottenTomatoesCritic: "71%",
      rottenTomatoesAudience: "87%",
    },
    settings: {
      runtime: "1h 42m",
      released: "1984",
      director: "Wolfgang Petersen",
      format: "VHS",
    },
  },
  "bobs-burgers": {
    summary: "A scattered local sample of the Belcher family's restaurant chaos.",
    releaseDate: "2011-",
    country: "United States",
    language: "English",
    directorLabel: "Creator",
    director: "Loren Bouchard",
    runtime: "22 min episodes",
    cast: [{ id: "bob-odenkirk", name: "Bob Odenkirk", role: "Guest Voice" }],
    settings: {
      subtitles: "English",
      audioTracks: "Stereo",
      resolution: "1080p",
      directPlay: "Available",
    },
  },
  "home-wrestling-wwe-ppv-2001-04-01": {
    cast: [
      { id: "stone-cold", name: "Stone Cold Steve Austin", role: "Main Event" },
      { id: "the-rock", name: "The Rock", role: "WWF Champion" },
    ],
    settings: {
      subtitles: null,
      audioTracks: "Stereo",
      resolution: "DVD / 480p",
      directPlay: "Available",
    },
  },
  "home-wrestling-wcw-ppv-1997-12-28": {
    tagline: "The biggest match in WCW history.",
    cast: [
      { id: "sting", name: "Sting", role: "Challenger" },
      { id: "hulk-hogan", name: "Hollywood Hogan", role: "WCW Champion" },
    ],
    settings: {
      subtitles: null,
      audioTracks: "Stereo",
      resolution: "VHS / 480p",
      directPlay: "Available",
    },
  },
};

function render() {
  clearPlayerAutoplayCountdown();
  stopActivePlaybackElements();
  const metadataOverlayOpen = Boolean(state.metadataOverlay);
  document.documentElement.classList.toggle("metadata-overlay-open", metadataOverlayOpen);
  document.body.classList.toggle("metadata-overlay-open", metadataOverlayOpen);

  if (state.powerOffMode === "off") {
    app.innerHTML = `<div class="power-off-screen" aria-label="Tobytube is powered off"></div>`;
    return;
  }

  const sidebarMarkup = renderSidebar();
  const contentMarkup = renderContent();
  const appMarkup = `
    <div class="app-shell ${state.tvGuideTheaterMode && state.section === "tv" && state.subView === "guide" ? "tv-guide-theater-mode" : ""}">
      ${sidebarMarkup}
      <main class="main">
        <section class="content">
          ${state.section === "tv" && state.subView === "guide" ? "" : renderNeonBackButton()}
          ${contentMarkup}
        </section>
      </main>
    </div>
    ${state.powerOffMode === "message" ? renderPowerOffOverlay() : ""}
    ${state.castOverlay ? renderCastOverlay() : ""}
    ${state.notesOverlay ? renderNotesOverlay() : ""}
    ${state.defenseOverlay ? renderDefenseOverlay() : ""}
    ${state.player ? renderPlayerOverlay(state.player) : ""}
    ${renderMetadataMatchOverlay()}
  `;
  app.innerHTML = appMarkup;

  bindEvents();
  syncPlayerOverlay();
  if (!(state.section === "wrestling" && state.promotionId) && !state.selectedCollectionId) syncUniversalMetadataMenus();
  syncCarouselNavigation();
  syncMovieGenreHotspots();
  syncTvGuideClock();
  if (metadataOverlayOpen) {
    state.preserveScrollOnRender = false;
    state.pendingScrollRestore = null;
  } else if (state.preserveScrollOnRender) {
    state.preserveScrollOnRender = false;
    const snapshot = state.pendingScrollRestore;
    state.pendingScrollRestore = null;
    if (snapshot) {
      const restore = () => restorePreservedPageScroll(snapshot);
      restore();
      requestAnimationFrame(restore);
      setTimeout(restore, 40);
      setTimeout(restore, 160);
      setTimeout(restore, 320);
    }
  } else {
    scrollPageTop();
  }
}

function clearPlayerAutoplayCountdown() {
  if (playerAutoplayTimer) clearTimeout(playerAutoplayTimer);
  if (playerAutoplayInterval) clearInterval(playerAutoplayInterval);
  playerAutoplayTimer = null;
  playerAutoplayInterval = null;
}

function stopActivePlaybackElements() {
  document.querySelectorAll("video, audio").forEach((media) => {
    try {
      media._tobytubeHls?.destroy?.();
      media.pause();
      media.removeAttribute("src");
      media.load?.();
    } catch {}
  });
}

function renderPowerOffOverlay() {
  return `
    <div class="power-off-screen power-off-screen-message" aria-live="polite">
      <div>ok den</div>
    </div>
  `;
}

function scrollPageTop() {
  const scrollTargets = [window, document.documentElement, document.body, document.querySelector(".content")].filter(Boolean);
  scrollTargets.forEach((target) => {
    if (target === window) {
      target.scrollTo({ top: 0, left: 0 });
      return;
    }
    target.scrollTop = 0;
    target.scrollLeft = 0;
  });
  requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
  setTimeout(() => window.scrollTo({ top: 0, left: 0 }), 0);
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">T</div>
        <div class="brand-text">
          <div class="brand-title">Tobytube</div>
          <div class="brand-subtitle">Home media server</div>
        </div>
      </div>
      <nav class="nav-group" aria-label="Library sections">
        ${navButton("home", "Home", "Start", state.section === "home", "house")}
        ${navButton("movies", "Movies", String(sidebarMediaCounts.movies ?? movies.length), state.section === "movies", "film")}
        ${navButton("tv", "TV", String(sidebarMediaCounts.tv ?? tvShows.length), state.section === "tv", "tv")}
        ${navButton("wrestling", "Wrestling", String(promotions.length), state.section === "wrestling", "ring")}
        ${navButton("collections", "Collections", String(getVisibleCollections().length), state.section === "collections", "books")}
      </nav>
      <div class="nav-divider" aria-hidden="true"></div>
      <div class="nav-group nav-utilities">
        <button class="nav-button utility media-archive-toggle" type="button" data-action="toggle-library-mode" aria-label="Toggle Media or Archive">
          ${icon("radar")}
          <span class="nav-label">${state.libraryMode === "media" ? "Media" : "Archive"}</span>
          <span class="nav-count">${state.libraryMode === "media" ? "Live" : "Template"}</span>
        </button>
        <button class="nav-button utility" type="button" data-action="options" aria-label="Options">
          ${icon("gear")}
          <span class="nav-label">Options</span>
        </button>
        <button class="nav-button utility ${state.section === "batcave" ? "active" : ""}" type="button" data-section="batcave" aria-label="Batcave">
          ${icon("bat")}
          <span class="nav-label">Batcave</span>
        </button>
        <label class="nav-search" aria-label="Search library">
          ${icon("search")}
          <input class="search" type="search" placeholder="Search library" value="${escapeHtml(state.query)}" />
        </label>
        <button class="nav-button utility scan-button ${metadataStatus?.state === "scanning" ? "scanning" : ""}" type="button" data-action="rescan" aria-label="Rescan media">
          ${icon("radar")}
          <span class="nav-label">Rescan</span>
          <span class="nav-count">${renderMetadataStatus()}</span>
        </button>
      </div>
    </aside>
  `;
}

function renderNeonBackButton(force = false) {
  const showBack =
    force ||
    (["movies", "tv", "wrestling"].includes(state.section) &&
      state.subView === "home" &&
      !state.promotionId &&
      !state.selectedTitleId &&
      !state.selectedPersonId);
  return showBack
    ? `<button class="neon-back-button" type="button" data-action="back-page" aria-label="Back to Home">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 9 12l6 6"/><path d="M10 12h9"/></svg>
      </button>`
    : "";
}

function navButton(section, label, count, active, iconName) {
  return `
    <button class="nav-button ${active ? "active" : ""}" type="button" data-section="${section}">
      ${icon(iconName)}
      <span class="nav-label">${label}</span>
      <span class="nav-count">${count}</span>
    </button>
  `;
}

function icon(name) {
  const icons = {
    books: `<path d="M4.5 5.5h4v14h-4z"/><path d="M9.5 4.5h4v15h-4z"/><path d="M14.7 5.2 18.5 4l3.2 14.2-3.8 1.1z"/><path d="M6.5 8v8M11.5 7v9M18.2 7.4l1.9 8.5"/>`,
    film: `<path d="M5 4h14v16H5z"/><path d="M8 4v16M16 4v16M5 8h3M5 12h3M5 16h3M16 8h3M16 12h3M16 16h3"/>`,
    gear: `<path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.04.04a2 2 0 0 1-2.83 2.83l-.04-.04A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.05a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.04.04a2 2 0 0 1-2.83-2.83l.04-.04A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.04-.04a2 2 0 0 1 2.83-2.83l.04.04A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.05a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.04-.04a2 2 0 0 1 2.83 2.83l-.04.04A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.05A1.7 1.7 0 0 0 19.4 15z"/>`,
    house: `<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>`,
    radar: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 12 18 7"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2"/>`,
    ring: `<path d="M4 15 12 9l8 6-8 5-8-5z"/><path d="M4 15v3l8 5 8-5v-3"/><path d="M7 13V7M17 13V7M12 10V4"/><path d="M7 8h10M6 11h12M5 14h14"/>`,
    search: `<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>`,
    tv: `<rect x="4" y="7" width="16" height="11" rx="2"/><path d="m8 3 4 4 4-4"/><path d="M9 21h6"/>`,
    bat: `<path d="M3.5 10.5c2.4-.1 3.9.7 5 2.2L10.5 8l1.5 2 1.5-2 2 4.7c1.1-1.5 2.6-2.3 5-2.2-.8 2.5-2.1 4.4-4.3 5.6l.3 3.4-4.5-2.2-4.5 2.2.3-3.4c-2.2-1.2-3.5-3.1-4.3-5.6Z"/>`,
  };
  return `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? icons.house}</svg>`;
}

function renderMetadataStatus() {
  if (!metadataStatus) return "Static preview";
  if (metadataStatus.state === "scanning") return "Scanning media";
  if (metadataStatus.state === "error") return "Scan needs attention";
  if (metadataStatus.stats) {
    return `${metadataStatus.stats.filesMatched}/${metadataStatus.stats.filesScanned} matched`;
  }
  return "Metadata ready";
}

function renderContent() {
  if (state.query.trim() && !state.selectedTitleId && !state.selectedChampionshipId && !state.selectedTvEpisodeId && !state.selectedTvSeason && !state.selectedCollectionId && state.section !== "batcave") return renderSearchResults();
  if (state.selectedChampionshipId) return renderChampionshipDetailPage(state.selectedChampionshipId);
  if (state.selectedPersonId) return renderPersonScreen(state.selectedPersonId);
  if (state.selectedMcuSeasonId) return renderMcuSeasonScreen(state.selectedMcuSeasonId);
  if (state.selectedMcuShowId) return renderMcuShowScreen(state.selectedMcuShowId);
  if (state.selectedCollectionId === "mcu") return renderMcuCollectionPage();
  if (state.selectedCollectionId === "criterion") return renderCriterionCollectionPage();
  if (state.selectedCollectionId === "cinema-of-india") return renderCinemaOfIndiaCollectionPage();
  if (state.selectedCollectionId && getCuratedCollectionPage(state.selectedCollectionId)) return renderCuratedCollectionPage(getCuratedCollectionPage(state.selectedCollectionId));
  if (state.selectedTvEpisodeId) return renderTvEpisodeScreen(state.selectedTvEpisodeId);
  if (state.selectedTvSubcollection && state.selectedTvSubcollection.showId === state.selectedTitleId) return renderTvSubcollectionScreen(state.selectedTvSubcollection.showId, state.selectedTvSubcollection.collectionId);
  if (state.selectedTvSeason) return renderTvSeasonScreen(state.selectedTvSeason.showId, state.selectedTvSeason.seasonNumber);
  if (state.selectedTitleId) {
    const item = getTitleItem(state.selectedTitleId) ?? resolveStaleTitleId(state.selectedTitleId);
    if (item?.mediaType === "tv") return renderTvProgramScreen(item);
    if (item?.mediaType === "movie") return renderMovieTitleScreen(item);
    if (item?.mediaType === "franchise") return renderFranchiseTitleScreen(item);
    return renderTitleScreen(item);
  }
  if (state.section === "home") return renderHomePage();
  if (state.section === "movies") return renderMoviesHome();
  if (state.section === "tv") return renderTvHome();
  if (state.section === "collections") return renderCollectionsHome();
  if (state.section === "batcave") return renderBatcave();
  if (state.section === "watchlist") return renderWatchlistHome();
  if (state.section === "recent") return renderRecentlyAddedHome();
  return state.promotionId ? renderPromotionDetail() : renderWrestlingHome();
}

function renderSearchResults() {
  const query = state.query.trim();
  const movieResults = filterLibraryItems(getMovieLibraryItems());
  const tvResults = filterLibraryItems(getTvLibraryItems());
  const wrestlingResults = filterLibraryItems(getHomeWrestlingItems());
  const collectionResults = getVisibleCollections().filter((collection) =>
    [collection.title, collection.description, collection.category].filter(Boolean).some((value) => String(value).toLowerCase().includes(query.toLowerCase())),
  );
  return `
    ${renderLibraryHeader("Search", `Results for "${query}".`, null, false)}
    <div class="search-results">
      ${renderPosterShelf("Movies", movieResults.slice(0, 18), "movie", renderLibraryCard, null, "", { section: "movies", subview: "library" })}
      ${renderPosterShelf("TV", tvResults.slice(0, 18), "show", renderTvCard, null, "", { section: "tv", subview: "library" })}
      ${renderPosterShelf("Wrestling", wrestlingResults.slice(0, 18), "event", renderLibraryCard, null, "", { section: "wrestling" })}
      ${renderPosterShelf("Collections", collectionResults.slice(0, 18), "collection", renderCollectionShelfCard, null, "", { section: "collections" })}
    </div>
  `;
}


function syncUniversalMetadataMenus() {
  document.querySelectorAll("[data-title-id]:not([data-action])").forEach((card) => {
    if (card.matches(".championship-event-link, .tournament-table-event")) return;
    if (card.querySelector("[data-action='metadata-menu']")) return;
    const item = getTitleItem(card.dataset.titleId);
    if (!item) return;
    card.insertAdjacentHTML("afterbegin", renderMediaStoplightButton(item, "universal"));
  });
}

function readMergedItemGroups() {
  try {
    const groups = JSON.parse(localStorage.getItem("tobytube.mergedItems") ?? "[]");
    return Array.isArray(groups) ? groups.filter((group) => group?.primaryId && Array.isArray(group.itemIds) && group.itemIds.length > 1) : [];
  } catch {
    return [];
  }
}

function getUserFranchiseItems() {
  return Object.entries(metadataOverrides?.items ?? {}).flatMap(([id, stored]) => {
    const metadata = stored?.metadata ?? stored ?? {};
    if (metadata.recordType !== "franchise") return [];
    return [{
      id,
      title: metadata.title || "Untitled Franchise",
      mediaType: "franchise",
      recordType: "franchise",
      summary: metadata.summary || "A custom Tobytube franchise.",
      posterUrl: metadata.posterUrl || null,
      backdropUrl: metadata.backdropUrl || null,
      memberIds: [...new Set(metadata.memberIds ?? [])],
      mixtapeKeys: [...new Set(metadata.mixtapeKeys ?? [])],
      createdAt: metadata.createdAt || stored?.updatedAt || null,
      posterA: "#081226",
      posterB: "#bd58ff",
    }];
  });
}

function getFranchisesForItem(itemId) {
  if (!itemId) return [];
  const explicitIds = getItemMetadataOverride(itemId).franchiseIds ?? [];
  return getUserFranchiseItems().filter((franchise) => explicitIds.includes(franchise.id) || franchise.memberIds.includes(itemId));
}

function syncCarouselNavigation() {
  document.querySelectorAll(".carousel, .toby-tv-season-carousel, .toby-tv-episode-carousel, .related-media-carousel, .curated-jump-bar").forEach((carousel, index) => {
    if (state.resetCuratedJumpRail && carousel.classList.contains("curated-jump-bar")) carousel.scrollLeft = 0;
    const host = carousel.closest(".curated-jump-shell, .lane, .toby-tv-shelf, .batcave-existing-collections section, .batcave-panel") ?? carousel.parentElement;
    if (!host || host.querySelector(`:scope > [data-carousel-edge-for="${index}"]`)) return;
    host.classList.add("carousel-edge-host");
    ["left", "right"].forEach((direction) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `carousel-edge-control ${direction}`;
      button.dataset.carouselEdgeFor = String(index);
      button.setAttribute("aria-label", `Scroll carousel ${direction}`);
      button.innerHTML = direction === "left" ? "&#8249;" : "&#8250;";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        carousel.scrollBy({ left: (direction === "left" ? -1 : 1) * Math.max(280, carousel.clientWidth * 0.82), behavior: "smooth" });
      });
      host.appendChild(button);
    });
    const updateControls = () => updateCarouselEdgeControls(carousel, host);
    carousel.addEventListener("scroll", updateControls, { passive: true });
    requestAnimationFrame(updateControls);
  });
  state.resetCuratedJumpRail = false;
}

function updateCarouselEdgeControls(carousel, host) {
  const maxScroll = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
  const left = host.querySelector(":scope > .carousel-edge-control.left");
  const right = host.querySelector(":scope > .carousel-edge-control.right");
  const atStart = carousel.scrollLeft <= 2;
  const atEnd = carousel.scrollLeft >= maxScroll - 2;
  if (left) {
    left.hidden = maxScroll <= 2 || atStart;
    left.disabled = left.hidden;
  }
  if (right) {
    right.hidden = maxScroll <= 2 || atEnd;
    right.disabled = right.hidden;
  }
}

function handleGlobalKeyboard(event) {
  if (state.section === "tv" && state.subView === "guide") return;
  const tag = event.target?.tagName;
  const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable;
  if (event.key === "Escape") {
    if (!(state.player || state.metadataOverlay || state.metadataMenu || state.castOverlay || state.notesOverlay || state.defenseOverlay || state.batcaveCollectionId)) return;
    event.preventDefault();
    state.player = null;
    state.metadataOverlay = null;
    state.metadataMenu = null;
    state.castOverlay = null;
    state.notesOverlay = null;
    state.defenseOverlay = null;
    state.batcaveCollectionId = null;
    state.batcaveCollectionDraft = null;
    render();
    return;
  }
  if (isTyping) return;
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    const trigger = getMetadataMenuTrigger(event.target);
    if (!trigger || trigger.classList.contains("gear")) return;
    event.preventDefault();
    const rect = event.target.getBoundingClientRect();
    openMetadataContextMenu(trigger, rect.left + Math.min(rect.width, 24), rect.top + Math.min(rect.height, 24));
    return;
  }
  if (event.code === "Space") {
    const video = document.querySelector("video");
    if (!video) return;
    event.preventDefault();
    if (video.paused) video.play().catch(() => {}); else video.pause();
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  const active = document.activeElement;
  const focusable = getSpatialNavigationTargets();
  if (!focusable.length) return;
  event.preventDefault();
  const next = getSpatialNavigationTarget(active, focusable, event.key) ?? focusable[0];
  next?.focus();
  next?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

function getSpatialNavigationTargets() {
  return [...document.querySelectorAll("button:not([disabled]):not([hidden]), a[href], [tabindex='0']")]
    .filter((element) => {
      if (element.classList.contains("metadata-menu-button")) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    });
}

function getSpatialNavigationTarget(active, targets, key) {
  if (!active || active === document.body || !targets.includes(active)) return targets.find((element) => element.getBoundingClientRect().top >= 0);
  const source = active.getBoundingClientRect();
  const sourceX = source.left + source.width / 2;
  const sourceY = source.top + source.height / 2;
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const direction = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  return targets
    .filter((candidate) => candidate !== active)
    .map((candidate) => {
      const rect = candidate.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - sourceX;
      const dy = rect.top + rect.height / 2 - sourceY;
      const primary = horizontal ? dx : dy;
      const secondary = horizontal ? dy : dx;
      return { candidate, primary, score: Math.abs(primary) + Math.abs(secondary) * 2.25 };
    })
    .filter((entry) => Math.sign(entry.primary) === direction && Math.abs(entry.primary) > 2)
    .sort((left, right) => left.score - right.score)[0]?.candidate ?? null;
}

function startGamepadNavigation() {
  if (gamepadNavigationFrame || !("getGamepads" in navigator)) return;
  const poll = (now) => {
    const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
    if (pad) {
      const horizontal = Math.abs(pad.axes?.[0] ?? 0) > 0.55 ? Math.sign(pad.axes[0]) : 0;
      const vertical = Math.abs(pad.axes?.[1] ?? 0) > 0.55 ? Math.sign(pad.axes[1]) : 0;
      const direction = pad.buttons?.[14]?.pressed || horizontal < 0
        ? "ArrowLeft"
        : pad.buttons?.[15]?.pressed || horizontal > 0
          ? "ArrowRight"
          : pad.buttons?.[12]?.pressed || vertical < 0
            ? "ArrowUp"
            : pad.buttons?.[13]?.pressed || vertical > 0
              ? "ArrowDown"
              : null;
      if (direction && (direction !== gamepadNavigationState.direction || now - gamepadNavigationState.repeatedAt > 210)) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: direction, bubbles: true }));
        gamepadNavigationState.repeatedAt = now;
      }
      gamepadNavigationState.direction = direction;
      const actionPressed = Boolean(pad.buttons?.[0]?.pressed);
      if (actionPressed && !gamepadNavigationState.actionPressed) document.activeElement?.click?.();
      gamepadNavigationState.actionPressed = actionPressed;
      const backPressed = Boolean(pad.buttons?.[1]?.pressed);
      if (backPressed && !gamepadNavigationState.backPressed) {
        if (state.player || state.metadataOverlay || state.metadataMenu || state.castOverlay || state.notesOverlay || state.defenseOverlay) {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        } else {
          goBackOnePage();
        }
      }
      gamepadNavigationState.backPressed = backPressed;
    }
    gamepadNavigationFrame = requestAnimationFrame(poll);
  };
  gamepadNavigationFrame = requestAnimationFrame(poll);
}

function writeMergedItemGroups(groups) {
  localStorage.setItem("tobytube.mergedItems", JSON.stringify(groups));
  invalidateMediaCaches();
}

function getMergedItemGroupFor(id) {
  return readMergedItemGroups().find((group) => group.itemIds.includes(id)) ?? null;
}

function getMergedAwayItemIds() {
  const ids = new Set();
  readMergedItemGroups().forEach((group) => {
    group.itemIds.forEach((id) => {
      if (id !== group.primaryId) ids.add(id);
    });
  });
  return ids;
}

function applyMergedMediaItems(items) {
  const groups = readMergedItemGroups();
  if (!groups.length) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const hidden = new Set();
  groups.forEach((group) => {
    const primary = byId.get(group.primaryId);
    if (!primary) return;
    const members = group.itemIds.map((id) => byId.get(id)).filter(Boolean);
    // A scanner correction can retire one of the IDs stored by an older merge.
    // Only hide members while that merge still resolves to multiple live items.
    if (members.length < 2) return;
    members.forEach((member) => {
      if (member.id !== group.primaryId) hidden.add(member.id);
    });
    const files = members.flatMap((member, memberIndex) => getFilesForMergeMember(member).map((file, fileIndex) => ({
      ...file,
      streams: {
        ...(file.streams ?? {}),
        versionLabel: formatVersionFileName(file.path),
      },
    })));
    byId.set(group.primaryId, { ...primary, files, mergedItemIds: group.itemIds, mergedItems: members });
  });
  return [...byId.values()].filter((item) => !hidden.has(item.id));
}

function getFilesForMergeMember(item) {
  const record = getMetadataRecordForItem(item);
  return item?.files?.length ? item.files : record?.files ?? [];
}

function toggleMergeSelection(id) {
  if (!id) return;
  if (state.mergeSelection.has(id)) state.mergeSelection.delete(id);
  else state.mergeSelection.add(id);
}

function createMergedItemGroup(primaryId, itemIds) {
  const ids = [...new Set(itemIds.filter(Boolean))];
  if (!primaryId || ids.length < 2) return;
  const remainingGroups = readMergedItemGroups().filter((group) => !group.itemIds.some((id) => ids.includes(id)));
  writeMergedItemGroups([...remainingGroups, { id: `merge-${Date.now()}`, primaryId, itemIds: ids, createdAt: new Date().toISOString() }]);
  state.mergeSelection = new Set();
}
function renderMetadataMatchOverlay() {
  const menu = state.metadataMenu ? renderMetadataContextMenu() : "";
  const overlay = state.metadataOverlay ? renderMetadataOverlayPanel() : "";
  const toast = state.metadataToast ? renderMetadataToast() : "";
  if (!menu && !overlay && !toast) return "";
  return `${menu}${overlay}${toast}`;
}

function mountMetadataContextMenu() {
  app.querySelectorAll(":scope > .metadata-menu-scrim, :scope > .metadata-context-menu").forEach((element) => element.remove());
  if (!state.metadataMenu) return;
  app.insertAdjacentHTML("beforeend", renderMetadataContextMenu());
  app.querySelectorAll(":scope > [data-action='close-metadata-menu']").forEach((button) => {
    button.addEventListener("click", () => {
      state.metadataMenu = null;
      app.querySelectorAll(":scope > .metadata-menu-scrim, :scope > .metadata-context-menu").forEach((element) => element.remove());
    });
  });
  app.querySelectorAll(":scope > .metadata-context-menu [data-action='metadata-command']").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      preservePageScrollForNextRender();
      await handleMetadataCommand(button.dataset.command, button.dataset.metadataId, button.dataset);
    });
  });
}

function renderMetadataToast() {
  const toast = state.metadataToast;
  if (!toast) return "";
  return `<div class="metadata-toast ${escapeHtml(toast.status ?? "success")}" role="status">${escapeHtml(toast.message ?? "Done")}</div>`;
}

function showMetadataToast(status, message) {
  if (metadataToastTimer) clearTimeout(metadataToastTimer);
  state.metadataToast = { status, message };
  metadataToastTimer = setTimeout(() => {
    state.metadataToast = null;
    preservePageScrollForNextRender();
    render();
  }, 3200);
}

function renderMediaStoplightButton(item, context = "card") {
  if (!item?.id) return "";
  const selected = state.mergeSelection?.has(item.id) ? " merge-selected" : "";
  const isGear = context === "gear";
  const label = `Open options for ${escapeHtml(item.title ?? "title")}`;
  const icon = isGear ? "&#9881;" : "...";
  return `<button class="metadata-menu-button ${context}${selected}" type="button" data-action="metadata-menu" data-metadata-id="${escapeHtml(item.id)}" data-metadata-title="${escapeHtml(getDisplayTitle(item))}" data-metadata-year="${escapeHtml(item.year ?? item.startYear ?? "")}"${item.sessionRental ? ` data-current-rental="true"` : ""} title="${label}" aria-label="${label}">${icon}</button>`;
}

function renderWatchedIndicator(item) {
  if (!isItemCompleted(item)) return "";
  return `<span class="watched-indicator" aria-label="Watched"><i></i></span>`;
}

function renderCompletionCheck(item, label = "Watched") {
  if (!isItemCompleted(item)) return "";
  return `<span class="completion-check" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><i></i></span>`;
}

function renderTvSeasonCompletionCheck(show, season) {
  if (!isTvSeasonCompleted(show, season)) return "";
  return `<span class="completion-check compact" title="Season watched" aria-label="Season watched"><i></i></span>`;
}

function renderDetailMixtapeButton(item) {
  if (!item?.id) return "";
  const included = getItemMixtapes(item.id).includes(DEFAULT_MIXTAPE_KEY);
  return `<button class="toby-detail-mixtape${included ? " included" : ""}" type="button" data-action="metadata-command" data-command="mixtape" data-metadata-id="${escapeHtml(item.id)}" title="${included ? "Already in Mixtape" : "Add to Mixtape"}" aria-label="${included ? "Already in Mixtape" : "Add to Mixtape"}">${renderActionIconSvg("watchlist")}</button>`;
}

function renderActionIconSvg(icon) {
  const icons = {
    watchlist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.75h10a1 1 0 0 1 1 1v14l-6-3.5-6 3.5v-14a1 1 0 0 1 1-1Z"/></svg>',
  };
  return icons[icon] ?? icons.watchlist;
}

const TV_EPISODE_COMPLETIONS_KEY = "tobytube.completed.tv-episodes";

function getCompletedTvEpisodeIds() {
  return new Set(readLocalJson(TV_EPISODE_COMPLETIONS_KEY, []));
}

function markTvEpisodeCompleted(episodeId) {
  if (!episodeId) return;
  const completed = getCompletedTvEpisodeIds();
  completed.add(episodeId);
  writeLocalJson(TV_EPISODE_COMPLETIONS_KEY, [...completed]);
}

function isTvEpisodeCompleted(episodeId) {
  return Boolean(episodeId && getCompletedTvEpisodeIds().has(episodeId));
}

function isTvSeasonCompleted(show, season) {
  const episodes = season?.episodes ?? [];
  return Boolean(episodes.length && episodes.every((episode) => isTvEpisodeCompleted(episode.id)));
}

function isTvShowCompleted(show) {
  const seasons = show ? getAvailableTvSeasons(show) : [];
  return Boolean(seasons.length && seasons.every((season) => isTvSeasonCompleted(show, season)));
}

function isItemCompleted(item) {
  if (!item) return false;
  if (item.mediaType === "episode" || item.mediaType === "tv-episode") return isTvEpisodeCompleted(item.id);
  if (item.mediaType === "tv") return isTvShowCompleted(item);
  return isMarkedWatched(item.id);
}

function isMarkedWatched(id) {
  if (!id) return false;
  return Boolean(getItemOverride(id).watched?.watchedAt ?? localStorage.getItem(`tobytube.watched.${id}`));
}

function markItemWatched(id) {
  if (!id) return;
  localStorage.setItem(`tobytube.watched.${id}`, new Date().toISOString());
}

function addItemToLocalList(key, id) {
  if (!id) return;
  const current = JSON.parse(localStorage.getItem(key) ?? "[]");
  const next = [id, ...current.filter((entry) => entry !== id)].slice(0, 200);
  localStorage.setItem(key, JSON.stringify(next));
}

function removeItemFromLocalList(key, id) {
  if (!id) return;
  const current = JSON.parse(localStorage.getItem(key) ?? "[]");
  localStorage.setItem(key, JSON.stringify(current.filter((entry) => entry !== id)));
}

function readLocalJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function appendLocalHistory(itemId, source = "manual") {
  const history = readLocalJson("tobytube.playHistory", []);
  const item = getTitleItem(itemId);
  const entry = {
    itemId,
    title: item?.title ?? itemId,
    year: item?.year ?? item?.startYear ?? null,
    mediaType: item?.mediaType ?? "movie",
    source,
    watchedAt: new Date().toISOString(),
  };
  writeLocalJson("tobytube.playHistory", [entry, ...history].slice(0, 500));
}

const DEFAULT_MIXTAPE_KEY = "tobytube.mixtape.default";

function getMixtapeOptions() {
  const stored = readLocalJson("tobytube.mixtapes", []);
  const custom = Array.isArray(stored)
    ? stored.filter((option) => option?.key && option.key !== DEFAULT_MIXTAPE_KEY)
      .map((option) => ({ key: option.key, label: option.label || "Untitled Mixtape" }))
    : [];
  return [{ key: DEFAULT_MIXTAPE_KEY, label: "Mixtape", system: true }, ...custom];
}

function saveMixtapeOptions(options) {
  writeLocalJson("tobytube.mixtapes", options.filter((option) => !option.system && option.key !== DEFAULT_MIXTAPE_KEY));
}

function getMixtapeItems(listKey = DEFAULT_MIXTAPE_KEY) {
  return getMixtapeItemIds(listKey).map((id) => getTitleItem(id)).filter(Boolean);
}

function getItemMediaFiles(item) {
  const record = getMetadataRecordForItem(item);
  return item?.files ?? record?.files ?? record?.versions?.flatMap((version) => version.files ?? []) ?? [];
}

function formatFileBytes(size) {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return "Size pending";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let index = 0;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function getSelectedMatchKey(itemId) {
  return `tobytube.selectedMatch.${itemId}`;
}

function readSelectedMatch(itemId) {
  const override = getItemOverride(itemId);
  if (override && Object.prototype.hasOwnProperty.call(override, "match")) return override.match;
  return readLocalJson(getSelectedMatchKey(itemId), null);
}

function writeSelectedMatch(itemId, match) {
  writeLocalJson(getSelectedMatchKey(itemId), {
    ...match,
    selectedAt: new Date().toISOString(),
    phase: "phase-4-local",
  });
}

function clearSelectedMatch(itemId) {
  localStorage.removeItem(getSelectedMatchKey(itemId));
}
async function persistMetadataOverride(itemId, override) {
  try {
    const response = await fetch("./api/metadata/overrides", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, override }),
    });
    if (!response.ok) throw new Error(`Override save failed: ${response.status}`);
    const payload = await response.json();
    mergeMetadataOverride(itemId, payload.override ?? override);
    invalidateMediaCaches();
    return payload;
  } catch (error) {
    writeLocalJson(`tobytube.metadataOverride.${itemId}`, {
      ...(readLocalJson(`tobytube.metadataOverride.${itemId}`, {}) ?? {}),
      ...override,
      localFallback: true,
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
}

async function persistMetadataOverridesBatch(overrides) {
  const response = await fetch("./api/metadata/overrides", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ overrides }),
  });
  if (!response.ok) throw new Error(`Batch override save failed: ${response.status}`);
  Object.entries(overrides).forEach(([itemId, override]) => mergeMetadataOverride(itemId, override));
  invalidateMediaCaches();
  return response.json();
}

function findMatchedWrestlingSeason(seasons, item) {
  if (!item) return null;
  const year = Number(item.year ?? String(item.date ?? "").slice(0, 4));
  return seasons.find((season) => Number(String(season.title ?? "").match(/\b(19\d{2}|20\d{2})\b/)?.[1]) === year)
    ?? seasons.find((season) => Number(String(season.airDate ?? "").slice(0, 4)) === year)
    ?? seasons.find((season) => Number(season.seasonNumber) === year)
    ?? null;
}

function findMatchedWrestlingEpisode(episodes, item) {
  const date = item.broadcastDate ?? item.date;
  return episodes.find((episode) => episode.airDate && episode.airDate === date)
    ?? episodes.find((episode) => Number(episode.episodeNumber) === Number(item.episodeNumber))
    ?? null;
}

function mergeMetadataOverride(itemId, override) {
  metadataOverrides = {
    ...(metadataOverrides ?? { version: 1 }),
    updatedAt: new Date().toISOString(),
    items: {
      ...(metadataOverrides?.items ?? {}),
      [itemId]: {
        ...(metadataOverrides?.items?.[itemId] ?? {}),
        ...(override ?? {}),
      },
    },
  };
}

function getItemOverride(itemId) {
  const cacheKey = `${metadataOverrides.updatedAt ?? "none"}:${itemId}`;
  if (itemOverrideCache.has(cacheKey)) return itemOverrideCache.get(cacheKey);
  const aliasIds = getMetadataAliasIds(itemId);
  const durable = aliasIds.reduce((result, aliasId) => ({
    ...result,
    ...(metadataOverrides?.items?.[aliasId] ?? {}),
  }), {});
  const local = aliasIds.reduce((result, aliasId) => ({
    ...result,
    ...(readLocalJson(`tobytube.metadataOverride.${aliasId}`, {}) ?? {}),
  }), {});
  const result = {
    ...local,
    ...durable,
    ...(readLocalJson(`tobytube.metadataOverride.${itemId}`, {}) ?? {}),
    ...(metadataOverrides?.items?.[itemId] ?? {}),
  };
  itemOverrideCache.set(cacheKey, result);
  return result;
}

function getMetadataAliasIds(itemId) {
  const value = String(itemId ?? "");
  if (!value) return [];
  if (metadataAliasCache.has(value)) return metadataAliasCache.get(value);
  // Wrestling records have their own durable IDs. Sending every event and
  // episode through the TV alias builder forces the entire TV hierarchy to be
  // reconstructed while rendering a promotion year.
  if (generatedWrestlingById.has(value) || batcaveWrestlingObjectIndex.has(value)) {
    const aliases = [...new Set([...getIdentityOverrideIds(value), value])];
    metadataAliasCache.set(value, aliases);
    return aliases;
  }
  if (!getAllTvTitleItems.cache) getAllTvTitleItems();
  const canonicalId = tvCanonicalIdByAlias.get(value) ?? value;
  const showAliases = [...tvCanonicalIdByAlias.entries()]
    .filter(([, canonical]) => canonical === canonicalId)
    .map(([alias]) => alias);
  const episodeMatch = value.match(/^(.*)-s(\d+)-e(\d+)$/i);
  if (episodeMatch) {
    const canonicalShowId = tvCanonicalIdByAlias.get(episodeMatch[1]) ?? episodeMatch[1];
    const mergedShowIds = getMergedItemGroupFor(episodeMatch[1])?.itemIds ?? [];
    const aliases = [...new Set([
      ...[...tvCanonicalIdByAlias.entries()]
        .filter(([, canonical]) => canonical === canonicalShowId)
        .map(([alias]) => buildEpisodeId(alias, episodeMatch[2], episodeMatch[3])),
      ...mergedShowIds.map((showId) => buildEpisodeId(showId, episodeMatch[2], episodeMatch[3])),
      ...getIdentityOverrideIds(value),
      value,
    ].filter(Boolean))];
    metadataAliasCache.set(value, aliases);
    return aliases;
  }
  const mergedAliases = getMergedItemGroupFor(value)?.itemIds ?? [];
  const aliases = [...new Set([...showAliases, ...mergedAliases, ...getIdentityOverrideIds(value), value])];
  metadataAliasCache.set(value, aliases);
  return aliases;
}

function getIdentityOverrideIds(itemId) {
  const raw = getRawItemIdentity(itemId);
  if (!raw?.title) return [];
  const titleKey = normalizeTitleForMatch(raw.title);
  if (!overrideIdsByIdentityTitle) {
    overrideIdsByIdentityTitle = new Map();
    Object.entries(metadataOverrides?.items ?? {}).forEach(([overrideId, override]) => {
      if (!override?.identity?.title) return;
      const key = normalizeTitleForMatch(override.identity.title);
      const entries = overrideIdsByIdentityTitle.get(key) ?? [];
      entries.push([overrideId, override]);
      overrideIdsByIdentityTitle.set(key, entries);
    });
  }
  return (overrideIdsByIdentityTitle.get(titleKey) ?? [])
    .filter(([, override]) => {
      const identity = override?.identity;
      if (!identity?.title || normalizeTitleForMatch(identity.title) !== titleKey) return false;
      if (identity.mediaType && raw.mediaType && identity.mediaType !== raw.mediaType) return false;
      if (identity.year && raw.year && String(identity.year) !== String(raw.year)) return false;
      return true;
    })
    .map(([overrideId]) => overrideId);
}

function getRawItemIdentity(itemId) {
  const candidate =
    metadataIndex[itemId] ??
    (generatedMetadata.records ?? []).find((record) => record.id === itemId) ??
    movies.find((item) => item.id === itemId) ??
    tvShows.find((item) => item.id === itemId) ??
    movieDetailIndex[itemId] ??
    tvDetailIndex[itemId] ??
    generatedWrestlingById.get(itemId) ??
    ecwExtremeFancamById.get(itemId) ??
    batcaveWrestlingObjectIndex.get(itemId) ??
    wweDocumentaries.find((item) => item.id === itemId) ??
    null;
  if (!candidate) return null;
  return {
    title: candidate.title,
    year: candidate.year ?? candidate.startYear ?? String(candidate.releaseDate ?? candidate.firstAirDate ?? "").match(/^\d{4}/)?.[0] ?? "",
    mediaType: candidate.mediaType ?? (tvDetailIndex[itemId] ? "tv" : movieDetailIndex[itemId] ? "movie" : ""),
  };
}

function getItemMixtapes(itemId) {
  const stored = getItemOverride(itemId).mixtapes;
  return Array.isArray(stored) ? stored : [];
}

function getMixtapeItemIds(listKey) {
  const durable = Object.entries(metadataOverrides?.items ?? {})
    .filter(([, override]) => Array.isArray(override.mixtapes) && override.mixtapes.includes(listKey))
    .map(([itemId]) => itemId);
  return [...new Set([...durable, ...readLocalJson(listKey, [])])];
}

function getItemMetadataOverride(itemId) {
  const override = getItemOverride(itemId);
  if (override.metadata || override.match?.title) return {
    ...(override.match?.title ? { title: override.match.title } : {}),
    ...(override.metadata ?? {}),
    ...(!override.metadata?.posterUrl && override.match?.posterUrl ? { posterUrl: override.match.posterUrl } : {}),
    ...(!override.metadata?.backdropUrl && override.match?.backdropUrl ? { backdropUrl: override.match.backdropUrl } : {}),
  };
  if (override.title || override.year || override.genre || override.rating || override.summary || override.collections) return override;
  return {};
}

function getWrestlingSeriesOverrideId(item, seriesName = "") {
  const promotionId = item?.promotionId ?? state.promotionId ?? "wrestling";
  const resolvedSeries = seriesName || item?.series || item?.displayTitle || item?.showName || "series";
  return `wrestling-series-${slugify(promotionId)}-${slugify(resolvedSeries)}`;
}

function getDisplayTitle(item) {
  return getItemMetadataOverride(item?.id).title ?? item?.title ?? "Untitled";
}

function applyMetadataOverrideToDetails(item, details = {}) {
  const override = getItemMetadataOverride(item?.id);
  if (!override || !Object.keys(override).length) return details;
  const next = { ...details, ...override };
  if (override.year && !override.releaseDate) next.releaseDate = override.year;
  if (override.genre && !override.genres?.length) next.genres = [override.genre, ...(details.genres ?? []).filter((genre) => genre !== override.genre)];
  if (override.title) next.overrideTitle = override.title;
  return next;
}
function getMetadataMenuItem() {
  const resolved = getTitleItem(state.metadataMenu?.itemId) ?? getTitleItem(state.metadataOverlay?.itemId);
  if (!resolved || !state.metadataMenu?.displayTitle) return resolved;
  const wantedTitle = normalizeTitleForMatch(state.metadataMenu.displayTitle);
  const wantedYear = Number(state.metadataMenu.displayYear);
  const selectedItem = [...getMovieLibraryItems(), ...getTvLibraryItems(), ...Object.values(movieDetailIndex), ...Object.values(tvDetailIndex)]
    .find((item) => normalizeTitleForMatch(item.title) === wantedTitle && (!wantedYear || Number(item.year ?? item.startYear) === wantedYear));
  return selectedItem ?? { ...resolved, title: state.metadataMenu.displayTitle, year: state.metadataMenu.displayYear || resolved.year };
}

function renderMetadataContextMenu() {
  const item = getMetadataMenuItem();
  if (!item) return "";
  const targetItemId = state.metadataMenu?.itemId ?? item.id;
  const menuWidth = 292;
  const menuHeight = Math.min(620, Math.max(360, window.innerHeight - 32));
  const x = Math.max(8, Math.min(state.metadataMenu.x ?? 24, window.innerWidth - menuWidth));
  const y = Math.max(8, Math.min(state.metadataMenu.y ?? 24, window.innerHeight - menuHeight - 8));
  const selectedForMerge = state.mergeSelection.has(item.id);
  const isWrestling = item.mediaType === "wrestling" || Boolean(item.promotionId && (item.recordType === "event" || item.recordType === "episode"));
  const actions = [
    ["select-merge", selectedForMerge ? "Unselect from Merge as…" : "Select for Merge as…"],
    ...(state.mergeSelection.size >= 2 ? [["merge-items", `Merge ${state.mergeSelection.size} Items as…`]] : []),
    ...(state.mergeSelection.size ? [["cancel-merge", "Cancel Merge"]] : []),
    ["play-next", "Play Next"],
    ["queue", "Add to Queue"],
    ["add-to", "Add to..."],
    ...(state.metadataMenu?.currentRental ? [["remove-current-rental", "Remove from Current Rentals"]] : []),
    ["watched", "Mark as Watched"],
    ["refresh", "Refresh Metadata"],
    ["analyze", "Analyze"],
    ...(isWrestling ? [["twdb-match", "TWDB Match..."]] : []),
    ["fix-match", "Fix Match..."],
    ["edit-metadata", "Edit Metadata..."],
    ["unmatch", "Unmatch"],
    ["optimize", "Optimize..."],
    ["save", "Save File"],
    ["access", "Modify Access..."],
    ["delete", "Delete..."],
    ["history", "View Play History"],
    ["info", "File Info"],
  ];
  return `
    <div class="metadata-menu-scrim" data-action="close-metadata-menu"></div>
    <nav class="metadata-context-menu" style="left:${x}px; top:${y}px; max-height:${menuHeight}px" aria-label="Options for ${escapeHtml(getDisplayTitle(item))}">
      <div class="metadata-context-title">${escapeHtml(getDisplayTitle(item))}</div>
      ${actions.map(([command, label]) => `<button type="button" data-action="metadata-command" data-command="${command}" data-metadata-id="${escapeHtml(targetItemId)}">${escapeHtml(label)}</button>`).join("")}
    </nav>
  `;
}

function getMetadataMenuTrigger(target) {
  if (!(target instanceof Element)) return null;
  const direct = target.closest("[data-action='metadata-menu']");
  if (direct) return direct;
  const host = target.closest(".media-card, .library-card, .continue-card, .episode-card, .event-row, .poster-menu-frame, [data-tv-episode-id]");
  return host?.querySelector("[data-action='metadata-menu']") ?? null;
}

function openMetadataContextMenu(trigger, clientX, clientY) {
  if (!trigger?.dataset.metadataId) return false;
  state.metadataMenu = {
    itemId: trigger.dataset.metadataId,
    displayTitle: trigger.dataset.metadataTitle,
    displayYear: trigger.dataset.metadataYear,
    currentRental: trigger.dataset.currentRental === "true",
    x: clientX,
    y: clientY,
  };
  state.metadataOverlay = null;
  mountMetadataContextMenu();
  return true;
}

function bindMetadataContextAccess() {
  const hosts = new Set();
  document.querySelectorAll("[data-action='metadata-menu']").forEach((trigger) => {
    if (trigger.classList.contains("gear")) return;
    const host = trigger.closest(".media-card, .library-card, .continue-card, .episode-card, .event-row, .poster-menu-frame, [data-tv-episode-id]");
    if (host) hosts.add(host);
  });
  hosts.forEach((host) => {
    const trigger = getMetadataMenuTrigger(host);
    if (!trigger) return;
    host.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMetadataContextMenu(trigger, event.clientX, event.clientY);
    });
    let timer = null;
    let startX = 0;
    let startY = 0;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    host.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      startX = event.clientX;
      startY = event.clientY;
      timer = setTimeout(() => {
        openMetadataContextMenu(trigger, startX, startY);
        navigator.vibrate?.(20);
        timer = null;
      }, 650);
    }, { passive: true });
    host.addEventListener("pointermove", (event) => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) cancel();
    }, { passive: true });
    host.addEventListener("pointerup", cancel, { passive: true });
    host.addEventListener("pointercancel", cancel, { passive: true });
  });
}

function renderMetadataOverlayPanel() {
  const item = getTitleItem(state.metadataOverlay.itemId);
  if (!item) return "";
  const type = state.metadataOverlay.type;
  const title = {
    "fix-match": "Fix Match",
    "twdb-match": "TWDB Match",
    "wrestling-series-match": "Wrestling Match Tools",
    "edit-metadata": "Edit Metadata",
    "batcave-metadata": "Edit Metadata",
    info: "File Info",
    delete: "Delete From Server",
    "merge-items": "Merge As",
    analyze: "Analyze",
    optimize: "Optimize",
    access: "Modify Access",
    history: "Play History",
    "add-to": "Add To",
    unmatch: "Unmatch",
    save: "Save File",
    status: "Status",
  }[type] ?? "Media Options";
  return `
    <div class="metadata-match-overlay" data-action="close-metadata-overlay">
      <section class="metadata-match-panel ${["batcave-metadata", "edit-metadata"].includes(type) ? "batcave-metadata-master" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" data-metadata-panel>
        <button class="metadata-overlay-close" type="button" data-action="close-metadata-overlay" aria-label="Close">X</button>
        <h2>${escapeHtml(title)}</h2>
        <p class="metadata-overlay-location">${escapeHtml(getMetadataLocationLine(item))}</p>
        ${renderMetadataOverlayBody(type, item)}
      </section>
    </div>
  `;
}

function renderMetadataOverlayBody(type, item) {
  if (type === "fix-match") return renderFixMatchShell(item);
  if (type === "twdb-match") return renderTwdbMatchShell(item);
  if (type === "wrestling-series-match") return renderWrestlingSeriesMatchShell(item);
  if (type === "edit-metadata") return renderBatcaveMetadataMaster(item);
  if (type === "batcave-metadata") return renderBatcaveMetadataMaster(item);
  if (type === "info") return renderFileInfoShell(item);
  if (type === "delete") return `<p>This removes the title from Tobytube only. It will not delete the file from disk.</p><button class="danger-button" type="button" data-action="metadata-command" data-command="delete-confirm" data-metadata-id="${escapeHtml(item.id)}">Remove from server</button>`;
  if (type === "merge-items") return renderMergeItemsShell();
  if (type === "add-to") return renderAddToShell(item);
  if (type === "analyze") return renderAnalyzeShell(item);
  if (type === "optimize") return renderOptimizeShell(item);
  if (type === "save") return renderSaveFileShell(item);
  if (type === "access") return renderAccessShell(item);
  if (type === "history") return renderPlayHistoryShell(item);
  if (type === "unmatch") return renderUnmatchShell(item);
  if (type === "status") return `<p>${escapeHtml(state.metadataOverlay.message ?? "Done.")}</p>`;
  return `<p>${escapeHtml(item.title)} is ready for the ${escapeHtml(type)} workflow.</p>`;
}

function renderWrestlingSeriesMatchShell(item) {
  const overlay = state.metadataOverlay;
  const items = (overlay.itemIds ?? []).map(getTitleItem).filter(Boolean);
  return `
    <p>Refresh this ${escapeHtml(overlay.seriesName ?? "wrestling show")} lane from one source. TMDB and TVDB open provider results for artwork; TWDB reloads Tobytube's saved event data.</p>
    <div class="metadata-match-actions wrestling-provider-actions">
      <button type="button" data-action="wrestling-lane-provider" data-provider="TMDB">TMDB Artwork</button>
      <button type="button" data-action="wrestling-lane-provider" data-provider="TVDB">TVDB Artwork</button>
      <button type="button" data-action="wrestling-lane-provider" data-provider="TWDB">TWDB Metadata</button>
    </div>
    <div class="wrestling-match-item-grid">
      ${items.map((entry) => `<article>${renderPosterBlock(entry)}<strong>${escapeHtml(getDisplayTitle(entry))}</strong><span>${escapeHtml(formatDisplayDate(entry.date))}</span></article>`).join("") || `<p>No episodes are loaded in this lane.</p>`}
    </div>
  `;
}

function renderEditMetadataShell(item) {
  const override = getItemMetadataOverride(item.id);
  const collections = override.collections ?? item.collections ?? item.collectionIds ?? [];
  return `
    <p>These metadata overrides are stored separately from scanned provider data, so they survive library rescans.</p>
    <div class="metadata-match-search two-column-form">
      <label>Title<input type="text" value="${escapeHtml(override.title ?? item.title ?? "")}" data-edit-title></label>
      <label>Year<input type="text" value="${escapeHtml(override.year ?? item.year ?? item.startYear ?? "")}" data-edit-year></label>
      <label>Genre<input type="text" value="${escapeHtml(override.genre ?? getPrimaryGenreForItem(item) ?? "")}" data-edit-genre></label>
      <label>Rating<input type="text" value="${escapeHtml(override.rating ?? item.rating ?? "")}" data-edit-rating></label>
      <label class="wide">Collections<textarea data-edit-collections>${escapeHtml(Array.isArray(collections) ? collections.join("\n") : String(collections ?? ""))}</textarea></label>
      <label class="wide">Summary<textarea data-edit-summary>${escapeHtml(override.summary ?? getTitleDetails(item)?.summary ?? item.summary ?? "")}</textarea></label>
    </div>
    <div class="metadata-match-actions">
      <button type="button" data-action="metadata-command" data-command="save-metadata-edit" data-metadata-id="${escapeHtml(item.id)}">Save Metadata Draft</button>
    </div>
  `;
}

const BATCAVE_COLLECTION_COLORS = {
  Vaults: "#d8b35d",
  Sagas: "#df6258",
  Aisles: "#55b8d8",
  "Boxed Sets": "#e28c4f",
  Worlds: "#9a79df",
  Profiles: "#6dbf81",
};

function buildBatcaveMetadataDraft(item) {
  const override = getItemMetadataOverride(item.id);
  const rawAllocations = Array.isArray(override.collectionAllocations) ? override.collectionAllocations : [];
  const legacyCollections = Array.isArray(override.collections) ? override.collections : [];
  const savedAllocations = rawAllocations.length ? rawAllocations : legacyCollections.map((entry) => {
    const labels = String(entry).split(/\s*(?:\/|>)\s*/).filter(Boolean);
    return {
      id: labels.map(slugify).join("/"),
      pathLabels: labels,
      rootId: slugify(labels[0] ?? "collections"),
      collectionId: slugify(labels[1] ?? labels[0] ?? "collection"),
      sectionId: slugify(labels.at(-1) ?? "featured"),
      color: BATCAVE_COLLECTION_COLORS[labels[0]] ?? "#d8b35d",
    };
  });
  const inferredAllocations = getInferredCollectionAllocations(item);
  const savedTvGuideChannelIds = [...new Set(override.tvGuideChannelIds ?? [])];
  const inferredTvGuideChannelIds = getFolderTvGuideChannelIds(item);
  const franchises = item.mediaType === "franchise" ? [item] : getFranchisesForItem(item.id);
  const excludedAllocationIds = new Set(override.collectionExclusions ?? []);
  const allocations = [...savedAllocations, ...inferredAllocations]
    .filter((allocation, index, all) => !excludedAllocationIds.has(allocation.id) && all.findIndex((entry) => entry.id === allocation.id) === index);
  return {
    itemId: item.id,
    title: override.title ?? item.title ?? "",
    year: override.year ?? item.year ?? item.startYear ?? "",
    genre: override.genre ?? getPrimaryGenreForItem(item) ?? "",
    rating: override.rating ?? item.rating ?? "",
    summary: override.summary ?? getTitleDetails(item)?.summary ?? item.summary ?? "",
    allocations,
    inferredAllocationIds: inferredAllocations.map((allocation) => allocation.id),
    savedTvGuideChannelIds,
    inferredTvGuideChannelIds,
    tvGuideChannelIds: [...new Set([...savedTvGuideChannelIds, ...inferredTvGuideChannelIds])],
    franchiseId: item.mediaType === "franchise" ? item.id : (franchises[0]?.id ?? ""),
    franchiseTitle: item.mediaType === "franchise" ? item.title : (franchises[0]?.title ?? ""),
    franchiseSummary: item.mediaType === "franchise" ? item.summary : (franchises[0]?.summary ?? ""),
    franchisePosterUrl: item.mediaType === "franchise" ? (item.posterUrl ?? "") : (franchises[0]?.posterUrl ?? ""),
    franchiseBackdropUrl: item.mediaType === "franchise" ? (item.backdropUrl ?? "") : (franchises[0]?.backdropUrl ?? ""),
    franchiseMemberIds: item.mediaType === "franchise" ? [...(item.memberIds ?? [])] : (franchises[0]?.memberIds ?? []),
    franchiseMixtapeKeys: item.mediaType === "franchise" ? [...(item.mixtapeKeys ?? [])] : (franchises[0]?.mixtapeKeys ?? []),
  };
}

function normalizeTvGuideFolderLabel(value = "") {
  return String(value).replace(/^\s*\d{3}\s+/, "").replace(/\s*\[[^\]]*\]\s*$/, "").trim();
}

function getFolderTvGuideChannelIds(item) {
  const files = getItemMediaFiles(item);
  const channelIds = files.flatMap((file) => {
    const parts = String(file.path ?? file.filePath ?? file.name ?? "").split(/[\\/]+/).filter(Boolean);
    const guideIndex = parts.findIndex((part) => normalizeTitleForMatch(part) === "tobytube tv guide");
    if (guideIndex < 0 || !parts[guideIndex + 1]) return [];
    const folder = parts[guideIndex + 1];
    const number = folder.match(/^\s*(\d{3})\b/)?.[1];
    const label = normalizeTvGuideFolderLabel(folder);
    const channel = tvGuideChannels.find((entry) => entry.number === number || normalizeTitleForMatch(entry.title) === normalizeTitleForMatch(label));
    return channel ? [channel.number] : [];
  });
  return [...new Set(channelIds)];
}

function collectionItemsMatch(left, right) {
  if (!left || !right) return false;
  if (left.id && right.id && left.id === right.id) return true;
  const sameTitle = normalizeTitleForMatch(left.title) === normalizeTitleForMatch(right.title);
  const leftYear = Number(left.year ?? left.startYear);
  const rightYear = Number(right.year ?? right.startYear);
  return sameTitle && (!leftYear || !rightYear || leftYear === rightYear);
}

function getInferredCollectionAllocations(item) {
  const allocations = [];
  const folderEntries = getGeneratedCollectionFolderEntries().filter((entry) => collectionItemsMatch(entry.item, item));
  getGroupedCollections().forEach((group) => {
    const color = BATCAVE_COLLECTION_COLORS[group.title] ?? "#d8b35d";
    group.collections.forEach((collection) => {
      const page = getCuratedCollectionPage(collection.id);
      const sections = page?.sections ?? collection.carousels ?? [];
      sections.forEach((section) => {
        if (!(section.items ?? []).some((entry) => collectionItemsMatch(entry, item))) return;
        allocations.push({
          id: `${slugify(group.title)}/${collection.id}/${section.id}`,
          pathIds: [slugify(group.title), collection.id, section.id],
          pathLabels: [group.title, collection.title, section.title],
          rootId: slugify(group.title),
          collectionId: collection.id,
          sectionId: section.id,
          color,
          inferred: true,
        });
      });
      const collectionKeys = collectionMatchKeys(page ?? collection);
      folderEntries.filter((entry) => collectionKeys.has(entry.collectionSlug)).forEach((entry) => {
        if (allocations.some((allocation) => allocation.collectionId === collection.id && allocation.sectionId === entry.sectionSlug)) return;
        allocations.push({
          id: `${slugify(group.title)}/${collection.id}/${entry.sectionSlug}`,
          pathIds: [slugify(group.title), collection.id, entry.sectionSlug],
          pathLabels: [group.title, collection.title, entry.section || "Unsorted"],
          rootId: slugify(group.title),
          collectionId: collection.id,
          sectionId: entry.sectionSlug,
          color,
          inferred: true,
        });
      });
    });
  });
  return allocations;
}

function isItemExcludedFromCollectionSection(item, collectionId, sectionId) {
  const resolvedItem = getCuratedHydratedItem(item);
  const exclusions = [
    ...(getItemMetadataOverride(item.id).collectionExclusions ?? []),
    ...(resolvedItem?.id !== item.id ? getItemMetadataOverride(resolvedItem.id).collectionExclusions ?? [] : []),
  ];
  if (!exclusions.length) return false;
  return exclusions.some((id) => {
    const parts = String(id).split("/");
    return parts.at(-2) === collectionId && parts.at(-1) === sectionId;
  });
}

function getBatcaveMetadataDraft(item) {
  if (state.batcaveMetadataDraft?.itemId !== item.id) state.batcaveMetadataDraft = buildBatcaveMetadataDraft(item);
  return state.batcaveMetadataDraft;
}

function captureBatcaveMetadataDraft() {
  const draft = state.batcaveMetadataDraft;
  if (!draft) return;
  draft.title = document.querySelector("[data-master-title]")?.value ?? draft.title;
  draft.year = document.querySelector("[data-master-year]")?.value ?? draft.year;
  draft.genre = document.querySelector("[data-master-genre]")?.value ?? draft.genre;
  draft.rating = document.querySelector("[data-master-rating]")?.value ?? draft.rating;
  draft.summary = document.querySelector("[data-master-summary]")?.value ?? draft.summary;
  draft.franchiseTitle = document.querySelector("[data-franchise-title]")?.value ?? draft.franchiseTitle;
  draft.franchiseSummary = document.querySelector("[data-franchise-summary]")?.value ?? draft.franchiseSummary;
  draft.franchisePosterUrl = document.querySelector("[data-franchise-poster]")?.value ?? draft.franchisePosterUrl;
  draft.franchiseBackdropUrl = document.querySelector("[data-franchise-backdrop]")?.value ?? draft.franchiseBackdropUrl;
}

function renderBatcaveFranchiseEditor(draft, item) {
  const franchise = draft.franchiseId ? getTitleItem(draft.franchiseId) : null;
  const members = (draft.franchiseMemberIds ?? []).map((id) => getTitleItem(id)).filter(Boolean);
  const mixtapes = getMixtapeOptions().filter((option) => (draft.franchiseMixtapeKeys ?? []).includes(option.key));
  return `
    <details class="batcave-master-section batcave-master-tagger franchise-editor" data-metadata-tagger="franchise" ${state.metadataOverlay.franchiseTaggerOpen ? "open" : ""}>
      <summary class="batcave-master-section-head"><h3>Franchise Editor</h3><small>${franchise ? escapeHtml(franchise.title) : "Not assigned"}</small></summary>
      ${franchise ? `
        <div class="batcave-master-fields">
          <label class="wide"><span>Franchise name</span><input data-franchise-title value="${escapeHtml(draft.franchiseTitle)}"></label>
          <label class="full"><span>Summary</span><textarea data-franchise-summary>${escapeHtml(draft.franchiseSummary)}</textarea></label>
          <label class="wide"><span>Poster artwork URL or local asset path</span><input data-franchise-poster value="${escapeHtml(draft.franchisePosterUrl)}"></label>
          <label class="wide"><span>Banner artwork URL or local asset path</span><input data-franchise-backdrop value="${escapeHtml(draft.franchiseBackdropUrl)}"></label>
        </div>
        <div class="franchise-editor-members">
          <h4>Movies & series</h4>
          ${members.map((member) => `<article>${renderPosterBlock(member)}<span>${escapeHtml(getDisplayTitle(member))}</span><button type="button" data-remove-franchise-member="${escapeHtml(member.id)}">Remove</button></article>`).join("") || `<p class="muted">No live members found.</p>`}
        </div>
        <div class="franchise-editor-mixtapes"><h4>Franchise mixtapes</h4><p>${mixtapes.map((entry) => escapeHtml(entry.label)).join(" / ") || "No mixtapes attached yet. Create them through Add To, then attach them here in a later refinement."}</p></div>
        <button type="button" data-open-franchise-page="${escapeHtml(franchise.id)}">Open Franchise Page</button>
      ` : `<p class="muted">This title is not part of a custom franchise. Select two or more objects and choose Merge as… → Franchise to create one.</p>`}
    </details>`;
}

function makeAllocatorNode(id, label, color, children = []) {
  return { id: slugify(id || label), label, color, children };
}

function getCollectionSectionNodes(collection, color) {
  if (collection.id === "criterion" && criterionCollectionIndex) {
    const byId = new Map((criterionCollectionIndex.subCollections ?? []).map((entry) => [entry.id, entry]));
    const groups = (criterionCollectionIndex.collectionGroups ?? []).map((group) => makeAllocatorNode(
      group.id,
      group.title,
      color,
      (group.collectionIds ?? []).map((id) => byId.get(id)).filter(Boolean).map((entry) => makeAllocatorNode(entry.id, entry.title, color)),
    ));
    return [makeAllocatorNode("collections", "Collections", color, groups)];
  }
  const page = getCuratedCollectionPage(collection.id);
  const sections = page?.sections ?? collection.carousels ?? [];
  return sections.map((section) => makeAllocatorNode(section.id, section.title, color, getNestedAllocatorNodes(section, color)));
}

function getNestedAllocatorNodes(source, color) {
  const childCollections = [source?.children, source?.subsections, source?.groups, source?.carousels].find(Array.isArray) ?? [];
  return childCollections.map((child) => makeAllocatorNode(child.id, child.title ?? child.label ?? child.name, color, getNestedAllocatorNodes(child, color)));
}

function getBatcaveCollectionAllocatorTree() {
  return getGroupedCollections().map((group) => {
    const color = BATCAVE_COLLECTION_COLORS[group.title] ?? "#d8b35d";
    const collections = group.collections.map((collection) => makeAllocatorNode(collection.id, collection.title, color, getCollectionSectionNodes(collection, color)));
    return makeAllocatorNode(group.title, group.title, color, collections);
  });
}

function getAllocatorNodeAtPath(tree, path, depth) {
  let nodes = tree;
  let selected = null;
  for (let index = 0; index <= depth; index += 1) {
    selected = nodes.find((node) => node.id === path[index]);
    if (!selected) return null;
    nodes = selected.children ?? [];
  }
  return selected;
}

function renderBatcaveAllocatorColumn(nodes, depth, selectedId, title) {
  return `
    <section class="batcave-allocator-column">
      <h4>${escapeHtml(title)}</h4>
      <div class="batcave-allocator-options">
        ${nodes.map((node) => `<button type="button" class="${selectedId === node.id ? "active" : ""}" data-allocator-depth="${depth}" data-allocator-node="${escapeHtml(node.id)}" style="--allocation-color:${node.color}"><span>${escapeHtml(node.label)}</span>${node.children?.length ? "<b>›</b>" : "<b>+</b>"}</button>`).join("") || `<p class="muted">No further categories.</p>`}
      </div>
    </section>`;
}

function renderBatcaveCollectionAllocator(draft) {
  const tree = getBatcaveCollectionAllocatorTree();
  const path = state.metadataOverlay.allocatorPath ?? [];
  const columns = [renderBatcaveAllocatorColumn(tree, 0, path[0], "Collections")];
  for (let depth = 0; depth < path.length; depth += 1) {
    const node = getAllocatorNodeAtPath(tree, path, depth);
    if (!node?.children?.length) break;
    columns.push(renderBatcaveAllocatorColumn(node.children, depth + 1, path[depth + 1], node.label));
  }
  return `
    <section class="batcave-master-section batcave-master-collections">
      <div class="batcave-master-section-head"><h3>Collections</h3><small>Choose a path; terminal choices are added automatically.</small></div>
      <div class="batcave-allocator-scroll">${columns.join("")}</div>
    </section>`;
}

function renderBatcaveTvGuideTagger(draft) {
  const inferred = new Set(draft.inferredTvGuideChannelIds ?? []);
  const selected = new Set(draft.tvGuideChannelIds ?? []);
  return `
    <details class="batcave-master-section batcave-master-tagger" data-metadata-tagger="tv-guide" ${state.metadataOverlay.tvGuideTaggerOpen ? "open" : ""}>
      <summary class="batcave-master-section-head"><h3>TV Guide tags</h3><small>${selected.size} channel${selected.size === 1 ? "" : "s"} selected</small></summary>
      <p class="muted">Folder membership is automatic. Select additional channels here for TV programs or movies.</p>
      <div class="batcave-tv-guide-tags">
        ${tvGuideChannels.map((channel) => {
          const active = selected.has(channel.number);
          const folderAssigned = inferred.has(channel.number);
          return `<button type="button" class="${active ? "active" : ""} ${folderAssigned ? "folder-assigned" : ""}" data-tv-guide-channel-id="${escapeHtml(channel.number)}" ${folderAssigned ? "disabled" : ""}><b>${escapeHtml(channel.number)}</b><span>${escapeHtml(channel.title)}</span>${folderAssigned ? "<small>Folder</small>" : ""}</button>`;
        }).join("")}
      </div>
    </details>`;
}

function renderBatcaveMetadataMaster(item) {
  const draft = getBatcaveMetadataDraft(item);
  const override = getItemMetadataOverride(item.id);
  const providerQuery = state.metadataOverlay.query ?? { title: draft.title, year: draft.year, agent: "TMDB", language: "English" };
  const results = state.metadataOverlay.results ?? [];
  const isWrestling = item.mediaType === "wrestling" || Boolean(item.promotionId);
  const previewItem = { ...item, ...override, title: draft.title, year: draft.year };
  return `
    ${state.metadataOverlay.notice ? `<p class="metadata-match-notice">${escapeHtml(state.metadataOverlay.notice)}</p>` : ""}
    <form class="batcave-master-form" data-batcave-metadata-form>
      <section class="batcave-master-section">
        <div class="batcave-master-fields">
          <label class="wide"><span>Title</span><input data-master-title value="${escapeHtml(draft.title)}"></label>
          <label><span>Year</span><input data-master-year value="${escapeHtml(String(draft.year))}"></label>
          <label class="wide"><span>Genre</span><input data-master-genre value="${escapeHtml(draft.genre)}"></label>
          <label><span>Rating</span><input data-master-rating value="${escapeHtml(draft.rating)}"></label>
          <label class="full"><span>Summary</span><textarea data-master-summary>${escapeHtml(draft.summary)}</textarea></label>
        </div>
      </section>
      <details class="batcave-master-section batcave-master-tagger" data-metadata-tagger="collections" ${state.metadataOverlay.collectionsTaggerOpen ? "open" : ""}>
        <summary class="batcave-master-section-head"><h3>Collection tags</h3><small>${draft.allocations.length} path${draft.allocations.length === 1 ? "" : "s"} selected</small></summary>
        ${draft.allocations.length ? `<div class="batcave-allocation-tags">${draft.allocations.map((allocation, index) => `<button type="button" data-remove-allocation="${index}" style="--allocation-color:${escapeHtml(allocation.color ?? "#d8b35d")}" title="Remove allocation">${escapeHtml((allocation.pathLabels ?? []).join(" / "))}<span>×</span></button>`).join("")}</div>` : `<p class="muted">No collection paths assigned.</p>`}
        ${renderBatcaveCollectionAllocator(draft)}
      </details>
      ${renderBatcaveTvGuideTagger(draft)}
      ${renderBatcaveFranchiseEditor(draft, item)}
      <section class="batcave-master-section batcave-master-artwork">
        <div class="batcave-master-section-head"><h3>Artwork</h3><small>Provider images can be matched without leaving the editor.</small></div>
        <div class="batcave-artwork-layout">
          <div class="batcave-artwork-preview">${renderPosterBlock(previewItem)}</div>
          <div class="batcave-artwork-controls">
            <label><span>Title</span><input data-match-title value="${escapeHtml(providerQuery.title ?? draft.title)}"></label>
            <label><span>Source</span><select data-match-agent>${["TMDB", "TVDB", ...(isWrestling ? ["TWDB"] : [])].map((provider) => `<option ${provider === providerQuery.agent ? "selected" : ""}>${provider}</option>`).join("")}</select></label>
            <label><span>Year</span><input data-match-year value="${escapeHtml(String(providerQuery.year ?? draft.year))}"></label>
            <label><span>Language</span><select data-match-language>${["English", "French", "Spanish", "Hindi"].map((language) => `<option ${language === providerQuery.language ? "selected" : ""}>${language}</option>`).join("")}</select></label>
            <label><span>Custom poster</span><input data-custom-poster-url value="${escapeHtml(override.posterUrl ?? item.posterUrl ?? "")}" placeholder="Asset path or URL"></label>
            <label><span>Custom backdrop</span><input data-custom-backdrop-url value="${escapeHtml(override.backdropUrl ?? item.backdropUrl ?? "")}" placeholder="Asset path or URL"></label>
            <button type="button" data-action="metadata-command" data-command="match-search" data-metadata-id="${escapeHtml(item.id)}">Search Artwork</button>
          </div>
        </div>
        <div class="metadata-match-results batcave-artwork-results">
          ${state.metadataOverlay.error ? `<p class="metadata-match-error">${escapeHtml(state.metadataOverlay.error)}</p>` : ""}
          ${state.metadataOverlay.loading ? `<article><strong>Searching...</strong></article>` : ""}
          ${results.map((result) => renderFixMatchResult(item, result)).join("")}
        </div>
      </section>
      <div class="batcave-master-actions"><button type="button" data-action="save-batcave-metadata" data-metadata-id="${escapeHtml(item.id)}">Save Metadata</button></div>
    </form>`;
}
function renderAddToShell(item) {
  const options = getMixtapeOptions();
  const notice = state.metadataOverlay.notice;
  const editingKey = state.metadataOverlay.editingMixtapeKey;
  const deletingKey = state.metadataOverlay.deletingMixtapeKey;
  return `
    ${notice ? `<p class="metadata-match-notice">${escapeHtml(notice)}</p>` : ""}
    <p>Add this title to your main Mixtape or a playlist of your own. Library collections are managed in the metadata editor.</p>
    <div class="mixtape-create">
      <input data-new-mixtape-name maxlength="80" placeholder="Name a new Mixtape" aria-label="New Mixtape name">
      <button type="button" data-action="metadata-command" data-command="create-mixtape" data-metadata-id="${escapeHtml(item.id)}">Create</button>
    </div>
    <div class="metadata-match-results mixtape-manager">
      ${options.map((option) => {
        const items = getMixtapeItemIds(option.key);
        const included = items.includes(item.id);
        const count = items.length;
        if (editingKey === option.key) return `<article class="mixtape-row"><div class="mixtape-rename"><input data-rename-mixtape-name maxlength="80" value="${escapeHtml(option.label)}" aria-label="Rename ${escapeHtml(option.label)}"><button type="button" data-action="metadata-command" data-command="save-rename-mixtape" data-metadata-id="${escapeHtml(item.id)}" data-list-key="${escapeHtml(option.key)}">Save</button><button type="button" data-action="metadata-command" data-command="cancel-mixtape-edit" data-metadata-id="${escapeHtml(item.id)}">Cancel</button></div></article>`;
        return `
          <article class="mixtape-row">
            <div><strong>${escapeHtml(option.label)}</strong><span>${count} item${count === 1 ? "" : "s"}${included ? " / This title is included" : ""}</span></div>
            <div class="mixtape-row-actions">
              <button type="button" data-action="metadata-command" data-command="${included ? "remove-from-list" : "add-to-list"}" data-metadata-id="${escapeHtml(item.id)}" data-list-key="${escapeHtml(option.key)}" data-list-label="${escapeHtml(option.label)}">${included ? "Remove" : "Add"}</button>
              ${option.system ? "" : `<button type="button" data-action="metadata-command" data-command="begin-rename-mixtape" data-metadata-id="${escapeHtml(item.id)}" data-list-key="${escapeHtml(option.key)}">Rename</button><button type="button" class="${deletingKey === option.key ? "danger-button" : ""}" data-action="metadata-command" data-command="${deletingKey === option.key ? "delete-mixtape" : "confirm-delete-mixtape"}" data-metadata-id="${escapeHtml(item.id)}" data-list-key="${escapeHtml(option.key)}">${deletingKey === option.key ? "Confirm delete" : "Delete"}</button>`}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderAnalyzeShell(item) {
  const files = getItemMediaFiles(item);
  const first = files[0] ?? {};
  const request = getItemOverride(item.id).analysis;
  return `
    <p>Run ffprobe against the primary file to record current technical details.</p>
    <dl class="metadata-info-grid">
      <dt>Files</dt><dd>${files.length}</dd>
      <dt>Runtime</dt><dd>${escapeHtml(item.runtime ?? getTitleDetails(item)?.runtime ?? "Pending")}</dd>
      <dt>Container</dt><dd>${escapeHtml(first.container ?? first.parsed?.container ?? "Pending")}</dd>
      <dt>Video</dt><dd>${escapeHtml(first.videoCodec ?? first.mediaInfo?.videoCodec ?? "Pending")}</dd>
      <dt>Audio</dt><dd>${escapeHtml(first.audioCodec ?? first.mediaInfo?.audioCodec ?? "Pending")}</dd>
    </dl>
    ${renderAnalysisResult(request)}
    <button type="button" data-action="metadata-command" data-command="analyze-run" data-metadata-id="${escapeHtml(item.id)}">${request?.status === "complete" ? "Analyze Again" : "Analyze Now"}</button>
  `;
}

function renderAnalysisResult(analysis) {
  if (!analysis) return "";
  if (analysis.status === "running") return `<p>Analysis is running...</p>`;
  if (analysis.status === "failed") return `<p class="metadata-match-error">Analysis failed: ${escapeHtml(analysis.error ?? "Unknown error")}</p>`;
  if (analysis.status !== "complete") return `<p>Analysis requested.</p>`;
  const resolution = analysis.video?.width && analysis.video?.height ? `${analysis.video.width} x ${analysis.video.height}` : "Unknown";
  return `
    <dl class="metadata-info-grid">
      <dt>Analyzed container</dt><dd>${escapeHtml(analysis.container ?? "Unknown")}</dd>
      <dt>Video codec</dt><dd>${escapeHtml(analysis.video?.codec ?? "Unknown")}</dd>
      <dt>Resolution</dt><dd>${escapeHtml(resolution)}</dd>
      <dt>Bit rate</dt><dd>${escapeHtml(analysis.bitRate ? `${Math.round(analysis.bitRate / 1000)} kbps` : "Unknown")}</dd>
      <dt>Audio tracks</dt><dd>${analysis.audio?.length ?? 0}</dd>
      <dt>Subtitle tracks</dt><dd>${analysis.subtitles?.length ?? 0}</dd>
    </dl>
  `;
}

function renderOptimizeShell(item) {
  const files = getItemMediaFiles(item);
  const first = files[0] ?? {};
  const request = getItemOverride(item.id).optimization;
  return `
    <p>Create a browser-friendly H.264/AAC MP4 copy in a <code>.tobytube-optimized</code> folder beside the original. The original file is never changed.</p>
    <dl class="metadata-info-grid">
      <dt>Primary file</dt><dd>${escapeHtml(first.path ?? "No local file recorded")}</dd>
      <dt>Size</dt><dd>${escapeHtml(formatFileBytes(first.size))}</dd>
    </dl>
    ${renderOptimizationResult(request)}
    ${request?.status === "running" || request?.status === "queued"
      ? `<button type="button" data-action="metadata-command" data-command="optimize-status" data-metadata-id="${escapeHtml(item.id)}">Refresh Status</button>`
      : `<button type="button" data-action="metadata-command" data-command="optimize-run" data-metadata-id="${escapeHtml(item.id)}">Create Optimized Copy</button>`}
  `;
}

function renderOptimizationResult(optimization) {
  if (!optimization) return "";
  if (optimization.status === "queued" || optimization.status === "running") return `<p>Optimization is ${escapeHtml(optimization.status)}. This can take a while for large files.</p>`;
  if (optimization.status === "failed") return `<p class="metadata-match-error">Optimization failed: ${escapeHtml(optimization.error ?? "Unknown error")}</p>`;
  if (optimization.status === "complete") return `<p>Optimized copy ready: <code>${escapeHtml(optimization.outputPath ?? "")}</code> (${escapeHtml(formatFileBytes(optimization.outputSize))})</p>`;
  return `<p>Optimization requested.</p>`;
}

function renderSaveFileShell(item) {
  const files = getItemMediaFiles(item);
  return `
    <p>Save opens the local media stream in the browser. Browser download behavior depends on file type and player support.</p>
    <div class="metadata-file-list">
      ${files.length ? files.map((file, index) => {
        const filePath = file.path ?? file.filePath ?? "";
        const href = `./api/media/stream?path=${encodeURIComponent(filePath)}`;
        const label = filePath.split(/[\\/]/).pop() || filePath || `File ${index + 1}`;
        return `<a class="detail-refresh-button" href="${escapeHtml(href)}" download>${escapeHtml(label)}</a>`;
      }).join("") : "<span>No local file recorded yet.</span>"}
    </div>
  `;
}

function renderAccessShell(item) {
  const current = getItemOverride(item.id).access ?? readLocalJson(`tobytube.access.${item.id}`, { profile: "everyone" });
  const options = [["everyone", "Everyone"], ["adults", "Adults Only"], ["blocked", "Blocked"]];
  return `
    <p>Persistent access setting for Batcave/user-control wiring.</p>
    <div class="metadata-match-results">
      ${options.map(([value, label]) => `
        <article>
          <strong>${label}</strong>
          <span>${current.profile === value ? "Current" : ""}</span>
          <button type="button" data-action="metadata-command" data-command="access-set" data-metadata-id="${escapeHtml(item.id)}" data-access-profile="${value}">Set</button>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPlayHistoryShell(item) {
  const history = readLocalJson("tobytube.playHistory", []).filter((entry) => entry.itemId === item.id).slice(0, 10);
  return `
    <p>Local play history recorded by Tobytube on this browser.</p>
    <div class="metadata-file-list">
      ${history.length ? history.map((entry) => `<code>${escapeHtml(`${entry.watchedAt} / ${entry.source ?? "playback"}`)}</code>`).join("") : "<span>No local play history yet.</span>"}
    </div>
  `;
}

function renderUnmatchShell(item) {
  return `
    <p>This marks the current provider match as ignored and stores that decision separately so rescans cannot restore it.</p>
    <button class="danger-button" type="button" data-action="metadata-command" data-command="unmatch-confirm" data-metadata-id="${escapeHtml(item.id)}">Mark Unmatched</button>
  `;
}

function renderFixMatchShell(item) {
  const year = item.year ?? item.startYear ?? "";
  const query = state.metadataOverlay.queryItemId === item.id && state.metadataOverlay.query
    ? state.metadataOverlay.query
    : { title: item.showTitle ?? item.title, year, language: "English", agent: "TMDB" };
  const results = state.metadataOverlay.results ?? [];
  const error = state.metadataOverlay.error;
  const notice = state.metadataOverlay.notice;
  const selectedMatch = readSelectedMatch(item.id) ?? { provider: "current", title: item.title, year, mediaType: item.mediaType ?? "movie" };
  return `
    ${notice ? `<p class="metadata-match-notice">${escapeHtml(notice)}</p>` : ""}
    ${selectedMatch ? renderSelectedMatchCard(item, selectedMatch) : ""}
    <div class="metadata-match-search two-column-form">
      <label>Title<input type="text" value="${escapeHtml(query.title ?? item.showTitle ?? item.title)}" data-match-title></label>
      <label>Agent<select data-match-agent>
        ${["TMDB", "TVDB", ...(item.mediaType === "wrestling" ? ["TWDB"] : []), "Manual"].map((agent) => `<option ${agent === query.agent ? "selected" : ""}>${agent}</option>`).join("")}
      </select></label>
      <label>Year<input type="text" value="${escapeHtml(query.year ?? year)}" data-match-year></label>
      <label>Language<select data-match-language>
        ${["English", "French", "Spanish", "Hindi"].map((language) => `<option ${language === query.language ? "selected" : ""}>${language}</option>`).join("")}
      </select></label>
    </div>
    <div class="metadata-match-actions">
      <button type="button" data-action="metadata-command" data-command="match-search" data-metadata-id="${escapeHtml(item.id)}">Search</button>
    </div>
    <div class="metadata-match-results">
      ${error ? `<p class="metadata-match-error">${escapeHtml(error)}</p>` : ""}
      ${state.metadataOverlay.loading ? `<article><strong>Searching...</strong><p>Checking provider results.</p></article>` : ""}
      ${results.length
        ? results.map((result) => renderFixMatchResult(item, result)).join("")
        : `<p class="metadata-match-empty">${state.metadataOverlay.searched ? `No ${escapeHtml(query.agent ?? "provider")} results found for this title.` : "Search results will appear here."}</p>`}
    </div>
  `;
}

function renderTwdbMatchShell(item) {
  const year = item.year ?? item.startYear ?? String(item.date ?? "").slice(0, 4);
  const query = state.metadataOverlay.query ?? { title: item.title, year, language: "English", agent: "TWDB" };
  const results = state.metadataOverlay.results ?? [];
  const override = getItemMetadataOverride(item.id);
  return `
    <p>Match the authoritative event or episode from TWDB, check TMDB or TVDB for artwork, and make final local corrections without leaving this panel.</p>
    ${state.metadataOverlay.notice ? `<p class="metadata-match-notice">${escapeHtml(state.metadataOverlay.notice)}</p>` : ""}
    <div class="metadata-match-search two-column-form">
      <label>Title<input type="text" value="${escapeHtml(query.title ?? item.title)}" data-match-title></label>
      <label>Source<select data-match-agent>
        ${["TWDB", "TMDB", "TVDB"].map((agent) => `<option ${agent === query.agent ? "selected" : ""}>${agent}</option>`).join("")}
      </select></label>
      <label>Year<input type="text" value="${escapeHtml(query.year ?? year ?? "")}" data-match-year></label>
      <input type="hidden" value="English" data-match-language>
    </div>
    <div class="metadata-match-actions">
      <button type="button" data-action="metadata-command" data-command="match-search" data-metadata-id="${escapeHtml(item.id)}">Search Selected Source</button>
    </div>
    <div class="metadata-match-results">
      ${state.metadataOverlay.error ? `<p class="metadata-match-error">${escapeHtml(state.metadataOverlay.error)}</p>` : ""}
      ${state.metadataOverlay.loading ? `<article><strong>Searching ${escapeHtml(query.agent ?? "TWDB")}...</strong></article>` : ""}
      ${results.length ? results.map((result) => renderFixMatchResult(item, result)).join("") : `<p class="metadata-match-empty">${state.metadataOverlay.searched ? `No ${escapeHtml(query.agent ?? "TWDB")} records matched this title and year.` : "Matching records will appear here."}</p>`}
    </div>
    <h3>Local metadata override</h3>
    <div class="metadata-match-search two-column-form">
      <label>Display title<input type="text" value="${escapeHtml(override.title ?? item.title ?? "")}" data-edit-title></label>
      <label>Year<input type="text" value="${escapeHtml(override.year ?? year ?? "")}" data-edit-year></label>
      <label>Type<input type="text" value="${escapeHtml(override.genre ?? item.eventType ?? "Wrestling")}" data-edit-genre></label>
      <label>Rating<input type="text" value="${escapeHtml(override.rating ?? item.rating ?? "")}" data-edit-rating></label>
      <label class="wide">Collections<textarea data-edit-collections>${escapeHtml((override.collections ?? item.collections ?? []).join?.("\n") ?? "")}</textarea></label>
      <label class="wide">Summary<textarea data-edit-summary>${escapeHtml(override.summary ?? getTitleDetails(item)?.summary ?? item.summary ?? "")}</textarea></label>
    </div>
    <div class="metadata-match-actions">
      <button type="button" data-action="metadata-command" data-command="save-metadata-edit" data-metadata-id="${escapeHtml(item.id)}">Save Local Corrections</button>
    </div>
  `;
}

function renderSelectedMatchCard(item, match) {
  const label = match.provider === "current"
    ? "Current Tobytube match retained"
    : `${match.provider ?? "Provider"} ${match.providerId ?? ""}`.trim();
  const title = match.title ?? item.title;
  const meta = [match.year, match.mediaType, match.language, match.selectedAt ? `Selected ${new Date(match.selectedAt).toLocaleString()}` : null].filter(Boolean).join(" / ");
  return `
    <article class="metadata-selected-match">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(label)}</span>
        <p>${escapeHtml(meta || "Stored in Tobytube's metadata override layer.")}</p>
      </div>
      <button type="button" data-action="metadata-command" data-command="clear-match" data-metadata-id="${escapeHtml(item.id)}">Clear Match</button>
    </article>
  `;
}

function renderFixMatchResult(item, result) {
  const year = result.year ?? "Year pending";
  const poster = result.posterUrl ? `<img src="${escapeHtml(result.posterUrl)}" alt="" loading="lazy" />` : `<div class="metadata-match-poster-fallback">${escapeHtml(buildPosterCode(result.title))}</div>`;
  return `
    <article class="metadata-match-result-card">
      <div>
        <strong>${escapeHtml(result.title)}</strong>
        <span>${escapeHtml([year, result.provider, result.language?.toUpperCase()].filter(Boolean).join(" / "))}</span>
        <p>${escapeHtml(cleanDisplayText(result.overview) || "No provider synopsis returned.")}</p>
        <button type="button" data-action="metadata-command" data-command="apply-match" data-metadata-id="${escapeHtml(item.id)}" data-provider="${escapeHtml(result.provider)}" data-provider-id="${escapeHtml(result.providerId)}" data-match-title="${escapeHtml(result.title)}" data-match-year="${escapeHtml(result.year ?? "")}" data-match-media-type="${escapeHtml(result.mediaType ?? item.mediaType ?? "movie")}" data-match-language="${escapeHtml(result.language ?? "")}" data-match-poster-url="${escapeHtml(result.posterUrl ?? "")}" data-match-backdrop-url="${escapeHtml(result.backdropUrl ?? "")}" data-match-score="${escapeHtml(result.score ?? "")}">Match</button>
      </div>
      ${poster}
    </article>
  `;
}
function renderMergeItemsShell() {
  const allSelected = [...state.mergeSelection].map(getTitleItem).filter((item) => item && ["movie", "tv"].includes(item.mediaType));
  const mode = state.metadataOverlay?.mergeMode ?? "choose";
  if (allSelected.length < 2) return `<p>Select at least two movies or TV shows to merge.</p><button type="button" data-action="metadata-command" data-command="cancel-merge" data-metadata-id="${escapeHtml(allSelected[0]?.id ?? "cancel")}">Cancel Merge</button>`;
  const sameType = allSelected.every((item) => item.mediaType === allSelected[0].mediaType);
  if (mode === "choose") return `
    <p>What kind of relationship should Tobytube create for these ${allSelected.length} objects?</p>
    <div class="merge-as-options">
      <button type="button" data-action="metadata-command" data-command="choose-merge-mode" data-merge-mode="single-film" data-metadata-id="${escapeHtml(allSelected[0].id)}" ${sameType && allSelected[0].mediaType === "movie" ? "" : "disabled"}><b>Single film</b><span>Alternate cuts, editions, or versions of one movie.</span></button>
      <button type="button" data-action="metadata-command" data-command="choose-merge-mode" data-merge-mode="single-series" data-metadata-id="${escapeHtml(allSelected[0].id)}" ${sameType && allSelected[0].mediaType === "tv" ? "" : "disabled"}><b>Single series</b><span>Repair a TV show that was split into multiple program records.</span></button>
      <button type="button" data-action="metadata-command" data-command="choose-merge-mode" data-merge-mode="franchise" data-metadata-id="${escapeHtml(allSelected[0].id)}"><b>Franchise</b><span>Connect every selected film and series through reciprocal title-page shelves.</span></button>
    </div>
    <button type="button" data-action="metadata-command" data-command="cancel-merge" data-metadata-id="${escapeHtml(allSelected[0].id)}">Cancel Merge</button>`;
  if (mode === "franchise") return `
    <p>Create a persistent franchise pipeline. Every selected object remains independently playable and links directly to its siblings.</p>
    <div class="metadata-match-search two-column-form">
      <label class="wide">Franchise name<input data-new-franchise-title value="${escapeHtml(inferFranchiseTitle(allSelected))}"></label>
      <label class="wide">Poster artwork<input data-new-franchise-poster placeholder="Asset path or URL"></label>
      <label class="wide">Banner artwork<input data-new-franchise-backdrop placeholder="Asset path or URL"></label>
      <label class="wide">Summary<textarea data-new-franchise-summary>${escapeHtml(`${inferFranchiseTitle(allSelected)} franchise hub.`)}</textarea></label>
    </div>
    <div class="merge-member-list">${allSelected.map((item) => `<span>${escapeHtml(getDisplayTitle(item))}</span>`).join("")}</div>
    <div class="metadata-match-actions"><button type="button" data-action="metadata-command" data-command="create-franchise" data-metadata-id="${escapeHtml(allSelected[0].id)}">Create Franchise</button><button type="button" data-action="metadata-command" data-command="choose-merge-mode" data-merge-mode="choose" data-metadata-id="${escapeHtml(allSelected[0].id)}">Back</button></div>`;
  const selected = allSelected;
  return `
    <p>Choose the metadata set Tobytube should prioritize. The other selected items become ${mode === "single-series" ? "parts of this series" : "versions of this film"}.</p>
    <div class="metadata-match-results">
      ${selected.map((item) => `
        <article class="metadata-match-result-card">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml([item.year, getPrimaryGenreForItem(item)].filter(Boolean).join(" / ") || "Metadata pending")}</span>
            <p>${escapeHtml(getTitleDetails(item)?.summary ?? "Use this item as the visible library entry.")}</p>
            <button type="button" data-action="metadata-command" data-command="merge-as" data-merge-mode="${escapeHtml(mode)}" data-metadata-id="${escapeHtml(item.id)}">Use This Record</button>
          </div>
          ${renderPosterBlock(item, "metadata-merge-poster")}
        </article>
      `).join("")}
    </div>
    <button type="button" data-action="metadata-command" data-command="cancel-merge" data-metadata-id="${escapeHtml(selected[0].id)}">Cancel Merge</button>
  `;
}
function renderFileInfoShell(item) {
  const record = getMetadataRecordForItem(item);
  const files = record?.files ?? record?.versions?.flatMap((version) => version.files ?? []) ?? [];
  return `
    <dl class="metadata-info-grid">
      <dt>Title</dt><dd>${escapeHtml(item.title)}</dd>
      <dt>Type</dt><dd>${escapeHtml(item.mediaType ?? "movie")}</dd>
      <dt>Year</dt><dd>${escapeHtml(item.year ?? item.startYear ?? "Pending")}</dd>
      <dt>Metadata ID</dt><dd>${escapeHtml(record?.id ?? item.metadataId ?? item.id)}</dd>
      <dt>Collections</dt><dd>${escapeHtml((item.collections ?? item.collectionIds ?? []).join(", ") || "None recorded")}</dd>
    </dl>
    <div class="metadata-file-list">
      <strong>Files</strong>
      ${files.length ? files.map((file) => `<code>${escapeHtml(file.path ?? file.filePath ?? file.name ?? String(file))}</code>`).join("") : "<span>No matched local file recorded yet.</span>"}
    </div>
  `;
}

function inferFranchiseTitle(items) {
  const titles = items.map((item) => String(getDisplayTitle(item)).replace(/\s*\([^)]*\)\s*$/, "").trim()).filter(Boolean);
  if (!titles.length) return "Untitled Franchise";
  let prefix = titles[0];
  titles.slice(1).forEach((title) => {
    while (prefix && !normalizeTitleForMatch(title).startsWith(normalizeTitleForMatch(prefix))) prefix = prefix.replace(/\s+\S+$/, "");
  });
  return prefix || titles[0];
}

function getMetadataLocationLine(item) {
  const record = getMetadataRecordForItem(item);
  const file = record?.files?.[0] ?? record?.versions?.[0]?.files?.[0];
  return file?.path ?? file?.filePath ?? `${item.mediaType ?? "media"} / ${item.id}`;
}

async function handleMetadataCommand(command, itemId, data = {}) {
  if (!itemId) return;
  if (command === "remove-current-rental") {
    removeTvCurrentRental(itemId);
    state.metadataMenu = null;
    state.metadataOverlay = null;
    showMetadataToast("success", "Removed from Current Rentals. Two future consecutive episodes will add it again.");
    render();
    return;
  }
  if (command === "watched") {
    const watchedItem = getTitleItem(itemId);
    if (watchedItem?.mediaType === "episode" || watchedItem?.mediaType === "tv-episode") {
      markTvEpisodeCompleted(itemId);
    } else if (watchedItem?.mediaType === "tv") {
      getAvailableTvSeasons(watchedItem).flatMap((season) => season.episodes ?? []).forEach((episode) => markTvEpisodeCompleted(episode.id));
    } else {
      markItemWatched(itemId);
    }
    appendLocalHistory(itemId, "manual-watched");
    const watched = { watchedAt: new Date().toISOString(), source: "manual" };
    await persistMetadataOverride(itemId, { watched });
    state.metadataOverlay = { type: "status", itemId, message: "Marked as watched." };
    state.metadataMenu = null;
    render();
    return;
  }
  if (command === "select-merge") {
    toggleMergeSelection(itemId);
    state.metadataMenu = null;
    render();
    return;
  }
  if (command === "cancel-merge") {
    state.mergeSelection = new Set();
    state.metadataMenu = null;
    state.metadataOverlay = null;
    render();
    return;
  }
  if (command === "merge-items") {
    state.metadataOverlay = { type: "merge-items", itemId, mergeMode: "choose" };
    state.metadataMenu = null;
    render();
    return;
  }
  if (command === "choose-merge-mode") {
    state.metadataOverlay = { ...state.metadataOverlay, type: "merge-items", itemId, mergeMode: data.mergeMode ?? "choose" };
    render();
    return;
  }
  if (command === "merge-as") {
    const selectedIds = [...state.mergeSelection];
    createMergedItemGroup(itemId, selectedIds);
    const mergeType = data.mergeMode === "single-series" ? "single-series" : "single-film";
    await persistMetadataOverridesBatch(Object.fromEntries(selectedIds.map((selectedId) => [selectedId, {
      metadata: { ...getItemMetadataOverride(selectedId), mergedIntoId: itemId, mergeType },
    }]))).catch(() => null);
    state.metadataOverlay = { type: "status", itemId, message: mergeType === "single-series" ? "Series records merged. Refresh Metadata can now hydrate the combined show." : "Film versions merged. Alternate files now appear in the Version selector." };
    state.metadataMenu = null;
    render();
    return;
  }
  if (command === "create-franchise") {
    const title = document.querySelector("[data-new-franchise-title]")?.value?.trim() || "Untitled Franchise";
    const summary = document.querySelector("[data-new-franchise-summary]")?.value?.trim() || `${title} franchise hub.`;
    const posterUrl = document.querySelector("[data-new-franchise-poster]")?.value?.trim() || "";
    const backdropUrl = document.querySelector("[data-new-franchise-backdrop]")?.value?.trim() || "";
    const memberIds = [...state.mergeSelection].filter((id) => ["movie", "tv"].includes(getTitleItem(id)?.mediaType));
    const franchiseId = `franchise-${slugify(title)}-${Date.now().toString(36)}`;
    const overrides = {
      [franchiseId]: {
        metadata: { recordType: "franchise", title, summary, posterUrl, backdropUrl, memberIds, mixtapeKeys: [], createdAt: new Date().toISOString() },
        identity: { title, mediaType: "franchise" },
      },
    };
    memberIds.forEach((memberId) => {
      const existing = getItemMetadataOverride(memberId);
      overrides[memberId] = { metadata: { ...existing, franchiseIds: [...new Set([...(existing.franchiseIds ?? []), franchiseId])] } };
    });
    await persistMetadataOverridesBatch(overrides);
    state.mergeSelection = new Set();
    state.metadataMenu = null;
    state.metadataOverlay = null;
    state.selectedCollectionId = null;
    state.selectedTitleId = memberIds[0] ?? franchiseId;
    showMetadataToast("success", `${title} pipeline created`);
    render();
    return;
  }
  if (command === "mixtape") {
    const listKey = DEFAULT_MIXTAPE_KEY;
    addItemToLocalList(listKey, itemId);
    await persistMetadataOverride(itemId, { mixtapes: [...new Set([...getItemMixtapes(itemId), listKey])] });
    state.metadataOverlay = { type: "status", itemId, message: "Added to Mixtape." };
  } else if (command === "add-to-list") {
    const listKey = data.listKey ?? DEFAULT_MIXTAPE_KEY;
    const listLabel = data.listLabel ?? "Mixtape";
    addItemToLocalList(listKey, itemId);
    await persistMetadataOverride(itemId, { mixtapes: [...new Set([...getItemMixtapes(itemId), listKey])] });
    state.metadataOverlay = { type: "add-to", itemId, notice: `Added to ${listLabel}.` };
  } else if (command === "remove-from-list") {
    const listKey = data.listKey ?? DEFAULT_MIXTAPE_KEY;
    const listLabel = data.listLabel ?? "Mixtape";
    removeItemFromLocalList(listKey, itemId);
    await persistMetadataOverride(itemId, { mixtapes: getItemMixtapes(itemId).filter((entry) => entry !== listKey) });
    state.metadataOverlay = { type: "add-to", itemId, notice: `Removed from ${listLabel}.` };
  } else if (command === "create-mixtape") {
    const input = document.querySelector("[data-new-mixtape-name]");
    const label = input?.value?.trim();
    if (!label) {
      state.metadataOverlay = { type: "add-to", itemId, notice: "Give the new Mixtape a name first." };
    } else {
      const options = getMixtapeOptions();
      const key = `tobytube.mixtape.${slugify(label) || "playlist"}-${Date.now().toString(36)}`;
      saveMixtapeOptions([...options, { key, label }]);
      state.metadataOverlay = { type: "add-to", itemId, notice: `${label} created.` };
    }
  } else if (command === "begin-rename-mixtape") {
    state.metadataOverlay = { type: "add-to", itemId, editingMixtapeKey: data.listKey };
  } else if (command === "cancel-mixtape-edit") {
    state.metadataOverlay = { type: "add-to", itemId };
  } else if (command === "save-rename-mixtape") {
    const label = document.querySelector("[data-rename-mixtape-name]")?.value?.trim();
    if (!label) {
      state.metadataOverlay = { type: "add-to", itemId, editingMixtapeKey: data.listKey, notice: "A Mixtape name cannot be empty." };
    } else {
      saveMixtapeOptions(getMixtapeOptions().map((option) => option.key === data.listKey ? { ...option, label } : option));
      state.metadataOverlay = { type: "add-to", itemId, notice: `Renamed to ${label}.` };
    }
  } else if (command === "confirm-delete-mixtape") {
    state.metadataOverlay = { type: "add-to", itemId, deletingMixtapeKey: data.listKey, notice: "Delete this Mixtape? Its titles will stay in your library." };
  } else if (command === "delete-mixtape") {
    const option = getMixtapeOptions().find((entry) => entry.key === data.listKey && !entry.system);
    if (option) {
      saveMixtapeOptions(getMixtapeOptions().filter((entry) => entry.key !== data.listKey));
      localStorage.removeItem(data.listKey);
      const overrides = Object.fromEntries(Object.entries(metadataOverrides?.items ?? {}).filter(([, override]) => override.mixtapes?.includes(data.listKey)).map(([id, override]) => [id, { mixtapes: override.mixtapes.filter((key) => key !== data.listKey) }]));
      if (Object.keys(overrides).length) await persistMetadataOverridesBatch(overrides);
      state.metadataOverlay = { type: "add-to", itemId, notice: `${option.label} deleted.` };
    }
  } else if (command === "play-next") {
    state.playbackQueue = [{ id: itemId }, ...state.playbackQueue.filter((entry) => entry.id !== itemId)];
    state.metadataOverlay = { type: "status", itemId, message: "Queued to play next." };
  } else if (command === "queue") {
    state.playbackQueue = [...state.playbackQueue.filter((entry) => entry.id !== itemId), { id: itemId }];
    state.metadataOverlay = { type: "status", itemId, message: "Added to queue." };
  } else if (command === "refresh") {
    try {
      const item = getTitleItem(itemId);
      if (item?.mediaType === "tv") {
        const tvUrl = new URL("./api/metadata/refresh-tv", window.location.href);
        tvUrl.searchParams.set("showId", item.id);
        await fetch(`${tvUrl.pathname}${tvUrl.search}`, { method: "POST" });
      }
      await fetch("./api/metadata/rescan", { method: "POST" });
      invalidateMediaCaches();
      state.metadataOverlay = { type: "status", itemId, message: item?.mediaType === "tv" ? "TV metadata refresh queued." : "Metadata refresh queued." };
    } catch (error) {
      state.metadataOverlay = { type: "status", itemId, message: `Metadata refresh could not start: ${error.message}` };
    }
  } else if (command === "delete-confirm") {
    const item = getTitleItem(itemId);
    const deleted = { deletedAt: new Date().toISOString(), title: item?.title ?? itemId, mediaType: item?.mediaType ?? "unknown" };
    await persistMetadataOverride(itemId, {
      deleted,
      identity: { title: item?.title ?? itemId, year: item?.year ?? item?.startYear ?? "", mediaType: item?.mediaType ?? "unknown" },
    });
    state.metadataMenu = null;
    state.metadataOverlay = null;
    state.selectedTitleId = null;
    state.selectedTvSeason = null;
    state.selectedTvEpisodeId = null;
    showMetadataToast("success", "Removed from Tobytube");
  } else if (command === "unmatch-confirm") {
    const unmatchedAt = new Date().toISOString();
    localStorage.setItem(`tobytube.unmatched.${itemId}`, unmatchedAt);
    clearSelectedMatch(itemId);
    await persistMetadataOverride(itemId, { match: null, unmatched: { unmatchedAt } });
    state.metadataOverlay = { type: "status", itemId, message: "Marked unmatched." };
  } else if (command === "access-set") {
    const access = { profile: data.accessProfile ?? "everyone", updatedAt: new Date().toISOString() };
    writeLocalJson(`tobytube.access.${itemId}`, access);
    await persistMetadataOverride(itemId, { access });
    state.metadataOverlay = { type: "status", itemId, message: `Access marker set to ${data.accessProfile ?? "everyone"}.` };
  } else if (command === "analyze-run") {
    const item = getTitleItem(itemId);
    const filePath = getItemMediaFiles(item)[0]?.path ?? getItemMediaFiles(item)[0]?.filePath;
    state.metadataOverlay = { type: "analyze", itemId };
    mergeMetadataOverride(itemId, { analysis: { status: "running", startedAt: new Date().toISOString() } });
    render();
    try {
      const response = await fetch("./api/media/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, filePath }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Analysis failed: ${response.status}`);
      mergeMetadataOverride(itemId, payload.override ?? { analysis: payload.analysis });
      showMetadataToast("success", "Analysis complete");
    } catch (error) {
      mergeMetadataOverride(itemId, { analysis: { status: "failed", error: error.message } });
      showMetadataToast("error", "Analysis failed");
    }
  } else if (command === "optimize-run") {
    const item = getTitleItem(itemId);
    const filePath = getItemMediaFiles(item)[0]?.path ?? getItemMediaFiles(item)[0]?.filePath;
    try {
      const response = await fetch("./api/media/optimize", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, filePath }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Optimization failed: ${response.status}`);
      mergeMetadataOverride(itemId, { optimization: payload.job });
      state.metadataOverlay = { type: "optimize", itemId };
      showMetadataToast("success", "Optimization started");
    } catch (error) {
      mergeMetadataOverride(itemId, { optimization: { status: "failed", error: error.message } });
      state.metadataOverlay = { type: "optimize", itemId };
      showMetadataToast("error", "Optimization failed");
    }
  } else if (command === "optimize-status") {
    const response = await fetch(`./api/media/optimize/status?itemId=${encodeURIComponent(itemId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (payload.job) mergeMetadataOverride(itemId, { optimization: payload.job });
    else await loadMetadataOverrides(false);
    state.metadataOverlay = { type: "optimize", itemId };
  } else if (command === "match-search") {
    if (state.metadataOverlay?.type === "batcave-metadata") captureBatcaveMetadataDraft();
    const item = getTitleItem(itemId);
    const query = {
      title: document.querySelector("[data-match-title]")?.value?.trim() || item?.showTitle || item?.title || "",
      year: document.querySelector("[data-match-year]")?.value?.trim() || "",
      agent: document.querySelector("[data-match-agent]")?.value || "TMDB",
      language: document.querySelector("[data-match-language]")?.value || "English",
    };
    const overlayType = ["twdb-match", "batcave-metadata"].includes(state.metadataOverlay?.type) ? state.metadataOverlay.type : "fix-match";
    state.metadataOverlay = { ...state.metadataOverlay, type: overlayType, itemId, queryItemId: itemId, query, results: [], loading: true, searched: false };
    render();
    const batchContext = {
      batchItemIds: state.metadataOverlay?.batchItemIds,
      seriesName: state.metadataOverlay?.seriesName,
    };
    state.metadataOverlay = { ...(await searchMetadataMatches(itemId, query)), type: overlayType, queryItemId: itemId, ...batchContext };
  } else if (command === "apply-match") {
    try {
      const provider = data.provider ?? "current";
      const providerId = data.providerId ?? "";
      const item = getTitleItem(itemId);
      const selectedMatch = {
        provider,
        providerId: provider === "current" ? "" : providerId,
        title: data.matchTitle ?? item?.title ?? itemId,
        year: data.matchYear ?? item?.year ?? item?.startYear ?? "",
        mediaType: data.matchMediaType ?? item?.mediaType ?? "movie",
        language: data.matchLanguage ?? "",
        posterUrl: data.matchPosterUrl ?? "",
        backdropUrl: data.matchBackdropUrl ?? "",
        score: data.matchScore ?? "",
      };
      writeSelectedMatch(itemId, selectedMatch);
      const targetMediaType = item?.mediaType === "episode" ? "episode" : selectedMatch.mediaType;
      const response = await fetch("./api/metadata/hydrate-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId,
          provider,
          providerId,
          mediaType: targetMediaType,
          showId: item?.showId,
          seasonNumber: item?.seasonNumber,
          episodeNumber: item?.episodeNumber,
          identity: {
            title: item?.title ?? itemId,
            year: item?.year ?? item?.startYear ?? "",
            mediaType: item?.mediaType ?? targetMediaType,
          },
          matchedFilePaths: getItemMediaFiles(item).map((file) => file.path).filter(Boolean),
          match: selectedMatch,
        }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : { error: (await response.text()).trim() || `Server returned ${response.status}` };
      if (!response.ok) throw new Error(payload.error ?? `Metadata hydration failed: ${response.status}`);
      mergeMetadataOverride(itemId, payload.override ?? { match: selectedMatch, metadata: payload.metadata });
      const batchItemIds = [...new Set(state.metadataOverlay?.batchItemIds ?? [])].filter(Boolean);
      if (batchItemIds.length && targetMediaType === "tv") {
        const batchOverrides = Object.fromEntries(batchItemIds.map((batchItemId) => {
          const batchItem = getTitleItem(batchItemId);
          if (!batchItem) return null;
          const season = findMatchedWrestlingSeason(payload.metadata?.seasons ?? [], batchItem);
          const episode = findMatchedWrestlingEpisode(season?.episodes ?? [], batchItem);
          const resolvedMetadata = {};
          // Prefer year/season art, but retain an explicitly matched series
          // poster when a provider has no season-level entry (notably Xplosion).
          const matchedPosterUrl = season?.posterUrl ?? payload.metadata?.posterUrl ?? selectedMatch.posterUrl;
          if (matchedPosterUrl) resolvedMetadata.posterUrl = matchedPosterUrl;
          if (episode?.stillUrl) resolvedMetadata.stillUrl = episode.stillUrl;
          return [batchItemId, {
            metadata: Object.keys(resolvedMetadata).length ? resolvedMetadata : payload.metadata,
            match: selectedMatch,
            matchedFilePaths: getItemMediaFiles(batchItem).map((file) => file.path).filter(Boolean),
            identity: {
              title: batchItem.title ?? batchItemId,
              year: batchItem.year ?? "",
              mediaType: batchItem.mediaType ?? "tv",
            },
          }];
        }).filter(Boolean));
        if (Object.keys(batchOverrides).length) await persistMetadataOverridesBatch(batchOverrides);
      }
      if (targetMediaType === "tv") tvDetailIndex[itemId] = { ...(tvDetailIndex[itemId] ?? {}), ...(payload.metadata ?? {}) };
      if (targetMediaType === "movie") movieDetailIndex[itemId] = { ...(movieDetailIndex[itemId] ?? {}), ...(payload.metadata ?? {}) };
      invalidateMediaCaches();
      showMetadataToast("success", "Match saved");
      const overlayType = ["twdb-match", "batcave-metadata"].includes(state.metadataOverlay?.type) ? state.metadataOverlay.type : "fix-match";
      state.metadataOverlay = {
        ...(["fix-match", "twdb-match", "batcave-metadata"].includes(state.metadataOverlay?.type) ? state.metadataOverlay : {}),
        type: overlayType,
        itemId,
        queryItemId: itemId,
        notice: provider === "current" ? "Current match retained." : `Applied ${provider} metadata and refreshed this item.`,
        batchItemIds: state.metadataOverlay?.batchItemIds,
        seriesName: state.metadataOverlay?.seriesName,
      };
    } catch (error) {
      showMetadataToast("error", "Match failed");
      const overlayType = ["twdb-match", "batcave-metadata"].includes(state.metadataOverlay?.type) ? state.metadataOverlay.type : "fix-match";
      state.metadataOverlay = {
        ...(["fix-match", "twdb-match", "batcave-metadata"].includes(state.metadataOverlay?.type) ? state.metadataOverlay : {}),
        type: overlayType,
        itemId,
        queryItemId: itemId,
        notice: `Match failed: ${error.message}`,
      };
    }
  } else if (command === "save-metadata-edit") {
    const collections = (document.querySelector("[data-edit-collections]")?.value ?? "").split(/\r?\n|,/).map((entry) => entry.trim()).filter(Boolean);
    const override = {
      title: document.querySelector("[data-edit-title]")?.value?.trim() ?? "",
      year: document.querySelector("[data-edit-year]")?.value?.trim() ?? "",
      genre: document.querySelector("[data-edit-genre]")?.value?.trim() ?? "",
      rating: document.querySelector("[data-edit-rating]")?.value?.trim() ?? "",
      summary: document.querySelector("[data-edit-summary]")?.value?.trim() ?? "",
      collections,
      phase: "phase-5-draft",
    };
    writeLocalJson(`tobytube.metadataOverride.${itemId}`, override);
    const originalItem = getTitleItem(itemId);
    await persistMetadataOverride(itemId, {
      metadata: override,
      identity: {
        title: originalItem?.title ?? itemId,
        year: originalItem?.year ?? originalItem?.startYear ?? "",
        mediaType: originalItem?.mediaType ?? "movie",
      },
    });
    showMetadataToast("success", "Metadata draft saved");
    state.metadataOverlay = {
      type: state.metadataOverlay?.type === "twdb-match" ? "twdb-match" : "edit-metadata",
      itemId,
      notice: "Local corrections saved.",
    };
  } else if (command === "clear-match") {
    clearSelectedMatch(itemId);
    try {
      await persistMetadataOverride(itemId, { match: null });
      showMetadataToast("success", "Match cleared");
      state.metadataOverlay = {
        ...(state.metadataOverlay?.type === "fix-match" ? state.metadataOverlay : {}),
        type: "fix-match",
        itemId,
        notice: "Match selection cleared.",
      };
    } catch (error) {
      showMetadataToast("error", "Clear failed");
      state.metadataOverlay = {
        ...(state.metadataOverlay?.type === "fix-match" ? state.metadataOverlay : {}),
        type: "fix-match",
        itemId,
        notice: `Clear failed: ${error.message}`,
      };
    }
  } else {
    const overlayType = command === "edit-metadata" ? "batcave-metadata" : command;
    const item = getTitleItem(itemId);
    if (overlayType === "batcave-metadata") {
      if (item) state.batcaveMetadataDraft = buildBatcaveMetadataDraft(item);
    }
    state.metadataOverlay = {
      type: overlayType,
      itemId,
      ...(overlayType === "batcave-metadata" ? { allocatorPath: [] } : {}),
      ...(overlayType === "fix-match" ? {
        queryItemId: itemId,
        batchItemIds: item?.batchItemIds ?? [],
        seriesName: item?.mediaType === "tv" ? item.title : undefined,
        query: {
          title: item?.showTitle ?? item?.title ?? "",
          year: item?.year ?? item?.startYear ?? "",
          language: "English",
          agent: item?.mediaType === "wrestling" ? "TWDB" : "TMDB",
        },
        results: [],
        searched: false,
      } : {}),
    };
  }
  state.metadataMenu = null;
  render();
}

async function searchMetadataMatches(itemId, submittedQuery = null) {
  const item = getTitleItem(itemId);
  const title = submittedQuery?.title ?? document.querySelector("[data-match-title]")?.value?.trim() ?? item?.showTitle ?? item?.title ?? "";
  const year = submittedQuery?.year ?? document.querySelector("[data-match-year]")?.value?.trim() ?? item?.year ?? item?.startYear ?? "";
  const agent = submittedQuery?.agent ?? document.querySelector("[data-match-agent]")?.value ?? "TMDB";
  const language = submittedQuery?.language ?? document.querySelector("[data-match-language]")?.value ?? "English";
  const query = { title, year, agent, language };
  if (agent === "Manual") {
    return { type: "fix-match", itemId, query, results: [], searched: true, error: "Manual matching will use the metadata editor; choose TMDB or TVDB for provider search." };
  }
  try {
    const url = new URL("./api/metadata/search-match", window.location.href);
    url.searchParams.set("title", title);
    if (year) url.searchParams.set("year", year);
    url.searchParams.set("language", language);
    url.searchParams.set("agent", agent);
    url.searchParams.set("mediaType", state.metadataOverlay?.batchItemIds?.length || item?.mediaType === "tv" || item?.mediaType === "episode" ? "tv" : "movie");
    const response = await fetch(`${url.pathname}${url.search}`, { cache: "no-store" });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : { error: (await response.text()).trim() || `Server returned ${response.status}` };
    if (!response.ok) throw new Error(payload.error ?? `Match search failed: ${response.status}`);
    return { type: "fix-match", itemId, query, results: payload.results ?? [], searched: true, error: payload.error ?? null };
  } catch (error) {
    return { type: "fix-match", itemId, query, results: [], searched: true, error: error.message };
  }
}
function renderBatcave() {
  const stats = generatedMetadata.stats ?? {};
  const unmatched = generatedMetadata.unmatchedFiles ?? [];
  const scannedMovies = getScannedMovieItems();
  const tabs = [
    ["overview", "Overview"],
    ["media", "Media"],
    ["wrestling", "Wrestling"],
    ["collections", "Collections"],
    ["scanner", "Scanner"],
  ];
  return `
    <div class="batcave-page">
      <header class="batcave-hero">
        <div>
          <p class="batcave-kicker">Administrative Control</p>
          <h1>The Batcave</h1>
          <p>Scan, parse, repair, and build the shelves behind Tobytube.</p>
        </div>
        <button class="play-button" type="button" data-action="rescan">Run Media Scan</button>
      </header>
      <nav class="batcave-tabs">
        ${tabs.map(([id, label]) => `<button type="button" data-batcave-view="${id}" class="${state.batcaveView === id ? "active" : ""}">${label}</button>`).join("")}
      </nav>
      ${state.batcaveView === "media" ? renderBatcaveMedia(scannedMovies, unmatched) : ""}
      ${state.batcaveView === "wrestling" ? renderBatcaveWrestling() : ""}
      ${state.batcaveView === "collections" ? renderBatcaveCollectionEditors() : ""}
      ${state.batcaveView === "scanner" ? renderBatcaveScanner(unmatched) : ""}
      ${state.batcaveView === "overview" ? renderBatcaveOverview(stats, scannedMovies, unmatched) : ""}
    </div>
  `;
}

function renderBatcaveOverview(stats, scannedMovies, unmatched) {
  const libraryStats = getBatcaveLibraryStats();
  return `
    <section class="batcave-grid">
      ${renderBatcaveMetric("Files Scanned", stats.filesScanned ?? 0)}
      ${renderBatcaveMetric("Files Matched", stats.filesMatched ?? 0)}
      ${renderBatcaveMetric("Unmatched", stats.filesUnmatched ?? unmatched.length)}
      ${renderBatcaveMetric("Movies", libraryStats.movies)}
      ${renderBatcaveMetric("TV Shows", `${libraryStats.tvShows} (${libraryStats.tvEpisodes})`)}
      ${renderBatcaveMetric("Wrestling Shows", libraryStats.wrestlingShows)}
      ${renderBatcaveMetric("Wrestling Events", libraryStats.wrestlingEvents)}
    </section>
    <section class="batcave-panel">
      <h2>Users</h2>
      <div class="batcave-form-grid">
        ${renderBatcaveMetric("Known Users", 1)}
        ${renderBatcaveMetric("Active Resumes", getStoredResumeEntries().length)}
        ${renderBatcaveMetric("Analytics", "Local")}
      </div>
      <p class="muted">User accounts and viewing analytics will plug into this overview once account storage exists.</p>
    </section>
  `;
}

function getBatcaveLibraryStats() {
  const tvItems = getTvLibraryItems();
  const wrestlingItems = getHomeWrestlingItems();
  const wrestlingShows = new Set(wrestlingItems.map((item) => item.series || item.showName || item.promotionName || item.promotion || "Wrestling")).size;
  return {
    movies: getMovieLibraryItems().length,
    tvShows: tvItems.length,
    tvEpisodes: tvItems.reduce((sum, show) => sum + countTvEpisodes(getAvailableTvSeasons(show)), 0),
    wrestlingShows,
    wrestlingEvents: wrestlingItems.length,
  };
}

function renderBatcaveMetric(label, value) {
  return `<article class="batcave-metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(String(value))}</b></article>`;
}

function renderBatcaveMedia(scannedMovies, unmatched) {
  const sorter = (a, b) => {
    if (state.batcaveMediaSort === "title-za") return getDisplayTitle(b).localeCompare(getDisplayTitle(a));
    if (state.batcaveMediaSort === "date-added") return String(b.addedAt ?? "").localeCompare(String(a.addedAt ?? ""));
    if (state.batcaveMediaSort === "date-released") return Number(b.year ?? b.startYear ?? 0) - Number(a.year ?? a.startYear ?? 0);
    return getDisplayTitle(a).localeCompare(getDisplayTitle(b));
  };
  const sections = [
    ["movie", "Movies", getMovieLibraryItems()], ["tv", "TV", getTvLibraryItems()],
  ];
  const mediaUnmatched = getVisibleBatcaveUnmatched(unmatched).filter((file) => ["movie", "tv"].includes(file.parsed?.mediaType));
  return `
    <section class="batcave-panel batcave-media-bar"><div class="batcave-media-toolbar"><h2>Media</h2><span class="batcave-divider">/</span>
      <div class="tag-row">${sections.map(([id,label])=>`<label><input type="checkbox" data-batcave-media-tag="${id}" ${state.batcaveMediaTags.has(id)?"checked":""}> ${label}</label>`).join("")}</div>
      <div class="batcave-toolbar-actions"><select data-batcave-media-sort>${[["title-az","Title (A-Z)"],["title-za","Title (Z-A)"],["date-added","Date added"],["date-released","Date released"]].map(([value,label])=>`<option value="${value}" ${state.batcaveMediaSort===value?"selected":""}>${label}</option>`).join("")}</select><button type="button" data-batcave-media-toggle="expand">Expand all</button><button type="button" data-batcave-media-toggle="collapse">Collapse all</button></div>
    </div></section>
    ${sections.filter(([id])=>state.batcaveMediaTags.has(id)).map(([id,label,items])=>`<details class="batcave-panel batcave-media-section" data-batcave-details="media:${id}" ${state.batcaveMediaOpenSections.has(id)?"open":""}><summary><h2>${label} <span class="batcave-divider">/</span> ${items.length}</h2></summary><div class="library-grid batcave-mini-grid">${[...items].sort(sorter).map((item) => renderBatcaveMediaCard(item, id)).join("")}</div></details>`).join("")}
    ${renderBatcaveUnmatchedSection("media", mediaUnmatched, ["movie", "tv"])}
  `;
}

function renderBatcaveMediaCard(item, sectionId) {
  const html = sectionId === "tv" ? renderTvCard(item) : renderLibraryCard(item);
  return html.replace("<article ", `<article data-action="open-batcave-metadata" data-metadata-id="${escapeHtml(item.id)}" `);
}

function renderBatcaveWrestling() {
  batcaveWrestlingObjectIndex = new Map();
  const archiveMode = state.batcaveWrestlingMode === "archive";
  const promotionRows = promotions
    .map((promotion) => ({ promotion, content: getBatcaveWrestlingContent(promotion, archiveMode) }))
    .filter(({ content }) => archiveMode || Object.values(content).some((items) => items.length));
  const selected = promotionRows.find(({ promotion }) => promotion.id === state.batcaveWrestlingPromotionId) ?? null;
  const wrestlingUnmatched = getVisibleBatcaveUnmatched(generatedMetadata.unmatchedFiles ?? []).filter((file) => file.parsed?.mediaType === "wrestling");
  return `
    <section class="batcave-panel">
      <div class="batcave-panel-head">
        <div><h2>Wrestling</h2><p class="muted">Promotions &gt; promotion &gt; content</p></div>
        <nav class="batcave-subpage-tabs" aria-label="Wrestling database mode">
          <button type="button" data-batcave-wrestling-mode="live" class="${archiveMode ? "" : "active"}">Live Media</button>
          <button type="button" data-batcave-wrestling-mode="archive" class="${archiveMode ? "active" : ""}">Archive</button>
        </nav>
      </div>
      <p class="muted">${archiveMode ? "Everything presently catalogued in Tobytube's wrestling database." : "Only wrestling objects backed by scanned local media files."}</p>
    </section>
    <div class="batcave-wrestling-promotion-picker">
      ${promotionRows.map(({ promotion, content }) => `<button type="button" data-batcave-wrestling-promotion="${escapeHtml(promotion.id)}" class="${selected?.promotion.id === promotion.id ? "active" : ""}"><b>${escapeHtml(promotion.cardName ?? promotion.name)}</b><small>${Object.values(content).reduce((sum, items) => sum + items.length, 0)} objects</small></button>`).join("") || `<div class="empty">No wrestling media has been scanned yet.</div>`}
    </div>
    ${selected ? `<div class="batcave-wrestling-promotions">${renderBatcaveWrestlingPromotion(selected.promotion, selected.content)}</div>` : `<div class="batcave-panel empty">Choose a promotion to inspect its content.</div>`}
    ${renderBatcaveUnmatchedSection("wrestling", wrestlingUnmatched, ["wrestling"])}
  `;
}

function getBatcaveWrestlingContent(promotion, archiveMode) {
  if (!archiveMode) {
    const records = getLocalWrestlingRecordsForPromotion(promotion);
    return {
      "Series & Episodes": records.filter((record) => record.series && !(record.files ?? []).some((file) => isWweDocumentaryPath(file.path))),
      "Events & Specials": records.filter((record) => !record.series && !(record.files ?? []).some((file) => isWweDocumentaryPath(file.path))),
      Documentaries: promotion.id === "wwe" ? getLiveWweDocumentaryItems() : [],
      Championships: [],
    };
  }
  const generated = getGeneratedWrestlingRecords(promotion.id);
  const series = promotion.shows.map((show) => ({ id: `${promotion.id}-series-${show.id}`, title: show.name, mediaType: "wrestling", promotionId: promotion.id, promotionName: promotion.name, genre: "Series", year: String(show.startDate ?? "").slice(0, 4), files: [] }));
  const events = dedupeTimelineItems([
    ...generated.map(libraryRecordToTimelineItem),
    ...promotion.ppvs,
  ]).map((item) => ({ ...item, mediaType: "wrestling", promotionId: promotion.id, promotionName: promotion.name, files: [] }));
  const documentaries = promotion.id === "wwe" ? wweDocumentaries.map((item) => ({ ...item, mediaType: "wrestling", promotionId: "wwe", promotionName: promotion.name, documentaryCategory: getWweDocumentaryCategory(item), files: [] })) : [];
  const championships = (championshipSectionsByPromotion[promotion.id]
    ? championshipSectionsByPromotion[promotion.id].flatMap((section) => section.groups.flatMap((group) => group.championships))
    : getPromotionChampionships(promotion))
    .map((item) => ({ ...item, title: item.name, mediaType: "wrestling", promotionId: promotion.id, promotionName: promotion.name, genre: "Championship", files: [] }));
  return { "Series & Episodes": series, "Events & Specials": events, Documentaries: documentaries, Championships: championships };
}

function renderBatcaveWrestlingPromotion(promotion, content) {
  const total = Object.values(content).reduce((sum, items) => sum + items.length, 0);
  return `
    <details class="batcave-panel batcave-wrestling-promotion">
      <summary><h2>${escapeHtml(promotion.name)}</h2><span>${total} objects</span></summary>
      <div class="batcave-wrestling-content">
        ${Object.entries(content).map(([title, items]) => `
          <details class="batcave-wrestling-content-group" ${items.length ? "" : "hidden"}>
            <summary><h3>${escapeHtml(title)}</h3><span>${items.length}</span></summary>
            <div class="batcave-wrestling-object-list">${items.map(renderBatcaveWrestlingObject).join("")}</div>
          </details>`).join("")}
      </div>
    </details>
  `;
}

function renderBatcaveWrestlingObject(item) {
  batcaveWrestlingObjectIndex.set(item.id, item);
  const subtitle = [item.series, item.date ?? item.year, item.documentaryCategory, item.genre ?? item.eventLabel].filter(Boolean).join(" / ");
  return `
    <article class="batcave-wrestling-object">
      ${renderPosterBlock(item, "batcave-wrestling-cover")}
      <div><b>${escapeHtml(getDisplayTitle(item))}</b><small>${escapeHtml(subtitle || "Wrestling database object")}</small></div>
      ${renderMediaStoplightButton(item, "poster")}
    </article>
  `;
}

function renderBatcaveTitleEditors() {
  return `
    <section class="batcave-panel">
      <h2>Title Editor Foundation</h2>
      <div class="batcave-form-grid">
        ${["Title", "Sort Title", "Year", "Country", "Genre", "Runtime", "Rating", "Director", "Poster URL", "Backdrop URL", "Media Path", "Collection Tags"].map((field) => `<label><span>${field}</span><input placeholder="${field}" /></label>`).join("")}
        <label class="wide"><span>Synopsis</span><textarea placeholder="Metadata summary"></textarea></label>
      </div>
    </section>
  `;
}

function renderBatcaveCollectionEditors() {
  const groups = getGroupedCollections();
  return `
    <section class="batcave-panel">
      <div class="batcave-panel-head">
        <h2>Collections</h2>
        <button class="play-button compact" type="button" data-batcave-new-collection>New Collection</button>
      </div>
      <div class="batcave-collection-editor">
        <aside class="batcave-existing-collections">
          ${groups.map((group) => `
            <section>
              <h3>${escapeHtml(group.title)}</h3>
              <div class="carousel collection-carousel batcave-collection-row">
                ${group.collections.map((collection) => `
                  <button type="button" data-batcave-edit-collection="${escapeHtml(collection.id)}">
                    ${collection.buttonImage ? `<img src="${escapeHtml(collection.buttonImage)}" alt="" loading="lazy" />` : `<span>${escapeHtml(buildPosterCode(collection.title))}</span>`}
                    <b>${escapeHtml(collection.title)}</b>
                  </button>
                `).join("") || `<div class="empty">No collections yet.</div>`}
              </div>
            </section>
          `).join("")}
        </aside>
      </div>
      ${state.batcaveCollectionId ? renderBatcaveCollectionFieldEditor(groups) : ""}
    </section>
  `;
}

function renderBatcaveCollectionFieldEditor(groups) {
  const selectedId = state.batcaveCollectionId;
  const collection = selectedId === "__new"
    ? null
    : groups.flatMap((group) => group.collections.map((item) => ({ ...item, groupTitle: group.title }))).find((item) => item.id === selectedId)
      ?? null;
  const draft = state.batcaveCollectionDraft ?? buildCollectionDraft(collection);
  const title = draft.title ?? "New Collection";
  const type = draft.collectionType ?? collection?.groupTitle ?? "Aisles";
  const pageType = collection?.pageType ?? (type === "Vaults" ? "Vault" : "Showcase");
  return `
    <div class="batcave-editor-scrim" data-action="close-collection-editor"></div>
    <form class="batcave-editor-form batcave-editor-modal" data-collection-editor>
      <div class="batcave-editor-head"><h3>${escapeHtml(title)}</h3><div><button type="button" data-action="save-collection">Save</button><button type="button" data-action="close-collection-editor">X</button></div></div>
      <h4>Collection details</h4>
      <div class="batcave-form-grid">
        <label><span>Collection Type</span><select data-collection-type>${["Vaults", "Sagas", "Aisles", "Boxed Sets", "Worlds", "Profiles"].map((item) => `<option ${item === type ? "selected" : ""}>${item}</option>`).join("")}</select></label>
        <label><span>Page Type</span><select data-page-type>${["Library", "Showcase", "Vault"].map((item) => `<option ${item === (draft.pageType ?? pageType) ? "selected" : ""}>${item}</option>`).join("")}</select></label>
        <label><span>Name</span><input data-collection-name value="${escapeHtml(title)}" /></label>
        <label><span>Button Image</span><input data-button-image value="${escapeHtml(draft.buttonImage ?? "")}" placeholder="Imported asset path" /><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-asset-import="button" /></label>
        <label class="wide"><span>Hero Image</span><input data-hero-image value="${escapeHtml(draft.heroImage ?? "")}" placeholder="Imported asset path" /><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-asset-import="hero" /></label>
      </div>
      <h4>Content</h4>
      <div class="batcave-carousel-editors">
        ${(draft.carousels ?? []).map((carousel, index) => renderCollectionCarouselEditor(carousel, index)).join("")}
      </div>
      <button type="button" data-action="add-collection-carousel">+ Add carousel</button>
      <div class="metadata-match-actions"><button type="button" data-action="save-collection">Save Collection</button></div>
      ${selectedId !== "__new" ? `<div class="collection-delete-zone"><p>Danger zone</p><button type="button" data-action="delete-collection">${["Delete Collection", "Confirm deletion — two checks remain", "Final confirmation — permanently delete"][Math.min(2, state.batcaveCollectionDeleteChecks)]}</button></div>` : ""}
    </form>
  `;
}

function buildCollectionDraft(collection) {
  const full = collection ? getCuratedCollectionPage(collection.id) : null;
  const sections = collection?.carousels ?? full?.sections ?? [];
  return {
    id: collection?.id ?? `custom-${Date.now()}`,
    title: collection?.title ?? "New Collection",
    collectionType: collection?.collectionType ?? collection?.groupTitle ?? "Aisles",
    pageType: collection?.pageType ?? "Showcase",
    buttonImage: collection?.buttonImage ?? "",
    heroImage: collection?.heroImage ?? "",
    carousels: sections.length ? sections.map((section) => ({ title: section.title, itemIds: [...new Set(section.itemIds ?? section.items?.map((item) => item.id) ?? [])], button: section.button ?? { label: section.title, align: "left", size: 1, layout: "horizontal", line: 1 } })) : [{ title: "Featured", itemIds: [], button: { label: "Featured", align: "left", size: 1, layout: "horizontal", line: 1 } }],
  };
}

function renderCollectionCarouselEditor(carousel, index) {
  const items = (carousel.itemIds ?? []).map((id) => getCollectionItem(id) ?? getTitleItem(id)).filter(Boolean);
  const button = carousel.button ?? {};
  return `<section class="batcave-carousel-editor" data-carousel-index="${index}">
    <label><span>Carousel title</span><input data-carousel-title value="${escapeHtml(carousel.title ?? "")}" /></label>
    <label class="collection-search-label"><span>Carousel content</span><input data-carousel-search placeholder="Search the media library" autocomplete="off" /><div class="collection-search-results" data-collection-search-results></div></label>
    <div class="collection-selected-items">${items.map((item) => `<button type="button" data-action="remove-carousel-item" data-item-id="${escapeHtml(item.id)}">${escapeHtml(getDisplayTitle(item))} ×</button>`).join("") || "<small>No titles selected.</small>"}</div>
    <label><span>Button label</span><input data-button-label value="${escapeHtml(button.label ?? carousel.title ?? "")}" /></label>
    <div class="collection-button-toolbar">
      <button type="button" data-format="bold" class="${button.bold ? "active" : ""}"><b>B</b></button><button type="button" data-format="italic" class="${button.italic ? "active" : ""}"><i>I</i></button><button type="button" data-format="underline" class="${button.underline ? "active" : ""}"><u>U</u></button>
      <button type="button" data-size-step data-button-size="${Number(button.size ?? 1)}" title="Text size ${Number(button.size ?? 1)}"><img src="./assets/icons/collection-editor/text-size.png" alt="Text size"><small>${Number(button.size ?? 1)}</small></button>
      <button type="button" data-layout="horizontal" class="${button.layout !== "vertical" ? "active" : ""}" title="Horizontal"><img src="./assets/icons/collection-editor/horizontal.png" alt="Horizontal"></button>
      <button type="button" data-layout="vertical" class="${button.layout === "vertical" ? "active" : ""}" title="Vertical"><img src="./assets/icons/collection-editor/vertical.png" alt="Vertical"></button>
      ${["left","center","right"].map((value) => `<button type="button" data-align="${value}" class="${(button.align ?? "left") === value ? "active" : ""}" title="Position ${value}"><img src="./assets/icons/collection-editor/position-${value}.png" alt="Position ${value}"></button>`).join("")}
      <select data-button-line>${Array.from({length:11},(_,i)=>`<option value="${i+1}" ${Number(button.line ?? 1)===i+1?"selected":""}>Line ${i+1}</option>`).join("")}</select>
    </div>
  </section>`;
}

function getCollectionSearchItems(query) {
  const words = normalizeTitleForMatch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return [...getMovieLibraryItems(), ...getTvLibraryItems(), ...getHomeWrestlingItems()]
    .filter((item) => words.every((word) => normalizeTitleForMatch(getDisplayTitle(item)).includes(word)))
    .sort((a, b) => getDisplayTitle(a).localeCompare(getDisplayTitle(b))).slice(0, 12);
}

function readCollectionDraftFromEditor() {
  const previous = state.batcaveCollectionDraft ?? buildCollectionDraft(null);
  const name = document.querySelector("[data-collection-name]")?.value.trim() || "Untitled Collection";
  const carousels = [...document.querySelectorAll("[data-carousel-index]")].map((editor, index) => ({
    title: editor.querySelector("[data-carousel-title]")?.value.trim() || `Carousel ${index + 1}`,
    itemIds: previous.carousels?.[index]?.itemIds ?? [],
    button: {
      label: editor.querySelector("[data-button-label]")?.value.trim() || "",
      align: editor.querySelector("[data-align].active")?.dataset.align ?? "left",
      bold: editor.querySelector("[data-format='bold']")?.classList.contains("active") ?? false,
      italic: editor.querySelector("[data-format='italic']")?.classList.contains("active") ?? false,
      underline: editor.querySelector("[data-format='underline']")?.classList.contains("active") ?? false,
      size: Number(editor.querySelector("[data-size-step]")?.dataset.buttonSize ?? 1),
      layout: editor.querySelector("[data-layout].active")?.dataset.layout ?? "horizontal",
      line: Number(editor.querySelector("[data-button-line]")?.value ?? 1),
    },
  }));
  return {
    ...previous,
    id: previous.id || `custom-${slugify(name)}`,
    title: name,
    collectionType: document.querySelector("[data-collection-type]")?.value ?? "Aisles",
    pageType: document.querySelector("[data-page-type]")?.value ?? "Showcase",
    buttonImage: document.querySelector("[data-button-image]")?.value.trim() ?? "",
    heroImage: document.querySelector("[data-hero-image]")?.value.trim() ?? "",
    carousels,
    itemIds: [...new Set(carousels.flatMap((carousel) => carousel.itemIds))],
  };
}

function getBatcaveCollectionSubpages(collection) {
  if (!collection) return ["Featured"];
  const full = getCuratedCollectionPage(collection.id);
  const sectionTitles = full?.sections?.map((section) => section.title).filter(Boolean) ?? [];
  return sectionTitles.length ? sectionTitles.slice(0, 8) : ["Featured"];
}

function renderBatcaveScanner(unmatched) {
  return `
    <section class="batcave-panel">
      <h2>Scanner</h2>
      <div class="batcave-form-grid">
        <label><span>Media Root</span><input value="D:/media" /></label>
        <label><span>Movies Folder</span><input value="D:/media/Movies" /></label>
        <label><span>TV Folder</span><input value="D:/media/TV" /></label>
        <label><span>Wrestling Folder</span><input value="D:/media/Wrestling" /></label>
      </div>
      ${renderBatcaveFileRows(unmatched.slice(0, 16))}
    </section>
  `;
}

function renderBatcaveFileRows(files) {
  return `
    <div class="batcave-file-list">
      ${files.map((file) => `
        <article>
          <b>${escapeHtml(file.parsed?.title ?? "Unparsed file")}</b>
          <span>${escapeHtml(file.parsed?.mediaType ?? "media")} ${file.parsed?.year ? `/ ${escapeHtml(String(file.parsed.year))}` : ""}</span>
          <small>${escapeHtml(file.path)}</small>
        </article>
      `).join("") || `<div class="empty">Nothing unresolved.</div>`}
    </div>
  `;
}

function getBatcaveUnmatchedFileId(file) {
  const parsed = file?.parsed ?? {};
  return `batcave-unmatched-${slugify(file.path ?? `${parsed.title}-${parsed.year ?? "tba"}`)}`;
}

function getUnmatchedTvProgramKey(file) {
  const parsed = file?.parsed ?? {};
  const title = parsed.series || parsed.showTitle || parsed.title || cleanScannedTitleFromPath(file?.path);
  return normalizeTitleForMatch(title) || slugify(file?.path ?? "unknown-tv-program");
}

function getBatcaveUnmatchedItem(fileOrFiles) {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  const file = files[0] ?? {};
  const parsed = file?.parsed ?? {};
  const mediaType = parsed.mediaType ?? "movie";
  const memberItemIds = files.map(getBatcaveUnmatchedFileId);
  const id = files.length > 1 && mediaType === "tv"
    ? `batcave-unmatched-tv-program-${slugify(getUnmatchedTvProgramKey(file))}`
    : memberItemIds[0];
  const item = {
    id,
    mediaType,
    title: parsed.title || cleanScannedTitleFromPath(file.path),
    year: parsed.year ?? null,
    series: parsed.series ?? null,
    seasonNumber: parsed.seasonNumber ?? null,
    episodeNumber: parsed.episodeNumber ?? null,
    status: "missing-poster",
    addedAt: file.modifiedAt ?? generatedMetadata.generatedAt,
    files,
    batchItemIds: memberItemIds,
    unmatchedFileCount: files.length,
    posterUrl: file.art?.posterUrl ?? null,
    posterA: file.art?.colors?.[0] ?? "#202329",
    posterB: file.art?.colors?.[1] ?? "#d8b35d",
  };
  batcaveUnmatchedItemIndex.set(id, item);
  memberItemIds.forEach((memberId) => batcaveUnmatchedItemIndex.set(memberId, { ...item, id: memberId, batchItemIds: memberItemIds }));
  return item;
}

function getVisibleBatcaveUnmatched(files) {
  return files.filter((file) => {
    const item = getBatcaveUnmatchedItem(file);
    const override = getItemOverride(item.id);
    return !override.unmatchedDismissed?.dismissedAt && !override.match?.providerId;
  });
}

function renderBatcaveUnmatchedSection(scope, files, mediaTypes) {
  const labels = { movie: "Movies", tv: "TV", wrestling: "Wrestling" };
  const sectionKey = `unmatched:${scope}`;
  return `<details class="batcave-panel batcave-unmatched-panel" data-batcave-details="${sectionKey}" ${state.batcaveUnmatchedOpenSections.has(sectionKey) ? "open" : ""}>
    <summary><h2>Unmatched Files <span class="batcave-divider">/</span> ${files.length}</h2></summary>
    <div class="batcave-unmatched-groups">${mediaTypes.map((mediaType) => {
      const group = files.filter((file) => file.parsed?.mediaType === mediaType).sort((a, b) => String(a.parsed?.title ?? a.path).localeCompare(String(b.parsed?.title ?? b.path)));
      const groupKey = `${sectionKey}:${mediaType}`;
      return `<details class="batcave-unmatched-group" data-batcave-details="${groupKey}" ${state.batcaveUnmatchedOpenSections.has(groupKey) ? "open" : ""}>
        <summary><h3>${labels[mediaType]} <span class="batcave-divider">/</span> ${group.length}</h3></summary>
        ${renderBatcaveEditableFileRows(group)}
      </details>`;
    }).join("")}</div>
  </details>`;
}

function renderBatcaveEditableFileRows(files) {
  const rows = files[0]?.parsed?.mediaType === "tv"
    ? [...files.reduce((groups, file) => {
        const key = getUnmatchedTvProgramKey(file);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(file);
        return groups;
      }, new Map()).values()]
    : files.map((file) => [file]);
  return `<div class="batcave-file-list">${rows.map((programFiles) => {
    const item = getBatcaveUnmatchedItem(programFiles);
    const file = programFiles[0];
    return `<article><div class="batcave-file-copy"><b>${escapeHtml(item.title || "Unparsed file")}</b><span>${escapeHtml(item.mediaType)} ${item.year ? `/ ${escapeHtml(String(item.year))}` : ""}</span><small>${escapeHtml(file.path)}</small></div>
      ${item.mediaType === "tv" && item.unmatchedFileCount > 1 ? `<span class="batcave-program-count">${item.unmatchedFileCount} files</span>` : ""}
      <div class="batcave-file-actions"><button type="button" data-action="metadata-command" data-command="fix-match" data-metadata-id="${escapeHtml(item.id)}">Fix Match</button><button type="button" data-action="open-batcave-metadata" data-metadata-id="${escapeHtml(item.id)}">Edit</button><button type="button" data-dismiss-unmatched="${escapeHtml(item.id)}">Remove</button></div></article>`;
  }).join("") || `<div class="empty">Nothing unresolved.</div>`}</div>`;
}

function renderHomePage() {
  const movieItems = getMovieLibraryItems();
  const tvItems = getTvLibraryItems();
  const resumeItems = getResumeLibraryItems();
  const currentRentals = dedupeShelfItems([
    ...getSessionTvRentals(),
    ...resumeItems.filter((item) => item.resumeEntry?.kind !== "tv"),
  ]);
  const mixedWatchlist = getMixtapeItems();
  const mixedRecent = prioritizeItems(sortByDate([...movieItems, ...tvItems, ...getHomeWrestlingItems()]), ["curated-the-neverending-story-1984", "bobs-burgers"]);

  return `
    <div class="home-exhibit">
      ${renderHomeLandingHero()}
      ${renderHomeMascotButtons()}
    </div>
    <div class="shelf-stack home-shelves">
      ${renderPosterShelf(
        "Current Rentals",
        currentRentals.slice(0, 10),
        "item",
        renderResumeCard,
        null,
        renderSeeAllSectionCard("recent"),
        { section: "recent" },
      )}
      ${renderPosterShelf(
        "New Releases",
        mixedRecent.slice(0, 10),
        "item",
        renderMixedCard,
        null,
        renderSeeAllSectionCard("recent"),
        { section: "recent" },
      )}
      ${renderPosterShelf(
        "Aisles",
        getHomeAisleCollections(),
        "aisle",
        renderCollectionShelfCard,
        null,
        renderSeeAllSectionCard("collections"),
        { section: "collections" },
      )}
      ${renderPosterShelf(
        "Collections",
        getHomeRecentCollections(),
        "collection",
        renderCollectionShelfCard,
        null,
        renderSeeAllSectionCard("collections"),
        { section: "collections" },
      )}
      ${renderPosterShelf(
        "Mixtape",
        mixedWatchlist.slice(0, 10),
        "item",
        renderMixedCard,
        null,
        renderSeeAllSectionCard("watchlist"),
        { section: "watchlist" },
      )}
      ${renderPosterShelf(
        "All Movies",
        movieItems.slice(0, 10),
        "movie",
        renderLibraryCard,
        null,
        renderSeeAllSectionCard("movies", "library"),
        { section: "movies", subview: "library" },
      )}
    </div>
  `;
}

function getHomeAisleCollections() {
  const aisleIds = ["action", "comedy", "documentary", "drama", "fantasy", "horror", "romance", "sci-fi", "sports", "western"];
  return aisleIds
    .map((id) => {
      const collection = getCuratedCollectionPage(id);
      const saved = collectionOverrides.collections?.[id];
      if (!collection || saved?.deleted) return null;
      return { ...getCuratedCollectionCard(collection), ...(saved ?? {}) };
    })
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));
}

function getHomeRecentCollections() {
  const aisleIds = new Set(getGroupedCollections().find((group) => group.title === "Aisles")?.collections.map((collection) => collection.id) ?? []);
  return getVisibleCollections()
    .filter((collection) => !aisleIds.has(collection.id))
    .map((collection) => ({ ...collection, latestAddedAt: getCollectionLatestAddedAt(collection) }))
    .sort((a, b) => String(b.latestAddedAt ?? "").localeCompare(String(a.latestAddedAt ?? "")) || a.title.localeCompare(b.title))
    .slice(0, 10);
}

function getCollectionLatestAddedAt(collection) {
  const itemDates = (collection.itemIds ?? [])
    .map((id) => getCollectionItem(id)?.addedAt ?? movieDetailIndex[id]?.addedAt ?? tvDetailIndex[id]?.addedAt)
    .filter(Boolean);
  const sectionDates = (collection.sections ?? [])
    .flatMap((section) => section.items ?? [])
    .map((item) => getCollectionItem(item.id)?.addedAt ?? item.addedAt)
    .filter(Boolean);
  return [...itemDates, ...sectionDates].sort((a, b) => String(b).localeCompare(String(a)))[0] ?? "";
}
function renderHomeLandingHero() {
  return `
    <section class="home-landing-hero" aria-label="Tobytube storefront">
      <img src="./assets/banners/home-landing-hero-crowells.png" alt="" loading="eager" />
      ${renderHomeLibraryButtons()}
    </section>
  `;
}

function renderHomeMascotButtons() {
  const buttons = [
    ["hirry", "Hirry", "./assets/banners/home-hirry.png"],
    ["rub", "Rub", "./assets/banners/home-rub.png"],
    ["tobe", "Tobe", "./assets/banners/home-tobe.png"],
  ];
  return `
    <div class="home-mascot-grid" aria-label="Featured moods">
      ${buttons
        .map(
          ([id, label, imageUrl]) => `
            <button class="home-mascot-card ${id}" type="button" aria-label="${label}">
              <img src="${imageUrl}" alt="" loading="eager" />
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderHomeLibraryButtons() {
  const buttons = [
    ["movies", "Movies"],
    ["tv", "TV"],
    ["wrestling", "Wrestling"],
    ["collections", "Collections"],
  ];
  return `
    <div class="home-library-strips" aria-label="Media libraries">
      ${buttons
        .map(
          ([section, label]) => `
            <button class="home-library-strip" type="button" data-section="${section}">
              <span>${label}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMediaHubShelf() {
  const hubs = [
    {
      section: "movies",
      title: "Movies",
      meta: `${movies.length} films`,
      visual: "movies",
      imageUrl: "./assets/banners/home-movies.png",
    },
    {
      section: "tv",
      title: "TV",
      meta: `${tvShows.length} shows`,
      visual: "tv",
      imageUrl: "./assets/banners/home-tv.png",
    },
    {
      section: "wrestling",
      title: "Wrestling",
      meta: `${promotions.length} promotions`,
      visual: "wrestling",
      imageUrl: "./assets/banners/home-wrestling.png",
    },
  ];

  return `
    <section class="lane">
      <div class="lane-head">
        <h2>My Media</h2>
        <span class="muted">3 libraries</span>
      </div>
      <div class="hub-carousel">
        ${hubs
          .map(
            (hub) => `
              <button class="hub-card ${hub.visual}" type="button" data-section="${hub.section}" aria-label="${hub.title} ${hub.meta}">
                <div class="hub-visual" aria-hidden="true">
                  ${renderHubVisual(hub)}
                </div>
                <div class="hub-label">
                  <div class="hub-title">${hub.title}</div>
                  <div class="hub-meta">${hub.meta}</div>
                </div>
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHubVisual(hub) {
  return `
    <img class="hub-image" src="${escapeHtml(hub.imageUrl)}" alt="" loading="eager" />
  `;
}

function renderMoviesHome() {
  const movieItems = getMovieLibraryItems();
  const filtered = filterLibraryItems(movieItems);
  const resumeItems = getResumeLibraryItems("movie");

  if (state.subView === "library") return renderAlphabeticalLibraryPage("Movies Library", filtered, renderLibraryCard);
  if (state.subView === "recent") return renderLibraryPage("New Release Movies", sortByDate(filtered), renderLibraryCard);
  if (state.subView === "continue") return renderLibraryPage("Resume Watching Movies", resumeItems, renderResumeCard);
  if (state.subView === "collections") return renderCollectionsHome();
  if (state.subView === "watchlist") return renderLibraryPage("Movie Mixtape", getMixtapeItems().filter((item) => item.mediaType === "movie"), renderLibraryCard);

  return `
    <div class="movie-exhibit">
      ${renderMovieLandingHero()}
      <div class="shelf-stack movie-shelves">
        ${renderPosterShelf(
          "New Releases",
          sortByDate(filtered).slice(0, 10),
          "movie",
          renderLibraryCard,
          null,
          renderSeeAllSubViewCard("recent"),
          { subview: "recent" },
        )}
        ${renderPosterShelf(
          "Current Rentals",
          resumeItems.slice(0, 10),
          "movie",
          renderResumeCard,
          null,
          renderSeeAllSubViewCard("continue"),
          { subview: "continue" },
        )}
        ${renderPosterShelf(
          "Aisles",
          (getGroupedCollections().find((group) => group.title === "Aisles")?.collections ?? []).slice(0, 10),
          "collection",
          renderCollectionShelfCard,
          null,
          "",
          { section: "collections" },
        )}
        ${renderPosterShelf(
          "Mixtape",
          getMixtapeItems().filter((item) => item.mediaType === "movie").slice(0, 10),
          "movie",
          renderLibraryCard,
          null,
          renderSeeAllSubViewCard("watchlist"),
          { subview: "watchlist" },
        )}
        ${renderPosterShelf(
          "Library",
          filtered.slice(0, 10),
          "movie",
          renderLibraryCard,
          null,
          renderSeeAllSubViewCard("library"),
          { subview: "library" },
        )}
      </div>
    </div>
  `;
}

function renderMovieLandingHero() {
  const signButtons = [
    ["action", "Action", 298, 141, 145, 52],
    ["comedy", "Comedy", 468, 141, 148, 52],
    ["documentary", "Documentary", 634, 141, 136, 52],
    ["fantasy", "Fantasy", 785, 141, 138, 52],
    ["drama", "Drama", 934, 141, 135, 52],
    ["horror", "Horror", 306, 213, 141, 49],
    ["romance", "Romance", 471, 213, 146, 49],
    ["sci-fi", "Sci-Fi", 639, 213, 129, 49],
    ["sports", "Sport", 784, 213, 139, 49],
    ["western", "Western", 935, 213, 145, 49],
  ];
  return `
    <section class="movie-landing-hero" aria-label="Tobytube movie shelves">
      <img src="./assets/banners/movies-landing-hero.png" alt="" loading="eager" />
      <div class="movie-genre-hotspots" aria-label="Movie genre aisles">
        ${signButtons
          .map(
            ([id, label, x, y, width, height]) => `
              <button
                class="movie-genre-hotspot"
                type="button"
                data-collection-id="${id}"
                data-sign-x="${x}"
                data-sign-y="${y}"
                data-sign-width="${width}"
                data-sign-height="${height}"
                aria-label="${escapeHtml(label)} collection"
                title="${escapeHtml(label)}"
              >
                <span>${escapeHtml(label)}</span>
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function syncMovieGenreHotspots() {
  const hero = document.querySelector(".movie-landing-hero");
  const layer = hero?.querySelector(".movie-genre-hotspots");
  if (!hero || !layer) {
    movieHotspotResizeObserver?.disconnect();
    movieHotspotResizeObserver = null;
    return;
  }

  const renderHotspots = () => {
    const heroRect = hero.getBoundingClientRect();
    const naturalWidth = 1672;
    const naturalHeight = 941;
    const scale = Math.max(heroRect.width / naturalWidth, heroRect.height / naturalHeight);
    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;
    const offsetX = (heroRect.width - renderedWidth) / 2;

    layer.style.width = `${heroRect.width}px`;
    layer.style.height = `${heroRect.height}px`;

    layer.querySelectorAll(".movie-genre-hotspot").forEach((button) => {
      const x = Number(button.dataset.signX);
      const y = Number(button.dataset.signY);
      const width = Number(button.dataset.signWidth);
      const height = Number(button.dataset.signHeight);
      button.style.left = `${offsetX + x * scale}px`;
      button.style.top = `${y * scale}px`;
      button.style.width = `${width * scale}px`;
      button.style.height = `${height * scale}px`;
    });
  };

  renderHotspots();

  if (!movieHotspotResizeObserver) {
    movieHotspotResizeObserver = new ResizeObserver(() => renderHotspots());
  }
  movieHotspotResizeObserver.disconnect();
  movieHotspotResizeObserver.observe(hero);
}

function renderMovieCollectionsPage() {
  return `
    ${renderLibraryHeader("Movie Collections", "Movie-only exhibits, franchises, moods, and shelves.", "movies", false)}
    <div class="collection-grid">
      ${getMovieCollections().map(renderCollectionCard).join("") || `<div class="empty">No movie collections yet.</div>`}
    </div>
  `;
}

function renderTvHome() {
  const tvItems = getTvLibraryItems();
  const filtered = filterLibraryItems(tvItems);
  const resumeItems = getResumeLibraryItems("tv");
  const currentRentals = getSessionTvRentals();

  if (state.subView === "guide") return renderTvGuidePage();
  if (state.subView === "library") return renderAlphabeticalLibraryPage("TV Library", filtered, renderTvCard);
  if (state.subView === "continue") return renderLibraryPage("Current Rentals", currentRentals, renderResumeCard);
  if (state.subView === "recent") return renderLibraryPage("New Release TV", sortByDate(filtered), renderTvCard);
  if (state.subView === "collections") return renderCollectionsHome();
  if (state.subView === "playlist") return renderLibraryPage("TV Mixtape", getTvPlaylistItems(), renderTvCard);

  return `
    <div class="tv-exhibit">
      ${renderTvLandingHero()}
      <div class="shelf-stack tv-shelves">
        ${renderPosterShelf(
          "Current Rentals",
          currentRentals.slice(0, 10),
          "show",
          renderResumeCard,
          null,
          renderSeeAllSubViewCard("continue"),
          { subview: "continue" },
        )}
        ${renderPosterShelf(
          "New Releases",
          sortByDate(filtered).slice(0, 10),
          "show",
          renderTvCard,
          null,
          renderSeeAllSubViewCard("recent"),
          { subview: "recent" },
        )}
        ${renderPosterShelf(
          "Collections",
          getTvCollections().slice(0, 10),
          "collection",
          renderCollectionShelfCard,
          null,
          renderSeeAllSubViewCard("collections"),
          { subview: "collections" },
        )}
        ${renderPosterShelf(
          "Mixtape",
          getTvPlaylistItems().slice(0, 10),
          "show",
          renderTvCard,
          null,
          renderSeeAllSubViewCard("playlist"),
          { subview: "playlist" },
        )}
        ${renderPosterShelf(
          "Library",
          filtered.slice(0, 10),
          "show",
          renderTvCard,
          null,
          renderSeeAllSubViewCard("library"),
          { subview: "library" },
        )}
      </div>
    </div>
  `;
}

function renderTvLandingHero() {
  return `
    <section class="tv-landing-hero" aria-label="Tobytube television shelves">
      <img src="./assets/banners/tv-landing-hero.png" alt="" loading="eager" />
      <div class="tv-hero-actions" aria-label="Television controls">
        <button class="tv-hero-button" type="button" data-action="watch-teebee">watch teebee.</button>
        <button class="tv-hero-button tv-hero-button-guide" type="button" data-subview="guide">wats on teebee</button>
        <button class="tv-hero-button tv-hero-button-muted" type="button" data-action="doan-watch-teebee">doan watch teebee.</button>
      </div>
    </section>
  `;
}

function renderTvGuidePage() {
  const channels = buildTvGuideChannels();
  const allEntries = channels.flatMap((channel) => channel.entries);
  const selected = allEntries.find((entry) => entry.id === state.selectedTvGuideItemId) ?? allEntries[0] ?? null;
  if (!state.selectedTvGuideItemId && selected) state.selectedTvGuideItemId = selected.id;

  return `
    <div class="tv-guide-page">
      <button class="neon-back-button tv-guide-back" type="button" data-action="back-page" aria-label="Back" title="Back">&larr;</button>
      <section class="tv-guide-shell" aria-label="Toby's 24-Hour TV Guide">
        ${renderTvGuideInfoBar(selected)}
        <div class="tv-guide-grid" role="grid" aria-label="Television guide channels">
          ${renderTvGuideTimeline()}
          ${channels.map(renderTvGuideChannel).join("")}
        </div>
        <footer class="tv-guide-footer">
          <span>PAGE UP / DOWN</span>
          <span>JUMP TO NOW</span>
          <button type="button" data-action="toggle-tv-guide-theater">${state.tvGuideTheaterMode ? "EXIT THEATRE" : "THEATRE MODE"}</button>
          <span>CHANGE CHANNEL</span>
          <span><kbd>SELECT</kbd> VIEW COLLECTION</span>
        </footer>
      </section>
    </div>
  `;
}

function renderTvGuideInfoBar(entry) {
  const related = entry?.relatedCollections?.length
    ? `<p class="tv-guide-related"><span>Related:</span> ${entry.relatedCollections.map((collection) => `<button type="button" data-collection-id="${escapeHtml(collection.id)}">${escapeHtml(collection.title)}</button>`).join("<i>ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢</i>")}</p>`
    : "";
  return `
    <header class="tv-guide-info">
      <div class="tv-guide-logo">
        <img src="./assets/banners/tobytube-tv-logo.png" alt="Toby's 24-Hour TV Guide" loading="eager" />
      </div>
      <div class="tv-guide-copy">
        <h1>${escapeHtml(entry?.title ?? "Toby's TV Guide")}</h1>
        <p class="tv-guide-meta">${escapeHtml(entry ? formatTvGuideMeta(entry) : "Pick a channel block")}</p>
        <p class="tv-guide-summary">${escapeHtml(truncateTvGuideText(entry?.summary ?? "Scroll the channels and see what Toby taped.", 120))}</p>
        ${related}
      </div>
      <div class="tv-guide-art">
        ${entry?.artUrl ? `<img src="${escapeHtml(entry.artUrl)}" alt="" loading="eager" />` : `<span>Collection<br />Artwork</span>`}
      </div>
      <time class="tv-guide-clock" datetime="${new Date().toISOString()}">
        <span>${escapeHtml(formatGuideDate(new Date()))}</span>
        <b>${escapeHtml(formatGuideTime(new Date()))}</b>
      </time>
    </header>
  `;
}

function renderTvGuideTimeline() {
  const slots = ["Today", "8:30 PM", "9:00 PM", "9:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM"];
  return `
    <div class="tv-guide-timeline" role="row">
      ${slots.map((slot) => `<div>${escapeHtml(slot)}</div>`).join("")}
    </div>
  `;
}

function renderTvGuideChannel(channel) {
  return `
    <div class="tv-guide-channel tv-guide-channel-${escapeHtml(channel.color)}" role="row">
      <div class="tv-guide-channel-label">
        <b>${escapeHtml(channel.number)}</b>
        <span>${escapeHtml(channel.title)}</span>
        ${channel.subtitle ? `<small>${escapeHtml(channel.subtitle)}</small>` : ""}
      </div>
      <div class="tv-guide-programs">
        ${channel.entries.map((entry) => renderTvGuideBlock(entry, channel)).join("")}
      </div>
    </div>
  `;
}

function renderTvGuideBlock(entry, channel) {
  const isSelected = entry.id === state.selectedTvGuideItemId;
  const attrs = entry.targetId
    ? `data-title-id="${escapeHtml(entry.targetId)}"`
    : entry.id === "tv-guide-library"
      ? `data-subview="library"`
      : entry.collectionId
      ? `data-collection-id="${escapeHtml(entry.collectionId)}"`
      : `data-tv-guide-item="${escapeHtml(entry.id)}"`;
  return `
    <button
      class="tv-guide-block ${isSelected ? "selected" : ""}"
      type="button"
      style="--guide-span:${entry.span};"
      ${attrs}
      data-tv-guide-hover="${escapeHtml(entry.id)}"
      aria-label="${escapeHtml(entry.title)}"
    >
      <strong>${escapeHtml(entry.title)}</strong>
      <span>${escapeHtml(entry.subtitle)}</span>
    </button>
  `;
}

function buildTvGuideChannels() {
  return tvGuideChannels.map((channel, channelIndex) => ({
    ...channel,
    entries: buildTvGuideEntries(channel, channelIndex),
  }));
}

function buildTvGuideEntries(channel, channelIndex) {
  const assigned = getTvGuideAssignedItems(channel).map((item, index) => item.mediaType === "movie"
    ? tvGuideMovieEntry(item, channel, index)
    : tvGuideShowEntry(item.title, channel, index, item));
  let programmed = [];
  if (channel.mode === "recent") programmed = sortByDate(getAllTvTitleItems()).slice(0, 6).map((show, index) => tvGuideShowEntry(show.title, channel, index));
  else if (channel.mode === "movies") programmed = movies.slice(0, 6).map((movie, index) => tvGuideMovieEntry(movie, channel, index));
  else if (channel.mode === "collections") programmed = getTvCollections().slice(0, 6).map((collection, index) => tvGuideCollectionEntry(collection, channel, index));
  else if (channel.mode === "library") programmed = [{ id: "tv-guide-library", title: "Full TV Library", subtitle: `${getAllTvTitleItems().length} shows`, span: 4, summary: "Every TV show presently known to Tobytube.", collectionId: null, targetId: null, artUrl: "./assets/banners/tv-guide-hero.png", relatedCollections: [] }];
  else if (channel.mode === "random-shows") programmed = seededPick(getAllTvTitleItems(), 5, channelIndex).map((show, index) => tvGuideShowEntry(show.title, channel, index));
  else programmed = (channel.shows ?? []).map((title, index) => tvGuideShowEntry(title, channel, index));
  return [...assigned, ...programmed].filter((entry, index, all) => all.findIndex((candidate) => (candidate.targetId && candidate.targetId === entry.targetId) || (!candidate.targetId && normalizeTitleForMatch(candidate.title) === normalizeTitleForMatch(entry.title))) === index);
}

function getTvGuideAssignedItems(channel) {
  return [...getAllTvTitleItems(), ...getMovieLibraryItems()].filter((item) => {
    const overrideChannels = getItemMetadataOverride(item.id).tvGuideChannelIds ?? [];
    return overrideChannels.includes(channel.number) || getFolderTvGuideChannelIds(item).includes(channel.number);
  });
}

function tvGuideShowEntry(title, channel, index = 0, knownShow = null) {
  const show = knownShow ?? findTvGuideShow(title);
  const details = show ? getTvDetails(show) : null;
  const seasons = details?.seasons ?? [];
  const episodeCount = countTvGuideEpisodes(details);
  const span = getTvGuideSpan(episodeCount);
  const year = getTvGuideYearRange(details, title);
  const genres = details?.genres?.length ? details.genres.slice(0, 2).join(", ") : "Program";
  return {
    id: `tv-guide-${channel.number}-${slugify(title)}-${index}`,
    title,
    subtitle: `${genres} / ${episodeCount || "?"} eps`,
    summary: details?.overview || `${title} is queued for Toby's TV Guide.`,
    span,
    years: year,
    episodeCount,
    rating: details?.rating || "",
    targetId: show?.id ?? null,
    collectionId: null,
    artUrl: getRandomTvGuideEpisodeStill(details, `${channel.number}:${title}`) ?? details?.backdropUrl ?? details?.posterUrl ?? show?.posterUrl ?? null,
    relatedCollections: show ? getRelatedTvGuideCollections(show.id) : [],
    mediaType: "tv",
    seasonCount: seasons.length,
  };
}

function tvGuideMovieEntry(movie, channel, index = 0) {
  const runtime = Number(movie.runtimeMinutes ?? movieDetailIndex[movie.id]?.runtimeMinutes ?? 120);
  return {
    id: `tv-guide-${channel.number}-${movie.id}-${index}`,
    title: movie.title,
    subtitle: `${movie.genre ?? "Movie"} / ${runtime} min`,
    summary: movie.summary ?? movieDetailIndex[movie.id]?.summary ?? "Feature presentation from Toby's movie shelves.",
    span: 1,
    years: String(movie.year ?? ""),
    episodeCount: null,
    rating: movie.rating ?? "",
    targetId: movie.id,
    collectionId: null,
    artUrl: movie.backdropUrl ?? movie.posterUrl ?? null,
    relatedCollections: [],
    mediaType: "movie",
  };
}

function tvGuideCollectionEntry(collection, channel, index = 0) {
  const itemCount = collection.itemIds?.length ?? 0;
  return {
    id: `tv-guide-${channel.number}-${collection.id}-${index}`,
    title: collection.title,
    subtitle: `Collection / ${itemCount} items`,
    summary: collection.description ?? "Collection block from Toby's shelves.",
    span: Math.min(4, Math.max(1, Math.ceil(itemCount / 12))),
    years: "",
    episodeCount: itemCount,
    rating: "",
    targetId: null,
    collectionId: collection.id,
    artUrl: collection.buttonImage ?? collection.heroImage ?? null,
    relatedCollections: [],
    mediaType: "collection",
  };
}

function findTvGuideShow(title) {
  const normalized = normalizeTitleForMatch(title)
    .replace(/\bclassic\b/g, "")
    .replace(/\b2005 present\b/g, "")
    .trim();
  return getAllTvTitleItems().find((show) => normalizeTitleForMatch(show.title) === normalized || normalizeTitleForMatch(show.title).includes(normalized));
}

function normalizeTitleForMatch(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function seededPick(items, count, seed) {
  if (!items.length) return [];
  return Array.from({ length: Math.min(count, items.length) }, (_, index) => items[(seed * 7 + index * 11) % items.length]);
}

function countTvGuideEpisodes(details) {
  return (details?.seasons ?? []).reduce((sum, season) => sum + Number(season.episodeCount ?? season.episodes?.length ?? 0), 0);
}

function getRandomTvGuideEpisodeStill(details, seed = "") {
  const stills = (details?.seasons ?? []).flatMap((season) => season.episodes ?? []).map((episode) => episode.stillUrl ?? episode.imageUrl ?? episode.backdropUrl).filter(Boolean);
  if (!stills.length) return null;
  const day = new Date().toISOString().slice(0, 10);
  const hash = [...`${seed}:${day}`].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 7);
  return stills[hash % stills.length];
}

function getTvGuideSpan(episodeCount) {
  if (!episodeCount || episodeCount <= 150) return 1;
  if (episodeCount <= 500) return 2;
  return 3;
}

function getTvGuideYearRange(details, title) {
  const first = details?.firstAirDate ? new Date(details.firstAirDate).getFullYear() : inferTvGuideYear(title);
  const last = (details?.seasons ?? []).map((season) => season.airDate || season.firstAirDate).filter(Boolean).map((date) => new Date(date).getFullYear()).filter(Boolean).sort((a, b) => b - a)[0];
  if (!first) return "Year pending";
  if (!last || last === first) return String(first);
  return `${first}-${last}`;
}

function inferTvGuideYear(title) {
  const match = String(title).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function getRelatedTvGuideCollections(showId) {
  return getTvCollections().filter((collection) => collection.itemIds?.includes(showId)).slice(0, 3);
}

function formatTvGuideMeta(entry) {
  const parts = [];
  if (entry.years) parts.push(entry.years);
  if (entry.mediaType === "collection") parts.push(`${entry.episodeCount ?? 0} items`);
  else if (entry.episodeCount) parts.push(`${entry.episodeCount} episodes`);
  if (entry.rating) parts.push(entry.rating);
  return parts.join(" / ") || "Metadata pending";
}

function formatGuideDate(date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

function formatGuideTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function truncateTvGuideText(value, maxLength = 185) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦`;
}

function getCurrentTvGuideEntries() {
  return buildTvGuideChannels().flatMap((channel) => channel.entries);
}

function getTvGuideBlocks() {
  return [...document.querySelectorAll(".tv-guide-block")];
}

function bindTvGuideInfoBarEvents() {
  document.querySelectorAll(".tv-guide-info [data-collection-id]").forEach((button) => {
    button.addEventListener("click", () => {
      pushNavigationState();
      state.selectedCollectionId = button.dataset.collectionId;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      state.selectedTvGuideItemId = null;
      render();
    });
  });
}

function updateTvGuideSelection(itemId) {
  if (!itemId || state.selectedTvGuideItemId === itemId) return;
  const entry = getCurrentTvGuideEntries().find((candidate) => candidate.id === itemId);
  if (!entry) return;

  state.selectedTvGuideItemId = itemId;
  const infoBar = document.querySelector(".tv-guide-info");
  if (infoBar) {
    infoBar.outerHTML = renderTvGuideInfoBar(entry);
    bindTvGuideInfoBarEvents();
  }
  document.querySelectorAll(".tv-guide-block.selected").forEach((button) => button.classList.remove("selected"));
  const selectedButton = [...document.querySelectorAll("[data-tv-guide-hover]")].find((button) => button.dataset.tvGuideHover === itemId);
  selectedButton?.classList.add("selected");
  syncTvGuideClock();
}

function handleTvGuideKeydown(event) {
  if (state.section !== "tv" || state.subView !== "guide") return;
  const blocks = getTvGuideBlocks();
  if (!blocks.length) return;

  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    state.tvGuideTheaterMode = !state.tvGuideTheaterMode;
    render();
    return;
  }

  const grid = document.querySelector(".tv-guide-grid");
  if (event.key === "PageDown" || event.key === "PageUp") {
    event.preventDefault();
    grid?.scrollBy({ top: (event.key === "PageDown" ? 1 : -1) * Math.round((grid.clientHeight || 600) * 0.82), behavior: "smooth" });
    return;
  }

  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;

  event.preventDefault();
  const activeBlock = document.activeElement?.classList?.contains("tv-guide-block")
    ? document.activeElement
    : document.querySelector(".tv-guide-block.selected") ?? blocks[0];
  let nextBlock = activeBlock;

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const currentIndex = blocks.indexOf(activeBlock);
    nextBlock = blocks[Math.max(0, Math.min(blocks.length - 1, currentIndex + (event.key === "ArrowRight" ? 1 : -1)))] ?? activeBlock;
  } else if (event.key === "Home") {
    nextBlock = blocks[0];
  } else if (event.key === "End") {
    nextBlock = blocks[blocks.length - 1];
  } else {
    const channels = [...document.querySelectorAll(".tv-guide-channel")];
    const currentChannel = activeBlock.closest(".tv-guide-channel");
    const channelIndex = channels.indexOf(currentChannel);
    const targetChannel = channels[channelIndex + (event.key === "ArrowDown" ? 1 : -1)];
    if (targetChannel) {
      const currentLeft = activeBlock.offsetLeft;
      const rowBlocks = [...targetChannel.querySelectorAll(".tv-guide-block")];
      nextBlock = rowBlocks.reduce((best, candidate) => {
        if (!best) return candidate;
        return Math.abs(candidate.offsetLeft - currentLeft) < Math.abs(best.offsetLeft - currentLeft) ? candidate : best;
      }, null) ?? activeBlock;
    }
  }

  nextBlock.focus({ preventScroll: false });
  updateTvGuideSelection(nextBlock.dataset.tvGuideHover);
}

function syncTvGuideClock() {
  if (tvGuideClockTimer) {
    clearInterval(tvGuideClockTimer);
    tvGuideClockTimer = null;
  }

  const clock = document.querySelector(".tv-guide-clock");
  if (!clock) return;

  const updateClock = () => {
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.innerHTML = `
      <span>${escapeHtml(formatGuideDate(now))}</span>
      <b>${escapeHtml(formatGuideTime(now))}</b>
    `;
  };

  updateClock();
  tvGuideClockTimer = setInterval(updateClock, 30 * 1000);
}

function renderTvCollectionsPage() {
  return `
    ${renderLibraryHeader("TV Collections", "TV-only shelves, stations, playlists, and late-night channel flips.", "tv")}
    <div class="collection-grid">
      ${getTvCollections().map(renderCollectionCard).join("") || `<div class="empty">No TV collections yet.</div>`}
    </div>
  `;
}

function renderCollectionsHome() {
  const groups = getGroupedCollections();
  const nextSortLabel = state.collectionSort === "az" ? "Z-A" : "A-Z";
  return `
    <section class="collections-hero exhibit-hero">
      ${renderNeonBackButton()}
      <img src="./assets/collections/collections-hero.png" alt="" />
      <nav class="collections-hero-menu" aria-label="Collection sections">
        ${groups
          .filter((group) => ["Vaults", "Sagas", "Aisles", "Boxed Sets", "Worlds", "Profiles"].includes(group.title))
          .map((group) => `<button type="button" data-collection-group-jump="${slugify(group.title)}">${escapeHtml(group.title)}</button>`)
          .join("")}
      </nav>
    </section>
    <div class="collection-sort-bar">
      <button class="collection-sort-button" type="button" data-action="toggle-collection-sort">
        Sort ${nextSortLabel}
      </button>
    </div>
    <div class="collection-group-stack">
      ${groups.map((group) => renderCollectionGroup(group.title, group.collections)).join("")}
    </div>
  `;
}

function renderCriterionCollectionPage() {
  const data = getCriterionCollectionData();
  if (!data?.collection) return `<div class="empty">The Criterion Collection is still loading.</div>`;
  if (state.selectedCriterionEclipseId) return renderCriterionEclipseSetPage(state.selectedCriterionEclipseId);
  if (state.selectedCriterionSubCollectionId) return renderCriterionSubCollectionPage(state.selectedCriterionSubCollectionId);

  const view = state.selectedCriterionView ?? "home";
  if (view === "archive") return renderCriterionArchivePage(data);
  if (view === "collections") return renderCriterionCollectionsPage(data);
  if (view === "eclipse") return renderCriterionEclipsePage(data);
  return renderCriterionLandingPage(data);
}

function getCriterionCollectionData() {
  const data = criterionCollectionIndex;
  if (!data?.collection) return data;
  const generated = getGeneratedCriterionSubCollections();
  if (!generated.subCollections.length) return data;
  const subCollectionMap = new Map(
    (data.subCollections ?? []).map((collection) => [
      collection.id,
      {
        ...collection,
        buttonImage: collection.buttonImage ?? getCriterionBoxedSetButtonImage(collection.title),
      },
    ]),
  );
  const subCollectionTitleMap = new Map((data.subCollections ?? []).map((collection) => [slugify(collection.title), collection.id]));
  const generatedCollectionIdAliases = new Map();
  generated.subCollections.forEach((collection) => {
    const existingId = subCollectionTitleMap.get(slugify(collection.title));
    if (existingId) {
      generatedCollectionIdAliases.set(collection.id, existingId);
      const existing = subCollectionMap.get(existingId);
      subCollectionMap.set(existingId, {
        ...existing,
        itemIds: [...new Set([...(existing.itemIds ?? []), ...(collection.itemIds ?? [])])],
        buttonImage: existing.buttonImage ?? collection.buttonImage ?? null,
        curatedSource: existing.curatedSource ?? collection.curatedSource ?? null,
      });
      return;
    }
    if (!subCollectionMap.has(collection.id)) {
      subCollectionMap.set(collection.id, collection);
      subCollectionTitleMap.set(slugify(collection.title), collection.id);
    }
  });
  const groupMap = new Map((data.collectionGroups ?? []).map((group) => [group.id, { ...group, collectionIds: [...(group.collectionIds ?? [])] }]));
  generated.groups.forEach((group) => {
    const existing = groupMap.get(group.id) ?? { id: group.id, title: group.title, collectionIds: [] };
    const ids = new Set(existing.collectionIds);
    group.collectionIds.forEach((id) => ids.add(generatedCollectionIdAliases.get(id) ?? id));
    groupMap.set(group.id, { ...existing, title: existing.title ?? group.title, collectionIds: [...ids] });
  });
  return {
    ...data,
    subCollections: [...subCollectionMap.values()],
    collectionGroups: [...groupMap.values()],
  };
}

function getGeneratedCriterionSubCollections() {
  const bucketSpecs = [
    ["noir", "noir", "Noir Collections", "#12151b", "#79a8c6"],
    ["directorShowcase", "director-showcase", "Director Showcase", "#1d1714", "#c69b63"],
    ["boxedSets", "boxed-sets", "Boxed Sets", "#171410", "#c5a46a"],
    ["officialChannelCollections", "criterion-channel", "Criterion Channel Collections", "#17141c", "#b47ad4"],
  ];
  const subCollections = [];
  const groups = [];
  bucketSpecs.forEach(([bucket, groupId, groupTitle, posterA, posterB]) => {
    const bucketCollections = curatedManifestIndex?.criterion?.[bucket] ?? [];
    const mapped = bucketCollections.map((collection) => ({
      id: collection.id,
      title: collection.title,
      description: `${collection.items?.length ?? 0} curated title${(collection.items?.length ?? 0) === 1 ? "" : "s"} from ${groupTitle}.`,
      itemIds: (collection.items ?? []).map((item) => item.id),
      posterA,
      posterB,
      category: groupTitle,
      buttonImage:
        bucket === "noir"
          ? getCriterionNoirButtonImage(collection.title)
          : bucket === "boxedSets"
            ? getCriterionBoxedSetButtonImage(collection.title)
            : null,
      curatedSource: collection.source ?? null,
    }));
    subCollections.push(...mapped);
    groups.push({ id: groupId, title: groupTitle, collectionIds: mapped.map((collection) => collection.id) });
  });
  return { subCollections, groups };
}

function getCriterionNoirButtonImage(title) {
  const buttonMap = {
    "american noir": "american-noir-button-png.png",
    "blackout noir": "blackout-noir-button-png.png",
    "british noir": "british-noir-button-png.png",
    "classic noir": "classic-noir-button-png.png",
    "columbia noir": "columbia-noir-button-png.png",
    "existential dream noir": "exestential-dream-noir-button-png.png",
    "femme noir": "femme-noir-button-png.png",
    "french noir": "french-noir-button-png.png",
    "japanese noir": "japanese-noir-button-png.png",
    "neo noir": "neo-noir-png.png",
    "noir westerns": "noir-westens-button-png.png",
    "noirvember essentials": "noirvember-essentials-png.png",
    "nordic noir": "nordic-noir-png.png",
    "political noir": "political-noir-button-png.png",
    "queer noir": "queer-noir-button-png.png",
    "urban nightmare noir": "urban-nightmare-noir-button-png.png",
  };
  const key = slugify(title).replace(/-/g, " ");
  return buttonMap[key] ? `./assets/collections/criterion/noir-buttons/${buttonMap[key]}` : null;
}

function getCriterionBoxedSetButtonImage(title) {
  const buttonMap = {
    "the before trilogy": "before-trilogy-button.png",
    "before trilogy": "before-trilogy-button.png",
    "ak 100 the works of akira kurosawa": "ak-100-button.png",
    "gregg araki s teen apocalypse trilogy": "gregg-araki-teen-apocalypse-button.png",
    "gregg araki s teen apocalypse": "gregg-araki-teen-apocalypse-button.png",
    "lone wolf and cub": "lone-wolf-and-cub-button.png",
    "the apu trilogy": "apu-trilogy-button.png",
    "apu trilogy": "apu-trilogy-button.png",
    zatoichi: "zatoichi-button.png",
    cc40: "cc40-button.png",
    "bergman cinema": "bergman-cinema-button.png",
    "ingmar bergman s cinema": "bergman-cinema-button.png",
  };
  const key = slugify(title).replace(/-/g, " ");
  return buttonMap[key] ? `./assets/collections/criterion/boxed-sets/${buttonMap[key]}` : null;
}

function renderCriterionLandingPage(data) {
  return `
    <div class="criterion-page">
      ${renderCriterionHero(data.collection.heroImage, "The Criterion Collection", "The finest in film. Collected.", {
        portals: true,
        variant: "landing",
      })}
      <div class="shelf-stack criterion-shelves">
        ${renderPosterShelf("Continue Watching", data.archiveItems.filter((item) => item.watchProgress > 0).slice(0, 10), "movie", renderLibraryCard)}
        ${renderCriterionSubCollectionShelf(data)}
        ${renderCriterionEclipseShelf(data.eclipseSets.slice(0, 10))}
      </div>
    </div>
  `;
}

function renderCriterionHero(image, title, subtitle, options = {}) {
  const classes = ["criterion-hero", options.variant ? `criterion-hero-${options.variant}` : ""].filter(Boolean).join(" ");
  return `
    <section class="${classes}">
      <button class="neon-back-button criterion-back" type="button" data-action="back-page" aria-label="Back" title="Back">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 9 12l6 6"/><path d="M10 12h9"/></svg>
      </button>
      <img src="${escapeHtml(image)}" alt="" />
      ${options.portals ? renderCriterionPortalGrid() : ""}
      ${
        options.showTitle
          ? `<div class="criterion-hero-title">
              <h1>${escapeHtml(title)}</h1>
              <p>${escapeHtml(subtitle)}</p>
            </div>`
          : ""
      }
    </section>
  `;
}

function renderCriterionPortalGrid() {
  return `
    <div class="criterion-portal-grid">
      ${renderCriterionPortal("archive", "The Archive", "./assets/collections/criterion/portal-archive.png")}
      ${renderCriterionPortal("collections", "Collections", "./assets/collections/criterion/portal-collections.png")}
      ${renderCriterionPortal("eclipse", "Eclipse", "./assets/collections/criterion/portal-eclipse.png")}
      <button class="criterion-portal-card discover" type="button" data-action="criterion-discover" aria-label="Discover">
        <img class="criterion-portal-image" src="./assets/collections/criterion/portal-discover.png" alt="" loading="eager" />
      </button>
    </div>
  `;
}

function renderCriterionPortal(view, title, imageUrl) {
  return `
    <button class="criterion-portal-card ${escapeHtml(view)}" type="button" data-criterion-view="${escapeHtml(view)}" aria-label="${escapeHtml(title)}">
      <img class="criterion-portal-image" src="${escapeHtml(imageUrl)}" alt="" loading="eager" />
    </button>
  `;
}

function renderCriterionArchivePage(data) {
  return `
    <div class="criterion-page">
      ${renderCriterionHero(data.collection.archiveHero, "The Full Archive", "The entire Criterion Collection.")}
      ${renderCriterionViewTabs("archive")}
      <section class="criterion-filter-panel">
        <span class="criterion-filter-label">Filter by:</span>
        ${(data.filters ?? []).map((filter) => renderCriterionFilterMenu(filter, data.archiveItems)).join("")}
      </section>
      <div class="library-grid criterion-wall">
        ${data.archiveItems.map(renderLibraryCard).join("")}
      </div>
    </div>
  `;
}

function renderCriterionCollectionsPage(data) {
  return `
    <div class="criterion-page">
      ${renderCriterionHero(data.collection.collectionsHero, "Collections & Boxed Sets", "Director shelves, movements, studio sets, and curated routes.")}
      ${renderCriterionViewTabs("collections")}
      <div class="shelf-stack criterion-shelves">
        ${(data.collectionGroups ?? []).map((group) => renderCriterionCollectionGroup(group, data)).join("")}
      </div>
    </div>
  `;
}

function renderCriterionEclipsePage(data) {
  return `
    <div class="criterion-page">
      ${renderCriterionHero("./assets/collections/criterion/eclipse-hero-2.png", "Eclipse", "Hidden gems. Rare visions. Timeless cinema.")}
      ${renderCriterionViewTabs("eclipse")}
      <div class="library-grid criterion-wall">
        ${data.eclipseSets.map(renderCriterionEclipseCard).join("")}
      </div>
    </div>
  `;
}

function renderCriterionViewTabs(active) {
  return `
    <nav class="criterion-tabs" aria-label="Criterion sections">
      ${[
        ["home", "Landing"],
        ["archive", "Archive"],
        ["collections", "Collections"],
        ["eclipse", "Eclipse"],
      ]
        .map(([view, label]) => `<button class="${view === active ? "active" : ""}" type="button" data-criterion-view="${view}">${view === "home" ? "Criterion Home" : label}</button>`)
        .join("")}
    </nav>
  `;
}

function renderCriterionFilterMenu(filter, items) {
  const values = getCriterionFilterValues(filter, items).slice(0, 8);
  return `
    <details class="criterion-filter-menu">
      <summary>${escapeHtml(filter)}</summary>
      <div class="criterion-filter-options">
        ${values.map((value) => `<button type="button">${escapeHtml(value)}</button>`).join("") || `<span>No options yet</span>`}
      </div>
    </details>
  `;
}

function getCriterionFilterValues(filter, items) {
  const normalized = filter.toLowerCase();
  const values = items.flatMap((item) => {
    if (normalized === "year") return item.year ? [String(item.year)] : [];
    if (normalized === "director") return item.director ? [item.director] : [];
    if (normalized === "genre") return item.genres?.length ? item.genres : [item.genre].filter(Boolean);
    if (normalized === "country") return [item.country].filter(Boolean);
    if (normalized === "actor") return (item.cast ?? []).map((person) => person.name).filter(Boolean);
    if (normalized === "decade") return item.year ? [`${Math.floor(item.year / 10) * 10}s`] : [];
    if (normalized === "language") return [item.language].filter(Boolean);
    if (normalized === "runtime") return item.runtime ? [item.runtime] : [];
    if (normalized === "format") return ["Film", "Boxed Set", "Eclipse"];
    if (normalized === "spine number") return ["Spine pending"];
    return [];
  });
  return [...new Set(values)].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b)));
}

function renderCriterionCollectionGroup(group, data) {
  const collections = (group.collectionIds ?? [])
    .map((id) => data.subCollections.find((collection) => collection.id === id))
    .filter(Boolean);
  return `
    <section class="lane criterion-collection-lane">
      <div class="lane-head">
        <h2>${escapeHtml(group.title)}</h2>
        <span class="muted">${collections.length} collections</span>
      </div>
      <div class="carousel">
        ${collections.map(renderCriterionSubCollectionShelfCard).join("")}
      </div>
    </section>
  `;
}

function renderCriterionSubCollectionShelf(data) {
  return `
    <section class="lane">
      <div class="lane-head">
        <button class="lane-title-button" type="button" data-criterion-view="collections">Collections</button>
        <button class="icon-button" type="button" data-criterion-view="collections" aria-label="See all">&rsaquo;</button>
      </div>
      <div class="carousel">
        ${data.subCollections.map(renderCriterionSubCollectionShelfCard).join("")}
      </div>
    </section>
  `;
}

function renderCriterionEclipseShelf(sets) {
  return `
    <section class="lane">
      <div class="lane-head">
        <button class="lane-title-button" type="button" data-criterion-view="eclipse">Eclipse</button>
        <button class="icon-button" type="button" data-criterion-view="eclipse" aria-label="See all">&rsaquo;</button>
      </div>
      <div class="carousel">
        ${sets.map(renderCriterionEclipseCard).join("")}
      </div>
    </section>
  `;
}

function renderCriterionSubCollectionCard(collection) {
  const artwork = collection.buttonImage
    ? `<img class="criterion-subcollection-image" src="${escapeHtml(collection.buttonImage)}" alt="" loading="lazy" />`
    : `<div class="collection-pile">${collection.itemIds.map(getCriterionDetailItem).filter(Boolean).slice(0, 4).map((item) => renderPosterBlock(item, "mini-poster")).join("")}</div>`;
  const canonicalId = getCanonicalCriterionProfileId(collection.id);
  const dataAttribute = canonicalId
    ? `data-collection-id="${escapeHtml(canonicalId)}"`
    : `data-criterion-subcollection-id="${escapeHtml(collection.id)}"`;
  return `
    <article class="collection-card criterion-subcollection-card" style="--poster-a:${collection.posterA};--poster-b:${collection.posterB}" ${dataAttribute} tabindex="0">
      ${artwork}
      <div class="card-body">
        <div class="card-title">${escapeHtml(collection.title)}</div>
        <p class="card-meta">${escapeHtml(collection.description)}</p>
      </div>
    </article>
  `;
}

function renderCriterionSubCollectionShelfCard(collection) {
  const artwork = collection.buttonImage
    ? `<img class="criterion-subcollection-image" src="${escapeHtml(collection.buttonImage)}" alt="" loading="lazy" />`
    : `<div class="collection-shelf-art">${collection.itemIds.map(getCriterionDetailItem).filter(Boolean).slice(0, 3).map((item) => renderPosterBlock(item, "mini-poster")).join("")}</div>`;
  const canonicalId = getCanonicalCriterionProfileId(collection.id);
  const dataAttribute = canonicalId
    ? `data-collection-id="${escapeHtml(canonicalId)}"`
    : `data-criterion-subcollection-id="${escapeHtml(collection.id)}"`;
  return `
    <article class="collection-shelf-card criterion-subcollection-card" style="--poster-a:${collection.posterA};--poster-b:${collection.posterB}" aria-label="${escapeHtml(collection.title)}" ${dataAttribute} tabindex="0">
      ${artwork}
    </article>
  `;
}

function getCanonicalCriterionProfileId(collectionId) {
  return {
    "criterion-cronenberg": "david-cronenberg",
    "criterion-wes-anderson": "wes-anderson",
  }[collectionId] ?? null;
}

function renderCriterionSubCollectionPage(collectionId) {
  const data = getCriterionCollectionData();
  const collection = data?.subCollections?.find((item) => item.id === collectionId);
  if (!collection) return `<div class="empty">Criterion collection metadata is not available yet.</div>`;
  const itemMap = new Map(collection.itemIds.map(getCriterionDetailItem).filter(Boolean).map((item) => [item.id, item]));
  getAllocatedCollectionEntries({ id: "criterion" }, { id: collectionId, title: collection.title }).forEach(({ item }) => itemMap.set(item.id, item));
  const items = [...itemMap.values()];
  const sets = (collection.setIds ?? [])
    .map((id) => getCriterionSetById(id))
    .filter(Boolean);
  return `
    <div class="criterion-page criterion-subcollection-page">
      ${renderCriterionHero(getCriterionCollectionHero(collection, data), collection.title, collection.description, { showTitle: true })}
      ${
        sets.length
          ? `<div class="library-grid criterion-wall">${sets.map(renderCriterionEclipseCard).join("")}</div>`
          : `<div class="library-grid criterion-wall">${items.map(renderLibraryCard).join("")}</div>`
      }
    </div>
  `;
}

function getCriterionCollectionHero(collection, data) {
  if (collection.heroImage) return collection.heroImage;
  const category = slugify(collection.category ?? "");
  if (category === "director-showcase") return "./assets/collections/criterion/director-showcase-hero.png";
  if (category === "criterion-channel-collections") return "./assets/collections/criterion/criterion-channel-collections-hero.png";
  return data.collection.collectionsHero;
}

function getCriterionDetailItem(id) {
  return criterionDetailIndex[id] ?? movieDetailIndex[id] ?? null;
}

function renderCriterionEclipseCard(set) {
  const label = set.seriesLabel ?? "Eclipse";
  return `
    <article class="media-card library-card criterion-eclipse-card" data-criterion-eclipse-id="${escapeHtml(set.id)}" tabindex="0">
      ${renderPosterBlock(set)}
      <div class="card-body">
        <div class="card-title">${escapeHtml(set.title)}</div>
        <div class="card-meta">${escapeHtml(label)} ${String(set.number).padStart(2, "0")} / ${set.films.length} films</div>
      </div>
    </article>
  `;
}

function renderCriterionEclipseSetPage(setId) {
  const data = criterionCollectionIndex;
  const set = getCriterionSetById(setId);
  if (!set) return `<div class="empty">Criterion set metadata is not available yet.</div>`;
  const label = set.seriesLabel ?? "Eclipse";
  return `
    <div class="criterion-page criterion-eclipse-set-page">
      ${renderCriterionHero(set.heroImage ?? "./assets/collections/criterion/eclipse-hero-2.png", set.title, `${label} ${String(set.number).padStart(2, "0")} / ${set.films.length} films`, { showTitle: true })}
      ${renderCriterionEclipseSetSynopsis(set)}
      <section class="lane">
        <div class="lane-head">
          <h2>Films In This Set</h2>
          <span class="muted">${set.films.length} films</span>
        </div>
        <div class="episode-carousel criterion-eclipse-film-list">
          ${set.films.map(renderCriterionEclipseFilmCard).join("")}
        </div>
      </section>
    </div>
  `;
}

function getCriterionSetById(setId) {
  const data = criterionCollectionIndex;
  return [...(data?.eclipseSets ?? []), ...(data?.worldCinemaProjectSets ?? [])].find((item) => item.id === setId) ?? null;
}

function renderCriterionEclipseSetSynopsis(set) {
  const copy = set.summary ?? set.description;
  if (!copy) return "";
  return `
    <section class="criterion-set-summary" aria-label="Eclipse set synopsis">
      <p>${escapeHtml(copy)}</p>
    </section>
  `;
}

function renderCriterionEclipseFilmCard(item) {
  return `
    <article class="episode-card criterion-film-card" data-title-id="${escapeHtml(item.id)}" tabindex="0">
      <div class="episode-still criterion-film-poster">${renderPosterBlock(item)}</div>
      <div class="episode-card-copy">
        <div class="card-title">${escapeHtml(item.title)}</div>
        <p>${escapeHtml(renderCriterionEclipseFilmMeta(item))}</p>
      </div>
    </article>
  `;
}

function renderCriterionEclipseFilmMeta(item) {
  return [item.year, item.country !== "Criterion" ? item.country : null, item.runtime, item.language !== "Unknown" ? item.language : null].filter(Boolean).join(" / ") || item.genre;
}

function renderCuratedCollectionPage(collection) {
  const seenItemIds = new Set();
  const visibleSections = getRenderableCollectionSections(collection)
    .filter((section) => !section.menuOnly)
    .map((section) => ({ ...section, items: (section.items ?? []).filter((item) => {
      if (isItemExcludedFromCollectionSection(item, collection.id, section.id)) return false;
      if (!item?.id || seenItemIds.has(item.id)) return false;
      seenItemIds.add(item.id);
      return true;
    }) }))
    .map((section) => {
      if (state.libraryMode !== "media") return section;
      return {
        ...section,
        items: getLiveCollectionSectionItems(collection, section)
          .filter((item) => !isItemExcludedFromCollectionSection(item, collection.id, section.id)),
      };
    })
    .filter((section) => state.libraryMode !== "media" || section.items?.length);
  const continueItems = dedupeShelfItems([
    ...getSessionTvRentals(collection.id),
    ...getCuratedContinueItems(visibleSections),
  ]);
  if (isAisleCollection(collection.id) || isCompactVaultCollection(collection.id)) {
    return renderCompactAisleCollectionPage(collection, visibleSections, continueItems, isCompactVaultCollection(collection.id) ? "vault" : "aisle");
  }
  return `
    <div class="curated-page curated-page-${escapeHtml(collection.id)}">
      <section class="curated-hero" style="--poster-a:${collection.posterA};--poster-b:${collection.posterB}">
        <button class="neon-back-button curated-back" type="button" data-action="back-page" aria-label="Back" title="Back">&larr;</button>
        ${
          collection.heroImage
            ? `<img src="${escapeHtml(collection.heroImage)}" alt="" loading="eager" />`
            : collection.showHeroText === false
              ? `<div class="curated-hero-fallback curated-hero-fallback-blank"></div>`
              : `<div class="curated-hero-fallback"><h1>${escapeHtml(collection.title)}</h1><p>${escapeHtml(collection.description)}</p></div>`
        }
        ${renderCuratedJumpBar(collection)}
      </section>
      <div class="shelf-stack curated-shelves">
        ${renderCuratedShelf(collection.continueTitle ?? (isAisleCollection(collection.id) ? "Current Rentals" : "Continue Watching"), continueItems, "continue")}
        ${visibleSections.map((section) => renderCuratedShelf(section.title, section.items, section.id)).join("")}
      </div>
    </div>
  `;
}

function renderCompactAisleCollectionPage(collection, visibleSections, continueItems, layout = "aisle") {
  const newArrivals = getCollectionNewArrivals(visibleSections);
  if (state.selectedCuratedShelfId === "new-arrivals") {
    return renderCuratedFullShelfPage(collection, "New Arrivals", newArrivals);
  }
  const navigationCollection = {
    ...collection,
    sections: visibleSections,
    menuRows: [visibleSections.map((section) => section.id)],
  };
  return `
    <div class="curated-page curated-page-${escapeHtml(collection.id)} curated-page-aisle-compact curated-page-${escapeHtml(layout)}-compact curated-page-${escapeHtml(collection.id)}-compact">
      <section class="curated-hero" style="--poster-a:${collection.posterA};--poster-b:${collection.posterB}">
        <button class="neon-back-button curated-back" type="button" data-action="back-page" aria-label="Back" title="Back">&larr;</button>
        <img src="${escapeHtml(collection.heroImage)}" alt="" loading="eager" />
      </section>
      <div class="curated-jump-shell">
        ${renderCuratedJumpBar(navigationCollection)}
      </div>
      <div class="shelf-stack curated-shelves">
        ${renderCuratedShelf(collection.continueTitle ?? "Current Rentals", continueItems, "continue")}
        ${renderCuratedShelf("New Arrivals", newArrivals.slice(0, 15), "new-arrivals", {
          total: newArrivals.length,
          viewAll: newArrivals.length > 0,
        })}
        ${visibleSections.map((section) => renderCuratedShelf(section.title, section.items, section.id)).join("")}
      </div>
    </div>
  `;
}

function getCollectionNewArrivals(sections) {
  const libraryMovies = getMovieLibraryItems();
  return dedupeShelfItems(
    sections
      .flatMap((section) => section.items ?? [])
      .map((item) => {
        const itemTitle = slugify(item.title);
        const itemYear = item.year ? Number(item.year) : null;
        return (
          libraryMovies.find((record) => record.id === item.id) ??
          libraryMovies.find((record) => movieRecordMatches(record, itemTitle, itemYear)) ??
          null
        );
      })
      .filter((item) => item?.mediaType === "movie" && item.addedAt),
  ).sort((a, b) => {
    const dateCompare = String(b.addedAt ?? "").localeCompare(String(a.addedAt ?? ""));
    if (dateCompare) return dateCompare;
    return String(getDisplayTitle(a)).localeCompare(String(getDisplayTitle(b)));
  });
}

function renderCuratedFullShelfPage(collection, title, items) {
  return `
    <div class="curated-page curated-full-shelf-page curated-full-shelf-${escapeHtml(collection.id)}">
      <header class="curated-full-shelf-header">
        <button class="neon-back-button" type="button" data-action="back-curated-shelf" aria-label="Back" title="Back">&larr;</button>
        <div>
          <span>${escapeHtml(collection.title)}</span>
          <h1>${escapeHtml(title)}</h1>
          <p>${items.length} title${items.length === 1 ? "" : "s"}, newest additions first</p>
        </div>
      </header>
      <div class="curated-full-shelf-grid">
        ${items.map(renderCuratedPlaceholderCard).join("")}
      </div>
    </div>
  `;
}

function isAisleCollection(collectionId) {
  return new Set(["action", "animation", "arrowverse", "comedy", "cult-films", "dc-animation", "documentary", "drama", "endless-anime-odyssey", "exploitation", "fantasy", "horror", "romance", "saturday-morning-marathon", "sci-fi", "sports", "western", "2010s"]).has(collectionId);
}

function isCompactVaultCollection(collectionId) {
  // Criterion is intentionally excluded: it has its own deeper, bespoke
  // collection architecture rather than the shared compact Vault template.
  return new Set(["a24", "black-excellence", "disney", "hammer", "hbo"]).has(collectionId);
}
function renderCinemaOfIndiaCollectionPage() {
  const collection = getCuratedCollectionPage("cinema-of-india") ?? buildCinemaOfIndiaCollection();
  if (state.selectedIndiaLanguageId) return renderCinemaOfIndiaLanguagePage(collection, state.selectedIndiaLanguageId);
  if (state.selectedIndiaView && state.selectedIndiaView !== "home") {
    const page = collection.indiaPages?.find((item) => item.id === state.selectedIndiaView);
    if (page) return renderCinemaOfIndiaSubPage(collection, page);
  }
  return renderCinemaOfIndiaLandingPage(collection);
}

function renderCinemaOfIndiaLandingPage(collection) {
  const pages = collection.indiaPages ?? [];
  return `
    <div class="curated-page curated-page-cinema-of-india cinema-india-page">
      <section class="curated-hero cinema-india-landing" style="--poster-a:${collection.posterA};--poster-b:${collection.posterB}">
        <button class="neon-back-button curated-back" type="button" data-action="back-page" aria-label="Back" title="Back">&larr;</button>
        <img src="${escapeHtml(collection.heroImage)}" alt="" loading="eager" />
        <nav class="cinema-india-main-nav" aria-label="Cinema of India sections">
          ${pages.map((page) => `<button type="button" data-india-view="${escapeHtml(page.id)}">${escapeHtml(page.title)}</button>`).join("")}
        </nav>
      </section>
    </div>
  `;
}

function renderCinemaOfIndiaSubPage(collection, page) {
  if (page.id === "languages") return renderCinemaOfIndiaLanguagesPage(collection, page);
  return renderCuratedCollectionPage({
    ...page,
    id: `cinema-of-india-${page.id}`,
    continueTitle: "Continue Watching",
  });
}

function renderCinemaOfIndiaLanguagesPage(collection, page) {
  const visibleSections = page.sections.filter((section) => !section.menuOnly);
  return `
    <div class="curated-page curated-page-cinema-of-india curated-page-cinema-of-india-languages cinema-india-page">
      <section class="curated-hero cinema-india-languages" style="--poster-a:${page.posterA};--poster-b:${page.posterB}">
        <button class="neon-back-button curated-back" type="button" data-action="india-home" aria-label="Back" title="Back">&larr;</button>
        <img src="${escapeHtml(page.heroImage)}" alt="" loading="eager" />
        <nav class="cinema-india-language-nav" aria-label="Cinema of India languages">
          ${cinemaOfIndiaLanguages
            .map(([id, title, nativeName]) => `<button type="button" data-india-language-id="${escapeHtml(id)}"><span>${escapeHtml(title)}</span><small>${escapeHtml(nativeName)}</small></button>`)
            .join("")}
        </nav>
      </section>
      <div class="shelf-stack curated-shelves">
        ${visibleSections.map((section) => renderCuratedShelf(section.title, section.items, section.id)).join("")}
      </div>
    </div>
  `;
}

function renderCinemaOfIndiaLanguagePage(collection, languageId) {
  const language = cinemaOfIndiaLanguages.find(([id]) => id === languageId) ?? cinemaOfIndiaLanguages[0];
  const [, title, nativeName, seed] = language;
  const sections = [
    curatedSection("Essentials", [curatedItem(seed, null, "movie", `${title} Cinema`)]),
    curatedSection("Box Office Smash", [curatedItem(seed, null, "movie", "Box Office")]),
    curatedSection("Modern Cinema", [curatedItem(seed, null, "movie", "Modern Cinema")]),
    curatedSection("Classics", [curatedItem(seed, null, "movie", "Classics")]),
    curatedSection("Directors' Hits", [curatedItem(seed, null, "movie", "Directors")]),
    curatedSection("Golden Age", [curatedItem(seed, null, "movie", "Golden Age")]),
    curatedSection("Crime", [curatedItem(seed, null, "movie", "Crime")]),
    curatedSection("Romance", [curatedItem(seed, null, "movie", "Romance")]),
    curatedSection("Action", [curatedItem(seed, null, "movie", "Action")]),
    curatedSection("Musicals", [curatedItem(seed, null, "movie", "Musical")]),
  ];
  return `
    <div class="curated-page curated-page-cinema-of-india-language cinema-india-page">
      <section class="curated-hero cinema-india-language-template" style="--poster-a:#130c07;--poster-b:#f3a44b">
        <button class="neon-back-button curated-back" type="button" data-action="india-languages" aria-label="Back" title="Back">&larr;</button>
        <img src="./assets/collections/cinema-of-india/language-template-hero.png" alt="" loading="eager" />
        <div class="cinema-india-language-title">
          <span>${escapeHtml(title)}</span>
          <small>${escapeHtml(nativeName)}</small>
        </div>
        ${renderCuratedJumpBar({ title: `${title} Cinema`, sections, menuRows: buildCuratedMenuRows(sections.map((section) => section.id), 5) })}
      </section>
      <div class="shelf-stack curated-shelves">
        ${sections.map((section) => renderCuratedShelf(section.title, section.items, section.id)).join("")}
      </div>
    </div>
  `;
}

function getCuratedContinueItems(sections) {
  return sections
    .flatMap((section) => section.items)
    .map((item) => getCuratedHydratedItem(item))
    .filter((item) => item.mediaType !== "tv" && (item.watchProgress ?? 0) > 0)
    .slice(0, 10);
}

function renderCuratedJumpBar(collection) {
  const sectionMap = new Map(collection.sections.map((section) => [section.id, section]));
  const configuredButtons = collection.sections.some((section) => section.button);
  const rows = configuredButtons
    ? [...collection.sections].sort((a, b) => Number(a.button?.line ?? 1) - Number(b.button?.line ?? 1)).reduce((groups, section) => {
        const line = Number(section.button?.line ?? 1);
        const row = groups.find((entry) => entry.line === line) ?? { line, sections: [] };
        if (!groups.includes(row)) groups.push(row);
        row.sections.push(section);
        return groups;
      }, []).map((entry) => entry.sections)
    : collection.menuRows?.length
    ? collection.menuRows.map((row) => row.map((id) => sectionMap.get(id)).filter(Boolean)).filter((row) => row.length)
    : [collection.sections];
  return `
    <nav class="curated-jump-bar${collection.menuRows?.length ? " curated-jump-bar-rows" : ""}" aria-label="${escapeHtml(collection.title)} sections">
      ${rows
        .map(
          (row) => `
            <div class="curated-jump-row" style="justify-content:${escapeHtml(row[0]?.button?.align ?? "center")}">
              ${row.map((section) => `<button type="button" data-curated-jump="${escapeHtml(section.id)}" style="font-size:${0.72 + (Number(section.button?.size ?? 1) - 1) * 0.16}rem;font-weight:${section.button?.bold ? 900 : 700};font-style:${section.button?.italic ? "italic" : "normal"};text-decoration:${section.button?.underline ? "underline" : "none"}">${escapeHtml(section.button?.label ?? section.menuLabel ?? section.title).replace(/\n/g, "<br />")}</button>`).join("")}
            </div>
          `,
        )
        .join("")}
    </nav>
  `;
}

function renderCuratedJumpLabel(section) {
  return escapeHtml(section.menuLabel ?? section.title).replace(/\n/g, "<br />");
}

function renderCuratedShelf(title, items, id, options = {}) {
  const shelfItems = dedupeShelfItems(items);
  const total = Number(options.total ?? shelfItems.length);
  return `
    <section class="lane curated-lane" id="curated-${escapeHtml(id)}">
      <div class="lane-head">
        <h2>${escapeHtml(title)}</h2>
        ${
          options.viewAll
            ? `<button class="curated-view-all" type="button" data-curated-view-all="${escapeHtml(id)}">View all ${total}</button>`
            : `<span class="muted">${total} item${total === 1 ? "" : "s"}</span>`
        }
      </div>
      <div class="carousel">
        ${shelfItems.map(renderCuratedPlaceholderCard).join("")}
      </div>
    </section>
  `;
}

function dedupeShelfItems(items = []) {
  const byIdentity = new Map();
  items.filter(Boolean).forEach((item) => {
    const identity = shelfItemIdentity(item);
    const existing = byIdentity.get(identity);
    if (!existing || shelfItemScore(item) > shelfItemScore(existing)) byIdentity.set(identity, item);
  });
  return [...byIdentity.values()];
}

function shelfItemIdentity(item) {
  const mediaType = item.mediaType ?? "movie";
  const title = normalizeTitleForMatch(getDisplayTitle(item) || item.title);
  const year = item.year ?? item.startYear ?? "tba";
  if (mediaType === "movie" || mediaType === "franchise") return `${mediaType}|${title}|${year}`;
  if (mediaType === "tv") {
    const season = item.season ?? "";
    const episode = item.episode ?? item.episodeNumber ?? "";
    // A top-level TV card represents the series, even when the curated and
    // scanned records disagree about its year or use different record IDs.
    if (season === "" && episode === "") return `${mediaType}|${title}`;
    return `${mediaType}|${title}|${year}|${season}|${episode}`;
  }
  if (mediaType === "wrestling") return `${mediaType}|${title}|${item.date ?? year}|${item.promotionId ?? item.promotion ?? ""}|${item.episodeNumber ?? ""}`;
  return item.id ?? `${mediaType}|${title}|${year}`;
}

function shelfItemScore(item) {
  const hydrated = getCuratedHydratedItem(item);
  return [
    hasPlayableMediaFiles(hydrated),
    hydrated.id === item.id ? null : true,
    hydrated.posterUrl,
    hydrated.summary,
    hydrated.runtime,
    !String(hydrated.id ?? "").startsWith("curated-"),
  ].filter(Boolean).length;
}

function renderCuratedPlaceholderCard(item) {
  if (item.sessionRental) return renderResumeCard(item);
  const hydrated = getCuratedHydratedItem(item);
  if (hydrated.mediaType === "tv") return renderTvCard({ ...hydrated, hasNewEpisodes: hydrated.hasNewEpisodes ?? item.hasNewEpisodes });
  if (hydrated.id !== item.id) return renderLibraryCard(hydrated);
  if (item.mediaType === "tv") return renderTvCard(item);

  const metaParts = [item.year, item.mediaType === "tv" ? "TV" : null, item.genre].filter(Boolean);
  return `
    <article class="media-card library-card curated-placeholder-card ${escapeHtml(item.mediaType)}" data-title-id="${escapeHtml(item.id)}" tabindex="0">
      ${renderPosterBlockWithMenu(item)}
      <div class="card-body">
        <div class="card-title">${escapeHtml(item.title)}</div>
        <div class="card-meta">${escapeHtml(metaParts.join(" / "))}</div>
      </div>
    </article>
  `;
}

function getCuratedHydratedItem(item) {
  const itemTitle = slugify(item.title);
  const itemYear = item.year ? Number(item.year) : null;
  const indexVersion = `${Object.keys(movieDetailIndex).length}:${Object.keys(tvDetailIndex).length}:${Object.keys(criterionDetailIndex).length}`;
  if (curatedHydrationIndex?.version !== indexVersion) {
    const moviesByIdentity = new Map();
    const moviesByTitle = new Map();
    const tvByIdentity = new Map();
    const tvByTitle = new Map();
    [...Object.values(movieDetailIndex), ...Object.values(criterionDetailIndex)].forEach((record) => {
      if (!record?.title || record.mediaType !== "movie") return;
      const year = Number(record.year ?? String(record.releaseDate ?? "").slice(0, 4)) || "";
      moviesByIdentity.set(`${slugify(record.title)}|${year}`, record);
      if (!moviesByTitle.has(slugify(record.title))) moviesByTitle.set(slugify(record.title), record);
    });
    Object.values(tvDetailIndex).forEach((record) => {
      if (!record?.title) return;
      const year = Number(record.year ?? String(record.firstAirDate ?? "").slice(0, 4)) || "";
      tvByIdentity.set(`${slugify(record.title)}|${year}`, record);
      if (!tvByTitle.has(slugify(record.title))) tvByTitle.set(slugify(record.title), record);
    });
    curatedHydrationIndex = { version: indexVersion, moviesByIdentity, moviesByTitle, tvByIdentity, tvByTitle };
  }
  if (item.mediaType === "tv") {
    const liveTv = getTvLibraryItems().find((candidate) => {
      const candidateTitle = slugify(getDisplayTitle(candidate) || candidate.title);
      const candidateYear = Number(getItemMetadataOverride(candidate.id).year ?? candidate.year ?? candidate.startYear) || null;
      return candidate.id === item.id || (candidateTitle === itemTitle && (!itemYear || !candidateYear || candidateYear === itemYear));
    });
    if (liveTv) return liveTv;
    const hydrated = (
      tvDetailIndex[item.id] ??
      curatedHydrationIndex.tvByIdentity.get(`${itemTitle}|${itemYear || ""}`) ??
      (!itemYear ? curatedHydrationIndex.tvByTitle.get(itemTitle) : null) ??
      item
    );
    return hydrated === item ? item : { ...item, ...hydrated, id: hydrated.id ?? item.id };
  }
  if (item.mediaType !== "movie") return item;
  const liveMovie = getMovieLibraryItems().find((candidate) => {
    const candidateTitle = slugify(getDisplayTitle(candidate) || candidate.title);
    const candidateYear = Number(getItemMetadataOverride(candidate.id).year ?? candidate.year) || null;
    return candidate.id === item.id || (candidateTitle === itemTitle && (!itemYear || !candidateYear || candidateYear === itemYear));
  });
  if (liveMovie) return liveMovie;
  const hydrated = (
    movieDetailIndex[item.id] ??
    criterionDetailIndex[item.id] ??
    curatedHydrationIndex.moviesByIdentity.get(`${itemTitle}|${itemYear || ""}`) ??
    (!itemYear ? curatedHydrationIndex.moviesByTitle.get(itemTitle) : null) ??
    item
  );
  return hydrated === item ? item : { ...item, ...hydrated, id: hydrated.id ?? item.id };
}

function movieRecordMatches(record, itemTitle, itemYear) {
  if (!record?.title || record.mediaType !== "movie") return false;
  const sameTitle = slugify(record.title) === itemTitle;
  const recordYear = Number(record.year ?? String(record.releaseDate ?? "").slice(0, 4));
  const sameYear = !itemYear || recordYear === itemYear;
  return sameTitle && sameYear;
}

function tvRecordMatches(record, itemTitle, itemYear) {
  if (!record?.title) return false;
  const sameTitle = slugify(record.title) === itemTitle;
  const recordYear = Number(record.year ?? String(record.firstAirDate ?? "").slice(0, 4));
  const sameYear = !itemYear || recordYear === itemYear;
  return sameTitle && sameYear;
}

function renderMcuCollectionPage() {
  const collection = mcuCollectionIndex;
  if (!collection) return `<div class="empty">The MCU collection is still loading.</div>`;
  const infinityPhases = collection.phases.filter((phase) => phase.saga === "infinity");
  const multiversePhases = collection.phases.filter((phase) => phase.saga === "multiverse");
  const sectionMap = new Map(collection.sections.map((section) => [section.id, section]));

  return `
    <div class="mcu-page">
      <section class="mcu-hero">
        <button class="icon-button mcu-back" type="button" data-action="back-page" aria-label="Back" title="Back">&larr;</button>
        <img src="${escapeHtml(collection.heroImage)}" alt="" />
        <div class="mcu-hero-title">
          <h1>Marvel Cinematic Universe</h1>
          <p>Infinity, Multiverse, Legacy, and Beyond.</p>
        </div>
      </section>
      <nav class="mcu-jump-bar" aria-label="MCU collection sections">
        ${[
          ["infinity", "Infinity Saga"],
          ["multiverse", "Multiverse Saga"],
          ["defenders", "Defenders"],
          ["legacy-films", "Legacy Films"],
          ["legacy-tv", "Legacy TV"],
          ["animation", "Animation"],
        ]
          .map(([id, label]) => `<button type="button" data-mcu-jump="${id}">${label}</button>`)
          .join("")}
      </nav>
      <section class="lane mcu-lane" id="mcu-infinity">
        <div class="lane-head">
          <h2>Infinity Saga <span class="muted">(Phases 1-3)</span></h2>
        </div>
        <div class="carousel mcu-carousel">
          ${infinityPhases.map(renderMcuPhaseBreak).join("")}
        </div>
      </section>
      <section class="mcu-panel" id="mcu-multiverse">
        <div class="lane-head">
          <h2>Multiverse Saga <span class="muted">(Phases 4-6)</span></h2>
        </div>
        ${multiversePhases.map((phase) => renderMcuPhaseCarousel(phase, true)).join("")}
      </section>
      ${["defenders", "legacy-films", "legacy-tv", "animation"]
        .map((id) => renderMcuSection(sectionMap.get(id)))
        .join("")}
      <button class="icon-button neon-bottom-back" type="button" data-action="back-page" aria-label="Back" title="Back">Back</button>
    </div>
  `;
}

function renderMcuPhaseBreak(phase) {
  return `
    <article class="mcu-phase-break">
      <span>${escapeHtml(phase.title.replace(" ", "\n"))}</span>
    </article>
    ${phase.items.map((item) => renderMcuItemCard(item, phase.saga)).join("")}
  `;
}

function renderMcuPhaseCarousel(phase, compact = false) {
  return `
    <section class="lane mcu-sub-lane">
      <div class="lane-head">
        <h3>${escapeHtml(phase.title)}</h3>
      </div>
      <div class="carousel mcu-carousel ${compact ? "compact" : ""}">
        ${phase.items.map((item) => renderMcuItemCard(item, phase.saga)).join("")}
      </div>
    </section>
  `;
}

function renderMcuSection(section) {
  if (!section) return "";
  const content = section.groups
    ? section.groups.map((group) => `${renderMcuGroupBreak(group)}${group.items.map((item) => renderMcuItemCard(item, section.id)).join("")}`).join("")
    : section.items.map((item) => renderMcuItemCard(item, section.id)).join("");
  return `
    <section class="lane mcu-lane" id="mcu-${section.id}">
      <div class="lane-head">
        <h2>${escapeHtml(section.title)}</h2>
      </div>
      <div class="carousel mcu-carousel compact">
        ${content}
      </div>
    </section>
  `;
}

function renderMcuGroupBreak(group) {
  return `
    <article class="mcu-phase-break mcu-group-break">
      <span>${escapeHtml(group.title)}</span>
    </article>
  `;
}

function renderMcuItemCard(entry, context = null) {
  const detail = mcuDetailIndex[entry.id] ?? entry;
  const isMultiverseTv = detail.mediaType === "tv" && context === "multiverse";
  const isSectionTv = detail.mediaType === "tv" && context && context !== "multiverse";
  const target =
    isMultiverseTv
      ? `data-mcu-season-id="${detail.id}"`
      : isSectionTv
        ? `data-mcu-show-id="${detail.id}"`
      : `data-title-id="${detail.id}"`;
  const posterItem = isSectionTv
    ? { ...detail, posterOverrideUrl: detail.showPosterUrl ?? detail.posterUrl, posterA: "#171129", posterB: "#f0643a" }
    : { ...detail, posterA: "#171129", posterB: "#f0643a" };
  return `
    <article class="media-card library-card mcu-item-card ${detail.mediaType}" ${target} tabindex="0" title="${escapeHtml(detail.title)}">
      ${renderPosterBlock(posterItem)}
      ${renderMediaStoplightButton(detail)}
      <div class="card-body">
        <div class="card-title">${escapeHtml(detail.title)}</div>
        <div class="card-meta">${isMultiverseTv ? `Season ${detail.seasonNumber}` : detail.year ?? detail.years ?? ""}</div>
      </div>
    </article>
  `;
}

function renderMcuShowScreen(id) {
  const seed = mcuDetailIndex[id];
  if (!seed) return `<button class="icon-button title-back" type="button" data-action="back-title">Back</button><div class="empty">Show metadata is not available yet.</div>`;
  const seasons = Object.values(mcuDetailIndex)
    .filter((item) => item.mediaType === "tv" && item.tmdbId === seed.tmdbId)
    .sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0));
  return `
    <div class="tv-title-screen">
      <button class="icon-button title-back" type="button" data-action="back-title">Back</button>
      <section class="tv-program-hero">
        <div class="title-poster tv-program-poster" style="--poster-a:#171129;--poster-b:#f0643a">
          ${renderPosterBlock({ ...seed, posterOverrideUrl: seed.showPosterUrl ?? seed.posterUrl }, "title-poster-art")}
        </div>
        <div class="tv-program-copy">
          <div>
            <h1>${escapeHtml(seed.title)}</h1>
            <p class="tv-meta-line">${escapeHtml(`${seed.years ?? seed.year ?? "Date pending"} / ${seed.rating || "NR"} / ${seed.averageRuntime ? `${seed.averageRuntime} min episodes` : "Runtime pending"} / ${(seed.genres ?? []).join(", ")}`)}</p>
          </div>
          ${renderTvRatings(seed)}
          <div class="title-actions tv-actions">
            <button class="play-button" type="button" data-mcu-season-id="${seasons[0]?.id ?? ""}">Play</button>
            ${renderActionIconButton("watchlist", "Add to Watchlist")}
            ${renderActionIconButton("watched", "Mark as Watched")}
          </div>
          <p class="tv-overview">${escapeHtml(seed.summary || "Series summary pending.")}</p>
        </div>
      </section>
      <section class="lane">
        <div class="lane-head">
          <h2>${seasons.length} ${seasons.length === 1 ? "Season" : "Seasons"}</h2>
          <span class="muted">In this collection</span>
        </div>
        <div class="carousel">
          ${seasons.map((season) => renderMcuItemCard(season, "multiverse")).join("")}
        </div>
      </section>
      ${renderCastShelf(seed.cast ?? [])}
    </div>
  `;
}

function renderMcuSeasonScreen(id) {
  const detail = mcuDetailIndex[id];
  if (!detail) return `<button class="icon-button title-back" type="button" data-action="back-title">Back</button><div class="empty">Season metadata is not available yet.</div>`;
  return `
    <div class="tv-title-screen">
      <button class="icon-button title-back" type="button" data-action="back-title">Back</button>
      <section class="tv-program-hero">
        <div class="title-poster tv-program-poster" style="--poster-a:#171129;--poster-b:#f0643a">
          ${renderPosterBlock({ ...detail, posterOverrideUrl: detail.season?.posterUrl ?? detail.posterUrl }, "title-poster-art")}
        </div>
        <div class="tv-program-copy">
          <div>
            <h1>${escapeHtml(detail.title)}</h1>
            <p class="title-tagline">Season ${detail.seasonNumber}</p>
            <p class="tv-meta-line">${escapeHtml(`${detail.season?.airDate ? formatDisplayDate(detail.season.airDate) : detail.year ?? "Date pending"} / ${detail.rating || "NR"} / ${detail.averageRuntime ? `${detail.averageRuntime} min episodes` : "Runtime pending"} / ${(detail.genres ?? []).join(", ")}`)}</p>
          </div>
          ${renderTvRatings(detail)}
          <div class="title-actions tv-actions">
            <button class="play-button" type="button">Play</button>
            ${renderActionIconButton("watchlist", "Add to Watchlist")}
            ${renderActionIconButton("watched", "Mark as Watched")}
          </div>
          <p class="tv-overview">${escapeHtml(detail.season?.overview || detail.summary || "Season summary pending.")}</p>
        </div>
      </section>
      ${renderMcuEpisodeWheel(detail)}
      ${renderCastShelf(detail.cast ?? [])}
    </div>
  `;
}

function renderMcuEpisodeWheel(detail) {
  const episodes = detail.season?.episodes ?? [];
  if (!episodes.length) return "";
  return `
    <section class="lane">
      <div class="lane-head">
        <h2>Episodes</h2>
        <span class="muted">${episodes.length} available</span>
      </div>
      <div class="episode-carousel">
        ${episodes.map(renderMcuEpisodeCard).join("")}
      </div>
    </section>
  `;
}

function renderMcuEpisodeCard(episode) {
  return `
    <article class="episode-card" tabindex="0">
      <div class="episode-still">${episode.stillUrl ? `<img src="${escapeHtml(episode.stillUrl)}" alt="" loading="lazy" />` : `<span>${escapeHtml(formatEpisodeNumber(episode))}</span>`}</div>
      <div class="episode-card-copy">
        <div class="card-title">${escapeHtml(formatEpisodeNumber(episode))}: ${escapeHtml(episode.title)}</div>
        <p>${escapeHtml(episode.overview || "Episode summary pending.")}</p>
      </div>
    </article>
  `;
}

function getVisibleCollections() {
  const cacheKey = `${getMetadataCacheKey()}:${collectionOverrides.updatedAt ?? "no-collection-overrides"}`;
  if (getVisibleCollections.cache?.key === cacheKey) return getVisibleCollections.cache.items;
  const mcu = {
    id: "mcu",
    title: "Marvel Cinematic Library",
    description: "Sagas, defenders, legacy branches, animation, and timeline wandering.",
    itemIds: Object.keys(mcuDetailIndex).slice(0, 8),
    posterA: "#171129",
    posterB: "#f0643a",
    buttonImage: "./assets/collections/mcu/mcu-button.png",
  };
  const criterion = {
    id: "criterion",
    title: "The Criterion Collection",
    description: "Archive, boxed sets, Eclipse shelves, and curated world-cinema pathways.",
    itemIds: criterionCollectionIndex?.archiveItems?.map((item) => item.id).slice(0, 8) ?? [],
    posterA: "#171410",
    posterB: "#c5a46a",
    buttonImage: "./assets/collections/criterion/criterion-button.png",
  };
  const byId = new Map([mcu, criterion, ...curatedCollectionPages.map(getCuratedCollectionCard)].map((collection) => [collection.id, collection]));
  Object.values(collectionOverrides.collections ?? {}).forEach((collection) => {
    if (collection.deleted) byId.delete(collection.id);
    else byId.set(collection.id, { ...(byId.get(collection.id) ?? {}), ...collection });
  });
  const items = [...byId.values()].filter(collectionHasVisibleMedia);
  getVisibleCollections.cache = { key: cacheKey, items };
  return items;
}

function getSortedCollections(collections) {
  const sorted = [...collections].sort((a, b) => a.title.localeCompare(b.title));
  return state.collectionSort === "za" ? sorted.reverse() : sorted;
}

function getGroupedCollections() {
  const genreCollectionIds = ["action", "comedy", "documentary", "drama", "fantasy", "horror", "romance", "sci-fi", "sports", "western"];
  const groups = [
    { title: "Vaults", ids: ["a24", "criterion", "defa", "disney", "hammer", "hbo"] },
    { title: "Sagas", ids: ["arrowverse", "james-bond", "dc-animation", "mcu", "kaiju", "star-trek", "star-wars", "universal-monsters"] },
    {
      title: "Aisles",
      ids: [
        "action",
        "comedy",
        "documentary",
        "drama",
        "fantasy",
        "horror",
        "romance",
        "sci-fi",
        "sports",
        "western",
      ],
    },
    { title: "Boxed Sets", ids: ["animation", "black-excellence", "cult-films", "endless-anime-odyssey", "exploitation", "plan-9-from-the-b-movie-aisle"] },
    { title: "Worlds", ids: ["cinema-of-india"] },
    { title: "Profiles", ids: ["david-cronenberg", "george-formby", "martin-scorseses-world-cinema-project", "tom-hanks", "wes-anderson"] },
  ];
  const collectionMap = new Map(getVisibleCollections().map((collection) => [collection.id, collection]));
  Object.values(collectionOverrides.collections ?? {}).forEach((collection) => {
    if (collection.deleted) collectionMap.delete(collection.id);
    else collectionMap.set(collection.id, collection);
  });
  return groups.map((group) => ({
    title: group.title,
    collections: getSortedCollections([
      ...(group.title === "Aisles"
        ? [
            ...genreCollectionIds.map((id) => collectionMap.get(id)).filter(Boolean),
            ...group.ids.filter((id) => !genreCollectionIds.includes(id)).map((id) => collectionMap.get(id)).filter(Boolean),
          ]
        : group.ids.map((id) => collectionMap.get(id)).filter(Boolean)),
      ...Object.values(collectionOverrides.collections ?? {}).filter((collection) => group.title !== "Aisles" && !collection.deleted && collection.collectionType === group.title && !group.ids.includes(collection.id)),
    ]),
  }));
}

function getPlaybackOriginLabel(collectionId) {
  if (!collectionId) return "";
  const selected = getGroupedCollections()
    .flatMap((group) => group.collections.map((collection) => ({ ...collection, groupTitle: group.title })))
    .find((collection) => collection.id === collectionId);
  if (!selected) return "";
  const title = String(selected.title ?? "").trim();
  if (!title) return "";
  if (selected.groupTitle === "Aisles") return `${title.replace(/\s+Aisle$/i, "")} Aisle`;
  if (selected.groupTitle === "Vaults") return `${title.replace(/\s+(?:Vault|Collection|Library)$/i, "")} Vault`;
  if (selected.groupTitle === "Profiles") return `${title.replace(/(?:'s)?\s+Collection$/i, "")} Collection`;
  return title;
}

function renderCollectionGroup(title, collections) {
  return `
    <section class="collection-group" id="collection-group-${slugify(title)}">
      <div class="lane-head">
        <h2>${escapeHtml(title)}</h2>
        <span class="muted">${collections.length} collection${collections.length === 1 ? "" : "s"}</span>
      </div>
      <div class="carousel collection-carousel">
        ${collections.map(renderCollectionCard).join("") || `<div class="empty">No collections yet.</div>`}
      </div>
    </section>
  `;
}

function getCuratedCollectionPage(id) {
  const collection = curatedCollectionPages.find((collection) => collection.id === id);
  const override = collectionOverrides.collections?.[id];
  if (override?.deleted) return null;
  if (override) {
    const base = collection ? withoutFixedCollectionNewArrivals(mergeCuratedManifestCollection(collection)) : {};
    return {
      ...base,
      ...override,
      sections: (override.carousels ?? []).map((carousel, index) => ({ id: slugify(carousel.title || `carousel-${index + 1}`), title: carousel.title, button: carousel.button, items: (carousel.itemIds ?? []).map((itemId) => getCollectionItem(itemId) ?? getTitleItem(itemId)).filter(Boolean) })),
    };
  }
  return collection ? withoutFixedCollectionNewArrivals(mergeCuratedManifestCollection(collection)) : null;
}

function mergeCuratedManifestCollection(collection) {
  const generated = curatedManifestIndex?.collections?.[collection.id];
  if (!generated?.sections?.length) return collection;

  const localSectionById = new Map(collection.sections.map((section) => [section.id, section]));
  const generatedSections = generated.sections
    .filter((section) => section.items?.length)
    .map((section) => ({
      id: section.id,
      title: getCuratedSectionDisplayTitle(collection.id, section),
      menuLabel: getGeneratedCuratedMenuLabel(collection.id, section, localSectionById),
      items: section.items.map((item) => curatedManifestItem(item, section.title)),
    }));
  const sections = generatedSections.filter((section) => section.id !== "new-arrivals");
  const menuRows = getCuratedGeneratedMenuRows(collection, sections);
  const orderedIds = menuRows.flat();
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const orderedSections = [
    ...orderedIds.map((id) => sectionById.get(id)).filter(Boolean),
    ...sections.filter((section) => !orderedIds.includes(section.id)),
  ];

  return {
    ...collection,
    sections: orderedSections,
    menuRows,
  };
}

function withoutFixedCollectionNewArrivals(collection) {
  if (!collection?.sections) return collection;
  const sections = collection.sections.filter((section) => section.id !== "new-arrivals");
  const menuRows = (collection.menuRows ?? [])
    .map((row) => row.filter((id) => id !== "new-arrivals"))
    .filter((row) => row.length);
  return { ...collection, sections, menuRows: menuRows.length ? menuRows : buildCuratedMenuRows(sections.map((section) => section.id)) };
}

function getGeneratedCuratedMenuLabel(collectionId, section, localSectionById) {
  if (collectionId === "black-excellence") {
    const label = getUpnSectionLabel(section.id);
    if (label) return label === "Television Classics" ? "Television" : label;
  }
  return localSectionById.get(section.id)?.menuLabel;
}

function getCuratedSectionDisplayTitle(collectionId, section) {
  return collectionId === "black-excellence" ? getUpnSectionLabel(section.id) ?? section.title : section.title;
}

function getUpnSectionLabel(sectionId) {
  return {
    cinema: "Cinema",
    "tv-classics": "Television Classics",
    "umoja-unity-the-prestige-collection": "The Prestige Collection",
    "kujichagulia-self-determination-stand-up-comedy": "Stand-Up Comedy",
    "ujima-collective-work-and-responsibility-sketches-and-animation": "Sketches & Animation",
    "ujamaa-cooperative-economics-horror-because-it-doesn-t-fit-anywhere-else": "Horror",
    "nia-purpose-comedy": "Comedy",
    "kumbaaa-creativity-music-and-culture": "Music & Culture",
    "imani-faith-afrofuturism-and-sci-fi": "Afrofuturism & Sci-Fi",
  }[sectionId];
}

function canonicalCollectionSectionId(collectionId, sectionId) {
  const normalized = slugify(sectionId || "featured");
  if (collectionId !== "black-excellence") return normalized;
  return {
    television: "tv-classics",
    "the-prestige-collection": "umoja-unity-the-prestige-collection",
    "stand-up-comedy": "kujichagulia-self-determination-stand-up-comedy",
    "sketches-and-animation": "ujima-collective-work-and-responsibility-sketches-and-animation",
    "sketches-animation": "ujima-collective-work-and-responsibility-sketches-and-animation",
    horror: "ujamaa-cooperative-economics-horror-because-it-doesn-t-fit-anywhere-else",
    comedy: "nia-purpose-comedy",
    "music-and-culture": "kumbaaa-creativity-music-and-culture",
    "afrofuturism-and-sci-fi": "imani-faith-afrofuturism-and-sci-fi",
  }[normalized] ?? normalized;
}

function getCuratedGeneratedMenuRows(collection, sections) {
  const ids = new Set(sections.map((section) => section.id));
  if (collection.id === "black-excellence") {
    return [
      ["cinema", "tv-classics"].filter((id) => ids.has(id)),
      [
        "umoja-unity-the-prestige-collection",
        "kujichagulia-self-determination-stand-up-comedy",
        "ujima-collective-work-and-responsibility-sketches-and-animation",
      ].filter((id) => ids.has(id)),
      [
        "ujamaa-cooperative-economics-horror-because-it-doesn-t-fit-anywhere-else",
        "nia-purpose-comedy",
        "kumbaaa-creativity-music-and-culture",
        "imani-faith-afrofuturism-and-sci-fi",
      ].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "kaiju") {
    return [
      ["showa-1954-1975", "heisei-1984-1995", "millennium-1999-2004", "reiwa-2016-present"].filter((id) => ids.has(id)),
      ["monsterverse", "king-kong", "all-monsters-attack", "mecha", "other-encounters"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "horror") {
    return [
      ["killers", "slashers", "creature-features", "supernatural", "sci-fi-horror"].filter((id) => ids.has(id)),
      ["cult-experimental", "found-footage", "evil-puppets", "relentless-pursuers"].filter((id) => ids.has(id)),
      ["spooky-kids-tv", "spoopy-kids-movies", "gateway-horror"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "romance") {
    return [
      ["romcoms", "romdrams", "musicals", "historical", "coming-of-age-and-ya"].filter((id) => ids.has(id)),
      ["paranormal-and-fantasy", "action-and-thriller", "lgbtq", "erotica"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "sci-fi") {
    return [
      ["alien-invaders", "time-travel", "space-opera"].filter((id) => ids.has(id)),
      ["hard-sci-fi", "military-sci-fi", "devils-in-the-machine", "cyberpunk", "steampunk"].filter((id) => ids.has(id)),
      ["science-experiments-gone-wrong", "weird-new-worlds", "climate-disasters", "dystopia", "post-apocalypse"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "western") {
    return [
      ["indigenous-heroes", "manifest-destiny", "singing-cowboys"].filter((id) => ids.has(id)),
      ["outlaws", "survivalism", "borderlands"].filter((id) => ids.has(id)),
      ["revisionist-westerns", "anti-western", "neo-western", "weird-westerns"].filter((id) => ids.has(id)),
      ["spaghetti-westerns", "oosterns", "eastern-influence"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "comedy") {
    return [
      ["marx-brothers", "slapstick", "satire", "farce", "parody", "mockumentary"].filter((id) => ids.has(id)),
      ["teen", "family", "buddy-comedies", "odd-couples", "fish-out-of-water", "road-trips"].filter((id) => ids.has(id)),
      ["black-excellence", "dark-comedy", "observational", "stoner-comedy", "indefensible-stupidity"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "drama") {
    return [
      ["prestige-oscar-bait", "historical", "period", "character-driven", "coming-of-age"].filter((id) => ids.has(id)),
      ["romantic-drama", "social-drama", "working-class", "family-drama", "melodrama"].filter((id) => ids.has(id)),
      ["tragedy", "biopics", "crime-and-legal", "psychological", "war"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "sports") {
    return [
      ["biopic", "documentary", "comedy", "drama"].filter((id) => ids.has(id)),
      ["combat-sports", "extreme-sports", "racing"].filter((id) => ids.has(id)),
      ["teams", "underdogs", "individual-excellence"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "disney") {
    return [
      ["animated-classics", "live-action-classics", "renaissance", "post-renaissance", "modern-times"].filter((id) => ids.has(id)),
      ["pixar", "animated-tv", "muppetmania", "shorts", "blast-from-the-past", "other-animated-films"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  if (collection.id === "endless-anime-odyssey") {
    return [
      ["choose-you", "shonen-giants", "toonami-fever", "monster-collectors"].filter((id) => ids.has(id)),
      ["eternal-episode-abyss", "anime-midnight", "anime-chaos-energy", "extras"].filter((id) => ids.has(id)),
    ].filter((row) => row.length);
  }
  return buildCuratedMenuRows(sections.map((section) => section.id), collection.id === "disney" ? 5 : 6);
}

function curatedManifestItem(item, genre = "Collection") {
  const year = item.year ? Number(item.year) : null;
  return {
    id: item.id ?? `curated-${slugify(item.title)}-${year ?? "tba"}`,
    title: item.title,
    year,
    mediaType: item.mediaType ?? "movie",
    season: item.season ?? null,
    genre,
    status: "complete",
    country: "Curated",
    posterA: "#171717",
    posterB: "#c6a35d",
    posterUrl: item.posterUrl ?? null,
    backdropUrl: item.backdropUrl ?? null,
    posterCode: item.posterCode ?? buildPosterCode(item.title),
    targetCollectionId: item.targetCollectionId ?? null,
    franchiseCarousels: item.franchiseCarousels ?? [],
    watchProgress: 0,
    inWatchlist: false,
    addedAt: year ? `${year}-01-01` : "2000-01-01",
    curatedSource: item.source ?? null,
  };
}

function getCuratedCollectionCard(collection) {
  return {
    id: collection.id,
    title: collection.title,
    description: collection.description,
    itemIds: getCollectionPageItemIds(collection),
    posterA: collection.posterA,
    posterB: collection.posterB,
    buttonImage: collection.buttonImage ?? collection.heroImage ?? null,
  };
}


function collectionHasVisibleMedia(collection) {
  if (state.libraryMode !== "media") return true;
  return getLiveCollectionItemIds(collection).length > 0;
}

function getRenderableCollectionSections(collection) {
  const baseSections = collection.sections ?? [];
  const byId = new Map(baseSections.map((section) => [section.id, { ...section, items: [...(section.items ?? [])] }]));
  getAllocatedCollectionEntries(collection).forEach((entry) => {
    const sectionId = canonicalCollectionSectionId(collection.id, entry.sectionId);
    const existing = byId.get(sectionId) ?? { id: sectionId, title: entry.sectionTitle, items: [] };
    if (!(existing.items ?? []).some((item) => item.id === entry.item.id)) existing.items = [...(existing.items ?? []), entry.item];
    byId.set(sectionId, existing);
  });
  if (state.libraryMode !== "media") return [...byId.values()];
  getFolderCollectionEntries(collection).forEach((entry) => {
    const sectionId = canonicalCollectionSectionId(collection.id, entry.sectionSlug);
    if (byId.has(sectionId)) return;
    byId.set(sectionId, { id: sectionId, title: entry.section || "Unsorted", items: [] });
  });
  return [...byId.values()];
}

function getCollectionPageItemIds(collection) {
  const ids = new Set(collection.itemIds ?? []);
  (collection.sections ?? []).forEach((section) => (section.items ?? []).forEach((item) => ids.add(item.id)));
  getFolderCollectionEntries(collection).forEach((entry) => ids.add(entry.item.id));
  getAllocatedCollectionEntries(collection).forEach((entry) => ids.add(entry.item.id));
  return [...ids];
}

function getLiveCollectionItemIds(collection) {
  const ids = new Set();
  (collection.itemIds ?? []).forEach((id) => { if (getCollectionItem(id, { mediaOnly: true })) ids.add(id); });
  (collection.sections ?? []).forEach((section) => { getLiveCollectionSectionItems(collection, section).forEach((item) => ids.add(item.id)); });
  getFolderCollectionEntries(collection).forEach((entry) => ids.add(entry.item.id));
  getAllocatedCollectionEntries(collection).forEach((entry) => ids.add(entry.item.id));
  return [...ids];
}

function getLiveCollectionSectionItems(collection, section) {
  const byId = new Map();
  const explicitItems = section.items ?? [];
  const isFranchiseOnlySection = explicitItems.length > 0 && explicitItems.every((item) => item.mediaType === "franchise");

  explicitItems.forEach((item) => {
    if (item.mediaType === "franchise") {
      byId.set(item.id, item);
      return;
    }
    const liveItem = getCollectionItem(item.id, { mediaOnly: true });
    if (liveItem) byId.set(liveItem.id, liveItem);
  });

  if (!isFranchiseOnlySection) {
    getFolderCollectionEntries(collection, section).forEach((entry) => { if (!byId.has(entry.item.id)) byId.set(entry.item.id, entry.item); });
    getAllocatedCollectionEntries(collection, section).forEach((entry) => { if (!byId.has(entry.item.id)) byId.set(entry.item.id, entry.item); });
  }

  return [...byId.values()].sort(sortCollectionItemsForDisplay);
}

function getAllocatedCollectionEntries(collection, section = null) {
  const entries = [];
  Object.entries(metadataOverrides?.items ?? {}).forEach(([itemId, stored]) => {
    const allocations = stored?.metadata?.collectionAllocations ?? stored?.collectionAllocations ?? [];
    allocations.forEach((allocation) => {
      if (allocation.collectionId !== collection.id) return;
      const sectionId = canonicalCollectionSectionId(collection.id, allocation.sectionId || "featured");
      if (section && !collectionMatchKeys(section).has(slugify(sectionId))) return;
      const item = getTitleItem(itemId);
      if (!item) return;
      entries.push({ item, sectionId: slugify(sectionId), sectionTitle: allocation.pathLabels?.at(-1) ?? "Featured" });
    });
  });
  return entries;
}

function sortCollectionItemsForDisplay(a, b) {
  const yearA = Number(a.year) || 9999;
  const yearB = Number(b.year) || 9999;
  if (yearA !== yearB) return yearA - yearB;
  return String(a.title ?? "").localeCompare(String(b.title ?? ""));
}

function getFolderCollectionEntries(collection, section = null) {
  const collectionKeys = collectionMatchKeys(collection);
  const sectionKeys = section ? collectionMatchKeys(section) : null;
  return getGeneratedCollectionFolderEntries().filter((entry) => {
    if (!collectionKeys.has(entry.collectionSlug)) return false;
    if (!sectionKeys) return true;
    return sectionKeys.has(entry.sectionSlug);
  });
}

function collectionMatchKeys(entity) {
  return new Set([entity?.id, entity?.title, entity?.label, entity?.name].filter(Boolean).map((value) => slugify(String(value))));
}

function getGeneratedCollectionFolderEntries() {
  const cacheKey = [generatedMetadata.generatedAt ?? "pending", generatedMetadata.records?.length ?? 0, generatedMetadata.unmatchedFiles?.length ?? 0].join(":");
  if (getGeneratedCollectionFolderEntries.cache?.key === cacheKey) return getGeneratedCollectionFolderEntries.cache.entries;
  const byItemAndSection = new Map();
  (generatedMetadata.records ?? []).forEach((record) => {
    (record.files ?? []).forEach((file) => {
      const pathInfo = getMovieCollectionPathInfo(file?.path);
      if (!pathInfo) return;
      const item = getGeneratedCollectionRecordItem(record, file, pathInfo);
      if (!item) return;
      byItemAndSection.set(item.id + "::" + pathInfo.collectionSlug + "::" + pathInfo.sectionSlug, { ...pathInfo, item });
    });
  });
  (generatedMetadata.unmatchedFiles ?? []).forEach((file) => {
    const pathInfo = getMovieCollectionPathInfo(file?.path);
    if (!pathInfo || isLikelyBonusFeature(file)) return;
    const item = getCollectionFolderItemFromUnmatchedFile(file, pathInfo);
    if (!item) return;
    byItemAndSection.set(item.id + "::" + pathInfo.collectionSlug + "::" + pathInfo.sectionSlug, { ...pathInfo, item });
  });
  const entries = [...byItemAndSection.values()];
  getGeneratedCollectionFolderEntries.cache = { key: cacheKey, entries };
  return entries;
}

function getCollectionFolderItemFromUnmatchedFile(file, pathInfo) {
  const tvShow = getTvShowFromCollectionFile(file, pathInfo);
  if (tvShow) return tvShow;
  if (file.parsed?.mediaType !== "movie" || isLikelyBonusFeature(file)) return null;
  return scannedMovieFromFile(file);
}

function getTvShowFromCollectionFile(file, pathInfo) {
  const parsed = file?.parsed ?? {};
  const titleSource = [parsed.title, file?.path].filter(Boolean).join(" ");
  const hasEpisodeNumber = /\bS\d{1,2}\s*E\d{1,3}\b/i.test(titleSource) || /\bSeason\s+\d+\b/i.test(String(file?.path ?? ""));
  const sectionLooksTv = /\btv\b|television|episodes?|series|cartoons?/i.test(pathInfo.section ?? "");
  if (!hasEpisodeNumber && !sectionLooksTv) return null;
  const showFolder = getCollectionShowFolderName(file?.path);
  const showTitle = showFolder?.replace(/\s*\((19|20)\d{2}\)\s*$/, "").trim() || cleanEpisodeSeriesTitle(parsed.title);
  if (!showTitle) return null;
  const normalized = normalizeTitleForMatch(showTitle);
  const show = getAllTvTitleItems().find((item) => normalizeTitleForMatch(item.title) === normalized);
  const base = show ?? { id: "scanned-tv-" + slugify(showTitle), mediaType: "tv", title: showTitle, year: String(showFolder ?? file?.path ?? "").match(/\b(19|20)\d{2}\b/)?.[0] ?? parsed.year ?? "Year pending", genre: pathInfo.section || "TV", status: "scanned", posterA: file.art?.colors?.[0] ?? "#202329", posterB: file.art?.colors?.[1] ?? "#d8b35d", posterCode: buildPosterCode(showTitle), addedAt: file.modifiedAt ?? generatedMetadata.generatedAt };
  return { ...base, mediaType: "tv", hasNewEpisodes: true, addedAt: file.modifiedAt ?? base.addedAt };
}

function getCollectionShowFolderName(filePath) {
  const parts = String(filePath ?? "").split(/[\\/]+/).filter(Boolean);
  const collectionsIndex = parts.findIndex((part, index) => part.toLowerCase() === "collections" && parts[index - 1]?.toLowerCase() === "movies");
  if (collectionsIndex < 0) return "";
  return parts[collectionsIndex + 4] ?? "";
}

function cleanEpisodeSeriesTitle(title = "") {
  return String(title).replace(/\bS\d{1,2}\s*E\d{1,3}\b.*$/i, "").replace(/[-_=]+\s*$/, "").trim();
}

function getGeneratedCollectionRecordItem(record, file, pathInfo) {
  if (record.mediaType === "movie") return getCollectionItem(record.id, { mediaOnly: true }) ?? scannedMovieFromRecord(record, file);
  if (record.mediaType === "tv") return getTvLibraryItems().find((item) => item.id === record.id) ?? getTvShowFromCollectionFile(file, pathInfo);
  return null;
}

function getMovieCollectionPathInfo(filePath) {
  const parts = String(filePath ?? "").split(/[\\/]+/).filter(Boolean);
  const collectionsIndex = parts.findIndex((part, index) => part.toLowerCase() === "collections" && parts[index - 1]?.toLowerCase() === "movies");
  if (collectionsIndex < 0 || !parts[collectionsIndex + 2]) return null;
  const group = parts[collectionsIndex + 1] ?? "";
  const collection = parts[collectionsIndex + 2] ?? "";
  const section = parts[collectionsIndex + 3] ?? "Unsorted";
  return { group, collection, section, groupSlug: slugify(group), collectionSlug: slugify(collection), sectionSlug: slugify(section) };
}

function getMovieCollections() {
  const movieOnlyCollections = mediaCollections.filter((collection) =>
    collection.itemIds.some((id) => getCollectionItem(id)?.mediaType === "movie"),
  );
  return [...movieOnlyCollections, ...movieMockCollections];
}

function getTvCollections() {
  const tvOnlyCollections = mediaCollections.filter((collection) =>
    collection.itemIds.some((id) => getCollectionItem(id)?.mediaType === "tv"),
  );
  return [...tvOnlyCollections, ...tvMockCollections];
}

function getTvPlaylistItems() {
  return getMixtapeItems().filter((item) => item.mediaType === "tv");
}

function hasPlayableMediaFiles(item) {
  const files = item?.files ?? getMetadataRecordForItem(item)?.files ?? [];
  return files.length > 0;
}

function getMovieLibraryItems() {
  const cacheKey = getMetadataCacheKey();
  if (getMovieLibraryItems.cache?.key === cacheKey) return getMovieLibraryItems.cache.items;
  const items = timed("movie library", () => {
    const seeded = movies.map((movie) => withPlaybackState(movie));
    const visibleSeeded = state.libraryMode === "media" ? seeded.filter(hasPlayableMediaFiles) : seeded;
    const seededIds = new Set(visibleSeeded.map((movie) => movie.id));
    const seededTitles = new Set(visibleSeeded.map((movie) => normalizeTitleForMatch(movie.title)));
    const generated = getScannedMovieItems().filter((movie) => !seededIds.has(movie.id) && !seededTitles.has(normalizeTitleForMatch(movie.title)));
    return dedupeMovieLibraryItems(applyMergedMediaItems([...visibleSeeded, ...generated])).filter((item) => !isItemDeleted(item.id));
  });
  getMovieLibraryItems.cache = { key: cacheKey, items };
  sidebarMediaCounts.movies = items.length;
  return items;
}

function getTvLibraryItems() {
  const cacheKey = getMetadataCacheKey();
  if (getTvLibraryItems.cache?.key === cacheKey) return getTvLibraryItems.cache.items;
  const items = timed("tv library", () => {
    const shows = applyMergedMediaItems(getAllTvTitleItems()).filter((show) => !isItemDeleted(show.id)).map((show) => {
      const latestTvFileDate = getLatestTvFileDate(show);
      return withPlaybackState({
        ...show,
        addedAt: latestTvFileDate ?? show.addedAt,
        hasNewEpisodes: show.hasNewEpisodes || Boolean(latestTvFileDate),
      });
    });
    if (state.libraryMode !== "media") return shows;
    return shows.filter((show) => hasPlayableMediaFiles(show));
  });
  getTvLibraryItems.cache = { key: cacheKey, items };
  sidebarMediaCounts.tv = items.length;
  return items;
}

function getScannedMovieItems() {
  const cacheKey = getMetadataCacheKey();
  if (getScannedMovieItems.cache?.key === cacheKey) return getScannedMovieItems.cache.items;
  const records = (generatedMetadata.records ?? [])
    .filter((record) => record.mediaType === "movie" && record.files?.length && !record.files.every(isLikelyBonusFeature) && !movies.some((movie) => movie.id === record.id))
    .map((record) => scannedMovieFromRecord(record, record.files[0]));
  const claimedPaths = new Set(records.flatMap((item) => item.files ?? []).map((file) => normalizeMediaFilePath(file.path)).filter(Boolean));
  const unmatched = (generatedMetadata.unmatchedFiles ?? [])
    .filter((file) => file.parsed?.mediaType === "movie" && !isLikelyBonusFeature(file) && !claimedPaths.has(normalizeMediaFilePath(file.path)))
    .map(scannedMovieFromFile);
  const byId = new Map();
  [...records, ...unmatched].forEach((item) => {
    if (!byId.has(item.id)) byId.set(item.id, item);
  });
  const items = [...byId.values()];
  getScannedMovieItems.cache = { key: cacheKey, items };
  return items;
}

function normalizeMediaFilePath(filePath) {
  return String(filePath ?? "").replace(/\//g, "\\").toLowerCase();
}

function movieLibraryIdentity(item) {
  const override = getItemMetadataOverride(item.id);
  const title = override.title ?? override.metadata?.title ?? getDisplayTitle(item) ?? item.title;
  const year = override.year ?? override.metadata?.year ?? item.year ?? "tba";
  return `${normalizeTitleForMatch(title)}|${year}`;
}

function movieLibraryItemScore(item) {
  const override = getItemMetadataOverride(item.id);
  const record = getMetadataRecordForItem(item);
  return [
    override.metadata?.title || override.title,
    override.metadata?.posterUrl || override.posterUrl,
    override.metadata?.summary || override.summary,
    record?.art?.posterUrl,
    item.posterUrl,
    item.summary,
    !/^(scan(?:ned)?-movie|scan-provider)-/.test(item.id),
  ].filter(Boolean).length;
}

function dedupeMovieLibraryItems(items) {
  const groups = [];
  const groupByIdentity = new Map();
  const groupByPath = new Map();
  items.forEach((item) => {
    const identity = movieLibraryIdentity(item);
    const paths = (item.files ?? getMetadataRecordForItem(item)?.files ?? []).map((file) => normalizeMediaFilePath(file.path)).filter(Boolean);
    let group = paths.map((filePath) => groupByPath.get(filePath)).find(Boolean) ?? groupByIdentity.get(identity);
    if (!group) {
      group = [];
      groups.push(group);
    }
    group.push(item);
    groupByIdentity.set(identity, group);
    paths.forEach((filePath) => groupByPath.set(filePath, group));
  });
  return groups.map((group) => {
    const ranked = [...group].sort((a, b) => movieLibraryItemScore(b) - movieLibraryItemScore(a));
    const primary = ranked[0];
    const files = [...new Map(group.flatMap((item) => item.files ?? getMetadataRecordForItem(item)?.files ?? []).filter((file) => file?.path).map((file) => [normalizeMediaFilePath(file.path), file])).values()];
    return { ...primary, files, duplicateItemIds: group.map((item) => item.id) };
  });
}

function scannedMovieFromRecord(record, file) {
  return withPlaybackState({
    id: record.id,
    mediaType: "movie",
    title: record.title,
    year: record.year ?? file?.parsed?.year ?? "Year pending",
    country: record.country ?? "Scanned",
    genre: getPrimaryGenreFromRecord(record) ?? "Unsorted",
    status: "scanned",
    addedAt: file?.modifiedAt ?? generatedMetadata.generatedAt,
    posterA: record.art?.colors?.[0] ?? "#202329",
    posterB: record.art?.colors?.[1] ?? "#d8b35d",
    posterUrl: record.art?.posterUrl ?? null,
    posterCode: buildPosterCode(record.title),
    files: record.files ?? [],
    scannedRecordId: record.id,
  });
}

function scannedMovieFromFile(file) {
  const title = file.parsed?.title || cleanScannedTitleFromPath(file.path);
  const year = file.parsed?.year ?? String(file.path).match(/\b(19|20)\d{2}\b/)?.[0] ?? "Year pending";
  return withPlaybackState({
    id: `scanned-movie-${slugify(`${title}-${year}`)}`,
    mediaType: "movie",
    title,
    year,
    country: "Scanned",
    genre: "Unsorted",
    status: "scanned",
    addedAt: file.modifiedAt ?? generatedMetadata.generatedAt,
    posterA: file.art?.colors?.[0] ?? "#202329",
    posterB: file.art?.colors?.[1] ?? "#d8b35d",
    posterUrl: file.art?.posterUrl ?? file.provider?.posterUrl ?? null,
    posterCode: buildPosterCode(title),
    files: [{ path: file.path, size: file.size, modifiedAt: file.modifiedAt, parsed: file.parsed, confidence: 0.5 }],
  });
}

function withPlaybackState(item) {
  const resume = getResumeEntryForItem(item);
  const record = getMetadataRecordForItem(item);
  const files = item.files ?? record?.files ?? [];
  const latestFile = files
    .filter((file) => file.modifiedAt)
    .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)))[0];
  const enriched = files.length
    ? {
        ...item,
        files,
        addedAt: item.addedAt ?? latestFile?.modifiedAt ?? generatedMetadata.generatedAt,
        status: item.status === "unmatched" ? "scanned" : item.status,
      }
    : item;
  const displayed = { ...enriched, title: getDisplayTitle(enriched) };
  return resume ? { ...displayed, watchProgress: resume.progress, lastPlayedAt: resume.updatedAt } : displayed;
}

function getLatestTvFileDate(show) {
  const record = metadataIndex[show.id] ?? generatedMetadata.records?.find((item) => item.id === show.id || normalizeTitleForMatch(item.title) === normalizeTitleForMatch(show.title));
  return (record?.files ?? [])
    .map((file) => file.modifiedAt)
    .filter(Boolean)
    .sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null;
}

function getResumeLibraryItems(kind = null) {
  return getStoredResumeEntries()
    .filter((entry) => !kind || entry.kind === kind)
    .map((entry) => {
      const located = entry.kind === "tv" ? resolveResumeTvEpisode(entry) : null;
      const item = entry.kind === "tv" ? located?.show : getTitleItem(entry.itemId);
      return item ? { ...withPlaybackState(item), resumeEntry: entry, resumeLocation: located } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(b.resumeEntry?.updatedAt ?? "").localeCompare(String(a.resumeEntry?.updatedAt ?? "")));
}

const TV_SESSION_RENTALS_KEY = "tobytube.tv-rentals";

function readSessionTvRentalState() {
  try {
    return JSON.parse(localStorage.getItem(TV_SESSION_RENTALS_KEY) || "{}") ?? {};
  } catch {
    return {};
  }
}

function writeSessionTvRentalState(value) {
  try {
    localStorage.setItem(TV_SESSION_RENTALS_KEY, JSON.stringify(value));
  } catch {}
}

function removeTvCurrentRental(showId) {
  const canonicalShowId = tvCanonicalIdByAlias.get(showId) ?? showId;
  const rentals = readSessionTvRentalState();
  if (!rentals[canonicalShowId]) return;
  rentals[canonicalShowId] = {
    ...rentals[canonicalShowId],
    completedCount: 0,
    nextExpectedEpisodeId: null,
    removedAt: new Date().toISOString(),
  };
  writeSessionTvRentalState(rentals);
}

function recordCompletedTvEpisodeForSession(showId, episodeId, nextEpisodeId, originCollectionId = null) {
  if (!showId || !episodeId) return;
  const canonicalShowId = tvCanonicalIdByAlias.get(showId) ?? showId;
  const rentals = readSessionTvRentalState();
  const previous = rentals[canonicalShowId] ?? {};
  const consecutive = previous.nextExpectedEpisodeId === episodeId;
  const originCollectionIds = new Set(previous.originCollectionIds ?? []);
  if (originCollectionId) originCollectionIds.add(originCollectionId);
  rentals[canonicalShowId] = {
    showId: canonicalShowId,
    completedCount: consecutive ? Number(previous.completedCount || 1) + 1 : 1,
    lastEpisodeId: episodeId,
    nextEpisodeId: nextEpisodeId ?? null,
    nextExpectedEpisodeId: nextEpisodeId ?? null,
    originCollectionIds: [...originCollectionIds],
    removedAt: null,
    updatedAt: new Date().toISOString(),
  };
  writeSessionTvRentalState(rentals);
}

function collectionContainsTvShow(collectionId, show) {
  const collection = getCuratedCollectionPage(collectionId);
  if (!collection || !show) return false;
  const showIdentity = shelfItemIdentity(show);
  return getRenderableCollectionSections(collection)
    .flatMap((section) => section.items ?? [])
    .some((item) => {
      const hydrated = getCuratedHydratedItem(item);
      return hydrated?.mediaType === "tv" && shelfItemIdentity(hydrated) === showIdentity;
    });
}

function getSessionTvRentals(collectionId = null) {
  return Object.values(readSessionTvRentalState())
    .filter((entry) => Number(entry.completedCount) >= 2 && entry.nextEpisodeId && !entry.removedAt)
    .map((entry) => {
      const located = findAvailableTvEpisode(entry.nextEpisodeId);
      if (!located) return null;
      if (collectionId && !(entry.originCollectionIds ?? []).includes(collectionId) && !collectionContainsTvShow(collectionId, located.show)) return null;
      const resumeEntry = {
        kind: "tv",
        itemId: located.show.id,
        episodeId: located.episode.id,
        progress: 0,
        updatedAt: entry.updatedAt,
      };
      return {
        ...withPlaybackState(located.show),
        sessionRental: true,
        sessionNextEpisodeId: located.episode.id,
        resumeEntry,
        resumeLocation: located,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.resumeEntry?.updatedAt ?? "").localeCompare(String(a.resumeEntry?.updatedAt ?? "")));
}

function getResumeEntryForItem(item) {
  if (!item) return null;
  if (item.mediaType === "tv") return getResumeEntryForTvShow(item.id);
  return getStoredResumeEntries().find((entry) => entry.itemId === item.id || entry.episodeId === item.id) ?? null;
}

function getResumeEntryForTvShow(showId) {
  const canonicalId = tvCanonicalIdByAlias.get(showId) ?? showId;
  return getStoredResumeEntries()
    .filter((entry) => entry.kind === "tv" && (tvCanonicalIdByAlias.get(entry.itemId) ?? entry.itemId) === canonicalId && resolveResumeTvEpisode(entry))
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0] ?? null;
}

function getResumeEntryForTvSeason(showId, seasonNumber) {
  const canonicalId = tvCanonicalIdByAlias.get(showId) ?? showId;
  return getStoredResumeEntries()
    .filter((entry) => {
      if (entry.kind !== "tv" || (tvCanonicalIdByAlias.get(entry.itemId) ?? entry.itemId) !== canonicalId) return false;
      const located = resolveResumeTvEpisode(entry);
      return Number(located?.season?.seasonNumber) === Number(seasonNumber);
    })
    .sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0] ?? null;
}

function getResumeEntryForEpisode(episodeId) {
  return getStoredResumeEntries().find((entry) => entry.kind === "tv" && entry.episodeId === episodeId) ?? null;
}

function getStoredResumeEntries() {
  try {
    const byKey = new Map();
    Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key) => key?.startsWith("tobytube.resume."))
      .map((key) => readResumeEntry(key.replace("tobytube.resume.", "")))
      .filter((entry) => entry?.schemaVersion === RESUME_SCHEMA_VERSION && entry?.seconds >= RESUME_THRESHOLD_SECONDS)
      .forEach((entry) => {
        const key = entry.key ?? `${entry.kind}:${entry.episodeId ?? entry.itemId}`;
        const previous = byKey.get(key);
        if (!previous || String(entry.updatedAt ?? "").localeCompare(String(previous.updatedAt ?? "")) > 0) byKey.set(key, entry);
      });
    return [...byKey.values()].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
  } catch {
    return [];
  }
}

function isLikelyBonusFeature(file) {
  const pathText = String(file.path ?? "");
  return /[\\\/](featurettes?|extras?|deleted scenes|bonus|shorts?)[\\\/]/i.test(pathText);
}

function cleanScannedTitleFromPath(filePath) {
  return String(filePath)
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Scanned Movie";
}

function renderResumeCard(item) {
  const entry = item.resumeEntry ?? getResumeEntryForItem(item);
  const progress = entry?.progress ?? item.watchProgress ?? 0;
  const titleAttribute = item.sessionNextEpisodeId ? "" : `data-title-id="${escapeHtml(item.id)}"`;
  const located = item.resumeLocation ?? (entry?.kind === "tv" ? resolveResumeTvEpisode(entry) : null);
  const title = entry?.kind === "tv" ? getDisplayTitle(item) : entry?.primaryLabel ?? item.title;
  const meta = entry?.kind === "tv" && located?.episode
    ? formatSeasonEpisode(located.episode)
    : entry?.secondaryLabel ?? entry?.label ?? getItemMeta(item);
  return `
    <article class="media-card library-card resume-card ${item.status}" title="${escapeHtml(item.title)}" ${titleAttribute}${item.sessionNextEpisodeId ? ` data-tv-episode-id="${escapeHtml(item.sessionNextEpisodeId)}"` : ""} tabindex="0">
      ${renderPosterBlockWithMenu(item)}
      <div class="card-body">
        <div class="card-title">${escapeHtml(title)}</div>
        <div class="card-meta">${escapeHtml(meta)}</div>
        <div class="progress-track"><span style="width:${Math.max(2, Math.min(100, progress))}%"></span></div>
      </div>
    </article>
  `;
}

function renderWatchlistHome() {
  const items = getMixtapeItems();
  return `
    ${renderLibraryHeader("Watch Later", "Everything you tucked aside for when the mood finally lands.")}
    <div class="library-grid">
      ${items.map(renderMixedCard).join("") || `<div class="empty">No watch later items yet.</div>`}
    </div>
  `;
}

function renderRecentlyAddedHome() {
  const items = sortByDate([...getMovieLibraryItems(), ...getTvLibraryItems(), ...getHomeWrestlingItems()]);
  return `
    ${renderLibraryHeader("New Releases", "The freshest things Tobytube has found across movies, TV, and wrestling.")}
    <div class="library-grid">
      ${items.map(renderMixedCard).join("") || `<div class="empty">Nothing recent yet.</div>`}
    </div>
  `;
}

function renderTitleScreen(item) {
  if (!item) {
    return `
      <button class="icon-button" type="button" data-action="back-title">Back</button>
      <div class="empty">This title is no longer available in the current view.</div>
    `;
  }

  const details = getTitleDetails(item);
  const cast = details.cast ?? [];
  const heroStyle = `--poster-a:${item.posterA ?? "#202329"};--poster-b:${item.posterB ?? "#d8b35d"}`;

  return `
    <div class="title-screen">
      <button class="icon-button title-back" type="button" data-action="back-title">Back</button>
      <section class="title-hero">
        <div class="title-poster" style="${heroStyle}">
          ${renderTitlePosterBlock(item)}
          ${item.mediaType === "wrestling" ? renderMediaStoplightButton(item, "gear") : ""}
        </div>
        <div class="title-copy">
          <div>
            <h1>${escapeHtml(getDisplayTitle(item))}</h1>
            <p class="title-tagline">${escapeHtml(details.tagline ?? details.summary ?? "Metadata will appear here once this title is matched.")}</p>
          </div>
          ${renderTitleMetadataList(item, details)}
          ${renderTitleActions(details, item)}
          ${renderPlaybackSettings(details)}
          ${renderCardViewTabs(details)}
        </div>
      </section>
      ${renderCastShelf(cast, item)}
      ${renderMatchCard(details)}
      ${renderContentListing(details)}
    </div>
  `;
}

const HORROR_FRANCHISE_RULES = {
  "horror-franchise-freddy-vs-jason": {
    folderKeys: ["freddy-vs-jason", "friday-the-13th", "nightmare-on-elm-street"],
    carousels: {
      "friday-the-13th": ["friday the 13th|1980", "friday the 13th part 2|1981", "friday the 13th part iii|1982", "friday the 13th the final chapter|1984", "friday the 13th a new beginning|1985", "friday the 13th part vi jason lives|1986", "friday the 13th part vii the new blood|1988", "friday the 13th part viii jason takes manhattan|1989", "jason goes to hell the final friday|1993", "jason x|2001", "friday the 13th|2009"],
      "a-nightmare-on-elm-street": ["a nightmare on elm street|1984", "a nightmare on elm street 2 freddy s revenge|1985", "a nightmare on elm street 3 dream warriors|1987", "a nightmare on elm street 4 the dream master|1988", "a nightmare on elm street 5 the dream child|1989", "freddy s dead the final nightmare|1991", "wes craven s new nightmare|1994", "a nightmare on elm street|2010"],
      "crossovers-and-more": ["freddy vs jason|2003", "freddy s nightmares|1988", "friday the 13th the series|1987"]
    }
  },
  "horror-franchise-alien-vs-predator": {
    folderKeys: ["alien-vs-predator", "alien", "predator"],
    carousels: {
      "alien": ["alien|1979", "aliens|1986", "alien3|1992", "alien resurrection|1997", "prometheus|2012", "alien covenant|2017", "alien romulus|2024"],
      "predator": ["predator|1987", "predator 2|1990", "predators|2010", "the predator|2018", "prey|2022", "predator killer of killers|2025"],
      "crossovers-and-more": ["alien vs predator|2004", "alien vs predator requiem|2007", "aliens vs predator requiem|2007", "avp requiem|2007", "alien earth|2025"]
    }
  },
  "horror-franchise-tales-from-the-creepshow": {
    folderKeys: ["tales-from-the-creepshow", "creepshow", "tales-from-the-crypt"],
    carousels: {
      "creepshow": ["creepshow|1982", "creepshow 2|1987", "creepshow 3|2006", "creepshow|2019", "tales from the darkside|1984", "tales from the darkside the movie|1990", "cat s eye|1985"],
      "tales-from-the-crypt": ["tales from the crypt|1989", "tales from the cryptkeeper|1993", "tales from the crypt|1972", "the vault of horror|1973", "demon knight|1995", "bordello of blood|1996", "ritual|2002"]
    }
  },
  "horror-franchise-halloween": { folderKeys: ["halloween"], carousels: { "movies-in-this-series": ["halloween|1978", "halloween ii|1981", "halloween iii season of the witch|1982", "halloween 4 the return of michael myers|1988", "halloween 5 the revenge of michael myers|1989", "halloween the curse of michael myers|1995", "halloween h20 20 years later|1998", "halloween resurrection|2002", "halloween|2007", "halloween ii|2009", "halloween|2018", "halloween kills|2021", "halloween ends|2022"] } },
  "horror-franchise-hellraiser": { folderKeys: ["hellraiser"], carousels: { "movies-in-this-series": ["hellraiser|1987", "hellbound hellraiser ii|1988", "hellraiser iii hell on earth|1992", "hellraiser bloodline|1996", "hellraiser inferno|2000", "hellraiser hellseeker|2002", "hellraiser deader|2005", "hellraiser hellworld|2005", "hellraiser revelations|2011", "hellraiser judgment|2018", "hellraiser|2022"] } },
  "horror-franchise-saw": { folderKeys: ["saw"], carousels: { "movies-in-this-series": ["saw|2004", "saw ii|2005", "saw iii|2006", "saw iv|2007", "saw v|2008", "saw vi|2009", "saw 3d|2010", "jigsaw|2017", "spiral from the book of saw|2021", "saw x|2023"] } },
  "horror-franchise-children-of-the-corn": { folderKeys: ["children-of-the-corn"], carousels: { "movies-in-this-series": ["children of the corn|1984", "children of the corn ii the final sacrifice|1992", "children of the corn iii urban harvest|1995", "children of the corn iv the gathering|1996", "children of the corn v fields of terror|1998", "children of the corn 666 isaac s return|1999", "children of the corn revelation|2001", "children of the corn|2009", "children of the corn genesis|2011", "children of the corn runaway|2018", "children of the corn|2020", "children of the corn|2023"] } },
  "horror-franchise-childs-play": { folderKeys: ["childs-play", "chucky"], carousels: { "movies-in-this-series": ["child s play|1988", "child s play 2|1990", "child s play 3|1991", "bride of chucky|1998", "seed of chucky|2004", "curse of chucky|2013", "cult of chucky|2017", "child s play|2019", "chucky|2021"] } },
  "horror-franchise-scream": { folderKeys: ["scream"], carousels: { "movies-in-this-series": ["scream|1996", "scream 2|1997", "scream 3|2000", "scream 4|2011", "scream|2022", "scream vi|2023", "scream vii|2025", "scream|2015"] } },
  "horror-franchise-texas-chainsaw-massacre": { folderKeys: ["texas-chainsaw-massacre"], carousels: { "movies-in-this-series": ["the texas chain saw massacre|1974", "the texas chainsaw massacre 2|1986", "leatherface the texas chainsaw massacre iii|1990", "texas chainsaw massacre the next generation|1995", "the texas chainsaw massacre|2003", "the texas chainsaw massacre the beginning|2006", "texas chainsaw 3d|2013", "leatherface|2017", "texas chainsaw massacre|2022"] } },
  "horror-franchise-evil-dead": { folderKeys: ["evil-dead"], carousels: { "movies-in-this-series": ["the evil dead|1981", "evil dead ii|1987", "army of darkness|1992", "evil dead|2013", "evil dead rise|2023", "ash vs evil dead|2015"] } },
  "horror-franchise-phantasm": { folderKeys: ["phantasm"], carousels: { "movies-in-this-series": ["phantasm|1979", "phantasm ii|1988", "phantasm iii lord of the dead|1994", "phantasm iv oblivion|1998", "phantasm ravager|2016"] } },
  "horror-franchise-candyman": { folderKeys: ["candyman"], carousels: { "movies-in-this-series": ["candyman|1992", "candyman farewell to the flesh|1995", "candyman day of the dead|1999", "candyman|2021"] } },
  "horror-franchise-psycho": { folderKeys: ["psycho", "bates-motel"], carousels: { "movies-in-this-series": ["psycho|1960", "psycho ii|1983", "psycho iii|1986", "psycho iv the beginning|1990", "psycho|1998", "bates motel|2013"] } },
  "horror-franchise-exorcist": { folderKeys: ["exorcist"], carousels: { "movies-in-this-series": ["the exorcist|1973", "exorcist ii the heretic|1977", "the exorcist iii|1990", "exorcist the beginning|2004", "dominion prequel to the exorcist|2005", "the exorcist believer|2023", "the exorcist|2016"] } },
  "horror-franchise-the-omen": { folderKeys: ["omen", "damien"], carousels: { "movies-in-this-series": ["the omen|1976", "damien omen ii|1978", "omen iii the final conflict|1981", "omen iv the awakening|1991", "the omen|2006", "the first omen|2024", "damien|2016"] } },
  "horror-franchise-leprechaun": { folderKeys: ["leprechaun"], carousels: { "movies-in-this-series": ["leprechaun|1993", "leprechaun 2|1994", "leprechaun 3|1995", "leprechaun 4 in space|1996", "leprechaun in the hood|2000", "leprechaun back 2 tha hood|2003", "leprechaun origins|2014", "leprechaun returns|2018"] } }
};

const HORROR_FRANCHISE_TITLE_META = {
  "friday the 13th|1980": { title: "Friday the 13th", year: 1980, mediaType: "movie" },
  "friday the 13th part 2|1981": { title: "Friday the 13th Part 2", year: 1981, mediaType: "movie" },
  "friday the 13th part iii|1982": { title: "Friday the 13th Part III", year: 1982, mediaType: "movie" },
  "friday the 13th the final chapter|1984": { title: "Friday the 13th: The Final Chapter", year: 1984, mediaType: "movie" },
  "friday the 13th a new beginning|1985": { title: "Friday the 13th: A New Beginning", year: 1985, mediaType: "movie" },
  "friday the 13th part vi jason lives|1986": { title: "Friday the 13th Part VI: Jason Lives", year: 1986, mediaType: "movie" },
  "friday the 13th part vii the new blood|1988": { title: "Friday the 13th Part VII: The New Blood", year: 1988, mediaType: "movie" },
  "friday the 13th part viii jason takes manhattan|1989": { title: "Friday the 13th Part VIII: Jason Takes Manhattan", year: 1989, mediaType: "movie" },
  "jason goes to hell the final friday|1993": { title: "Jason Goes to Hell: The Final Friday", year: 1993, mediaType: "movie" },
  "jason x|2001": { title: "Jason X", year: 2001, mediaType: "movie" },
  "friday the 13th|2009": { title: "Friday the 13th", year: 2009, mediaType: "movie" },
  "a nightmare on elm street|1984": { title: "A Nightmare on Elm Street", year: 1984, mediaType: "movie" },
  "a nightmare on elm street 2 freddy s revenge|1985": { title: "A Nightmare on Elm Street 2: Freddy's Revenge", year: 1985, mediaType: "movie" },
  "a nightmare on elm street 3 dream warriors|1987": { title: "A Nightmare on Elm Street 3: Dream Warriors", year: 1987, mediaType: "movie" },
  "a nightmare on elm street 4 the dream master|1988": { title: "A Nightmare on Elm Street 4: The Dream Master", year: 1988, mediaType: "movie" },
  "a nightmare on elm street 5 the dream child|1989": { title: "A Nightmare on Elm Street 5: The Dream Child", year: 1989, mediaType: "movie" },
  "freddy s dead the final nightmare|1991": { title: "Freddy's Dead: The Final Nightmare", year: 1991, mediaType: "movie" },
  "wes craven s new nightmare|1994": { title: "Wes Craven's New Nightmare", year: 1994, mediaType: "movie" },
  "a nightmare on elm street|2010": { title: "A Nightmare on Elm Street", year: 2010, mediaType: "movie" },
  "freddy vs jason|2003": { title: "Freddy vs Jason", year: 2003, mediaType: "movie" },
  "freddy s nightmares|1988": { title: "Freddy's Nightmares", year: 1988, mediaType: "tv" },
  "friday the 13th the series|1987": { title: "Friday the 13th: The Series", year: 1987, mediaType: "tv" },
  "alien|1979": { title: "Alien", year: 1979, mediaType: "movie" },
  "aliens|1986": { title: "Aliens", year: 1986, mediaType: "movie" },
  "alien3|1992": { title: "Alien 3", year: 1992, mediaType: "movie" },
  "alien resurrection|1997": { title: "Alien Resurrection", year: 1997, mediaType: "movie" },
  "prometheus|2012": { title: "Prometheus", year: 2012, mediaType: "movie" },
  "alien covenant|2017": { title: "Alien: Covenant", year: 2017, mediaType: "movie" },
  "alien romulus|2024": { title: "Alien: Romulus", year: 2024, mediaType: "movie" },
  "predator|1987": { title: "Predator", year: 1987, mediaType: "movie" },
  "predator 2|1990": { title: "Predator 2", year: 1990, mediaType: "movie" },
  "predators|2010": { title: "Predators", year: 2010, mediaType: "movie" },
  "the predator|2018": { title: "The Predator", year: 2018, mediaType: "movie" },
  "prey|2022": { title: "Prey", year: 2022, mediaType: "movie" },
  "predator killer of killers|2025": { title: "Predator: Killer of Killers", year: 2025, mediaType: "movie" },
  "alien vs predator|2004": { title: "Alien vs Predator", year: 2004, mediaType: "movie" },
  "alien vs predator requiem|2007": { title: "Aliens vs Predator: Requiem", year: 2007, mediaType: "movie" },
  "aliens vs predator requiem|2007": { title: "Aliens vs Predator: Requiem", year: 2007, mediaType: "movie" },
  "avp requiem|2007": { title: "Aliens vs Predator: Requiem", year: 2007, mediaType: "movie" },
  "alien earth|2025": { title: "Alien: Earth", year: 2025, mediaType: "tv" },
  "creepshow|1982": { title: "Creepshow", year: 1982, mediaType: "movie" },
  "creepshow 2|1987": { title: "Creepshow 2", year: 1987, mediaType: "movie" },
  "creepshow 3|2006": { title: "Creepshow 3", year: 2006, mediaType: "movie" },
  "creepshow|2019": { title: "Creepshow", year: 2019, mediaType: "tv" },
  "tales from the darkside|1984": { title: "Tales from the Darkside", year: 1984, mediaType: "tv" },
  "tales from the darkside the movie|1990": { title: "Tales from the Darkside: The Movie", year: 1990, mediaType: "movie" },
  "cat s eye|1985": { title: "Cat's Eye", year: 1985, mediaType: "movie" },
  "tales from the crypt|1989": { title: "Tales from the Crypt", year: 1989, mediaType: "tv" },
  "tales from the cryptkeeper|1993": { title: "Tales from the Cryptkeeper", year: 1993, mediaType: "tv" },
  "tales from the crypt|1972": { title: "Tales from the Crypt", year: 1972, mediaType: "movie" },
  "the vault of horror|1973": { title: "The Vault of Horror", year: 1973, mediaType: "movie" },
  "demon knight|1995": { title: "Demon Knight", year: 1995, mediaType: "movie" },
  "bordello of blood|1996": { title: "Bordello of Blood", year: 1996, mediaType: "movie" },
  "ritual|2002": { title: "Ritual", year: 2002, mediaType: "movie" },
};

function renderFranchiseTitleScreen(item) {
  const isUserFranchise = item.recordType === "franchise";
  const rows = isUserFranchise ? ["Movies & Series"] : (item.franchiseCarousels?.length ? item.franchiseCarousels : ["Movies in This Series"]);
  const heroStyle = `--poster-a:${item.posterA ?? "#1c1012"};--poster-b:${item.posterB ?? "#d13c2f"}`;
  const sections = rows.map((title) => ({
    id: slugify(`${item.id}-${title}`),
    title,
    items: getFranchiseCarouselItems(item, title),
  }));

  return `
    <div class="toby-tv-detail toby-movie-detail franchise-title-screen">
      ${renderTobyMovieTopbar()}
      <button class="toby-tv-back" type="button" data-action="back-title">Back</button>
      <section class="toby-movie-layout">
        <aside class="toby-movie-side">
          <div class="toby-movie-poster-frame" style="${heroStyle}">
            ${renderTitlePosterBlock(item)}
            ${renderMediaStoplightButton(item, "gear")}
          </div>
        </aside>
        <main class="toby-movie-main">
          <h1>${escapeHtml(getDisplayTitle(item))}</h1>
          <p class="toby-movie-meta">${isUserFranchise ? "Tobytube Franchise" : "Horror Franchise"} / Tobytube Video</p>
          <p class="toby-movie-overview">${escapeHtml(item.summary || "Franchise hub. Movies in these rows link back to their regular title pages.")}</p>
        </main>
      </section>
      <div class="shelf-stack curated-shelves">
        ${sections.map((section) => renderCuratedShelf(section.title, section.items, section.id)).join("")}
      </div>
    </div>
  `;
}

function getFranchiseCarouselItems(item, carouselTitle) {
  if (item.recordType === "franchise") {
    return dedupeShelfItems((item.memberIds ?? []).map((id) => getTitleItem(id)).filter((entry) => entry && entry.id !== item.id));
  }
  const carouselKey = slugify(carouselTitle);
  const rules = HORROR_FRANCHISE_RULES[item.id];
  const allowedList = rules?.carousels?.[carouselKey] ?? rules?.carousels?.["movies-in-this-series"] ?? [];
  if (carouselKey === "crossovers-and-more") return getFranchiseCrossoversFolderItems(item, rules, allowedList);

  const allowedOrder = new Map(allowedList.map((key, index) => [key, index]));
  const pool = [...getMovieLibraryItems(), ...getTvLibraryItems(), ...Object.values(movieDetailIndex), ...Object.values(tvDetailIndex)];
  const byKey = new Map();

  pool.forEach((candidate) => {
    if (!candidate?.title) return;
    const key = franchiseCandidateKey(candidate);
    if (!allowedOrder.has(key)) return;
    const current = byKey.get(key);
    if (!current || franchiseItemScore(candidate, rules, carouselKey) > franchiseItemScore(current, rules, carouselKey)) byKey.set(key, candidate);
  });

  const expectedItems = allowedList.map((key) => byKey.get(key)).filter(Boolean);
  const expectedKeys = new Set(expectedItems.map(franchiseCandidateKey));
  const folderExtras = pool
    .filter((candidate) => candidate?.id && !expectedKeys.has(franchiseCandidateKey(candidate)))
    .filter((candidate) => candidateInFranchiseFolder(candidate, rules, carouselKey))
    .sort(sortCollectionItemsForDisplay);
  return dedupeFranchiseItemsByKey([...expectedItems, ...folderExtras]);
}

function getFranchiseCrossoversFolderItems(item, rules, allowedList = []) {
  const byId = new Map();
  (generatedMetadata.records ?? []).forEach((record) => {
    const files = (record.files ?? []).filter((file) => fileInFranchiseCrossoversFolder(file, rules) && !isLikelyBonusFeature(file));
    if (!files.length) return;
    const titleItem = record.mediaType === "tv"
      ? getTvLibraryItems().find((show) => show.id === record.id) ?? getAllTvTitleItems().find((show) => show.id === record.id)
      : getCollectionItem(record.id, { mediaOnly: true }) ?? scannedMovieFromRecord({ ...record, files }, files[0]);
    if (titleItem) byId.set(titleItem.id, titleItem);
  });

  (generatedMetadata.unmatchedFiles ?? []).forEach((file) => {
    if (!fileInFranchiseCrossoversFolder(file, rules) || isLikelyBonusFeature(file)) return;
    if (file.parsed?.mediaType !== "movie") return;
    const movie = scannedMovieFromFile(file);
    byId.set(movie.id, movie);
  });

  const folderItems = [...byId.values()].sort(sortCollectionItemsForDisplay);
  const allowedOrder = new Map(allowedList.map((key, index) => [key, index]));
  const pool = [...getMovieLibraryItems(), ...getTvLibraryItems(), ...Object.values(movieDetailIndex), ...Object.values(tvDetailIndex), ...folderItems];
  const fallbackByKey = new Map();
  pool.forEach((candidate) => {
    if (!candidate?.title) return;
    const key = franchiseCandidateKey(candidate);
    if (!allowedOrder.has(key)) return;
    const current = fallbackByKey.get(key);
    if (!current || itemCompletenessScore(candidate) > itemCompletenessScore(current)) fallbackByKey.set(key, candidate);
  });

  const expectedItems = allowedList.map((key) => fallbackByKey.get(key)).filter(Boolean);
  const expectedKeys = new Set(expectedItems.map(franchiseCandidateKey));
  const extraFolderItems = folderItems.filter((folderItem) => !expectedKeys.has(franchiseCandidateKey(folderItem)));
  return dedupeFranchiseItemsByKey([...expectedItems, ...extraFolderItems]);
}

function franchisePlaceholderItem(key) {
  const meta = HORROR_FRANCHISE_TITLE_META[key];
  if (!meta) return null;
  return withPlaybackState({
    id: `franchise-placeholder-${slugify(`${meta.title}-${meta.year}`)}`,
    title: meta.title,
    year: meta.year,
    mediaType: meta.mediaType ?? "movie",
    genre: "Horror Franchise",
    country: "Tobytube Video",
    status: "missing-poster",
    addedAt: `${meta.year ?? 2000}-01-01`,
    posterA: "#171717",
    posterB: "#c6a35d",
    posterUrl: null,
    posterCode: buildPosterCode(meta.title),
    watchProgress: 0,
    inWatchlist: false,
    files: [],
    franchisePlaceholder: true,
  });
}

function dedupeFranchiseItemsByKey(items) {
  const byKey = new Map();
  items.forEach((item) => {
    const key = franchiseCandidateKey(item);
    const current = byKey.get(key);
    if (!current || itemCompletenessScore(item) > itemCompletenessScore(current)) byKey.set(key, item);
  });
  return [...byKey.values()];
}
function fileInFranchiseCrossoversFolder(file, rules) {
  const hubKey = rules?.folderKeys?.[0];
  if (!hubKey) return false;
  const segments = getSluggedPathSegments(file?.path ?? file?.relativePath ?? "");
  const hubIndex = segments.indexOf(hubKey);
  if (hubIndex < 0) return false;
  return segments.slice(hubIndex + 1).some((segment) => ["crossovers-and-more", "crossovers-and-related", "crossovers-related"].includes(segment));
}

function getSluggedPathSegments(filePath) {
  return String(filePath).split(/[\\/]+/).map((segment) => slugify(segment.replace(/\.[^.]+$/, ""))).filter(Boolean);
}

function franchiseItemScore(candidate, rules, carouselKey) {
  const folderScore = candidateInFranchiseFolder(candidate, rules, carouselKey) ? 20 : 0;
  return folderScore + itemCompletenessScore(candidate);
}

function franchiseCandidateKey(candidate) {
  const rawTitle = String(candidate.title ?? "").replace(/Alien\s*[�3]/gi, "Alien 3");
  let title = normalizeTitleForMatch(rawTitle).replace(/\balien 3\b/g, "alien3");
  title = title.replace(/^aliens vs predator requiem$/, "alien vs predator requiem").replace(/^avp requiem$/, "alien vs predator requiem");
  const year = Number(candidate.year ?? candidate.startYear ?? String(candidate.releaseDate ?? candidate.firstAirDate ?? "").slice(0, 4));
  return `${title}|${Number.isFinite(year) ? year : "null"}`;
}

function candidateInFranchiseFolder(candidate, rules, carouselKey = null) {
  if (!rules?.folderKeys?.length) return false;
  const allowedKeys = new Set(rules?.carousels?.[carouselKey] ?? rules?.carousels?.["movies-in-this-series"] ?? []);
  if (allowedKeys.has(franchiseCandidateKey(candidate))) return true;

  const carouselKeys = Object.keys(rules.carousels ?? {});
  const isComboHub = carouselKeys.length > 1;
  const folderKeys = new Set();
  if (isComboHub) {
    if (carouselKey && carouselKey !== "crossovers-and-more") folderKeys.add(carouselKey);
    if (carouselKey === "a-nightmare-on-elm-street") folderKeys.add("nightmare-on-elm-street");
    if (carouselKey === "crossovers-and-more") {
      ["crossovers-and-more", "crossovers-and-related", "crossovers-related", rules.folderKeys[0]].filter(Boolean).forEach((key) => folderKeys.add(key));
    }
  } else {
    (rules.folderKeys ?? []).forEach((key) => folderKeys.add(key));
  }
  if (!folderKeys.size) return false;

  const assignedKeys = [
    ...(Array.isArray(candidate.collections) ? candidate.collections : []),
    ...(Array.isArray(candidate.collectionIds) ? candidate.collectionIds : []),
    ...(Array.isArray(candidate.tags) ? candidate.tags : []),
    candidate.collection,
    candidate.category,
  ]
    .filter(Boolean)
    .map((value) => slugify(String(value)));
  if (assignedKeys.some((key) => folderKeys.has(key) || [...folderKeys].some((folderKey) => key.includes(folderKey)))) return true;

  const record = getMetadataRecordForItem(candidate);
  const files = candidate.files ?? record?.files ?? [];
  return files.some((file) => {
    const segments = String(file.path ?? file.relativePath ?? "")
      .split(/[\\/]+/)
      .map((segment) => slugify(segment.replace(/\.[^.]+$/, "")))
      .filter(Boolean);
    return segments.some((segment) => folderKeys.has(segment));
  });
}

function itemCompletenessScore(item) {
  return [item.posterUrl, item.summary, item.files?.length, item.runtime, item.rating].filter(Boolean).length;
}


function renderMovieTitleScreen(item) {
  if (!item) {
    return `
      <button class="icon-button" type="button" data-action="back-title">Back</button>
      <div class="empty">This movie is no longer available in the current view.</div>
    `;
  }

  const details = getTitleDetails(item);
  const cast = details.cast ?? [];
  const heroStyle = `--poster-a:${item.posterA ?? "#202329"};--poster-b:${item.posterB ?? "#d8b35d"}`;
  const mediaFamily = getRelatedMediaFamily(item);
  const familyIds = new Set(mediaFamily.map((entry) => entry.id));
  const related = getRelatedMovies(item).filter((entry) => !familyIds.has(entry.id)).slice(0, 8);
  const resume = getResumeEntryForItem(item);
  const playLabel = resume ? "Resume Playing" : "Play Movie";

  return `
    <div class="toby-tv-detail toby-movie-detail movie-title-screen">
      ${renderTobyMovieTopbar()}
      <button class="toby-tv-back" type="button" data-action="back-title">Back</button>
      <section class="toby-movie-layout">
        <aside class="toby-movie-side">
          <div class="toby-movie-poster-frame" style="${heroStyle}">
            ${renderTitlePosterBlock(item)}
            ${renderMediaStoplightButton(item, "gear")}
          </div>
          ${renderTobyMovieFoundIn(item)}
          ${renderTobyMovieStoreInfo(item, details)}
        </aside>
        <main class="toby-movie-main">
          <h1>${escapeHtml(getDisplayTitle(item))}</h1>
          <p class="toby-movie-meta">${escapeHtml(renderMovieHeroMetaLine(item, details))}</p>
          ${renderMovieRatings(details)}
          <div class="toby-movie-actions">
            <button class="toby-tv-play toby-movie-play" type="button" data-action="play-title" data-title-id="${escapeHtml(item.id)}"><span></span>${playLabel}</button>
            ${resume ? `<button class="toby-tv-secondary" type="button" data-action="play-title" data-start-over="true" data-title-id="${escapeHtml(item.id)}">Play from Start</button>` : ""}
            ${renderDetailMixtapeButton(item)}
            ${renderCompletionCheck(item)}
          </div>
          <p class="toby-movie-overview">${escapeHtml(details.summary || "Synopsis will appear here once this movie is matched.")}</p>
          ${renderMediaStreamControls(`movie:${item.id}`, getMovieMediaFiles(item), "movie")}
          ${renderRelatedMediaShelf("TV Series", mediaFamily.filter((entry) => entry.mediaType === "tv"))}
          ${renderRelatedMediaShelf("Movies in This Series", mediaFamily.filter((entry) => entry.mediaType === "movie"))}
          ${renderTobyMovieRelatedShelf(related)}
          ${renderTobyMovieCastShelf(cast, item)}
        </main>
      </section>
    </div>
  `;
}

function renderTobyMovieTopbar() {
  return `
    <header class="toby-tv-detail-bar toby-movie-detail-bar">
      <div class="toby-tv-brand toby-movie-brand">
        <span>TOBYTUBE</span>
        <i></i><i></i><i></i><i></i>
      </div>
      <div class="toby-tv-detail-icons toby-movie-detail-icons" aria-hidden="true">
        <span>Search</span>
        <span>Smile</span>
      </div>
    </header>
  `;
}

function renderMovieHeroMetaLine(item, details) {
  const year = item.year ?? String(details.releaseDate ?? "").match(/\d{4}/)?.[0] ?? "Year pending";
  const genres = (details.genres?.length ? details.genres : [item.genre]).filter(Boolean).slice(0, 2);
  return [year, ...genres, formatMovieRuntime(details.runtime), details.rating ?? "NR"].filter(Boolean).join(" / ");
}

function renderTobyMovieStoreInfo(item, details) {
  const rows = [
    ["Runtime", formatMovieRuntime(details.runtime)],
    ["Released", item.year ?? String(details.releaseDate ?? "").match(/\d{4}/)?.[0]],
    ["Director", details.director],
    ["Format", details.settings?.format ?? "VHS"],
  ].filter(([, value]) => Boolean(value));
  return `
    <section class="toby-movie-store-card">
      <h2>Tobytube</h2>
      <p>Video Store</p>
      <dl>
        ${rows
          .map(
            ([label, value]) => `
              <div>
                <dt>${escapeHtml(label)}</dt>
                <dd>${label === "Director" ? `<button class="toby-store-person-link" type="button" data-person-id="director-${escapeHtml(slugify(value))}" data-person-name="${escapeHtml(value)}">${escapeHtml(value)}</button>` : escapeHtml(value)}</dd>
              </div>
            `,
          )
          .join("")}
      </dl>
    </section>
  `;
}

function renderTobyMovieFoundIn(item) {
  const foundIn =
    item.id === "curated-the-neverending-story-1984"
      ? [
          { title: "Childhood Favourites", id: "fantasy", tone: "cult" },
          { title: "Fantasy", id: "fantasy", tone: "saturday" },
          { title: "1980s", id: "2010s", tone: "decade" },
          { title: "Harry's Picks", id: "tom-hanks", tone: "animation" },
        ]
      : getMovieCollections()
          .filter((collection) => collection.itemIds.includes(item.id))
          .slice(0, 4)
          .map((collection) => ({ title: collection.title, id: collection.id, tone: "default" }));
  if (!foundIn.length) return "";
  return `
    <div class="toby-found toby-movie-found">
      <h2>Found In</h2>
      <div class="toby-found-list toby-movie-found-list">
        ${foundIn
          .map(
            (entry) => `
              <button class="toby-found-button ${entry.tone}" type="button" data-collection-id="${entry.id}">
                ${escapeHtml(entry.title)}
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderTobyMovieCastShelf(cast, item = null) {
  if (!cast.length) return `<section class="toby-tv-cast"><div class="toby-tv-section-title">Cast</div><div class="empty">Cast metadata pending.</div></section>`;
  const visibleCast = cast.slice(0, 10);
  return `
    <section class="toby-tv-cast">
      <div class="toby-tv-section-title">Cast</div>
      <div class="toby-tv-cast-row">
        ${visibleCast
          .map(
            (person) => `
              <button class="toby-cast-card" type="button" data-person-id="${escapeHtml(person.id)}">
                <div class="toby-cast-avatar">
                  ${person.imageUrl || person.profileUrl ? `<img src="${escapeHtml(person.imageUrl ?? person.profileUrl)}" alt="" loading="lazy" />` : `<span>${escapeHtml(buildPosterCode(person.name))}</span>`}
                </div>
                <b>${escapeHtml(person.name)}</b>
                <small>${escapeHtml(cleanCharacterName(person.role ?? person.character ?? "Character"))}</small>
              </button>
            `,
          )
          .join("")}
        ${cast.length > 10 ? `
          <button class="toby-cast-card view-all" type="button" data-action="open-cast-overlay" data-cast-context="movie:${escapeHtml(item?.id ?? "")}" data-cast-title="${escapeHtml(`Cast for ${item?.title ?? "Movie"}`)}">
            <div class="toby-cast-avatar"><span>...</span></div><b>View</b><small>Full Cast</small>
          </button>` : ""}
      </div>
    </section>
  `;
}

function renderTobyMovieRelatedShelf(items) {
  if (!items.length) return "";
  return `
    <section class="toby-movie-panel">
      <div class="toby-tv-section-title">More Like This</div>
      <div class="toby-movie-related-row">
        ${items.map(renderLibraryCard).join("")}
      </div>
    </section>
  `;
}

function renderRelatedMediaShelf(title, items) {
  if (!items.length) return "";
  return `
    <section class="toby-movie-panel related-media-family">
      <div class="toby-tv-section-title">${escapeHtml(title)}</div>
      <div class="toby-movie-related-row related-media-carousel" role="region" aria-label="${escapeHtml(title)} carousel" tabindex="0">
        ${items.map(renderMixedCard).join("")}
      </div>
    </section>
  `;
}

function renderOneShotBonus(oneShots) {
  if (!oneShots.length) return "";
  return `
    <div class="one-shot-stack">
      ${oneShots
        .map(
          (shot) => `
            <article class="one-shot-card">
              ${renderPosterBlock({ ...shot, posterA: "#141016", posterB: "#e24b3b" }, "one-shot-thumb")}
              <div>
                <div class="card-title">${escapeHtml(shot.title)} ${shot.year ? `(${escapeHtml(String(shot.year))})` : ""}</div>
                <p class="card-meta">${escapeHtml(truncateText(shot.summary || "One-Shot summary pending.", 160))}</p>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMovieMetaLine(item, details) {
  const country = details.country ?? item.country ?? "Country pending";
  const release = details.releaseDate
    ? String(details.releaseDate).match(/^\d{4}-\d{2}-\d{2}$/)
      ? formatDisplayDate(details.releaseDate)
      : details.releaseDate
    : item.year ?? "Year pending";
  const rating = details.rating ?? "NR";
  const runtime = formatMovieRuntime(details.runtime);
  const genres = [item.genre, ...(details.genres ?? [])].filter(Boolean);
  return `${country} / ${release} / ${rating} / ${runtime} / ${[...new Set(genres)].join(", ") || "Genre pending"}`;
}

function renderMovieRatings(details) {
  const ratings = details.ratings ?? {};
  const tmdb = ratings.tmdb ? Number(ratings.tmdb).toFixed(1) : "-";
  const imdb = ratings.imdb ?? "-";
  const critics = ratings.rottenTomatoesCritic ?? ratings.rottenTomatoes ?? "-";
  const audience = ratings.rottenTomatoesAudience ?? "-";
  return `
    <div class="movie-score-row" aria-label="Ratings">
      <span><img src="./assets/ratings/imdb.png" alt="" loading="lazy" /><b>${escapeHtml(imdb)}</b></span>
      <span class="tmdb-score"><i>TM<br>DB</i><b>${escapeHtml(tmdb)}</b></span>
      <span><img src="./assets/ratings/rt-critics.png" alt="" loading="lazy" /><b>${escapeHtml(critics)}</b></span>
      <span><img src="./assets/ratings/rt-audience.png" alt="" loading="lazy" /><b>${escapeHtml(audience)}</b></span>
    </div>
  `;
}

function formatVersionFileName(filePath) {
  const name = String(filePath ?? "").split(/[\\/]/).pop() ?? "";
  return name.replace(/\.[^.]+$/, "") || formatFileLabel(filePath);
}

function renderMediaStreamControls(mediaKey, files, mediaKind = "media") {
  const playableFiles = (files ?? []).filter((file) => file?.path);
  const multipartFiles = mediaKind === "movie" ? getMultipartMovieFiles(playableFiles) : [];
  const selectedFile = multipartFiles[0] ?? getSelectedPlaybackFile(mediaKey, playableFiles);
  const streams = selectedFile?.streams ?? {};
  const versionOptions = playableFiles.map((file, index) => ({
    value: file.path,
    label: file.streams?.versionLabel || formatVersionFileName(file.path) || `Version ${index + 1}`,
  }));
  const videoOptions = streams.video?.length ? streams.video.map((stream) => ({ value: String(stream.index), label: stream.label })) : [{ value: "default", label: selectedFile ? formatFileLabel(selectedFile.path) : "No matched video file" }];
  const audioOptions = streams.audio?.length ? streams.audio.map((stream) => ({ value: String(stream.index), label: stream.label })) : [{ value: "default", label: "Default audio" }];
  const subtitleOptions = [{ value: "off", label: "Off" }, ...((streams.subtitles ?? []).map((stream) => ({ value: String(stream.index), label: stream.label })))];
  return `
    <section class="media-stream-panel" data-media-stream-panel="${escapeHtml(mediaKey)}">
      ${multipartFiles.length > 1 ? `<div class="media-stream-row multipart-feature-row"><span>Feature</span><b>${multipartFiles.length} parts / continuous playback</b></div>` : versionOptions.length > 1 ? renderMediaStreamRow("Version", mediaKey, "version", selectedFile?.path ?? versionOptions[0]?.value, versionOptions) : ""}
      ${renderMediaStreamRow("Video", mediaKey, "video", readStreamSelection(mediaKey, "video") ?? videoOptions[0]?.value, videoOptions)}
      ${renderMediaStreamRow("Audio", mediaKey, "audio", readStreamSelection(mediaKey, "audio") ?? audioOptions[0]?.value, audioOptions)}
      ${renderMediaStreamRow("Subtitles", mediaKey, "subtitles", readStreamSelection(mediaKey, "subtitles") ?? "off", subtitleOptions)}
    </section>
  `;
}

function renderMediaStreamRow(label, mediaKey, kind, selectedValue, options) {
  const usableOptions = options?.length ? options : [{ value: "none", label: "Unavailable" }];
  return `
    <label class="media-stream-row">
      <span>${escapeHtml(label)}</span>
      <select data-stream-setting="${escapeHtml(mediaKey)}" data-stream-kind="${escapeHtml(kind)}" ${usableOptions.length <= 1 ? "disabled" : ""}>
        ${usableOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(selectedValue) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function getMovieMediaFiles(item) {
  const record = getMetadataRecordForItem(item);
  return record?.files?.length ? record.files : item.files ?? [];
}

function getMultipartMoviePart(file) {
  const parsedPart = Number(file?.parsed?.part);
  if (Number.isFinite(parsedPart) && parsedPart > 0) return parsedPart;
  const match = String(file?.path ?? "").match(/\[(?:part|pt|cd|disc|disk)\s*(\d{1,2})(?:\s*(?:of|\/)\s*\d{1,2})?\]/i);
  return match ? Number(match[1]) : null;
}

function getMultipartMovieFiles(files) {
  const parts = (files ?? [])
    .map((file) => ({ file, part: getMultipartMoviePart(file) }))
    .filter((entry) => Number.isFinite(entry.part))
    .sort((a, b) => a.part - b.part);
  if (parts.length < 2 || new Set(parts.map((entry) => entry.part)).size !== parts.length) return [];
  return parts.map(({ file, part }) => ({ ...file, multipartPart: part }));
}

function getMultipartSegmentOffset(segments, index) {
  return segments.slice(0, index).reduce((total, segment) => total + (Number(segment.durationSeconds) || 0), 0);
}

function locateMultipartPosition(segments, absoluteSeconds) {
  const target = Math.max(0, Number(absoluteSeconds) || 0);
  let offset = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const duration = Number(segments[index].durationSeconds) || 0;
    if (!duration || target < offset + duration || index === segments.length - 1) {
      return { index, offset, localSeconds: Math.max(0, target - offset) };
    }
    offset += duration;
  }
  return { index: 0, offset: 0, localSeconds: target };
}

function findMediaFilesForEpisode(show, episode) {
  const indexed = ensureMediaPreflightIndex().tvFilesByEpisodeId.get(episode.id);
  if (indexed?.length) return indexed;
  const aliasIds = getMetadataAliasIds(show.id);
  const files = [
    ...(show.files ?? []),
    ...aliasIds.flatMap((id) => metadataIndex[id]?.files ?? []),
    ...(getMetadataRecordForItem(show)?.files ?? []),
  ];
  return [...new Map(files.map((file) => [String(file.path ?? file.episodeId), file])).values()].filter((file) => {
    const parsed = file.parsed ?? {};
    return Number(parsed.season) === Number(episode.seasonNumber) && Number(parsed.episode) === Number(episode.episodeNumber);
  });
}

function getSelectedPlaybackFile(mediaKey, files) {
  const available = (files ?? []).filter((file) => file?.path);
  if (!available.length) return null;
  const selectedPath = readStreamSelection(mediaKey, "version");
  return available.find((file) => file.path === selectedPath) ?? available[0];
}

function readStreamSelection(mediaKey, kind) {
  try {
    return localStorage.getItem(`tobytube.stream.${mediaKey}.${kind}`);
  } catch {
    return null;
  }
}

function writeStreamSelection(mediaKey, kind, value) {
  try {
    localStorage.setItem(`tobytube.stream.${mediaKey}.${kind}`, value);
  } catch {}
}

const GLOBAL_SUBTITLE_PREFERENCE_KEY = "tobytube.stream.preference.subtitles";

function readGlobalSubtitlePreference() {
  try {
    return JSON.parse(localStorage.getItem(GLOBAL_SUBTITLE_PREFERENCE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeGlobalSubtitlePreference(value, options = []) {
  const selected = options.find((option) => String(option.index ?? option.value) === String(value));
  try {
    localStorage.setItem(GLOBAL_SUBTITLE_PREFERENCE_KEY, JSON.stringify({
      enabled: value !== "off",
      value: String(value),
      language: selected?.language ?? null,
      label: selected?.label ?? null,
    }));
  } catch {}
}

function getPreferredSubtitleSelection(mediaKey, options = []) {
  const local = readStreamSelection(mediaKey, "subtitles");
  if (local !== null) return local;
  const preference = readGlobalSubtitlePreference();
  if (!preference?.enabled) return "off";
  const matched = options.find((option) =>
    (preference.language && option.language === preference.language) ||
    (preference.label && option.label === preference.label) ||
    String(option.index ?? option.value) === String(preference.value),
  );
  return String(matched?.index ?? matched?.value ?? preference.value ?? "off");
}

function buildPlaybackStreamUrl(player) {
  const url = new URL("./api/media/playback-stream", window.location.href);
  url.searchParams.set("path", player.filePath);
  const mode = player.transport === "jellyfin-hls" ? "hls" : player.transport === "local-transcode" ? "local-transcode" : "direct";
  url.searchParams.set("mode", mode);
  if (Number(player.startSeconds) > 0) url.searchParams.set("start", String(Math.floor(Number(player.startSeconds))));
  if (player.audioStreamIndex) url.searchParams.set("audioStreamIndex", player.audioStreamIndex);
  if (player.videoStreamIndex) url.searchParams.set("videoStreamIndex", player.videoStreamIndex);
  return `${url.pathname}${url.search}`;
}
function buildSubtitleTrackUrl(player, subtitleStreamIndex = player?.subtitleStreamIndex) {
  if (!player?.filePath || !subtitleStreamIndex || subtitleStreamIndex === "off") return "";
  const url = new URL("./api/media/subtitle", window.location.href);
  url.searchParams.set("path", player.filePath);
  url.searchParams.set("subtitleStreamIndex", subtitleStreamIndex);
  const option = (player.streamOptions?.subtitles ?? []).find((track) => String(track.index) === String(subtitleStreamIndex));
  if (option?.externalPath) url.searchParams.set("subtitlePath", option.externalPath);
  return `${url.pathname}${url.search}`;
}

function parseWebVttTimestamp(value) {
  const parts = String(value).trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return null;
}

function parseWebVttCues(source) {
  const cues = [];
  const lines = String(source ?? "").replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const timing = lines[index].match(/^\s*((?:\d{1,2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{1,2}:)?\d{2}:\d{2}\.\d{3})/);
    if (!timing) continue;
    const start = parseWebVttTimestamp(timing[1]);
    const end = parseWebVttTimestamp(timing[2]);
    const text = [];
    while (++index < lines.length && lines[index].trim()) text.push(lines[index]);
    if (start === null || end === null || end <= start || !text.length) continue;
    cues.push({ start, end, text: text.join("\n").replace(/<[^>]*>/g, "").trim() });
  }
  return cues;
}

function clearPlayerSubtitleRenderer(video) {
  video?._tobytubeSubtitleCleanup?.();
  if (video) video._tobytubeSubtitleCleanup = null;
  const overlay = document.querySelector("[data-player-subtitle-overlay]");
  if (overlay) {
    overlay.textContent = "";
    overlay.classList.remove("visible");
  }
}

async function startPlayerSubtitleRenderer(video, trackUrl) {
  clearPlayerSubtitleRenderer(video);
  const overlay = document.querySelector("[data-player-subtitle-overlay]");
  if (!overlay || !trackUrl) return;
  const controller = new AbortController();
  let cues = [];
  const renderCue = () => {
    const time = Number(video.currentTime ?? 0);
    const text = cues.filter((cue) => time >= cue.start && time < cue.end).map((cue) => cue.text).join("\n");
    overlay.textContent = text;
    overlay.classList.toggle("visible", Boolean(text));
  };
  video.addEventListener("timeupdate", renderCue);
  video.addEventListener("seeking", renderCue);
  video._tobytubeSubtitleCleanup = () => {
    controller.abort();
    video.removeEventListener("timeupdate", renderCue);
    video.removeEventListener("seeking", renderCue);
  };
  try {
    const response = await fetch(trackUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Subtitle request failed (${response.status})`);
    cues = parseWebVttCues(await response.text());
    renderCue();
  } catch (error) {
    if (error?.name !== "AbortError") showPlayerFeedback("Subtitles could not be loaded");
  }
}

function applyPlayerSubtitleSelection(video, subtitleStreamIndex = state.player?.subtitleStreamIndex) {
  if (!video || !state.player) return;
  Array.from(video.textTracks ?? []).forEach((track) => {
    track.mode = "disabled";
  });
  Array.from(video.querySelectorAll("track[data-tobytube-subtitle]")).forEach((track) => {
    if (track.dataset.subtitleIndex !== String(subtitleStreamIndex)) track.remove();
  });
  if (!subtitleStreamIndex || subtitleStreamIndex === "off") {
    clearPlayerSubtitleRenderer(video);
    return;
  }
  let trackElement = video.querySelector(`track[data-tobytube-subtitle][data-subtitle-index="${CSS.escape(String(subtitleStreamIndex))}"]`);
  if (!trackElement) {
    const option = (state.player.streamOptions?.subtitles ?? []).find((track) => String(track.index) === String(subtitleStreamIndex));
    trackElement = document.createElement("track");
    trackElement.kind = "subtitles";
    trackElement.label = option?.label ?? "Subtitles";
    trackElement.srclang = option?.language ?? "en";
    trackElement.src = buildSubtitleTrackUrl(state.player, subtitleStreamIndex);
    trackElement.dataset.tobytubeSubtitle = "true";
    trackElement.dataset.subtitleIndex = String(subtitleStreamIndex);
    video.appendChild(trackElement);
  }
  const showTrack = () => {
    Array.from(video.textTracks ?? []).forEach((track) => {
      track.mode = track.label === trackElement.label ? "hidden" : "disabled";
    });
  };
  if (trackElement.track) showTrack();
  trackElement.addEventListener("load", showTrack, { once: true });
  startPlayerSubtitleRenderer(video, trackElement.src);
}

function getMediaDurationSeconds(file) {
  return Number(file?.streams?.durationSeconds) || null;
}

function initialPlaybackTransport(file) {
  const filePath = file?.path ?? file;
  if (!/\.(mp4|m4v|mov|webm)$/i.test(String(filePath ?? ""))) return "local-transcode";
  const videoCodec = String(file?.streams?.video?.[0]?.codec ?? "").toLowerCase();
  const audioCodec = String(file?.streams?.audio?.[0]?.codec ?? "").toLowerCase();
  const genericContainerCodec = !videoCodec || ["mp4", "m4v", "mov", "video", "unknown"].includes(videoCodec);
  if (genericContainerCodec && /\.(mp4|m4v|mov)$/i.test(String(filePath ?? ""))) return "direct";
  if (videoCodec && !["h264", "av1", "vp8", "vp9"].includes(videoCodec)) return "local-transcode";
  if (audioCodec && !["aac", "mp3", "opus", "vorbis"].includes(audioCodec)) return "local-transcode";
  return "direct";
}

function getPlayerAbsoluteTime(video) {
  return Math.max(0, Number(state.player?.segmentOffsetSeconds ?? 0) + Number(state.player?.startSeconds ?? 0) + Number(video?.currentTime ?? 0));
}

function updatePlayerStartTime(seconds) {
  if (!state.player) return;
  state.player = { ...state.player, startSeconds: Math.max(0, Math.floor(seconds)) };
}

function renderPlayerOverlay(player) {
  const infoLines = player.infoLines ?? [];
  const source = player.filePath ? buildPlaybackStreamUrl(player) : "";
  return `
    <div class="toby-player-overlay" data-player-overlay>
      <div class="toby-player-shell" role="dialog" aria-label="Tobytube player">
        <section class="toby-player-tv">
          <div class="toby-player-screen">
            ${
              source
                ? `<video class="toby-player-video" data-player-source="${escapeHtml(source)}" data-resume-key="${escapeHtml(player.resumeKey)}" playsinline></video>`
                : `<div class="toby-player-empty">No playable file is matched to this title yet.</div>`
            }
            <div class="toby-player-crt-fx" aria-hidden="true"></div>
            <div class="toby-player-subtitle-overlay" data-player-subtitle-overlay aria-live="off"></div>
            <div class="toby-player-skip-feedback" data-player-feedback aria-live="polite"></div>
            <div class="toby-player-end-card" data-player-end-card hidden></div>
          </div>
          <aside class="toby-player-info" aria-label="Now playing">
            <div class="toby-player-info-screen">
              <b>${escapeHtml(player.heading)}</b>
              ${infoLines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
              ${player.filePath ? (player.originLabel ? `<small>${escapeHtml(player.originLabel)}</small>` : "") : `<small>NO SIGNAL</small>`}
            </div>
            <div class="toby-player-speaker" aria-hidden="true"></div>
            <div class="toby-player-brand">TOBY'S <span>24-HOUR VIDEO</span><i></i><i></i></div>
          </aside>
        </section>
        <section class="toby-player-deck" aria-label="Playback controls">
          <div class="toby-player-deck-side">
            <button type="button" data-player-control="home"><span>Home</span></button>
            <button type="button" data-player-control="back"><span>Back</span></button>
          </div>
          <div class="toby-player-status">
            <div class="toby-player-status-line">
              <span data-player-time>00:00 / 00:00</span>
            </div>
            <input class="toby-player-progress" type="range" min="0" max="1000" value="0" data-player-progress aria-label="Playback position" />
          </div>
          <div class="toby-player-transport">
            <button type="button" data-player-control="rewind" title="Rewind">REW</button>
            <button type="button" data-player-control="toggle-play" title="Play or pause" data-player-toggle>PLAY</button>
            <button type="button" data-player-control="forward" title="Fast forward">FF</button>
            <button type="button" data-player-control="previous" title="Previous episode">PREV</button>
            <button type="button" data-player-control="next" title="Next episode">NEXT</button>
          </div>
          <div class="toby-player-deck-side right">
            <label class="toby-player-volume-control">VOL <input type="range" min="0" max="200" value="100" data-player-volume /><output data-player-volume-label>100%</output></label>
            <button type="button" data-player-control="subtitles"><span>CC</span></button>
            <button type="button" data-player-control="audio"><span>AUDIO</span></button>
            <button type="button" data-player-control="options"><span>MENU</span></button>
            <button type="button" data-player-control="fullscreen"><span>FULL</span></button>
          </div>
        </section>
        <div class="toby-player-popover" data-player-popover hidden></div>
        <input type="file" accept=".srt,.vtt,text/vtt,application/x-subrip" data-player-subtitle-file hidden />
      </div>
    </div>
  `;
}

function launchTitlePlayback(item, options = {}) {
  const target = item ?? getTitleItem(state.selectedTitleId);
  if (!target) return;
  const payload = buildPlaybackPayload(target);
  if (options.startOver && payload) payload.startSeconds = 0;
  state.player = payload;
  render();
}

function launchTvEpisodePlayback(episodeId, options = {}) {
  const located = findAvailableTvEpisode(episodeId);
  if (!located) return;
  state.section = "tv";
  state.subView = "home";
  state.selectedTitleId = located.show.id;
  state.selectedTvSeason = { showId: located.show.id, seasonNumber: located.season.seasonNumber };
  state.selectedTvEpisodeId = located.episode.id;
  state.selectedCollectionId = null;
  state.selectedPersonId = null;
  state.castOverlay = null;
  state.player = buildTvPlaybackPayload(located);
  if (options.startOver && state.player) state.player.startSeconds = 0;
  render();
}

function buildPlaybackPayload(item) {
  if (item.mediaType === "tv") {
    const next = getNextTvEpisode(item);
    const located = next ? findAvailableTvEpisode(next.id) : null;
    return located ? buildTvPlaybackPayload(located) : buildMissingPlaybackPayload(item, "tv");
  }

  if (item.mediaType === "wrestling" || item.promotionName || item.promotion) {
    const record = getMetadataRecordForItem(item);
    const file = record?.files?.[0] ?? item.files?.[0] ?? null;
    const date = item.date ? formatDisplayDate(item.date) : item.year ?? "Date pending";
    const mediaKey = `wrestling:${item.metadataId ?? item.id}`;
    return {
      kind: "wrestling",
      itemId: item.id,
      mediaKey,
      filePath: file?.path ?? null,
      transport: initialPlaybackTransport(file),
      resumeKey: `wrestling:${item.metadataId ?? item.id}`,
      startSeconds: getInitialPlaybackSeconds(`wrestling:${item.metadataId ?? item.id}`, getMediaDurationSeconds(file)),
      durationSeconds: getMediaDurationSeconds(file),
      audioStreamIndex: readStreamSelection(mediaKey, "audio") ?? "default",
      subtitleStreamIndex: readStreamSelection(mediaKey, "subtitles") ?? "off",
      videoStreamIndex: readStreamSelection(mediaKey, "video") ?? "default",
      streamOptions: getStreamOptionsForFile(file),
      heading: item.title,
      infoLines: [item.promotionName ?? item.promotion ?? "Promotion pending", date, item.location ?? item.venue ?? "Location pending"],
      originLabel: getPlaybackOriginLabel(state.playbackOriginCollectionId),
      formatLabel: file ? formatFileLabel(file.path) : "UNMATCHED",
    };
  }

  const details = getTitleDetails(item);
  const record = getMetadataRecordForItem(item);
  const files = item.files?.length ? item.files : record?.files ?? [];
  const mediaKey = `movie:${item.id}`;
  const resumeKey = `movie:${item.id}`;
  const multipartFiles = getMultipartMovieFiles(files);
  const multipartSegments = multipartFiles.map((file) => ({
    filePath: file.path,
    part: file.multipartPart,
    durationSeconds: getMediaDurationSeconds(file),
    transport: initialPlaybackTransport(file),
    streamOptions: getStreamOptionsForFile(file),
  }));
  const multipartDuration = multipartSegments.reduce((total, segment) => total + (Number(segment.durationSeconds) || 0), 0);
  const selectedFile = multipartFiles[0] ?? getSelectedPlaybackFile(`movie:${item.id}`, files);
  const savedPosition = getInitialPlaybackSeconds(resumeKey, multipartDuration || getMediaDurationSeconds(selectedFile));
  const position = multipartSegments.length ? locateMultipartPosition(multipartSegments, savedPosition) : { index: 0, offset: 0, localSeconds: savedPosition };
  const activeSegment = multipartSegments[position.index] ?? null;
  const file = activeSegment ? multipartFiles[position.index] : selectedFile;
  return {
    kind: "movie",
    itemId: item.id,
    mediaKey,
    filePath: file?.path ?? null,
    transport: initialPlaybackTransport(file),
    resumeKey,
    startSeconds: position.localSeconds,
    durationSeconds: multipartDuration || getMediaDurationSeconds(file),
    segmentDurationSeconds: getMediaDurationSeconds(file),
    segmentOffsetSeconds: position.offset,
    multipartSegments,
    segmentIndex: position.index,
    audioStreamIndex: readStreamSelection(mediaKey, "audio") ?? "default",
    subtitleStreamIndex: readStreamSelection(mediaKey, "subtitles") ?? "off",
    videoStreamIndex: readStreamSelection(mediaKey, "video") ?? "default",
    streamOptions: getStreamOptionsForFile(file),
    heading: item.title,
    infoLines: [
      item.year ?? String(details.releaseDate ?? "").match(/\d{4}/)?.[0] ?? "Year pending",
      details.director ? `Dir. ${details.director}` : "Director pending",
      details.country ?? item.country ?? "Country pending",
    ],
    originLabel: getPlaybackOriginLabel(state.playbackOriginCollectionId),
    formatLabel: file ? formatFileLabel(file.path) : "UNMATCHED",
  };
}

function buildTvPlaybackPayload({ show, details, season, episode }) {
  const mediaKey = `tv:${episode.id}`;
  const file = getSelectedPlaybackFile(mediaKey, findMediaFilesForEpisode(show, episode));
  const resumeKey = `tv:${episode.id}`;
  const startSeconds = getInitialPlaybackSeconds(resumeKey, getMediaDurationSeconds(file));
  return {
    kind: "tv",
    itemId: show.id,
    episodeId: episode.id,
    mediaKey,
    filePath: file?.path ?? null,
    transport: initialPlaybackTransport(file),
    resumeKey,
    startSeconds,
    durationSeconds: getMediaDurationSeconds(file),
    audioStreamIndex: readStreamSelection(mediaKey, "audio") ?? "default",
    subtitleStreamIndex: getPreferredSubtitleSelection(mediaKey, getStreamOptionsForFile(file).subtitles),
    videoStreamIndex: readStreamSelection(mediaKey, "video") ?? "default",
    streamOptions: getStreamOptionsForFile(file),
    heading: episode.title,
    infoLines: [show.title, formatSeasonEpisode(episode), episode.airDate ? formatDisplayDate(episode.airDate) : "Airdate pending"],
    originLabel: getPlaybackOriginLabel(state.playbackOriginCollectionId),
    formatLabel: file ? formatFileLabel(file.path) : "UNMATCHED",
    nextEpisodeId: getEpisodeAfter(show, episode)?.id ?? null,
    previousEpisodeId: getEpisodeBefore(show, episode)?.id ?? null,
    backdropUrl: episode.stillUrl ?? details.backdropUrl ?? null,
    seasonNumber: season.seasonNumber,
  };
}

function readPlayerAutoplay() {
  try {
    return localStorage.getItem("tobytube.player.autoplay") !== "off";
  } catch {
    return true;
  }
}

function writePlayerAutoplay(enabled) {
  try {
    localStorage.setItem("tobytube.player.autoplay", enabled ? "on" : "off");
  } catch {}
}

function showPlayerNextEpisodeCard() {
  clearPlayerAutoplayCountdown();
  const nextId = state.player?.kind === "tv" ? state.player.nextEpisodeId : null;
  const located = nextId ? findAvailableTvEpisode(nextId) : null;
  const card = document.querySelector("[data-player-end-card]");
  const overlay = document.querySelector("[data-player-overlay]");
  if (!card || !located) return;
  const { show, episode } = located;
  const autoplay = readPlayerAutoplay();
  let remaining = 7;
  card.hidden = false;
  overlay?.classList.remove("is-idle");
  const draw = () => {
    card.innerHTML = `
      <div class="toby-player-next-still">${episode.stillUrl ? `<img src="${escapeHtml(episode.stillUrl)}" alt="" />` : `<span>NEXT</span>`}</div>
      <div class="toby-player-next-copy">
        <small>Up next / ${escapeHtml(show.title)}</small>
        <h2>${escapeHtml(episode.title)}</h2>
        <b>${escapeHtml(formatSeasonEpisode(episode))}${episode.airDate ? ` / ${escapeHtml(formatDisplayDate(episode.airDate))}` : ""}</b>
        <p>${escapeHtml(truncateText(episode.overview || "Episode summary pending.", 180))}</p>
        <div class="toby-player-next-actions">
          <button type="button" data-player-continue>Continue Watching</button>
          <button type="button" data-player-end-close>Not now</button>
        </div>
        <em data-player-autoplay-status>Autoplay: ${autoplay ? `ON / starting in ${remaining}` : "OFF"}</em>
      </div>`;
    card.querySelector("[data-player-continue]")?.addEventListener("click", () => launchTvEpisodePlayback(nextId));
    card.querySelector("[data-player-end-close]")?.addEventListener("click", () => {
      clearPlayerAutoplayCountdown();
      card.hidden = true;
    });
  };
  draw();
  if (!autoplay) return;
  playerAutoplayInterval = setInterval(() => {
    remaining -= 1;
    const status = card.querySelector("[data-player-autoplay-status]");
    if (status) status.textContent = `Autoplay: ON / starting in ${Math.max(remaining, 0)}`;
  }, 1000);
  playerAutoplayTimer = setTimeout(() => launchTvEpisodePlayback(nextId), 7000);
}

function buildMissingPlaybackPayload(item, kind) {
  return {
    kind,
    itemId: item.id,
    filePath: null,
    resumeKey: `${kind}:${item.id}`,
    heading: item.title,
    infoLines: ["No matched file", "Run a media scan", "Check D:/media"],
    originLabel: getPlaybackOriginLabel(state.playbackOriginCollectionId),
    formatLabel: "UNMATCHED",
  };
}

function findMediaFileForEpisode(show, episode) {
  return findMediaFilesForEpisode(show, episode)[0] ?? null;
}

function getInitialPlaybackSeconds(resumeKey, durationSeconds) {
  const saved = readResumeEntry(resumeKey);
  const seconds = Number(saved?.seconds ?? 0);
  if (!seconds || seconds < RESUME_THRESHOLD_SECONDS) return 0;
  if (durationSeconds && seconds >= durationSeconds - 8) return 0;
  return Math.floor(seconds);
}

function getStreamOptionsForFile(file) {
  const streams = file?.streams ?? {};
  return {
    video: streams.video ?? [],
    audio: streams.audio ?? [],
    subtitles: streams.subtitles ?? [],
  };
}

function getEpisodeBefore(show, episode) {
  const episodes = getAvailableTvSeasons(show).flatMap((season) => season.episodes ?? []);
  const index = episodes.findIndex((item) => item.id === episode.id);
  return index > 0 ? episodes[index - 1] : null;
}

function formatFileLabel(filePath) {
  const extension = String(filePath).split(".").pop()?.toUpperCase() ?? "MEDIA";
  return `${extension} DIRECT PLAY`;
}

function setupPlayerSource(video) {
  const source = video?.dataset?.playerSource;
  if (!video || !source) return;
  const canPlayNativeHls = video.canPlayType("application/vnd.apple.mpegurl");
  if (window.Hls?.isSupported?.() && source.includes("mode=hls")) {
    const hls = new window.Hls({ enableWorker: true, lowLatencyMode: false });
    video._tobytubeHls?.destroy?.();
    video._tobytubeHls = hls;
    hls.loadSource(source);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (!data?.fatal) return;
      if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else {
        hls.destroy();
        video._tobytubeHls = null;
        video.src = source.replace(/[?&]mode=hls\b/, "");
        video.load();
      }
    });
    return;
  }
  video.src = source;
  if (canPlayNativeHls || !source.includes("mode=hls")) video.load();
}

async function hydratePlayerPlaybackInfo(video) {
  if (!video || !state.player?.filePath) return;
  try {
    const url = new URL("./api/media/playback-info", window.location.href);
    url.searchParams.set("path", state.player.filePath);
    const response = await fetch(`${url.pathname}${url.search}`);
    if (!response.ok) throw new Error(`Playback inspection failed: ${response.status}`);
    const info = await response.json();
    if (!state.player || state.player.filePath !== info.path) return;
    const streamOptions = {
      video: info.streams?.video ?? state.player.streamOptions?.video ?? [],
      audio: info.streams?.audio ?? state.player.streamOptions?.audio ?? [],
      subtitles: info.streams?.subtitles ?? state.player.streamOptions?.subtitles ?? [],
    };
    let selectedSubtitle = String(state.player.subtitleStreamIndex ?? "off");
    let subtitleAvailable = selectedSubtitle === "off" || streamOptions.subtitles.some((track) => String(track.index) === selectedSubtitle) || Boolean(state.player.multipartSegments?.length);
    if (!subtitleAvailable && readGlobalSubtitlePreference()?.enabled) {
      selectedSubtitle = getPreferredSubtitleSelection(state.player.mediaKey, streamOptions.subtitles);
      subtitleAvailable = streamOptions.subtitles.some((track) => String(track.index) === selectedSubtitle);
    }
    const previousTransport = state.player.transport;
    state.player = {
      ...state.player,
      transport: info.transport ?? "direct",
      durationSeconds: state.player.multipartSegments?.length ? state.player.durationSeconds : Number(info.durationSeconds) || state.player.durationSeconds,
      segmentDurationSeconds: state.player.multipartSegments?.length ? Number(info.durationSeconds) || state.player.segmentDurationSeconds : state.player.segmentDurationSeconds,
      streamOptions,
      subtitleStreamIndex: subtitleAvailable ? selectedSubtitle : "off",
    };
    if (previousTransport !== state.player.transport) {
      const wasPaused = video.paused;
      state.player = { ...state.player, startSeconds: Math.floor(getPlayerAbsoluteTime(video)), userPaused: wasPaused };
      video.dataset.playerSource = buildPlaybackStreamUrl(state.player);
      setupPlayerSource(video);
    }
  } catch {
    state.player = { ...state.player, transport: state.player.transport ?? "direct" };
  }
  applyPlayerSubtitleSelection(video);
  setTimeout(() => hydratePlayerTrackOptions(video, state.player?.filePath), 900);
}

async function hydratePlayerTrackOptions(video, filePath) {
  if (!video || !filePath || state.player?.filePath !== filePath) return;
  try {
    const url = new URL("./api/media/playback-info", window.location.href);
    url.searchParams.set("path", filePath);
    url.searchParams.set("deep", "true");
    const response = await fetch(`${url.pathname}${url.search}`);
    if (!response.ok) return;
    const info = await response.json();
    if (!state.player || state.player.filePath !== filePath) return;
    const previousTransport = state.player.transport;
    state.player = {
      ...state.player,
      transport: info.transport ?? state.player.transport,
      durationSeconds: state.player.multipartSegments?.length ? state.player.durationSeconds : Number(info.durationSeconds) || state.player.durationSeconds,
      segmentDurationSeconds: state.player.multipartSegments?.length ? Number(info.durationSeconds) || state.player.segmentDurationSeconds : state.player.segmentDurationSeconds,
      streamOptions: {
        video: info.streams?.video ?? state.player.streamOptions?.video ?? [],
        audio: info.streams?.audio ?? state.player.streamOptions?.audio ?? [],
        subtitles: info.streams?.subtitles ?? state.player.streamOptions?.subtitles ?? [],
      },
    };
    if (previousTransport !== state.player.transport) {
      const wasPaused = video.paused;
      state.player = { ...state.player, startSeconds: Math.floor(getPlayerAbsoluteTime(video)), userPaused: wasPaused };
      video.dataset.playerSource = buildPlaybackStreamUrl(state.player);
      setupPlayerSource(video);
    }
    applyPlayerSubtitleSelection(video);
  } catch {}
}
function recordPlayerCompletion(video) {
  if (!state.player || state.player.completionRecorded) return false;
  const player = state.player;
  state.player = { ...player, completionRecorded: true };
  localStorage.removeItem(`tobytube.resume.${player.resumeKey}`);
  if (player.kind === "tv" && player.episodeId) {
    markTvEpisodeCompleted(player.episodeId);
    recordCompletedTvEpisodeForSession(player.itemId, player.episodeId, player.nextEpisodeId, state.playbackOriginCollectionId);
    appendLocalHistory(player.itemId, "episode-completion-threshold");
  } else if (player.itemId) {
    markItemWatched(player.itemId);
    appendLocalHistory(player.itemId, `${player.kind ?? "media"}-completion-threshold`);
  }
  return true;
}

function recordPlayerCompletionAtThreshold(video) {
  if (!state.player || state.player.completionRecorded) return false;
  const duration = getPlayerDuration(video);
  const absoluteTime = getPlayerAbsoluteTime(video);
  if (!duration || absoluteTime <= 0) return false;
  const thresholdSeconds = state.player.kind === "tv" ? 2 * 60 : 7 * 60;
  if (duration - absoluteTime > thresholdSeconds) return false;
  return recordPlayerCompletion(video);
}

function syncPlayerOverlay() {
  const overlay = document.querySelector("[data-player-overlay]");
  if (!overlay) return;
  const video = overlay.querySelector(".toby-player-video");
  let idleTimer = null;
  const showChrome = () => {
    overlay.classList.remove("is-idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const activeVideo = overlay.querySelector(".toby-player-video");
      if (!activeVideo?.paused) overlay.classList.add("is-idle");
    }, 4000);
  };

  ["mousemove", "pointermove", "keydown", "click"].forEach((eventName) => {
    overlay.addEventListener(eventName, showChrome);
  });
  showChrome();

  if (video) {
    const resumeKey = video.dataset.resumeKey;
    const savedEntry = readResumeEntry(resumeKey);
    const savedTime = Number(savedEntry?.seconds ?? 0);
    const progress = overlay.querySelector("[data-player-progress]");
    const timeLabel = overlay.querySelector("[data-player-time]");
    const volume = overlay.querySelector("[data-player-volume]");
    const volumeLabel = overlay.querySelector("[data-player-volume-label]");
    const toggle = overlay.querySelector("[data-player-toggle]");
    if (volume) volume.value = readPlayerVolume();
    applyPlayerVolume(video, Number(volume?.value ?? readPlayerVolume()));
    if (volumeLabel) volumeLabel.textContent = `${volume?.value ?? readPlayerVolume()}%`;
    video.addEventListener("loadedmetadata", () => {
      applyInitialPlayerSeek(video);
      if (!state.player?.userPaused) video.play().catch(() => {});
      updatePlayerStatus(video, progress, timeLabel, toggle);
    }, { once: true });
    video.addEventListener("error", () => {
      if (state.player?.transport === "direct" && !state.player.compatibilityRetry) {
        const retryAt = getPlayerAbsoluteTime(video);
        const wasPaused = Boolean(state.player?.userPaused || video.paused);
        state.player = { ...state.player, transport: "local-transcode", startSeconds: retryAt, userPaused: wasPaused, compatibilityRetry: true };
        video.dataset.playerSource = buildPlaybackStreamUrl(state.player);
        showPlayerFeedback("Compatibility playback");
        setupPlayerSource(video);
        video.addEventListener("canplay", () => {
          if (!state.player?.userPaused) video.play().catch(() => {});
        }, { once: true });
        return;
      }
      const transportMessage = state.player?.transport === "local-transcode"
        ? "Live compatibility conversion stopped before the browser received playable video."
        : "The selected playback source could not be opened.";
      showPlayerPopover("Playback", [getVideoErrorMessage(video), transportMessage]);
    });
    setupPlayerSource(video);
    hydratePlayerPlaybackInfo(video);
    video.addEventListener("play", () => {
      if (state.player) state.player.userPaused = false;
      updatePlayerStatus(video, progress, timeLabel, toggle);
    });
    video.addEventListener("pause", () => {
      if (state.player && !video.ended) state.player.userPaused = true;
      clearTimeout(idleTimer);
      overlay.classList.remove("is-idle");
      updatePlayerStatus(video, progress, timeLabel, toggle);
    });
    video.addEventListener("timeupdate", () => {
      if (progress?.dataset.scrubbing !== "true") updatePlayerStatus(video, progress, timeLabel, toggle);
      const absoluteTime = getPlayerAbsoluteTime(video);
      const duration = getPlayerDuration(video);
      if (absoluteTime >= RESUME_THRESHOLD_SECONDS && duration && absoluteTime < duration - 5) {
        localStorage.setItem(`tobytube.resume.${resumeKey}`, JSON.stringify({
          schemaVersion: RESUME_SCHEMA_VERSION,
          key: resumeKey,
          kind: state.player?.kind,
          itemId: state.player?.itemId,
          episodeId: state.player?.episodeId ?? null,
          label: buildResumeLabel(state.player),
          primaryLabel: buildResumePrimaryLabel(state.player),
          secondaryLabel: buildResumeSecondaryLabel(state.player),
          seconds: Math.floor(absoluteTime),
          duration: Math.floor(duration),
          progress: Math.round((absoluteTime / duration) * 100),
          updatedAt: new Date().toISOString(),
        }));
      }
      recordPlayerCompletionAtThreshold(video);
    });
    video.addEventListener("ended", () => {
      if (state.player?.multipartSegments?.length && Number(state.player.segmentIndex) < state.player.multipartSegments.length - 1) {
        const nextIndex = Number(state.player.segmentIndex) + 1;
        const nextSegment = state.player.multipartSegments[nextIndex];
        state.player = {
          ...state.player,
          filePath: nextSegment.filePath,
          transport: nextSegment.transport,
          streamOptions: nextSegment.streamOptions,
          segmentIndex: nextIndex,
          segmentOffsetSeconds: getMultipartSegmentOffset(state.player.multipartSegments, nextIndex),
          segmentDurationSeconds: nextSegment.durationSeconds,
          startSeconds: 0,
          compatibilityRetry: false,
        };
        render();
        return;
      }
      recordPlayerCompletion(video);
      if (state.player?.kind === "tv" && state.player.nextEpisodeId) showPlayerNextEpisodeCard();
    });
    progress?.addEventListener("input", () => {
      progress.dataset.scrubbing = "true";
      const duration = getPlayerDuration(video);
      if (!duration || !timeLabel) return;
      const preview = (Number(progress.value) / 1000) * duration;
      timeLabel.textContent = `${formatPlayerTime(preview)} / ${formatPlayerTime(duration)}`;
    });
    progress?.addEventListener("change", () => {
      const duration = getPlayerDuration(video);
      if (!duration) return;
      const target = (Number(progress.value) / 1000) * duration;
      delete progress.dataset.scrubbing;
      seekPlayerTo(video, target);
    });
    progress?.addEventListener("blur", () => { delete progress.dataset.scrubbing; });
    volume?.addEventListener("input", () => {
      applyPlayerVolume(video, Number(volume.value));
      if (volumeLabel) volumeLabel.textContent = `${volume.value}%`;
      writePlayerVolume(volume.value);
    });
    overlay.querySelector("[data-player-subtitle-file]")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await uploadPlayerSubtitle(file, video);
      event.target.value = "";
    });
  }

  overlay.querySelectorAll("[data-player-control]").forEach((button) => {
    button.addEventListener("click", () => handlePlayerControl(button.dataset.playerControl, video));
  });
}

let playerAudioContext = null;
let playerAudioSource = null;
let playerGainNode = null;
let playerGainVideo = null;

function applyPlayerVolume(video, percent) {
  if (!video) return;
  const normalized = Math.max(0, Math.min(200, Number(percent) || 0));
  video.muted = normalized === 0;
  if (normalized <= 100) {
    video.volume = normalized / 100;
    if (playerGainNode) playerGainNode.gain.value = 1;
    return;
  }
  video.volume = 1;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!playerAudioContext) playerAudioContext = new AudioContextClass();
    if (playerGainVideo !== video) {
      playerAudioSource?.disconnect();
      playerGainNode?.disconnect();
      playerAudioSource = playerAudioContext.createMediaElementSource(video);
      playerGainNode = playerAudioContext.createGain();
      playerAudioSource.connect(playerGainNode).connect(playerAudioContext.destination);
      playerGainVideo = video;
    }
    playerAudioContext.resume?.();
    playerGainNode.gain.value = normalized / 100;
  } catch {
    // Fall back to the browser's native 100% ceiling without interrupting play.
  }
}

async function uploadPlayerSubtitle(file, video) {
  if (!state.player?.filePath) return showPlayerFeedback("No local media file");
  try {
    const response = await fetch("./api/subtitles/upload", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-media-path": encodeURIComponent(state.player.filePath),
        "x-subtitle-name": encodeURIComponent(file.name),
      },
      body: file,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Subtitle upload failed");
    await refreshPlayerSubtitleTracks(video, result.subtitlePath);
    showPlayerFeedback("Subtitle added");
  } catch (error) {
    showPlayerFeedback(error.message || "Subtitle upload failed");
  }
}

async function refreshPlayerSubtitleTracks(video, preferredPath = "") {
  const url = new URL("./api/media/playback-info", window.location.href);
  url.searchParams.set("path", state.player.filePath);
  const response = await fetch(url, { cache: "no-store" });
  const info = await response.json();
  const subtitles = info.streams?.subtitles ?? [];
  const preferred = subtitles.find((track) => track.externalPath === preferredPath) ?? subtitles.at(-1);
  state.player = { ...state.player, streamOptions: { ...state.player.streamOptions, subtitles }, subtitleStreamIndex: preferred ? String(preferred.index) : "off" };
  if (preferred) applyPlayerSubtitleSelection(video, String(preferred.index));
}

function handlePlayerControl(action, video) {
  if (action === "home") {
    state.player = null;
    state.section = "home";
    clearTitleSelection();
    render();
    return;
  }
  if (action === "back") {
    state.player = null;
    render();
    return;
  }
  if (action === "toggle-play" && video) {
    if (video.paused) {
      if (state.player) state.player.userPaused = false;
      video.play().catch(() => {});
    } else {
      if (state.player) state.player.userPaused = true;
      video.pause();
    }
  }
  if (action === "rewind" && video) {
    seekPlayerTo(video, Math.max(0, getPlayerAbsoluteTime(video) - 15));
    showPlayerFeedback("-15s");
  }
  if (action === "forward" && video) {
    const duration = getPlayerDuration(video);
    seekPlayerTo(video, Math.min(duration || getPlayerAbsoluteTime(video) + 15, getPlayerAbsoluteTime(video) + 15));
    showPlayerFeedback("+15s");
  }
  if (action === "previous" && state.player?.previousEpisodeId) launchTvEpisodePlayback(state.player.previousEpisodeId);
  if (action === "next" && state.player?.nextEpisodeId) launchTvEpisodePlayback(state.player.nextEpisodeId);
  if (action === "fullscreen") togglePlayerFullscreen();
  if (action === "subtitles") showPlayerPopover("Subtitles", getPlayerSubtitleOptions(video), "subtitles");
  if (action === "audio") showPlayerPopover("Audio Track", getPlayerAudioOptions(video), "audio");
  if (action === "options") showPlayerPopover("Options", [
    { value: "autoplay", label: `Autoplay: ${readPlayerAutoplay() ? "On" : "Off"}` },
    { value: "resume", label: "Resume enabled" },
    { value: "diagnostic", label: getVideoAudioDiagnostic(video) },
  ], "options");
}

function clearTitleSelection() {
  state.selectedTitleId = null;
  state.selectedPersonId = null;
  state.selectedTvSeason = null;
  state.selectedTvEpisodeId = null;
  state.selectedTvGuideItemId = null;
  state.selectedCollectionId = null;
  state.playbackOriginCollectionId = null;
  state.selectedMcuSeasonId = null;
  state.selectedMcuShowId = null;
  state.selectedCriterionEclipseId = null;
  state.selectedCriterionSubCollectionId = null;
  state.selectedIndiaLanguageId = null;
  state.returnPage = null;
}


function applyInitialPlayerSeek(video) {
  const startSeconds = Number(state.player?.startSeconds ?? 0);
  if (!video || !Number.isFinite(startSeconds) || startSeconds <= 0) return;
  const duration = Number(state.player?.segmentDurationSeconds) || (Number.isFinite(video?.duration) ? Number(video.duration) : 0);
  if (state.player?.transport === "direct" && duration && startSeconds < duration - 5) {
    video.currentTime = startSeconds;
    state.player = { ...state.player, startSeconds: 0 };
  }
}
function updatePlayerStatus(video, progress, timeLabel, toggle) {
  const duration = getPlayerDuration(video);
  const current = getPlayerAbsoluteTime(video);
  if (progress && duration) progress.value = String(Math.round((current / duration) * 1000));
  if (timeLabel) timeLabel.textContent = `${formatPlayerTime(current)} / ${formatPlayerTime(duration)}`;
  if (toggle) toggle.textContent = video.paused ? "PLAY" : "PAUSE";
}

function getPlayerDuration(video) {
  return Number(state.player?.durationSeconds) || (Number.isFinite(video?.duration) ? Number(video.duration) : 0);
}

function restartPlaybackAt(seconds) {
  if (!state.player) return;
  if (state.player.multipartSegments?.length) {
    const position = locateMultipartPosition(state.player.multipartSegments, seconds);
    const segment = state.player.multipartSegments[position.index];
    state.player = {
      ...state.player,
      filePath: segment.filePath,
      transport: segment.transport,
      streamOptions: segment.streamOptions,
      segmentIndex: position.index,
      segmentOffsetSeconds: position.offset,
      segmentDurationSeconds: segment.durationSeconds,
      startSeconds: position.localSeconds,
      compatibilityRetry: false,
    };
    render();
    return;
  }
  updatePlayerStartTime(seconds);
  render();
}

function seekPlayerTo(video, seconds) {
  if (!video || !state.player) return;
  const target = Math.max(0, Number(seconds) || 0);
  if (state.player.multipartSegments?.length) {
    const position = locateMultipartPosition(state.player.multipartSegments, target);
    if (position.index !== state.player.segmentIndex || state.player.transport !== "direct") {
      restartPlaybackAt(target);
      return;
    }
    state.player = { ...state.player, startSeconds: 0, segmentOffsetSeconds: position.offset };
    video.currentTime = position.localSeconds;
    return;
  }
  if (state.player.transport === "direct") {
    state.player = { ...state.player, startSeconds: 0 };
    video.currentTime = target;
    return;
  }
  restartPlaybackAt(target);
}

function readPlayerVolume() {
  try {
    return localStorage.getItem("tobytube.player.volume") ?? "100";
  } catch {
    return "100";
  }
}

function writePlayerVolume(value) {
  try {
    localStorage.setItem("tobytube.player.volume", value);
  } catch {}
}

function buildResumeLabel(player) {
  if (!player) return "Resume";
  if (player.kind === "tv") return [player.infoLines?.[0], player.heading, player.infoLines?.[1]].filter(Boolean).join(" / ");
  return player.heading ?? "Resume";
}

function buildResumePrimaryLabel(player) {
  return player?.heading ?? "Resume";
}

function buildResumeSecondaryLabel(player) {
  if (!player) return "";
  if (player.kind === "tv") return [player.infoLines?.[0], player.infoLines?.[1]].filter(Boolean).join(" / ");
  if (player.kind === "movie") return player.infoLines?.[0] ?? "Movie";
  if (player.kind === "wrestling") return [player.infoLines?.[0], player.infoLines?.[1]].filter(Boolean).join(" / ");
  return player.formatLabel ?? "";
}

function getPlayerSubtitleOptions(video) {
  const options = state.player?.streamOptions?.subtitles ?? [];
  return [
    { value: "off", label: "Off" },
    ...options.map((track, index) => ({ value: String(track.index), label: track.label || `Subtitle ${index + 1}` })),
    { value: "browse-video-folder", label: "Browse video folder…" },
    { value: "upload-subtitle", label: "Upload subtitle file…" },
    { value: "search-opensubtitles", label: "Search OpenSubtitles…" },
  ];
}

function getPlayerAudioOptions(video) {
  const options = state.player?.streamOptions?.audio ?? [];
  return options.length ? options.map((track, index) => ({ value: String(track.index), label: track.label || `Audio ${index + 1}` })) : [{ value: "default", label: "Default audio" }];
}

function getVideoAudioDiagnostic(video) {
  if (!video) return "No active video element";
  if (video.readyState === 0) return "Media stream has not loaded yet";
  if (video.muted) return "Video is muted";
  if (Number(video.volume) === 0) return "Volume is at zero";
  return "Browser direct-play audio is enabled";
}

function getVideoErrorMessage(video) {
  const code = video?.error?.code;
  return {
    1: "Playback aborted",
    2: "Network error while loading media",
    3: "Browser could not decode this media stream",
    4: "Media source is not supported by this browser",
  }[code] ?? "Unknown playback error";
}

function readResumeEntry(resumeKey) {
  const value = localStorage.getItem(`tobytube.resume.${resumeKey}`) ?? localStorage.getItem(resumeKey);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "number" ? { seconds: parsed } : parsed;
  } catch {
    return { seconds: Number(value) };
  }
}

function formatPlayerTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function showPlayerFeedback(text) {
  const feedback = document.querySelector("[data-player-feedback]");
  if (!feedback) return;
  feedback.textContent = text;
  feedback.classList.add("visible");
  setTimeout(() => feedback.classList.remove("visible"), 900);
}

function showPlayerPopover(title, items, streamKind = null) {
  const popover = document.querySelector("[data-player-popover]");
  if (!popover) return;
  const normalizedItems = items.map((item) => (typeof item === "string" ? { value: item, label: item } : item));
  let selectedValue = ["subtitles", "audio"].includes(streamKind)
    ? String(state.player?.[streamKind === "subtitles" ? "subtitleStreamIndex" : "audioStreamIndex"] ?? (streamKind === "subtitles" ? "off" : "default"))
    : null;
  if (streamKind === "audio" && selectedValue === "default" && normalizedItems.length) selectedValue = String(normalizedItems[0].value);
  popover.hidden = false;
  popover.innerHTML = `
    <b>${escapeHtml(title)}</b>
    ${normalizedItems.map((item, index) => {
      const selected = selectedValue !== null && String(item.value) === selectedValue;
      return `<button type="button" class="${selected ? "is-selected" : ""}" aria-pressed="${selected}" data-popover-index="${index}" data-popover-value="${escapeHtml(item.value)}"><span>${escapeHtml(item.label)}</span><i class="player-selection-mark" aria-hidden="true">${selected ? "&#10003;" : ""}</i></button>`;
    }).join("")}
  `;
  popover.querySelectorAll("[data-popover-index]").forEach((button) => {
    button.addEventListener("click", () => handlePlayerPopoverChoice(title, Number(button.dataset.popoverIndex), button.dataset.popoverValue, streamKind));
  });
  clearTimeout(showPlayerPopover.timer);
  showPlayerPopover.timer = setTimeout(() => {
    popover.hidden = true;
  }, 4500);
}

function handlePlayerPopoverChoice(title, index, value, streamKind) {
  const video = document.querySelector(".toby-player-video");
  if (!video) return;
  if (streamKind === "subtitles" && value === "upload-subtitle") {
    document.querySelector("[data-player-subtitle-file]")?.click();
    document.querySelector("[data-player-popover]")?.setAttribute("hidden", "");
    return;
  }
  if (streamKind === "subtitles" && value === "browse-video-folder") {
    browseVideoFolderSubtitles(video);
    return;
  }
  if (streamKind === "folder-subtitles" && String(value).startsWith("folder-subtitle:")) {
    selectFolderSubtitle(decodeURIComponent(value.slice("folder-subtitle:".length)), video);
    return;
  }
  if (streamKind === "subtitles" && value === "search-opensubtitles") {
    searchOpenSubtitles(video);
    return;
  }
  if (streamKind === "opensubtitles" && String(value).startsWith("opensubtitles:")) {
    downloadOpenSubtitle(value.split(":")[1], video);
    return;
  }
  if (streamKind === "options") {
    if (value === "autoplay") {
      writePlayerAutoplay(!readPlayerAutoplay());
      showPlayerPopover("Options", [
        { value: "autoplay", label: `Autoplay: ${readPlayerAutoplay() ? "On" : "Off"}` },
        { value: "resume", label: "Resume enabled" },
        { value: "diagnostic", label: getVideoAudioDiagnostic(video) },
      ], "options");
    }
    return;
  }
  if (streamKind && state.player?.mediaKey) {
    writeStreamSelection(state.player.mediaKey, streamKind, value);
    if (streamKind === "subtitles") {
      writeGlobalSubtitlePreference(value, state.player.streamOptions?.subtitles ?? []);
      state.player = { ...state.player, subtitleStreamIndex: value };
      applyPlayerSubtitleSelection(video, value);
      document.querySelector("[data-player-popover]")?.setAttribute("hidden", "");
      return;
    }
    const absolute = getPlayerAbsoluteTime(video);
    state.player = {
      ...state.player,
      startSeconds: Math.floor(absolute),
      audioStreamIndex: streamKind === "audio" ? value : state.player.audioStreamIndex,
      videoStreamIndex: streamKind === "video" ? value : state.player.videoStreamIndex,
    };
    render();
    return;
  }
  if (title === "Subtitles") {
    Array.from(video.textTracks ?? []).forEach((track, trackIndex) => {
      track.mode = index > 0 && trackIndex === index - 1 ? "showing" : "disabled";
    });
  }
}

async function searchOpenSubtitles(video) {
  try {
    showPlayerFeedback("Searching subtitles…");
    const url = new URL("./api/subtitles/search", window.location.href);
    url.searchParams.set("query", state.player?.seriesTitle || state.player?.heading || "");
    url.searchParams.set("languages", "en");
    const response = await fetch(url, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "OpenSubtitles search failed");
    const choices = (result.results ?? []).slice(0, 8).map((entry) => ({ value: `opensubtitles:${entry.fileId}`, label: `${entry.language?.toUpperCase() || "SUB"} · ${entry.release || entry.fileName}` }));
    if (!choices.length) return showPlayerFeedback("No subtitles found");
    showPlayerPopover("OpenSubtitles", choices, "opensubtitles");
  } catch (error) {
    showPlayerFeedback(error.message || "OpenSubtitles unavailable");
  }
}

async function browseVideoFolderSubtitles(video) {
  try {
    const url = new URL("./api/subtitles/folder", window.location.href);
    url.searchParams.set("path", state.player?.filePath || "");
    const response = await fetch(url, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not open the video folder");
    const choices = (result.subtitles ?? []).map((entry) => ({ value: `folder-subtitle:${encodeURIComponent(entry.path)}`, label: entry.name }));
    if (!choices.length) return showPlayerFeedback("No SRT or VTT files in video folder");
    showPlayerPopover("Video Folder", choices, "folder-subtitles");
  } catch (error) {
    showPlayerFeedback(error.message || "Video folder unavailable");
  }
}

function selectFolderSubtitle(subtitlePath, video) {
  const subtitles = state.player?.streamOptions?.subtitles ?? [];
  const existing = subtitles.find((track) => track.externalPath === subtitlePath);
  const track = existing ?? {
    index: `external:folder:${Date.now()}`,
    label: `${subtitlePath.split(/[\\/]/).pop()} · Same folder`,
    source: "external",
    externalPath: subtitlePath,
  };
  const next = existing ? subtitles : [...subtitles, track];
  state.player = { ...state.player, streamOptions: { ...state.player.streamOptions, subtitles: next }, subtitleStreamIndex: String(track.index) };
  applyPlayerSubtitleSelection(video, String(track.index));
  document.querySelector("[data-player-popover]")?.setAttribute("hidden", "");
}

async function downloadOpenSubtitle(fileId, video) {
  try {
    showPlayerFeedback("Downloading subtitle…");
    const response = await fetch("./api/subtitles/download", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileId, mediaPath: state.player?.filePath }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Subtitle download failed");
    await refreshPlayerSubtitleTracks(video, result.subtitlePath);
    showPlayerFeedback("Subtitle downloaded");
  } catch (error) {
    showPlayerFeedback(error.message || "Subtitle download failed");
  }
}

function togglePlayerFullscreen() {
  const overlay = document.querySelector("[data-player-overlay]");
  if (!overlay || !app) return;
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    app.requestFullscreen?.();
  }
}

function formatMovieRuntime(runtime) {
  const minutes = typeof runtime === "number" ? runtime : Number(String(runtime ?? "").match(/\d+/)?.[0]);
  if (!minutes) return runtime ?? "Runtime pending";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins} min`;
  return mins ? `${hours} hr ${mins} min` : `${hours} hr`;
}

function truncateText(value = "", maxLength = 160) {
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function getRelatedMovies(item) {
  const baseYear = Number(item.year);
  const source = state.libraryMode === "media" ? getMovieLibraryItems() : movies;
  const itemGenre = getPrimaryGenreForItem(item);
  return source
    .filter((movie) => movie.id !== item.id)
    .filter((movie) => state.libraryMode !== "media" || hasPlayableMediaFiles(movie))
    .map((movie) => {
      const movieGenre = getPrimaryGenreForItem(movie);
      const genreScore = movieGenre && itemGenre && movieGenre === itemGenre ? 6 : 0;
      const yearScore = Number.isFinite(baseYear) && Number.isFinite(Number(movie.year)) ? Math.max(0, 4 - Math.abs(Number(movie.year) - baseYear) / 5) : 0;
      return { movie, score: genreScore + yearScore };
    })
    .filter((entry) => entry.score > 0 || state.libraryMode !== "media")
    .sort((a, b) => b.score - a.score || Number(b.movie.year) - Number(a.movie.year))
    .map(({ movie }) => movie);
}

function getRelatedMediaFamily(item) {
  if (!item?.id || !item.title) return [];
  const pool = [...getMovieLibraryItems(), ...getTvLibraryItems()];
  const byId = new Map(pool.filter((candidate) => candidate?.id && candidate.id !== item.id).map((candidate) => [candidate.id, candidate]));
  const override = getItemMetadataOverride(item.id);
  const explicitIds = [...new Set([...(override.relatedMediaIds ?? []), ...(item.relatedMediaIds ?? [])])];
  const result = explicitIds.map((id) => byId.get(id) ?? getTitleItem(id)).filter(Boolean);
  // User-created franchises are reciprocal title-page pipelines. The durable
  // hub record stays available for later, without becoming the main UI.
  getFranchisesForItem(item.id).forEach((franchise) => {
    (franchise.memberIds ?? [])
      .filter((id) => id !== item.id)
      .map((id) => byId.get(id) ?? getTitleItem(id))
      .filter(Boolean)
      .forEach((candidate) => result.push(candidate));
  });
  const currentKey = franchiseCandidateKey(item);
  Object.entries(HORROR_FRANCHISE_RULES).forEach(([hubId, rules]) => {
    const allKeys = Object.values(rules.carousels ?? {}).flat();
    if (!allKeys.includes(currentKey)) return;
    Object.keys(rules.carousels ?? {}).forEach((carouselTitle) => {
      getFranchiseCarouselItems({ id: hubId }, carouselTitle)
        .filter((candidate) => candidate?.id && !candidate.franchisePlaceholder && candidate.id !== item.id)
        .forEach((candidate) => result.push(candidate));
    });
  });

  const explicitFamilyKey = String(override.franchiseKey ?? item.franchiseKey ?? "").trim().toLowerCase();
  const automaticFamilyKey = explicitFamilyKey || inferMediaFamilyKey(item.title);
  if (automaticFamilyKey) {
    pool.filter((candidate) => candidate.id !== item.id && mediaTitleContainsFamily(candidate.title, automaticFamilyKey)).forEach((candidate) => result.push(candidate));
  }

  return [...new Map(result.map((candidate) => [candidate.id, candidate])).values()]
    .filter((candidate) => state.libraryMode !== "media" || hasPlayableMediaFiles(candidate))
    .sort((a, b) => Number(a.year ?? a.startYear ?? 9999) - Number(b.year ?? b.startYear ?? 9999) || getDisplayTitle(a).localeCompare(getDisplayTitle(b)));
}

function inferMediaFamilyKey(title) {
  const normalized = normalizeTitleForMatch(title);
  const configured = [
    ...Object.values(HORROR_FRANCHISE_RULES).flatMap((rules) => rules.folderKeys ?? []).map((key) => normalizeTitleForMatch(key)),
    "terminator",
    "bob s burgers",
    "beavis and butt head",
  ];
  const collectionAnchors = getGroupedCollections()
    .filter((group) => /^(sagas|worlds|boxed sets)$/i.test(group.title))
    .flatMap((group) => group.collections ?? [])
    .map((collection) => normalizeTitleForMatch(collection.title))
    .filter((key) => key.length >= 5);
  return [...new Set([...configured, ...collectionAnchors])]
    .filter((key) => mediaTitleContainsFamily(normalized, key))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

function mediaTitleContainsFamily(title, familyKey) {
  const normalizedTitle = ` ${normalizeTitleForMatch(title)} `;
  const normalizedKey = ` ${normalizeTitleForMatch(familyKey)} `;
  return normalizedTitle.includes(normalizedKey);
}

function renderTvProgramScreen(show) {
  const details = getTvDetails(show);
  const seasons = getAvailableTvSeasons(show);
  const resume = getResumeEntryForTvShow(show.id);
  const next = resume?.episodeId ? findAvailableTvEpisode(resume.episodeId)?.episode : getNextTvEpisode(show);
  const episodeQueueLabel = Number(resume?.seconds ?? 0) >= TV_CURRENT_EPISODE_THRESHOLD_SECONDS ? "Current Episode" : "Next Episode";
  const playLabel = resume?.episodeId ? "Resume Watching" : "Play";
  const relatedMovies = getRelatedMediaFamily(show).filter((entry) => entry.mediaType === "movie");
  return `
    <div class="toby-tv-detail toby-tv-program-page">
      ${renderTobyTvTopbar()}
      <button class="toby-tv-back" type="button" data-action="back-title">Back</button>
      <section class="toby-tv-program-layout">
        <div class="toby-tv-poster-frame">
          ${renderPosterBlock({ ...show, posterOverrideUrl: details.posterUrl }, "toby-tv-main-poster")}
          ${renderMediaStoplightButton(show, "gear")}
        </div>
        <div class="toby-tv-main-copy">
          <h1>${escapeHtml(getDisplayTitle(show))}</h1>
          <p class="toby-tv-meta">${escapeHtml(renderTobyTvProgramMeta(show, details))}</p>
          ${renderTobyTvRatings(details)}
          <p class="toby-tv-overview">${escapeHtml(details.overview || "Synopsis will appear here once this show is matched.")}</p>
          <div class="toby-tv-actions">
            <button class="toby-tv-play" type="button" data-action="play-tv-episode" data-play-tv-episode-id="${next?.id ?? ""}"><span></span>${playLabel}</button>
            <button class="toby-tv-secondary" type="button" data-action="random-tv-episode" data-tv-show-id="${show.id}">Random Episode</button>
            ${renderDetailMixtapeButton(show)}
            ${renderCompletionCheck(show)}
          </div>
          ${renderTobyTvNextEpisode(show, next, episodeQueueLabel)}
        </div>
        <aside class="toby-tv-side">
          <div class="toby-tv-counts">
            <strong>${seasons.length} seasons</strong>
            <span>${countTvEpisodes(seasons)} episodes in library</span>
          </div>
          ${renderTobyTvFoundIn(show)}
        </aside>
      </section>
      ${renderTobyTvSeasonShelf(show, seasons)}
      ${renderRelatedMediaShelf(relatedMovies.length === 1 ? "Movie" : "Movies", relatedMovies)}
      ${renderTobyTvSubcollectionShelf(show)}
      ${renderTobyTvCastShelf(details.cast ?? [], `Cast for ${show.title}`, `program:${show.id}`)}
    </div>
  `;
}

const TV_SUBCOLLECTION_RULES = {
  "bobs-burgers": [
    {
      id: "autumnal-bobs",
      title: "Autumnal Bob's",
      description: "Halloween, Thanksgiving, harvest weather, and the Belchers' annual surrender to autumn.",
      pattern: /full bars|fort night|dawn of the peck|hauntening|teen-a-witch|quirk-ducers|wolf of wharf|thanks-hoarding|nightmare on ocean|i bob your pardon|heartbreak hotel-oween|pumpkinening|stuck in the kitchen|apple gore-chard|putts-giving|twinnening/i,
    },
    {
      id: "holidays-with-the-belchers",
      title: "Holidays with the Belchers",
      description: "The family's Halloween, Thanksgiving, Christmas, and winter celebrations.",
      pattern: /thank|turkey|christmas|merry|gingerbread|nice-capades|better off sled|plight before|stunterful|father of the bob|diarrhea of a poopy kid/i,
    },
    {
      id: "gayle-force-winds",
      title: "Gayle Force Winds",
      description: "Episodes featuring Linda's magnificently unpredictable sister Gayle.",
      pattern: /gayle/i,
    },
  ],
};

function getTvSubcollections(show) {
  const rules = TV_SUBCOLLECTION_RULES[show.id] ?? TV_SUBCOLLECTION_RULES[slugify(show.title)] ?? [];
  const episodes = getAvailableTvSeasons(show).flatMap((season) => season.episodes ?? []);
  return rules
    .map((rule) => ({
      ...rule,
      showId: show.id,
      episodes: episodes.filter((episode) => rule.pattern.test(`${episode.title ?? ""} ${episode.overview ?? episode.summary ?? ""}`)),
    }))
    .filter((collection) => collection.episodes.length);
}

function renderTobyTvSubcollectionShelf(show) {
  const collections = getTvSubcollections(show);
  if (!collections.length) return "";
  return `
    <section class="toby-tv-shelf toby-tv-subcollections">
      <div class="toby-tv-section-title">${escapeHtml(slugify(show.title) === "bobs-burgers" ? "Burger of the Day" : "Mixtapes")}</div>
      <div class="toby-tv-season-carousel">
        ${collections.map((collection) => {
          const artwork = collection.episodes.find((episode) => episode.stillUrl)?.stillUrl ?? getTvDetails(show).posterUrl ?? TOBY_TV_LOGO_FALLBACK;
          return `
            <button class="toby-season-card toby-subcollection-card" type="button" data-tv-subcollection="${escapeHtml(collection.id)}" data-tv-show-id="${escapeHtml(show.id)}">
              <img src="${escapeHtml(artwork)}" alt="" loading="lazy" />
              <span>${escapeHtml(collection.title)}</span>
              <small>${collection.episodes.length} episodes</small>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderTvSubcollectionScreen(showId, collectionId) {
  const show = getTvTitleItem(showId);
  const collection = show ? getTvSubcollections(show).find((entry) => entry.id === collectionId) : null;
  if (!show || !collection) return `<button class="icon-button" type="button" data-action="back-title">Back</button><div class="empty">This TV collection has no playable episodes yet.</div>`;
  return `
    <div class="toby-tv-detail toby-tv-subcollection-page">
      ${renderTobyTvTopbar()}
      <button class="toby-tv-back" type="button" data-action="back-title">Back</button>
      <header class="toby-tv-subcollection-head">
        <div>
          <p class="toby-tv-season-kicker">${escapeHtml(show.title)} Collection</p>
          <h1>${escapeHtml(collection.title)}</h1>
          <p class="toby-tv-overview">${escapeHtml(collection.description)}</p>
          <p class="toby-tv-meta">${collection.episodes.length} playable episodes</p>
        </div>
      </header>
      <section class="toby-tv-shelf">
        <div class="toby-tv-section-title">Episodes</div>
        <div class="toby-tv-episode-carousel">
          ${collection.episodes.map((episode) => `
            <button class="toby-episode-card" type="button" data-tv-episode-id="${escapeHtml(episode.id)}">
              <img src="${escapeHtml(episode.stillUrl ?? TOBY_TV_LOGO_FALLBACK)}" alt="" loading="lazy" />
              <span>${escapeHtml(formatSeasonEpisode(episode))}</span>
              <b>${escapeHtml(episode.title)}</b>
              <small>${escapeHtml(truncateText(episode.overview || "Episode summary pending.", 82))}</small>
            </button>
          `).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderTvProgramStats(show, details) {
  const runtime = details.averageRuntime ? `${details.averageRuntime} min episodes` : "Runtime pending";
  const genres = details.genres.length ? details.genres.join(" / ") : "Genre pending";
  return `
    <dl class="tv-fact-list">
      <div><dt>Released</dt><dd>${escapeHtml(formatTvYear(details.firstAirDate, show.years))}</dd></div>
      <div><dt>Rating</dt><dd>${escapeHtml(details.rating || "NR")}</dd></div>
      <div><dt>Runtime</dt><dd>${escapeHtml(runtime)}</dd></div>
      <div><dt>Genres</dt><dd>${escapeHtml(genres)}</dd></div>
    </dl>
  `;
}

function renderTvMetaLine(show, details, season = null) {
  const release = season?.airDate
    ? formatDisplayDate(season.airDate)
    : details.firstAirDate
      ? formatDisplayDate(details.firstAirDate)
      : show.years ?? "Date pending";
  const rating = details.rating || "NR";
  const runtime = details.averageRuntime ? `${details.averageRuntime} min episodes` : "Runtime pending";
  const genres = details.genres?.length ? details.genres.join(", ") : "Genre pending";
  return `${release} / ${rating} / ${runtime} / ${genres}`;
}

function renderEpisodeMetaLine(episode) {
  const airDate = formatEpisodeAirDate(episode);
  const runtime = episode.runtime ? `${episode.runtime} min` : "Runtime pending";
  const rating = episode.voteAverage ? `${Number(episode.voteAverage).toFixed(1)} TMDB` : "Rating pending";
  return `${airDate} / ${runtime} / ${rating}`;
}

function renderTvRatings(details) {
  const tmdb = details.ratings?.tmdb ? Number(details.ratings.tmdb).toFixed(1) : "-";
  return `
    <div class="rating-row" aria-label="Ratings">
      <span class="rating-pill imdb">IMDb <b>${details.ratings?.imdb ?? "-"}</b></span>
      <span class="rating-pill tmdb">TMDB <b>${tmdb}</b></span>
      <span class="rating-pill rt">RT <b>${details.ratings?.rottenTomatoes ?? "-"}</b></span>
    </div>
  `;
}

function renderTvPrimaryActions(show) {
  const next = getNextTvEpisode(show);
  return `
    <div class="title-actions tv-actions">
      <button class="play-button" type="button" data-action="play-tv-episode" data-play-tv-episode-id="${next?.id ?? ""}">${next ? `Play ${formatEpisodeNumber(next)}` : "Play"}</button>
      ${renderActionIconButton("watchlist", "Add to Watchlist")}
      ${renderActionIconButton("watched", "Mark as Watched")}
    </div>
  `;
}

function renderTvSeasonWheel(show, seasons) {
  return `
    <section class="lane">
      <div class="lane-head">
        <h2>${seasons.length} ${seasons.length === 1 ? "Series" : "Series"}</h2>
        <span class="muted">In your library</span>
      </div>
      <div class="carousel">
        ${seasons.map((season) => renderTvSeasonCard(show, season)).join("") || `<div class="empty">No series in your library yet.</div>`}
      </div>
    </section>
  `;
}

function renderTvSeasonCard(show, season) {
  return `
    <article class="media-card library-card" data-tv-season data-tv-show-id="${escapeHtml(show.id)}" data-tv-season-number="${season.seasonNumber}" tabindex="0">
      ${renderPosterBlock(
        {
          ...show,
          title: season.title || `Series ${season.seasonNumber}`,
          posterOverrideUrl: season.posterUrl ?? getTvDetails(show).posterUrl,
          posterCode: `S${season.seasonNumber}`,
        },
      )}
      <div class="card-body">
        <div class="card-title">Series ${season.seasonNumber}</div>
        <div class="card-meta">${season.episodes.length} episodes</div>
      </div>
      ${renderTvSeasonCompletionCheck(show, season)}
    </article>
  `;
}

function renderTvSeasonScreen(showId, seasonNumber) {
  const show = getTvTitleItem(showId);
  const details = show ? getTvDetails(show) : null;
  const season = show ? getAvailableTvSeasons(show).find((item) => item.seasonNumber === Number(seasonNumber)) : null;
  if (!show || !details || !season) return `<button class="icon-button" type="button" data-action="back-title">Back</button><div class="empty">No playable episodes are matched for this season yet.</div>`;
  const resume = getResumeEntryForTvSeason(show.id, season.seasonNumber);
  const firstEpisode = resume?.episodeId ? findAvailableTvEpisode(resume.episodeId)?.episode : season.episodes[0];
  const playLabel = resume?.episodeId ? "Resume Watching" : "Play";

  return `
    <div class="toby-tv-detail toby-tv-season-page">
      ${renderTobyTvTopbar()}
      <button class="toby-tv-back" type="button" data-action="back-title">Back</button>
      <section class="toby-tv-season-layout">
        <aside class="toby-tv-season-side">
          <div class="toby-tv-poster-frame compact">
            ${renderPosterBlock(
              {
                ...show,
                title: season.title || `Season ${season.seasonNumber}`,
                posterOverrideUrl: season.posterUrl ?? details.posterUrl,
                posterCode: `S${season.seasonNumber}`,
              },
              "toby-tv-main-poster",
            )}
          </div>
          <p class="toby-tv-meta">${escapeHtml(renderTobyTvProgramMeta(show, details))}</p>
          ${renderTobyTvFoundIn(show)}
        </aside>
        <div class="toby-tv-season-main">
          <div class="toby-tv-season-head">
            <div>
              <h1>${escapeHtml(getDisplayTitle(show))}</h1>
              <p class="toby-tv-season-kicker">Season ${season.seasonNumber}</p>
              <p class="toby-tv-meta">${season.episodes.length} episodes</p>
              ${renderTobyTvRatings(details)}
            </div>
            <div class="toby-tv-actions slim">
              <button class="toby-tv-play" type="button" data-action="play-tv-episode" data-play-tv-episode-id="${firstEpisode?.id ?? ""}"><span></span>${playLabel}</button>
              <button class="toby-tv-secondary" type="button" data-action="random-tv-episode" data-tv-show-id="${show.id}">Random Episode</button>
              ${renderTvSeasonCompletionCheck(show, season)}
            </div>
          </div>
          ${renderTobyTvEpisodeList(show, season)}
        </div>
      </section>
      ${renderTobyTvSeasonShelf(show, getAvailableTvSeasons(show), season.seasonNumber)}
      ${renderTobyTvCastShelf(season.cast ?? details.cast ?? [], `Cast for ${show.title} Season ${season.seasonNumber}`, `season:${show.id}:${season.seasonNumber}`)}
    </div>
  `;
}

function renderEpisodeWheel(show, season) {
  return `
    <section class="lane">
      <div class="lane-head">
        <h2>Episodes</h2>
        <span class="muted">${season.episodes.length} available</span>
      </div>
      <div class="episode-carousel">
        ${season.episodes.map((episode) => renderEpisodeCard(show, episode)).join("")}
      </div>
    </section>
  `;
}

function renderEpisodeCard(show, episode) {
  return `
    <article class="episode-card" data-tv-episode-id="${episode.id}" tabindex="0">
      <div class="episode-still">${episode.stillUrl ? `<img src="${escapeHtml(episode.stillUrl)}" alt="" loading="lazy" />` : `<span>${escapeHtml(formatEpisodeNumber(episode))}</span>`}</div>
      <div class="episode-card-copy">
        <div class="card-title">${escapeHtml(formatEpisodeNumber(episode))}: ${escapeHtml(episode.title)}</div>
        <p>${escapeHtml(episode.overview || "Episode summary pending.")}</p>
      </div>
      ${renderCompletionCheck({ id: episode.id, mediaType: "episode" }, "Episode watched")}
    </article>
  `;
}

function renderTvEpisodeScreen(episodeId) {
  const located = findAvailableTvEpisode(episodeId);
  if (!located) return `<button class="icon-button" type="button" data-action="back-title">Back</button><div class="empty">That episode is in the database, but its media file is not matched yet.</div>`;
  const { show, details, season, episode } = located;
  const nextEpisode = getEpisodeAfter(show, episode);
  const resume = getResumeEntryForEpisode(episode.id);
  const playLabel = resume ? "Resume Playing" : "Play Episode";
  const episodeFiles = findMediaFilesForEpisode(show, episode);
  return `
    <div class="toby-tv-detail toby-tv-episode-page">
      ${renderTobyTvTopbar()}
      <button class="toby-tv-back" type="button" data-action="back-title">Back</button>
      <section class="toby-tv-episode-layout">
        <aside class="toby-tv-season-side">
          <div class="toby-tv-poster-frame compact episode-still-frame">
            ${renderPosterBlock(
              {
                ...show,
                title: episode.title,
                posterOverrideUrl: episode.stillUrl ?? TOBY_TV_LOGO_FALLBACK,
                posterCode: formatSeasonEpisode(episode),
              },
              "toby-tv-main-poster",
            )}
            ${renderMediaStoplightButton(getEpisodeMetadataItem(show, season, episode), "gear")}
          </div>
          <p class="toby-tv-meta">${escapeHtml(renderTobyTvProgramMeta(show, details))}</p>
          ${renderTobyTvFoundIn(show)}
        </aside>
        <div class="toby-tv-episode-main">
          <h1>${escapeHtml(episode.title)}</h1>
          <p class="toby-tv-meta">${escapeHtml(show.title)} / Season ${season.seasonNumber} / Episode ${episode.episodeNumber} / ${escapeHtml(formatEpisodeAirDate(episode))}</p>
          ${renderTobyTvRatings(details, episode)}
          <div class="toby-tv-actions">
            <button class="toby-tv-play" type="button" data-action="play-tv-episode" data-play-tv-episode-id="${escapeHtml(episode.id)}"><span></span>${playLabel}</button>
            ${resume ? `<button class="toby-tv-secondary" type="button" data-action="play-tv-episode" data-start-over="true" data-play-tv-episode-id="${escapeHtml(episode.id)}">Play from Start</button>` : ""}
            ${renderDetailMixtapeButton(getEpisodeMetadataItem(show, season, episode))}
            ${renderCompletionCheck(getEpisodeMetadataItem(show, season, episode))}
          </div>
          <p class="toby-tv-overview episode">${escapeHtml(episode.overview || "Episode summary pending.")}</p>
          ${renderMediaStreamControls(`tv:${episode.id}`, episodeFiles, "tv")}
          ${nextEpisode ? renderTobyTvNextEpisode(show, nextEpisode) : ""}
        </div>
      </section>
      ${renderTobyTvEpisodeShelf(show, season, episode.id)}
      ${renderTobyTvCastShelf(mergeCastLists(episode.cast ?? [], season.cast ?? [], details.cast ?? []), `Cast for ${show.title} ${formatSeasonEpisode(episode)}`, `episode:${episode.id}`)}
    </div>
  `;
}

function getEpisodeMetadataItem(show, season, episode) {
  return {
    ...episode,
    id: episode.id,
    mediaType: "episode",
    showId: show.id,
    showTitle: show.title,
    year: show.year ?? String(episode.airDate ?? "").slice(0, 4),
    seasonNumber: season.seasonNumber,
    episodeNumber: episode.episodeNumber,
    files: findMediaFilesForEpisode(show, episode),
  };
}

function renderTobyTvTopbar() {
  return `
    <header class="toby-tv-detail-bar">
      <div class="toby-tv-brand">
        <span>TOBY'S 24-HOUR TV</span>
        <i></i><i></i><i></i><i></i>
      </div>
      <div class="toby-tv-detail-icons">
        <span>Search</span>
        ${state.selectedTitleId && !state.selectedTvEpisodeId ? `<button class="detail-refresh-button" type="button" data-action="rescan">Refresh show</button>` : `<span>Smile</span>`}
      </div>
    </header>
  `;
}

function renderTobyTvProgramMeta(show, details) {
  const yearRange = getTvYearRange(show, details);
  const genres = details.genres?.length ? details.genres.join(" / ") : show.genre ?? "Program";
  const rating = details.rating || "NR";
  return `${yearRange} / ${genres} / ${rating}`;
}

function getTvYearRange(show, details) {
  const start = details.firstAirDate ? String(new Date(details.firstAirDate).getFullYear()) : show.year ?? show.years ?? "Year pending";
  if (details.status === "Returning Series") return `${start} - Present`;
  const seasonYears = (details.seasons ?? [])
    .map((season) => season.airDate || season.episodes?.at(-1)?.airDate)
    .filter(Boolean)
    .map((date) => new Date(date).getFullYear())
    .filter(Number.isFinite);
  const end = seasonYears.length ? Math.max(...seasonYears) : null;
  return end && String(end) !== String(start) ? `${start} - ${end}` : String(start);
}

function countTvEpisodes(seasons) {
  return (seasons ?? []).reduce((sum, season) => sum + (season.episodes?.length ?? 0), 0);
}

function renderTobyTvRatings(details, episode = null) {
  const tmdbValue = episode?.voteAverage ?? details.ratings?.tmdb;
  const tmdb = tmdbValue ? Number(tmdbValue).toFixed(1) : "-";
  const imdb = details.ratings?.imdb ?? (details.externalIds?.imdb_id ? "listed" : "-");
  const rtCritics = details.ratings?.rottenTomatoesCritics ?? details.ratings?.rottenTomatoes ?? "-";
  const rtAudience = details.ratings?.rottenTomatoesAudience ?? "-";
  return `
    <div class="movie-score-row toby-tv-score-row" aria-label="Ratings">
      <span><img src="./assets/ratings/imdb.png" alt="" loading="lazy" /><b>${escapeHtml(imdb)}</b></span>
      <span class="tmdb-score"><i>TM<br>DB</i><b>${escapeHtml(tmdb)}</b></span>
      <span><img src="./assets/ratings/rt-critics.png" alt="" loading="lazy" /><b>${escapeHtml(rtCritics)}</b></span>
      <span><img src="./assets/ratings/rt-audience.png" alt="" loading="lazy" /><b>${escapeHtml(rtAudience)}</b></span>
    </div>
  `;
}

function renderTobyTvFoundIn(show) {
  const foundIn =
    show.id === "bobs-burgers"
      ? [
          { title: "Animation", id: "animation", tone: "animation" },
          { title: "The Cult Collection", id: "cult-films", tone: "cult" },
          { title: "2010s", id: "2010s", tone: "decade" },
          { title: "Saturday Morning Cartoons", id: "saturday-morning-marathon", tone: "saturday" },
        ]
      : getTvCollections()
          .filter((collection) => collection.itemIds.includes(show.id))
          .slice(0, 4)
          .map((collection) => ({ title: collection.title, id: collection.id, tone: "default" }));
  if (!foundIn.length) return "";
  return `
    <div class="toby-found">
      <h2>Found In</h2>
      <div class="toby-found-list">
        ${foundIn
          .map(
            (item) => `
              <button class="toby-found-button ${item.tone}" type="button" data-collection-id="${item.id}">
                ${escapeHtml(item.title)}
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderTobyTvNextEpisode(show, forcedEpisode = null, label = "Next Episode") {
  const episode = forcedEpisode ?? getNextTvEpisode(show);
  if (!episode) return "";
  return `
    <button class="toby-next-episode" type="button" data-tv-episode-id="${episode.id}">
      <span class="toby-next-label">${escapeHtml(label)}</span>
      <img src="${escapeHtml(episode.stillUrl ?? TOBY_TV_LOGO_FALLBACK)}" alt="" loading="lazy" />
      <span>
        <b>${escapeHtml(formatSeasonEpisode(episode))} / ${escapeHtml(episode.title)}</b>
        <small>${escapeHtml(truncateText(episode.overview || "Episode summary pending.", 90))}</small>
        <em>${episode.runtime ? `${episode.runtime} min` : "Runtime pending"}</em>
      </span>
    </button>
  `;
}

function renderTobyTvSeasonShelf(show, seasons, activeSeasonNumber = null) {
  return `
    <section class="toby-tv-shelf">
      <div class="toby-tv-section-title">Seasons</div>
      <div class="toby-tv-season-carousel">
        ${seasons.map((season) => renderTobyTvSeasonShelfCard(show, season, activeSeasonNumber)).join("")}
      </div>
    </section>
  `;
}

function renderTobyTvSeasonShelfCard(show, season, activeSeasonNumber = null) {
  return `
    <button class="toby-season-card ${Number(activeSeasonNumber) === season.seasonNumber ? "active" : ""}" type="button" data-tv-season data-tv-show-id="${escapeHtml(show.id)}" data-tv-season-number="${season.seasonNumber}">
      <img src="${escapeHtml(season.posterUrl ?? getTvDetails(show).posterUrl ?? TOBY_TV_LOGO_FALLBACK)}" alt="" loading="lazy" />
      <span>Season ${season.seasonNumber}</span>
      <small>${season.episodes.length} episodes</small>
      ${renderTvSeasonCompletionCheck(show, season)}
    </button>
  `;
}

function renderTobyTvEpisodeList(show, season) {
  return `
    <section class="toby-season-episodes">
      <div class="toby-season-episode-list">
        ${season.episodes
          .map(
            (episode, index) => `
              <button class="toby-season-episode-row" type="button" data-tv-episode-id="${episode.id}">
                <span class="toby-episode-still-wrap">
                  <img src="${escapeHtml(episode.stillUrl ?? TOBY_TV_LOGO_FALLBACK)}" alt="" loading="lazy" />
                  ${renderCompletionCheck({ id: episode.id, mediaType: "episode" }, "Episode watched")}
                </span>
                <b>${index + 1}</b>
                <span>
                  <strong>${escapeHtml(episode.title)}</strong>
                  <small>${escapeHtml(truncateText(episode.overview || "Episode summary pending.", 112))}</small>
                </span>
                <em>${escapeHtml(formatEpisodeAirDate(episode))}<br>${episode.runtime ? `${episode.runtime} min` : "Runtime pending"}</em>
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="toby-more-episodes">More Episodes</div>
    </section>
  `;
}

function updateTobyMoreEpisodeIndicators() {
  document.querySelectorAll(".toby-season-episodes").forEach((section) => {
    const list = section.querySelector(".toby-season-episode-list");
    const marker = section.querySelector(".toby-more-episodes");
    if (!list || !marker) return;
    const canScroll = list.scrollHeight > list.clientHeight + 4;
    const isAtBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
    marker.hidden = !canScroll || isAtBottom;
  });
}

function renderTobyTvEpisodeShelf(show, season, activeEpisodeId) {
  return `
    <section class="toby-tv-shelf">
      <div class="toby-tv-section-title">Season ${season.seasonNumber} Episodes</div>
      <div class="toby-tv-episode-carousel">
        ${season.episodes
          .map(
            (episode) => `
              <button class="toby-episode-card ${episode.id === activeEpisodeId ? "active" : ""}" type="button" data-tv-episode-id="${episode.id}">
                <img src="${escapeHtml(episode.stillUrl ?? TOBY_TV_LOGO_FALLBACK)}" alt="" loading="lazy" />
                <span>${escapeHtml(formatEpisodeNumber(episode))}</span>
                <b>${escapeHtml(episode.title)}</b>
                <small>${escapeHtml(truncateText(episode.overview || "Episode summary pending.", 82))}</small>
                ${renderCompletionCheck({ id: episode.id, mediaType: "episode" }, "Episode watched")}
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTobyTvCastShelf(cast = [], title = "Cast", contextKey = "program") {
  if (!cast.length) return `<section class="toby-tv-cast"><div class="toby-tv-section-title">Cast</div><div class="empty">Cast metadata pending.</div></section>`;
  const visibleCast = cast.slice(0, 10);
  return `
    <section class="toby-tv-cast">
      <div class="toby-tv-section-title">Cast</div>
      <div class="toby-tv-cast-row">
        ${visibleCast
          .map(
            (person) => `
              <article class="toby-cast-card">
                <div class="toby-cast-avatar">
                  ${person.profileUrl || person.imageUrl ? `<img src="${escapeHtml(person.profileUrl ?? person.imageUrl)}" alt="" loading="lazy" />` : `<span>${escapeHtml(buildPosterCode(person.name))}</span>`}
                </div>
                <b title="${escapeHtml(cleanCharacterName(person.role ?? person.character ?? "Character"))}">${escapeHtml(formatVisibleCastRole(person.role ?? person.character ?? "Character", contextKey))}</b>
                <small>${escapeHtml(person.name ?? "Actor pending")}</small>
              </article>
            `,
          )
          .join("")}
        ${cast.length > 10 ? `<button class="toby-cast-card view-all" type="button" data-action="open-cast-overlay" data-cast-context="${escapeHtml(contextKey)}" data-cast-title="${escapeHtml(title)}">
          <div class="toby-cast-avatar"><span>...</span></div>
          <b>View</b>
          <small>Full Cast</small>
        </button>` : ""}
      </div>
    </section>
  `;
}

function mergeCastLists(...lists) {
  const seen = new Set();
  return lists.flat().filter((person) => {
    const key = String(person?.id ?? person?.name ?? "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanCharacterName(value) {
  return String(value).replace(/\s*\(voice\)\s*/gi, "").trim();
}

function formatVisibleCastRole(value, contextKey = "") {
  const cleaned = cleanCharacterName(value);
  const roles = cleaned
    .split("/")
    .map((role) => role.trim())
    .filter(Boolean);
  if (contextKey.startsWith("program:") && roles.length > 5) return "Various";
  return truncateText(roles.join(" / ") || cleaned || "Character", 34);
}

function renderCastOverlay() {
  const overlay = state.castOverlay;
  if (!overlay) return "";
  return `
    <div class="cast-overlay">
      <section class="cast-overlay-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(overlay.title)}">
        <button class="cast-overlay-close" type="button" data-action="close-cast-overlay">X</button>
        <h2>${escapeHtml(overlay.title)}</h2>
        <div class="cast-overlay-grid">
          ${(overlay.cast ?? [])
            .map(
              (person) => `
                <article>
                  <strong>${escapeHtml(cleanCharacterName(person.role ?? person.character ?? "Character"))}</strong>
                  <span>${escapeHtml(person.name ?? "Actor pending")}</span>
                </article>
              `,
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderNotesOverlay() {
  const overlay = state.notesOverlay;
  if (!overlay) return "";
  return `
    <div class="cast-overlay notes-overlay" data-action="close-notes-overlay">
      <section class="cast-overlay-panel notes-overlay-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(overlay.title ?? "Notes")}">
        <button class="cast-overlay-close" type="button" data-action="close-notes-overlay" aria-label="Close notes">X</button>
        <h2>${escapeHtml(overlay.title ?? "Notes")}</h2>
        <p>${escapeHtml(overlay.notes ?? "No additional notes.")}</p>
      </section>
    </div>
  `;
}

function renderDefenseOverlay() {
  const overlay = state.defenseOverlay;
  if (!overlay) return "";
  const defenses = Array.isArray(overlay.defenses) ? overlay.defenses : [];
  return `
    <div class="cast-overlay defense-overlay" data-action="close-defense-overlay">
      <section class="cast-overlay-panel defense-overlay-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(overlay.title ?? "Title defenses")}">
        <button class="cast-overlay-close" type="button" data-action="close-defense-overlay" aria-label="Close title defenses">X</button>
        <h2>${escapeHtml(overlay.title ?? "Title Defenses")}</h2>
        <div class="championship-table-wrap">
          <table class="championship-history-table defense-history-table">
            <thead><tr><th>No.</th><th>Challenger</th><th>Date</th><th>Event</th></tr></thead>
            <tbody>${defenses.length
              ? defenses.map((defense, index) => `<tr><td>${escapeHtml(defense.number ?? index + 1)}</td><td>${escapeHtml(defense.challenger ?? "—")}</td><td>${escapeHtml(formatMetadataDate(defense.date))}</td><td>${escapeHtml(defense.event ?? "—")}</td></tr>`).join("")
              : `<tr><td colspan="4">Defense details have not been catalogued yet.</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function getCastOverlayPayload(context, fallbackTitle = "Cast") {
  const [type, showId, seasonNumber] = String(context).split(":");
  if (type === "movie") {
    const movie = getTitleItem(showId);
    const details = movie ? getTitleDetails(movie) : null;
    return { title: fallbackTitle, cast: details?.cast ?? [] };
  }
  if (type === "episode") {
    const located = findTvEpisode(showId);
    if (!located) return null;
    return { title: fallbackTitle, cast: mergeCastLists(located.episode.cast ?? [], located.season.cast ?? [], located.details.cast ?? []) };
  }
  const show = getTvTitleItem(showId);
  if (!show) return null;
  const details = getTvDetails(show);
  if (type === "season") {
    const season = details.seasons?.find((item) => item.seasonNumber === Number(seasonNumber));
    return { title: fallbackTitle, cast: season?.cast ?? details.cast ?? [] };
  }
  return { title: fallbackTitle, cast: details.cast ?? [] };
}

function formatSeasonEpisode(episode) {
  return `S${episode.seasonNumber} E${episode.episodeNumber}`;
}

function formatEpisodeAirDate(episode) {
  const value = episode?.airDate;
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(String(value))) return "Airdate pending";
  try {
    return formatDisplayDate(value);
  } catch {
    return "Airdate pending";
  }
}

function getEpisodeAfter(show, episode) {
  const episodes = getAvailableTvSeasons(show).flatMap((season) => season.episodes ?? []);
  const index = episodes.findIndex((item) => item.id === episode.id);
  return index >= 0 ? episodes[index + 1] ?? null : null;
}

function getRandomTvEpisodeLocationForShow(showId) {
  const show = getTvTitleItem(showId);
  if (!show) return null;
  const details = getTvDetails(show);
  const episodes = getAvailableTvSeasons(show).flatMap((season) =>
    (season.episodes ?? []).map((episode) => ({
      show,
      details,
      season,
      episode,
    })),
  );
  if (!episodes.length) return null;
  return episodes[Math.floor(Math.random() * episodes.length)];
}

function getTvDetails(show) {
  const cacheKey = `${getMetadataCacheKey()}:${show.id}`;
  getTvDetails.cache = getTvDetails.cache ?? new Map();
  const cached = getTvDetails.cache.get(cacheKey);
  if (cached) return cached;
  const generated = { ...(tvDetailIndex[show.id] ?? {}), ...getItemMetadataOverride(show.id) };
  const indexedRecord = metadataIndex[show.id] ?? generatedMetadata.records?.find((item) => item.id === show.id || normalizeTitleForMatch(item.title) === normalizeTitleForMatch(show.title));
  const record = show.files?.length ? { ...(indexedRecord ?? {}), id: show.id, files: show.files } : indexedRecord;
  const sourceSeasons = mergeGeneratedAndScannedTvSeasons(generated.seasons ?? [], buildScannedTvSeasons(show, record, generated));
  const seasons = (sourceSeasons ?? []).map((season) => ({
    ...season,
    episodes: (season.episodes?.length ? season.episodes : buildPlaceholderEpisodes(show, season, generated)).map((episode) => ({
      ...episode,
      ...getItemMetadataOverride(episode.id),
    })),
  }));
  const details = {
    id: show.id,
    title: show.title,
    overview: generated.overview ?? "",
    tagline: generated.tagline ?? "",
    firstAirDate: generated.firstAirDate ?? "",
    rating: generated.rating ?? "",
    averageRuntime: generated.averageRuntime ?? null,
    genres: generated.genres ?? [],
    posterUrl: generated.posterUrl ?? tmdbPosters[show.id]?.posterUrl ?? show.posterUrl,
    backdropUrl: generated.backdropUrl ?? null,
    ratings: generated.ratings ?? {},
    externalIds: generated.externalIds ?? {},
    status: generated.status ?? "",
    seasons,
    cast: generated.cast ?? [],
  };
  if (getTvDetails.cache.size >= 300) getTvDetails.cache.delete(getTvDetails.cache.keys().next().value);
  getTvDetails.cache.set(cacheKey, details);
  return details;
}

function getTvTitleItem(id) {
  const shows = getAllTvTitleItems();
  const merged = applyMergedMediaItems(shows).find((item) => item.id === id || item.mergedItemIds?.includes(id));
  if (merged) return merged;
  const canonicalId = tvCanonicalIdByAlias.get(id) ?? id;
  const direct = shows.find((item) => item.id === canonicalId);
  if (direct) return direct;
  const source =
    tvShows.find((item) => item.id === id) ??
    tvDetailIndex[id] ??
    metadataIndex[id] ??
    (generatedMetadata.records ?? []).find((item) => item.id === id) ??
    findCuratedManifestTitleItem(id) ??
    null;
  if (source?.mediaType && source.mediaType !== "tv") return null;
  const resolved = source?.title
    ? shows.find((item) => normalizeTitleForMatch(item.title) === normalizeTitleForMatch(source.title)) ?? null
    : null;
  if (resolved) tvCanonicalIdByAlias.set(id, resolved.id);
  return resolved;
}

function getAllTvTitleItems() {
  const cacheKey = getMetadataCacheKey();
  if (getAllTvTitleItems.cache?.key === cacheKey) return getAllTvTitleItems.cache.items;
  const byIdentity = new Map();
  tvCanonicalIdByAlias = new Map();
  const addShow = (show, files = []) => {
    if (!show?.id || !show.title) return;
    const matchedTitle = getDirectMatchedTvTitle(show);
    const canonicalShow = matchedTitle && normalizeTitleForMatch(matchedTitle) !== normalizeTitleForMatch(show.title)
      ? { ...show, title: matchedTitle, matchedSourceTitle: show.title }
      : show;
    const identity = normalizeTitleForMatch(canonicalShow.title);
    const existing = byIdentity.get(identity);
    if (existing) {
      tvCanonicalIdByAlias.set(show.id, existing.id);
      existing.files = [...new Map([...(existing.files ?? []), ...files].map((file) => [String(file.path ?? file.episodeId), file])).values()];
      return;
    }
    const next = { ...canonicalShow, files: [...(canonicalShow.files ?? []), ...files] };
    byIdentity.set(identity, next);
    tvCanonicalIdByAlias.set(show.id, next.id);
  };
  tvShows.forEach((show) => addShow(show));
  Object.values(tvDetailIndex).forEach((show) => addShow(show));
  (generatedMetadata.records ?? []).filter((record) => record.mediaType === "tv").forEach((record) => {
    if (!record.id) return;
    const latestFileDate = (record.files ?? []).map((file) => file.modifiedAt).filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)))[0];
    addShow({
      id: record.id,
      mediaType: "tv",
      title: record.title,
      year: record.year ?? record.files?.[0]?.parsed?.year ?? "Year pending",
      genre: getPrimaryGenreFromRecord(record) ?? "TV",
      status: "scanned",
      posterUrl: record.art?.posterUrl ?? record.provider?.posterUrl ?? null,
      posterA: record.art?.colors?.[0] ?? "#202329",
      posterB: record.art?.colors?.[1] ?? "#d8b35d",
      posterCode: buildPosterCode(record.title),
      addedAt: latestFileDate ?? generatedMetadata.generatedAt,
      hasNewEpisodes: true,
    }, record.files ?? []);
  });
  const items = [...byIdentity.values()];
  getAllTvTitleItems.cache = { key: cacheKey, items };
  return items;
}

function getDirectMatchedTvTitle(show) {
  const direct = metadataOverrides?.items?.[show.id];
  const rawTitleKey = normalizeTitleForMatch(show.title);
  const rawYear = String(show.year ?? show.startYear ?? "");
  const identityMatch = Object.values(metadataOverrides?.items ?? {}).find((override) => {
    if (!override?.match?.providerId || !override.identity?.title) return false;
    if (override.identity.mediaType && override.identity.mediaType !== "tv") return false;
    if (normalizeTitleForMatch(override.identity.title) !== rawTitleKey) return false;
    const overrideYear = String(override.identity.year ?? "");
    return !rawYear || !overrideYear || rawYear === overrideYear;
  });
  const override = direct?.match?.providerId ? direct : identityMatch;
  return override?.metadata?.title ?? override?.match?.title ?? null;
}

function mergeGeneratedAndScannedTvSeasons(generatedSeasons = [], scannedSeasons = []) {
  const bySeason = new Map();
  generatedSeasons.forEach((season) => bySeason.set(Number(season.seasonNumber), { ...season }));
  scannedSeasons.forEach((season) => {
    const seasonNumber = Number(season.seasonNumber);
    const existing = bySeason.get(seasonNumber);
    if (!existing) {
      bySeason.set(seasonNumber, { ...season });
      return;
    }
    const generatedEpisodes = existing.episodes ?? [];
    const episodeKeys = new Set(generatedEpisodes.map((episode) => Number(episode.episodeNumber)));
    const scannedExtras = (season.episodes ?? []).filter((episode) => !episodeKeys.has(Number(episode.episodeNumber)));
    bySeason.set(seasonNumber, {
      ...season,
      ...existing,
      episodeCount: Math.max(Number(existing.episodeCount ?? 0), Number(season.episodeCount ?? 0), generatedEpisodes.length + scannedExtras.length),
      episodes: [...generatedEpisodes, ...scannedExtras].sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber)),
    });
  });
  return [...bySeason.values()].sort((a, b) => Number(a.seasonNumber) - Number(b.seasonNumber));
}
function buildScannedTvSeasons(show, record, details = {}) {
  const bySeason = new Map();
  (record?.files ?? []).forEach((file) => {
    const parsed = file.parsed ?? {};
    const seasonNumber = Number(parsed.season);
    const episodeNumber = Number(parsed.episode);
    if (!seasonNumber || !episodeNumber) return;
    const season = bySeason.get(seasonNumber) ?? {
      seasonNumber,
      title: `Season ${seasonNumber}`,
      airDate: parsed.airDate ?? details.firstAirDate ?? null,
      episodeCount: 0,
      episodes: [],
    };
    season.episodes.push({
      id: file.episodeId ?? parsed.episodeId ?? buildEpisodeId(show.id, seasonNumber, episodeNumber),
      seasonNumber,
      episodeNumber,
      title: parsed.episodeTitle ?? getEpisodeTitleFromFile(file, episodeNumber) ?? `Episode ${episodeNumber}`,
      overview: "",
      airDate: parsed.airDate ?? null,
      runtime: getMediaDurationSeconds(file) ? Math.round(getMediaDurationSeconds(file) / 60) : details.averageRuntime ?? null,
      stillUrl: file.art?.stillUrl ?? null,
    });
    season.episodeCount = Math.max(season.episodeCount, season.episodes.length);
    bySeason.set(seasonNumber, season);
  });
  return [...bySeason.values()]
    .map((season) => ({
      ...season,
      episodes: season.episodes.sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber)),
    }))
    .sort((a, b) => Number(a.seasonNumber) - Number(b.seasonNumber));
}

function getEpisodeTitleFromFile(file, episodeNumber) {
  const name = String(file?.path ?? "").split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "";
  const padded = String(episodeNumber).padStart(2, "0");
  const match = name.match(new RegExp(`s\\d{1,2}[ex]${padded}\\s+(.+)$`, "i")) ?? name.match(/s\d{1,2}e\d{1,3}\s+(.+)$/i);
  if (!match?.[1]) return null;
  return cleanDisplayText(match[1].replace(/[._-]+/g, " ").trim());
}

function buildPlaceholderEpisodes(show, season, details) {
  const count = Number(season.episodeCount ?? 0);
  if (!count) return [];
  return Array.from({ length: count }, (_, index) => ({
    id: `${show.id}-s${season.seasonNumber}-e${index + 1}`,
    seasonNumber: season.seasonNumber,
    episodeNumber: index + 1,
    title: `Episode ${index + 1}`,
    overview: season.overview || details.overview || "",
    airDate: season.airDate ?? details.firstAirDate ?? null,
    runtime: details.averageRuntime ?? null,
    voteAverage: null,
    stillUrl: null,
  }));
}

function getAvailableTvSeasons(show) {
  const cacheKey = `${getMetadataCacheKey()}:${show.id}`;
  if (getAvailableTvSeasons.cache?.get(cacheKey)) return getAvailableTvSeasons.cache.get(cacheKey);
  getAvailableTvSeasons.cache = getAvailableTvSeasons.cache ?? new Map();
  const details = getTvDetails(show);
  const seasons = (details.seasons ?? [])
    .map((season) => ({
      ...season,
      episodes: (season.episodes ?? []).filter((episode) => Boolean(findMediaFileForEpisode(show, episode)?.path)),
    }))
    .filter((season) => season.episodes.length);
  getAvailableTvSeasons.cache.set(cacheKey, seasons);
  return seasons;
}

function getNextTvEpisode(show) {
  const episodes = getAvailableTvSeasons(show).flatMap((season) => season.episodes ?? []);
  return episodes.find((episode) => !isTvEpisodeCompleted(episode.id)) ?? null;
}

function findTvEpisode(episodeId) {
  const coordinate = String(episodeId ?? "").match(/^(.*)-s(\d+)-e(\d+)$/i);
  for (const show of getAllTvTitleItems()) {
    const details = getTvDetails(show);
    for (const season of details.seasons ?? []) {
      const episode = (season.episodes ?? []).find((item) => item.id === episodeId || (
        coordinate &&
        (tvCanonicalIdByAlias.get(coordinate[1]) ?? coordinate[1]) === show.id &&
        Number(item.seasonNumber) === Number(coordinate[2]) &&
        Number(item.episodeNumber) === Number(coordinate[3])
      ));
      if (episode) return { show, details, season, episode };
    }
  }
  return null;
}

function findAvailableTvEpisode(episodeId) {
  const cacheKey = `${getMetadataCacheKey()}:${episodeId}`;
  findAvailableTvEpisode.cache = findAvailableTvEpisode.cache ?? new Map();
  if (findAvailableTvEpisode.cache.has(cacheKey)) return findAvailableTvEpisode.cache.get(cacheKey);
  for (const show of getAllTvTitleItems()) {
    const details = getTvDetails(show);
    for (const season of getAvailableTvSeasons(show)) {
      const episode = (season.episodes ?? []).find((item) => item.id === episodeId);
      if (episode) {
        const located = { show, details, season, episode };
        if (findAvailableTvEpisode.cache.size >= 500) findAvailableTvEpisode.cache.delete(findAvailableTvEpisode.cache.keys().next().value);
        findAvailableTvEpisode.cache.set(cacheKey, located);
        return located;
      }
    }
  }
  findAvailableTvEpisode.cache.set(cacheKey, null);
  return null;
}

function resolveResumeTvEpisode(entry) {
  const match = String(entry?.episodeId ?? "").match(/-s(\d+)-e(\d+)$/i);
  const canonicalShowId = tvCanonicalIdByAlias.get(entry?.itemId) ?? entry?.itemId;
  const show = getTvTitleItem(canonicalShowId);
  if (show) {
    for (const season of getAvailableTvSeasons(show)) {
      const episode = (season.episodes ?? []).find((candidate) => candidate.id === entry?.episodeId || (
        match &&
        Number(season.seasonNumber) === Number(match[1]) &&
        Number(candidate.episodeNumber) === Number(match[2])
      ));
      if (episode) return { show, details: getTvDetails(show), season, episode };
    }
  }
  return findAvailableTvEpisode(entry?.episodeId);
}

function getRandomTvEpisodeLocation() {
  const episodes = getAllTvTitleItems().flatMap((show) => {
    const details = getTvDetails(show);
    return getAvailableTvSeasons(show).flatMap((season) =>
      (season.episodes ?? []).map((episode) => ({
        show,
        details,
        season,
        episode,
      })),
    );
  });
  if (!episodes.length) return null;
  return episodes[Math.floor(Math.random() * episodes.length)];
}

function stopTeebeeShuffle() {
  if (!teebeeShuffleTimer) return;
  clearInterval(teebeeShuffleTimer);
  teebeeShuffleTimer = null;
}

function playRandomTeebeeEpisode() {
  const located = getRandomTvEpisodeLocation();
  if (!located) return;
  state.section = "tv";
  state.subView = "home";
  state.powerOffMode = null;
  state.selectedTitleId = located.show.id;
  state.selectedTvSeason = { showId: located.show.id, seasonNumber: located.season.seasonNumber };
  state.selectedTvEpisodeId = located.episode.id;
  state.selectedCollectionId = null;
  state.selectedPersonId = null;
  state.selectedMcuSeasonId = null;
  state.selectedMcuShowId = null;
  state.selectedCriterionEclipseId = null;
  state.selectedCriterionSubCollectionId = null;
  state.selectedIndiaView = "home";
  state.selectedIndiaLanguageId = null;
  render();
}

function startTeebeeShuffle() {
  stopTeebeeShuffle();
  playRandomTeebeeEpisode();
  teebeeShuffleTimer = setInterval(playRandomTeebeeEpisode, 1000 * 60 * 22);
}

function powerOffTeebee() {
  stopTeebeeShuffle();
  state.powerOffMode = "message";
  render();
  setTimeout(() => {
    state.powerOffMode = "off";
    render();
  }, 6000);
}

function formatTvYear(firstAirDate, fallback) {
  return firstAirDate ? String(new Date(firstAirDate).getFullYear()) : fallback ?? "Year pending";
}

function formatEpisodeNumber(episode) {
  return `E${String(episode.episodeNumber).padStart(2, "0")}`;
}

function episodeToCardItem(show, episode) {
  return {
    id: episode.id,
    mediaType: "tv-episode",
    title: episode.title,
    year: episode.airDate ? new Date(episode.airDate).getFullYear() : "",
    country: show.country,
    genre: formatEpisodeNumber(episode),
    status: "complete",
    posterCode: formatEpisodeNumber(episode),
    posterOverrideUrl: episode.stillUrl ?? TOBY_TV_LOGO_FALLBACK,
    posterA: show.posterA,
    posterB: show.posterB,
  };
}

function renderEpisodePosterCard(item) {
  return `
    <article class="media-card library-card episode-poster-card" data-tv-episode-id="${item.id}" tabindex="0">
      ${item.posterOverrideUrl ? `<div class="episode-still"><img src="${escapeHtml(item.posterOverrideUrl)}" alt="" loading="lazy" /></div>` : renderPosterBlock(item)}
      <div class="card-body">
        <div class="card-title">${escapeHtml(item.genre)}: ${escapeHtml(item.title)}</div>
      </div>
    </article>
  `;
}

function renderTitleActions(details, item = null) {
  if (hasNightCards(details)) {
    return `
      <div class="title-actions">
        <button class="play-button night-play-button" type="button" data-action="play-title" data-title-id="${escapeHtml(item?.id ?? "")}">
          <span>Play</span>
          <small>Night 1</small>
        </button>
        <button class="play-button night-play-button" type="button" data-action="play-title" data-title-id="${escapeHtml(item?.id ?? "")}">
          <span>Play</span>
          <small>Night 2</small>
        </button>
        ${renderDetailMixtapeButton(item)}
        ${renderCompletionCheck(item)}
      </div>
    `;
  }

  return `
    <div class="title-actions">
      <button class="play-button" type="button" data-action="play-title" data-title-id="${escapeHtml(item?.id ?? "")}">Play</button>
      ${renderDetailMixtapeButton(item)}
      ${renderCompletionCheck(item)}
    </div>
  `;
}

function renderActionIconButton(icon, label) {
  const icons = {
    watchlist:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.75h10a1 1 0 0 1 1 1v14l-6-3.5-6 3.5v-14a1 1 0 0 1 1-1Z"/></svg>',
    watched:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.4 4.25 4.1L19.5 6.75"/></svg>',
    playlist:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.25h10"/><path d="M5 12h10"/><path d="M5 16.75h6"/><path d="M17.75 15.25v4.5"/><path d="M15.5 17.5H20"/></svg>',
    collection:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.25 6.25h3.1v11.5h-3.1z"/><path d="M10.45 5.25h3.1v12.5h-3.1z"/><path d="m15.35 6.3 3-.8 2.65 10.9-3 .8z"/><path d="M5.25 15.75h3.1"/><path d="M10.45 15.75h3.1"/><path d="m17.35 15.2 3-.8"/></svg>',
  };
  return `<button class="icon-button action-icon-button" type="button" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icons[icon] ?? icons.watchlist}</button>`;
}

function renderCardViewTabs(details) {
  if (!hasNightCards(details)) return "";
  return `
    <div class="segmented title-card-tabs" aria-label="Card view">
      ${[
        ["full", "Full Card"],
        ["night-1", "Night 1"],
        ["night-2", "Night 2"],
      ]
        .map(
          ([view, label]) =>
            `<button type="button" data-card-view="${view}" class="${state.titleCardView === view ? "active" : ""}">${label}</button>`,
        )
        .join("")}
    </div>
  `;
}

function renderTitlePosterBlock(item) {
  const nightPosters = getNightPosters(item);
  const nightOnePoster = nightPosters?.[1]?.posterUrl;
  const nightTwoPoster = nightPosters?.[2]?.posterUrl;

  if (state.titleCardView === "night-1" && nightOnePoster) {
    return renderPosterBlock({ ...item, posterOverrideUrl: nightOnePoster }, "title-poster-art");
  }

  if (state.titleCardView === "night-2" && nightTwoPoster) {
    return renderPosterBlock({ ...item, posterOverrideUrl: nightTwoPoster }, "title-poster-art");
  }

  if (nightOnePoster && nightTwoPoster) {
    return `
      <div class="dual-title-posters">
        <div class="dual-title-poster primary">
          ${renderPosterBlock({ ...item, posterOverrideUrl: nightOnePoster }, "title-poster-art")}
        </div>
        <div class="dual-title-poster secondary">
          ${renderPosterBlock({ ...item, posterOverrideUrl: nightTwoPoster }, "title-poster-art")}
        </div>
      </div>
    `;
  }


  if (item.mediaType === "wrestling" && item.recordType === "episode") {
    const durableMetadata = getItemMetadataOverride(item.id);
    const stillUrl = durableMetadata.stillUrl ?? item.stillUrl ?? item.art?.stillUrl;
    if (stillUrl) {
      return `<div class="wrestling-episode-still"><img src="${escapeHtml(stillUrl)}" alt="" loading="eager" onerror="this.parentElement.remove()" /></div>`;
    }
  }

  return renderPosterBlock(item, "title-poster-art");
}

function getNightPosters(item) {
  const posters = item.nightPosters ?? item.art?.nightPosters;
  if (!posters) return null;
  return {
    1: posters[1] ?? posters["1"] ?? null,
    2: posters[2] ?? posters["2"] ?? null,
  };
}

function renderPersonScreen(personId) {
  const person = personFilmographyIndex.get(personId) ?? peopleIndex[personId] ?? getWrestlingPersonRecord(personId);
  if (!person && String(personId).startsWith("director-")) {
    return `<div class="title-screen person-filmography-page"><button class="icon-button" type="button" data-action="back-title">Back</button><div class="empty">Loading director filmography…</div></div>`;
  }
  const items = person?.wrestling
    ? getWrestlingPerformancesForPerson(person.name)
    : (person?.libraryIds ?? []).map(getTitleItem).filter(Boolean);

  if (person?.works) return renderDirectorFilmography(person);

  return `
    <div class="title-screen">
      <button class="icon-button" type="button" data-action="back-title">Back</button>
      <div class="section-heading">
        <div>
          <h1>${person?.name ?? "Cast Member"}</h1>
          <p class="muted">${person?.wrestling ? "Wrestling appearances currently represented in your Tobytube library." : "Other media in your library featuring this person."}</p>
        </div>
      </div>
      <div class="library-grid">
        ${items.map(renderMixedCard).join("") || `<div class="empty">No other local matches yet.</div>`}
      </div>
    </div>
  `;
}

function renderTitleMetadataList(item, details) {
  const rows = [
    ["Date", formatMetadataDate(details.releaseDate ?? item.date ?? item.year ?? item.years)],
    ["Location", details.location ?? details.country ?? item.country ?? item.promotionName],
    ["Venue", details.venue],
    ["Attendance", details.attendance ? Number(details.attendance).toLocaleString() : null],
    ["Broadcast", details.broadcastType],
    ["Network", details.network],
    ["Commentary", details.commentary?.join?.(", ")],
    ["Main Event", details.mainEvent],
    ["Runtime", details.runtime],
    ["Language", details.language],
  ].filter(([, value]) => Boolean(value));

  if (!rows.length) return "";

  return `
    <dl class="title-facts">
      ${rows
        .map(
          ([label, value]) => `
            <div class="fact">
              <dt>${escapeHtml(label)}:</dt>
              <dd>${escapeHtml(value)}</dd>
            </div>
          `,
        )
        .join("")}
    </dl>
  `;
}

function formatMetadataDate(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatDisplayDate(value);
  }

  return value;
}

function renderPlaybackSettings(details) {
  const settings = [
    ["Subtitles", details.settings?.subtitles],
    ["Audio Tracks", details.settings?.audioTracks],
    ["Resolution", details.settings?.resolution],
    ["Direct Play", details.settings?.directPlay],
  ];

  return `
    <div class="settings-panel">
      ${settings
        .map(
          ([label, value]) => `
            <button class="setting-button ${value ? "" : "disabled"}" type="button" ${value ? "" : "disabled"}>
              <span>${label}</span>
              <strong>${value || "Unavailable"}</strong>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderCastShelf(cast, item = null) {
  if (!cast.length) return "";
  const isRoster = item?.mediaType === "wrestling";

  return `
    <section class="lane">
      <div class="lane-head">
        <div class="lane-title-with-count">
          <h2>${isRoster ? "Roster" : "Cast & Crew"}</h2>
          <span class="muted">${cast.length} people</span>
        </div>
      </div>
      <div class="cast-carousel">
        ${cast
          .map(
            (person) => `
              <button class="cast-card${isRoster ? " roster-card" : ""}" type="button" data-person-id="${person.id}">
                <div class="cast-avatar">${person.imageUrl ? `<img src="${escapeHtml(person.imageUrl)}" alt="" loading="lazy" />` : person.name.slice(0, 1)}</div>
                <div>
                  <div class="card-title">${escapeHtml(isRoster ? person.role || person.name : person.name)}</div>
                  <div class="card-meta">${escapeHtml(isRoster ? person.name : person.role)}</div>
                </div>
              </button>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderMatchCard(details) {
  if (!details.matches?.length) {
    if (!/no match disputed|recap episode/i.test(details.summary ?? "")) return "";
    return `
      <section class="match-panel">
        <div class="lane-head"><h2>Card</h2><span class="muted">0 matches</span></div>
        <div class="empty">Recap episode — no matches disputed.</div>
      </section>
    `;
  }
  const matches = getVisibleTitleMatches(details);

  return `
    <section class="match-panel">
      <div class="lane-head">
        <h2>Card</h2>
        <span class="muted">${matches.filter((match) => match.type !== "separator").length} matches</span>
      </div>
      <div class="match-list">
        ${matches
          .map(
            (match) => {
              const display = formatWrestlingMatchForDisplay(match);
              return match.type === "separator"
                ? `<div class="match-night-break">${escapeHtml(match.label)}</div>`
                : `
              <article class="match-row">
                <span>${match.order}</span>
                <div>
                  <strong>${escapeHtml(display.participants)}</strong>
                  <p class="card-meta">${escapeHtml(display.stipulation)}${match.time ? ` / ${escapeHtml(match.time)}` : ""}</p>
                </div>
              </article>
            `;
            },
          )
          .join("")}
      </div>
    </section>
  `;
}

function findLibraryTitleForCredit(credit) {
  const wantedTitle = normalizeTitleForMatch(credit.title);
  const wantedYear = Number(credit.year);
  return [...getMovieLibraryItems(), ...getTvLibraryItems()].find((item) => {
    if (normalizeTitleForMatch(getDisplayTitle(item)) !== wantedTitle) return false;
    return !wantedYear || !Number(item.year ?? item.startYear) || Number(item.year ?? item.startYear) === wantedYear;
  }) ?? null;
}

function renderDirectorFilmography(person) {
  const works = (person.works ?? []).map((work) => {
    const local = findLibraryTitleForCredit(work);
    const details = local ? (local.mediaType === "tv" ? getTvDetails(local) : getTitleDetails(local)) : {};
    return { ...work, local, details };
  });
  const available = [...new Map(works.filter((work) => work.local).map((work) => [work.local.id, work.local])).values()];
  return `
    <div class="title-screen person-filmography-page">
      <button class="icon-button" type="button" data-action="back-title">Back</button>
      <header class="person-filmography-hero">
        <div class="person-filmography-portrait">${person.profileUrl ? `<img src="${escapeHtml(person.profileUrl)}" alt="" />` : `<span>${escapeHtml(buildPosterCode(person.name))}</span>`}</div>
        <div><span class="person-kicker">Director / Producer</span><h1>${escapeHtml(person.name)}</h1><p>${escapeHtml(person.biography || "TMDB filmography record.")}</p><small>${escapeHtml([person.birthday, person.birthplace].filter(Boolean).join(" / "))}</small></div>
      </header>
      <section class="person-available"><h2>Available for Rent</h2><div class="carousel person-available-row">${available.map(renderMixedCard).join("") || `<div class="empty">No local titles currently available.</div>`}</div></section>
      <section class="person-credits"><h2>Film & Television Credits</h2><div class="person-credit-table" role="table">
        <div class="person-credit-row heading" role="row"><b>Year</b><b>Title</b><b>Credit</b><b>Genre</b><b>Runtime</b><b>Country</b><b>Library</b><b>Watched</b></div>
        ${works.map(({ local, details, ...work }) => `<div class="person-credit-row" role="row"><span>${escapeHtml(work.year ?? "—")}</span><strong>${escapeHtml(work.title)}</strong><span>${escapeHtml(work.job ?? "—")}</span><span>${escapeHtml(details.genres?.join?.(", ") ?? local?.genre ?? "—")}</span><span>${escapeHtml(formatMovieRuntime(details.runtime) ?? "—")}</span><span>${escapeHtml(details.country ?? local?.country ?? work.country ?? "—")}</span><span class="credit-tick ${local ? "yes" : "no"}" aria-label="${local ? "In library" : "Not in library"}">${local ? "✓" : "—"}</span><span class="credit-tick ${local && isItemCompleted(local) ? "watched" : "no"}" aria-label="${local && isItemCompleted(local) ? "Watched" : "Not watched"}">${local && isItemCompleted(local) ? "✓" : "—"}</span></div>`).join("")}
      </div></section>
    </div>`;
}

async function ensureDirectorFilmography(personId, name) {
  if (personFilmographyIndex.has(personId)) return;
  try {
    const url = new URL("./api/tmdb/person", window.location.href);
    url.searchParams.set("name", name);
    const response = await fetch(`${url.pathname}${url.search}`);
    if (!response.ok) throw new Error(`TMDB person request failed: ${response.status}`);
    personFilmographyIndex.set(personId, await response.json());
  } catch (error) {
    personFilmographyIndex.set(personId, { name, biography: `Director details could not be loaded: ${error.message}`, works: [] });
  }
}

function formatWrestlingMatchForDisplay(match = {}) {
  let participants = String(match.match ?? "").trim();
  const stipulations = [match.stipulation, match.titleMatch].map((value) => String(value ?? "").trim()).filter(Boolean);
  const colonIndex = participants.indexOf(":");
  if (colonIndex > 0) {
    const prefix = participants.slice(0, colonIndex).trim();
    const isStipulationPrefix = /championship|\btitle\b|contenders?|\bmatch\b|battle royal|ladder|cage|elimination|tournament|rules|no disqualification|falls count|handicap|gauntlet/i.test(prefix);
    if (isStipulationPrefix) {
      participants = participants.slice(colonIndex + 1).trim();
      stipulations.unshift(prefix);
    }
  }
  const unique = [];
  const seen = new Set();
  stipulations.forEach((value) => {
    const cleaned = value.replace(/contender(?:'s|s')/gi, "contenders").replace(/\s+/g, " ").trim();
    const key = normalizeTitleForMatch(cleaned);
    if (!key || seen.has(key) || (key === "match" && stipulations.length > 1)) return;
    seen.add(key);
    unique.push(cleaned);
  });
  return { participants: participants || String(match.match ?? "Match"), stipulation: unique.join(" / ") || "Match" };
}

function getWrestlingPersonRecord(personId) {
  const reign = wrestlingReferenceIndex.titleReigns.find((item) => item.personId === personId);
  return reign ? { id: personId, name: reign.champion.replace(/\s*\(Interim\)\s*$/i, ""), wrestling: true } : null;
}

function getWrestlingPerformancesForPerson(name) {
  const needle = normalizeTitleForMatch(name.replace(/^"|"$/g, ""));
  const source = state.wrestlingMode === "media"
    ? getLocalWrestlingRecords().map(metadataRecordToTimelineItem)
    : generatedWrestlingLibrary;
  return source
    .filter((item) => (item.matches ?? []).some((match) => normalizeTitleForMatch(match.match).includes(needle)))
    .slice(0, 120);
}

function hasNightCards(details) {
  return Boolean(details.matches?.some((match) => Number(match.night) === 1 || Number(match.night) === 2));
}

function getVisibleTitleMatches(details) {
  if (!hasNightCards(details)) return details.matches ?? [];
  if (state.titleCardView === "night-1") return renumberMatches(details.matches.filter((match) => Number(match.night) === 1));
  if (state.titleCardView === "night-2") return renumberMatches(details.matches.filter((match) => Number(match.night) === 2));

  const nightOne = details.matches.filter((match) => Number(match.night) === 1);
  const nightTwo = details.matches.filter((match) => Number(match.night) === 2);
  return [
    { type: "separator", label: "Night 1" },
    ...renumberMatches(nightOne),
    { type: "separator", label: "Night 2" },
    ...renumberMatches(nightTwo),
  ];
}

function renumberMatches(matches = []) {
  return matches.map((match, index) => ({ ...match, order: index + 1 }));
}

function renderContentListing(details) {
  if (!details.contents?.length) return "";

  return `
    <section class="match-panel content-listing-panel">
      <div class="lane-head">
        <h2>Contents</h2>
        <span class="muted">${details.contents.length} entries</span>
      </div>
      <div class="match-list">
        ${details.contents
          .map(
            (entry) => `
              <article class="match-row">
                <span>${entry.order}</span>
                <div>
                  <strong>${escapeHtml(entry.description)}</strong>
                  <p class="card-meta">${escapeHtml(entry.dateText)}</p>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function getTitleDetails(item) {
  const wrestlingMetadata =
    wrestlingMetadataIndex[item.metadataId] ??
    wrestlingMetadataIndex[item.id] ??
    wrestlingMetadataIndex[`${slugify(item.title)}-${item.year}`] ??
    wrestlingMetadataIndex[slugify(item.title)];
  const seeded = titleDetails[item.id] ?? titleDetails[item.metadataId] ?? {};

  if (wrestlingMetadata) {
    const metadataMatches = wrestlingMetadata.spoilerSafeMatches ?? wrestlingMetadata.matches;
    return applyMetadataOverrideToDetails(item, {
      ...seeded,
      summary: wrestlingMetadata.summary,
      tagline: wrestlingMetadata.tagline,
      releaseDate: wrestlingMetadata.date,
      country: wrestlingMetadata.city,
      location: wrestlingMetadata.city,
      language: "English",
      directorLabel: "Promotion",
      director: wrestlingMetadata.promotion,
      runtime: wrestlingMetadata.matches?.length ? `${wrestlingMetadata.matches.length} matches` : null,
      venue: wrestlingMetadata.venue,
      matches: metadataMatches,
      mainEvent: wrestlingMetadata.mainEvent ?? getMainEvent(metadataMatches),
      settings: seeded.settings ?? defaultSettings(item),
    });
  }

  if (item.mediaType === "wrestling") {
    const itemMatches = getWrestlingMatchesForItem(item);
    const derivedMainEvent = hasNightSplit(itemMatches)
      ? getNightMainEvents(itemMatches)
      : getMainEvent(itemMatches);
    return applyMetadataOverrideToDetails(item, {
      ...seeded,
      summary:
        item.summary ??
        (item.location || item.venue
          ? `${item.title} from ${[item.venue, item.location].filter(Boolean).join(", ")}.`
          : "Reference metadata imported from the wrestling database."),
      releaseDate: item.date,
      country: item.location ?? item.country ?? null,
      location: item.location ?? item.city ?? null,
      language: "English",
      directorLabel: "Promotion",
      director: item.promotionName,
      runtime: itemMatches?.length ? `${itemMatches.length} matches` : item.matchCount ? `${item.matchCount} matches` : null,
      venue: item.venue,
      attendance: item.attendance,
      broadcastType: item.broadcastType,
      network: item.network,
      commentary: item.commentary,
      matches: itemMatches,
      mainEvent: item.mainEvent ?? derivedMainEvent,
      contents: item.contents,
      settings: seeded.settings ?? defaultSettings(item),
    });
  }

  if (item.mediaType === "movie") {
    const detailByTitle =
      Object.values(movieDetailIndex).find((record) => movieRecordMatches(record, slugify(item.title), Number(item.year))) ??
      Object.values(criterionDetailIndex).find((record) => movieRecordMatches(record, slugify(item.title), Number(item.year)));
    const generated = movieDetailIndex[item.id] ?? mcuDetailIndex[item.id] ?? criterionDetailIndex[item.id] ?? detailByTitle ?? item ?? {};
    const ratings = mergeRatingDetails(seeded.ratings, generated.ratings);
    return applyMetadataOverrideToDetails(item, {
      ...seeded,
      summary: seeded.summary ?? generated.summary ?? "Movie metadata will be hydrated from TMDB.",
      tagline: seeded.tagline ?? generated.tagline ?? null,
      releaseDate: generated.releaseDate ?? item.year,
      country: generated.country ?? item.country,
      language: generated.language ?? "Unknown",
      director: seeded.director ?? generated.director ?? null,
      runtime: seeded.runtime ?? generated.runtime ?? null,
      rating: seeded.rating ?? generated.rating ?? "NR",
      genres: seeded.genres ?? generated.genres ?? [item.genre],
      ratings,
      cast: generated.cast ?? seeded.cast ?? [],
      posterUrl: generated.posterUrl ?? tmdbPosters[item.id]?.posterUrl ?? null,
      backdropUrl: generated.backdropUrl ?? null,
      tmdbId: generated.tmdbId ?? tmdbPosters[item.id]?.tmdbId ?? null,
      imdbId: generated.imdbId ?? null,
      oneShots: generated.oneShots ?? seeded.oneShots ?? [],
      settings: seeded.settings ?? defaultSettings(item),
    });
  }

  return applyMetadataOverrideToDetails(item, {
    summary: item.mediaType === "tv" ? "Series metadata will be hydrated from TVDB/TMDB." : "Movie metadata will be hydrated from TMDB.",
    releaseDate: item.year ?? item.years ?? item.date,
    country: item.country ?? item.promotionName,
    language: "Unknown",
    director: null,
    runtime: null,
    ...seeded,
    settings: seeded.settings ?? defaultSettings(item),
  });
}

function mergeRatingDetails(seedRatings = {}, generatedRatings = {}) {
  const keys = new Set([...Object.keys(seedRatings ?? {}), ...Object.keys(generatedRatings ?? {})]);
  return [...keys].reduce((ratings, key) => {
    ratings[key] = generatedRatings?.[key] ?? seedRatings?.[key] ?? null;
    return ratings;
  }, {});
}

function getMainEvent(matches = []) {
  const mainEvent =
    [...(matches ?? [])]
      .reverse()
      .find((entry) => entry?.match && /\bvs\.?\b/i.test(entry.match))?.match ??
    matches?.at?.(-1)?.match;
  return mainEvent ? mainEvent.replace(/\s+/g, " ").trim() : null;
}

function hasNightSplit(matches = []) {
  return (matches ?? []).some((match) => Number(match.night) === 1 || Number(match.night) === 2);
}

function getNightMainEvents(matches = []) {
  const nightOne = getMainEvent((matches ?? []).filter((match) => Number(match.night) === 1));
  const nightTwo = getMainEvent((matches ?? []).filter((match) => Number(match.night) === 2));
  return [nightOne ? `Night 1: ${nightOne}` : null, nightTwo ? `Night 2: ${nightTwo}` : null].filter(Boolean).join(" / ");
}

function getWrestlingMatchesForItem(item) {
  if (item.matches?.length) return item.matches;
  return wrestlingMatchDetailsIndex?.[item.referenceId] ?? wrestlingMatchDetailsIndex?.[item.id] ?? null;
}

async function ensureWrestlingMatchDetails(item = null) {
  const promotionId = item?.promotionId ?? null;
  const year = Number(item?.year ?? String(item?.date ?? "").slice(0, 4));
  const useYearPage = Boolean(promotionId) && Number.isFinite(year);
  const scope = useYearPage ? `${promotionId}:${year}` : "global";
  if (wrestlingMatchDetailScopes.has(scope)) return wrestlingMatchDetailsIndex;
  if (wrestlingMatchDetailsPending.has(scope)) return wrestlingMatchDetailsPending.get(scope);
  const source = useYearPage
    ? `./src/wrestling-library-pages/${promotionId}-${year}-matches.generated.json`
    : "./src/wrestling-matches.generated.json";
  const pending = fetch(source, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : { matchesByReferenceId: {} }))
    .then((data) => {
      Object.assign(wrestlingMatchDetailsIndex, data.matchesByReferenceId ?? {});
      wrestlingMatchDetailScopes.add(scope);
      return wrestlingMatchDetailsIndex;
    })
    .catch(() => wrestlingMatchDetailsIndex)
    .finally(() => wrestlingMatchDetailsPending.delete(scope));
  wrestlingMatchDetailsPending.set(scope, pending);
  return pending;
}

function getTitleItem(id) {
  if (isItemDeleted(id)) return null;
  const userFranchise = getUserFranchiseItems().find((item) => item.id === id);
  if (userFranchise) return userFranchise;
  const unmatchedItem = batcaveUnmatchedItemIndex.get(id);
  if (unmatchedItem) return { ...unmatchedItem, title: getDisplayTitle(unmatchedItem) };
  const fancamItem = ecwExtremeFancamById.get(id);
  if (fancamItem) return { ...fancamItem, title: getDisplayTitle(fancamItem) };
  const generatedWrestlingItem = generatedWrestlingById.get(id);
  if (generatedWrestlingItem) return { ...generatedWrestlingItem, title: getDisplayTitle(generatedWrestlingItem) };
  const mergedMovie = getMovieLibraryItems.cache?.items?.find((item) => item.id === id) ?? null;
  if (mergedMovie) return mergedMovie;
  const currentPromotion = state.promotionId ? getPromotion(state.promotionId) : null;
  const promotionEvents = currentPromotion ? getYearEvents(currentPromotion, state.selectedYear) : [];
  const promotionArchiveEvents = currentPromotion ? getVisiblePromotionArchiveItems(currentPromotion) : [];
  const item = (
    movies.find((item) => item.id === id) ??
    getScannedMovieItems().find((item) => item.id === id) ??
    getTvTitleItem(id) ??
    movieDetailIndex[id] ??
    tvDetailIndex[id] ??
    mcuDetailIndex[id] ??
    criterionDetailIndex[id] ??
    findCuratedManifestTitleItem(id) ??
    getHomeWrestlingItems().find((item) => item.id === id || item.metadataId === id) ??
    generatedWrestlingItem ??
    getWweDocumentaryArchiveItems().find((item) => item.id === id) ??
    batcaveWrestlingObjectIndex.get(id) ??
    promotionEvents.find((item) => item.id === id) ??
    promotionArchiveEvents.find((item) => item.id === id) ??
    null
  );
  if (item) return { ...item, title: getDisplayTitle(item) };
  const locatedEpisode = findTvEpisode(id);
  return locatedEpisode ? getEpisodeMetadataItem(locatedEpisode.show, locatedEpisode.season, locatedEpisode.episode) : null;
}

function resolveStaleTitleId(id) {
  const identity = getRawItemIdentity(id);
  if (!identity?.title) return null;
  const titleKey = normalizeTitleForMatch(identity.title);
  const candidates = identity.mediaType === "tv"
    ? getTvLibraryItems()
    : identity.mediaType === "movie"
      ? getMovieLibraryItems()
      : [...getMovieLibraryItems(), ...getTvLibraryItems(), ...getHomeWrestlingItems()];
  const exact = candidates.find((item) => {
    if (normalizeTitleForMatch(getDisplayTitle(item)) !== titleKey) return false;
    const candidateYear = String(item.year ?? item.startYear ?? "");
    return !identity.year || !candidateYear || String(identity.year) === candidateYear;
  });
  return exact ?? candidates.find((item) => normalizeTitleForMatch(getDisplayTitle(item)) === titleKey) ?? null;
}

function isItemDeleted(itemId) {
  return Boolean(getItemOverride(itemId).deleted?.deletedAt);
}

function findCuratedManifestTitleItem(id) {
  const collectionItem = Object.values(curatedManifestIndex?.collections ?? {}).flatMap((collection) =>
    (collection.sections ?? []).flatMap((section) =>
      (section.items ?? []).map((item) => ({ item, genre: section.title })),
    ),
  ).find((entry) => entry.item.id === id);
  if (collectionItem) return curatedManifestItem(collectionItem.item, collectionItem.genre);

  const criterionItem = ["noir", "directorShowcase", "boxedSets", "officialChannelCollections"].flatMap((bucket) =>
    (curatedManifestIndex?.criterion?.[bucket] ?? []).flatMap((collection) =>
      (collection.items ?? []).map((item) => ({ item, genre: collection.title })),
    ),
  ).find((entry) => entry.item.id === id);
  return criterionItem ? curatedManifestItem(criterionItem.item, criterionItem.genre) : null;
}

function defaultSettings(item) {
  if (item.files?.length === 0) {
    return {
      subtitles: null,
      audioTracks: null,
      resolution: null,
      directPlay: null,
    };
  }

  return {
    subtitles: item.mediaType === "wrestling" ? null : "English",
    audioTracks: "Stereo",
    resolution: item.mediaType === "tv" ? "1080p" : "4K / 1080p",
    directPlay: "Available",
  };
}

function renderLibraryHeader(title, subtitle, scopedSection = null, showBack = state.section !== "home") {
  const backButton = showBack ? `<button class="icon-button page-back" type="button" data-action="back-page">Back</button>` : "";
  return `
    <div class="section-heading">
      <div>
        ${backButton}
        <h1>${title}</h1>
        <p class="muted">${subtitle}</p>
      </div>
      ${scopedSection ? renderSubnav(scopedSection) : ""}
    </div>
  `;
}

function renderSubnav(section) {
  const views = section === "tv" ? ["home", "library", "collections", "playlist"] : ["home", "library", "collections"];
  return `
    <div class="segmented" aria-label="${section} view">
      ${views
        .map(
          (view) =>
            `<button type="button" data-subview="${view}" class="${state.subView === view ? "active" : ""}">${formatStatus(view)}</button>`,
        )
        .join("")}
    </div>
  `;
}

function renderContinueShelf(items) {
  const progressItems = items.filter((item) => item.watchProgress > 0);
  return `
    <section class="lane">
      <div class="lane-head">
        <h2>Continue Watching</h2>
        <span class="muted">${progressItems.length} in progress</span>
      </div>
      <div class="continue-carousel">
        ${progressItems.map(renderContinueCard).join("") || `<div class="empty">Nothing in progress yet.</div>`}
      </div>
    </section>
  `;
}

function renderContinueCard(item) {
  const meta = getItemMeta(item);
  return `
    <article class="continue-card" data-title-id="${item.id}">
      ${renderPosterBlock(item, "continue-poster")}
      <div class="continue-copy">
        <div class="card-title">${escapeHtml(getDisplayTitle(item))}</div>
        <div class="card-meta">${meta}</div>
        <div class="progress-track"><span style="width:${item.watchProgress}%"></span></div>
        <div class="card-meta">${item.watchProgress}% watched</div>
      </div>
    </article>
  `;
}

function renderPosterShelf(title, items, kind, renderer = renderLibraryCard, seeAllView = null, extraCard = "", titleTarget = null) {
  const shelfItems = dedupeShelfItems(items);
  return `
    <section class="lane">
      <div class="lane-head">
        ${renderLaneTitle(title, seeAllView, titleTarget)}
        <span class="muted">${shelfItems.length} ${shelfItems.length === 1 ? kind : `${kind}s`}</span>
      </div>
      <div class="carousel">
        ${shelfItems.map(renderer).join("") || `<div class="empty">No items match your search.</div>`}
        ${seeAllView ? renderSeeAllCard(seeAllView) : ""}
        ${extraCard}
      </div>
    </section>
  `;
}

function renderLaneTitle(title, seeAllView = null, titleTarget = null) {
  if (titleTarget?.section) {
    return `
      <button class="lane-title-button" type="button" data-section="${titleTarget.section}" ${
        titleTarget.subview ? `data-target-subview="${titleTarget.subview}"` : ""
      }>
        ${title}
      </button>
    `;
  }
  if (seeAllView) {
    return `<button class="lane-title-button" type="button" data-subview="${seeAllView}">${title}</button>`;
  }
  if (titleTarget?.subview) {
    return `<button class="lane-title-button" type="button" data-subview="${titleTarget.subview}">${title}</button>`;
  }
  return `<h2>${title}</h2>`;
}

function renderSeeAllCard(view) {
  return `
    <button class="see-all-card" type="button" data-subview="${view}">
      <span>See All</span>
      <span aria-hidden="true">&rarr;</span>
    </button>
  `;
}

function renderSeeAllSubViewCard(subview) {
  return `
    <button class="see-all-card" type="button" data-subview="${subview}">
      <span>See All</span>
      <span aria-hidden="true">&rarr;</span>
    </button>
  `;
}

function renderSeeAllSectionCard(section, subview = null) {
  return `
    <button class="see-all-card" type="button" data-section="${section}" ${subview ? `data-target-subview="${subview}"` : ""}>
      <span>See All</span>
      <span aria-hidden="true">&rarr;</span>
    </button>
  `;
}

function renderLibraryPage(title, items, renderer, embedded = false) {
  const content = `
    <div class="library-grid ${items.some((item) => item.mediaType === "tv") ? "tv-grid" : ""}">
      ${items.map(renderer).join("") || `<div class="empty">No items match your search.</div>`}
    </div>
  `;

  if (embedded) {
    return `
      <section class="lane">
        <div class="lane-head">
          <h2>${title}</h2>
          <span class="muted">${items.length} items</span>
        </div>
        ${content}
      </section>
    `;
  }

  return `
    ${renderLibraryHeader(title, "Full A-Z style library view, keeping incomplete matches visible instead of hiding the messy bits.", state.section)}
    ${content}
  `;
}

function getLibrarySortTitle(item) {
  return String(getDisplayTitle(item) ?? item?.title ?? "")
    .trim()
    .replace(/^[\s"'“”‘’]+/, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .trim();
}

function getLibraryLetter(item) {
  const first = getLibrarySortTitle(item).normalize("NFD").replace(/\p{Diacritic}/gu, "").match(/[A-Za-z0-9]/)?.[0]?.toUpperCase();
  return first && /[A-Z]/.test(first) ? first : "0-9";
}

function sortLibraryByTitle(items) {
  return [...items].sort((left, right) => {
    const titleCompare = getLibrarySortTitle(left).localeCompare(getLibrarySortTitle(right), undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return titleCompare || String(getDisplayTitle(left)).localeCompare(String(getDisplayTitle(right)), undefined, { sensitivity: "base" });
  });
}

function renderAlphabeticalLibraryPage(title, items, renderer) {
  const alphabet = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0-9"];
  const groups = new Map(alphabet.map((letter) => [letter, []]));
  sortLibraryByTitle(items).forEach((item) => groups.get(getLibraryLetter(item))?.push(item));
  const populatedGroups = alphabet.filter((letter) => groups.get(letter)?.length);
  return `
    <div class="alphabet-library-page">
      <section class="alphabet-library-hero" aria-label="${escapeHtml(title)}">
        ${renderNeonBackButton(true)}
        <img src="./assets/banners/library-banner.png?v=20260805-2" alt="" loading="eager" />
      </section>
      <nav class="alphabet-library-index" aria-label="Library letters">
        ${alphabet.map((letter) => `<button type="button" data-library-letter="${letter}" ${groups.get(letter)?.length ? "" : "disabled"}>${letter}</button>`).join("")}
      </nav>
      <div class="alphabet-library-groups">
        ${
          populatedGroups
            .map((letter) => `
              <section class="alphabet-library-group" id="library-letter-${letter === "0-9" ? "numbers" : letter.toLowerCase()}">
                <div class="alphabet-library-heading">
                  <h2>${letter}</h2>
                  <span>${groups.get(letter).length} title${groups.get(letter).length === 1 ? "" : "s"}</span>
                </div>
                <div class="library-grid ${items.some((item) => item.mediaType === "tv") ? "tv-grid" : ""}">
                  ${groups.get(letter).map(renderer).join("")}
                </div>
              </section>
            `)
            .join("") || `<div class="empty">No items match your search.</div>`
        }
      </div>
    </div>
  `;
}

function renderCollectionsPage(title, mediaType) {
  const relevant = mediaCollections.filter((collection) =>
    collection.itemIds.some((id) => getCollectionItem(id)?.mediaType === mediaType),
  );

  return `
    ${renderLibraryHeader(title, "Collections can mix formats globally, but this page filters to the current library type.", state.section)}
    ${renderCollectionsGrid(relevant)}
  `;
}

function renderCollectionsGrid(collections) {
  return `
    <div class="collection-grid">
      ${collections.map(renderCollectionCard).join("") || `<div class="empty">No collections yet.</div>`}
    </div>
  `;
}

function renderCollectionCard(collection) {
  const items = collection.itemIds.map(getCollectionItem).filter(Boolean);
  return `
    <article class="collection-card" style="--poster-a:${collection.posterA};--poster-b:${collection.posterB}" data-collection-id="${collection.id}" tabindex="0">
      ${
        collection.buttonImage
          ? `<div class="collection-button-art"><img src="${escapeHtml(collection.buttonImage)}" alt="" loading="lazy" /></div>`
          : `<div class="collection-pile">${items.slice(0, 4).map((item) => renderPosterBlock(item, "mini-poster")).join("")}</div>`
      }
      <div class="card-body">
        <div class="card-title">${collection.title}</div>
        <p class="card-meta">${collection.description}</p>
        <div class="tag-row">
          <span class="tag">${items.length} items</span>
          <span class="tag">${items.filter((item) => item.mediaType === "movie").length} movies</span>
          <span class="tag">${items.filter((item) => item.mediaType === "tv").length} TV</span>
        </div>
      </div>
    </article>
  `;
}

function renderLibraryCard(item) {
  const displayTitle = getDisplayTitle(item);
  return `
    <article class="media-card library-card ${item.status}" title="${escapeHtml(displayTitle)}" data-title-id="${escapeHtml(item.id)}" data-title-name="${escapeHtml(displayTitle)}" data-media-type="${escapeHtml(item.mediaType ?? "movie")}" data-title-year="${escapeHtml(String(item.year ?? item.startYear ?? ""))}" tabindex="0">
      ${renderPosterBlockWithMenu(item)}
      ${renderWatchedIndicator(item)}
      <div class="card-body">
        <div class="card-title">${escapeHtml(displayTitle)}</div>
        <div class="card-meta">${escapeHtml(getItemMeta(item))}</div>
      </div>
    </article>
  `;
}

function renderWatchStateTag(item) {
  const state = getWatchState(item);
  return `<span class="tag watch-tag ${state.className}">${state.label}</span>`;
}

function getWatchState(item) {
  if (isItemCompleted(item)) return { className: "watched", label: "Watched" };
  if ((item.watchProgress ?? 0) > 0) return { className: "watching", label: "Watching" };
  return { className: "unwatched", label: "Unwatched" };
}

function renderMixedCard(item) {
  if (item.mediaType === "tv") return renderTvCard(item);
  return renderLibraryCard(item);
}

function renderTvCard(show) {
  return `
    <article class="media-card tv-card ${show.status}" data-title-id="${escapeHtml(show.id)}" data-title-name="${escapeHtml(getDisplayTitle(show))}" data-media-type="tv" data-title-year="${escapeHtml(String(show.year ?? show.startYear ?? ""))}" tabindex="0">
      ${renderPosterBlockWithMenu(show)}
      ${renderWatchedIndicator(show)}
      <div class="card-body">
        <div class="card-title">${escapeHtml(getDisplayTitle(show))}</div>
        <div class="card-meta">${escapeHtml(getItemMeta(show))}</div>
      </div>
    </article>
  `;
}

function resolveTitleCardItem(card, fallback = null) {
  const direct = getTitleItem(card?.dataset?.titleId);
  if (direct) return direct;
  const titleKey = normalizeTitleForMatch(card?.dataset?.titleName ?? fallback?.title ?? "");
  const mediaType = card?.dataset?.mediaType ?? fallback?.mediaType ?? null;
  const year = String(card?.dataset?.titleYear ?? fallback?.year ?? fallback?.startYear ?? "");
  if (!titleKey) return fallback;
  const candidates = mediaType === "tv"
    ? getTvLibraryItems()
    : mediaType === "movie"
      ? getMovieLibraryItems()
      : [...getMovieLibraryItems(), ...getTvLibraryItems(), ...getHomeWrestlingItems()];
  return candidates.find((item) => {
    if (normalizeTitleForMatch(getDisplayTitle(item)) !== titleKey) return false;
    const candidateYear = String(item.year ?? item.startYear ?? "");
    return !year || !candidateYear || year === candidateYear;
  }) ?? candidates.find((item) => normalizeTitleForMatch(getDisplayTitle(item)) === titleKey) ?? fallback;
}

function renderPosterBlockWithMenu(item, extraClass = "") {
  return `<div class="poster-menu-frame">${renderPosterBlock(item, extraClass)}${renderMediaStoplightButton(item, "poster")}</div>`;
}

function renderPosterBlock(item, extraClass = "") {
  const metadataRecord = getMetadataRecordForItem(item);
  const metadataArt = metadataRecord?.art;
  const durableMetadata = getItemMetadataOverride(item.id);
  const seriesMetadata = item.mediaType === "wrestling"
    ? getItemMetadataOverride(getWrestlingSeriesOverrideId(item))
    : {};
  const allowSeriesPoster = !(item.mediaType === "wrestling" && item.recordType === "episode");
  const seasonPoster = item.mediaType === "wrestling" && item.recordType === "episode" ? item.posterUrl : null;
  const tvDetails = item.mediaType === "tv" ? tvDetailIndex[item.id] : null;
  const movieDetails = item.mediaType === "movie" ? movieDetailIndex[item.id] ?? mcuDetailIndex[item.id] ?? criterionDetailIndex[item.id] : null;
  const wrestlingMetadata =
    wrestlingMetadataIndex[item.metadataId] ??
    wrestlingMetadataIndex[item.id] ??
    wrestlingMetadataIndex[metadataRecord?.id] ??
    wrestlingMetadataIndex[`${slugify(item.title)}-${item.year}`] ??
    wrestlingMetadataIndex[slugify(item.title)];
  // Empty strings are used to represent cleared metadata fields. Treating them
  // as a real URL prevents valid season or generated artwork from rendering.
  const posterUrl = [
    item.posterOverrideUrl,
    durableMetadata.posterUrl,
    allowSeriesPoster ? seriesMetadata.posterUrl : null,
    seasonPoster,
    wrestlingMetadata?.posterUrl,
    metadataArt?.posterUrl,
    tvDetails?.posterUrl,
    movieDetails?.posterUrl,
    tmdbPosters[metadataRecord?.id]?.posterUrl,
    tmdbPosters[item.id]?.posterUrl,
    item.posterUrl,
  ].find((value) => typeof value === "string" && value.trim().length > 0);
  const image = posterUrl
    ? `<img src="${escapeHtml(posterUrl)}" alt="" loading="lazy" onerror="const frame=this.parentElement;this.remove();frame?.classList.add('poster-fallback')" />`
    : "";
  const missingClass = item.status === "missing-poster" ? "poster-missing" : "";
  const posterA = item.posterA ?? metadataArt?.colors?.[0] ?? "#202329";
  const posterB = item.posterB ?? metadataArt?.colors?.[1] ?? "#d8b35d";
  return `
    <div class="poster ${missingClass} ${extraClass}" style="--poster-a:${posterA};--poster-b:${posterB}">
      ${image}
      <div class="poster-code">${item.status === "missing-poster" ? "?" : (item.posterCode ?? "")}</div>
    </div>
  `;
}

function getMetadataRecordForItem(item) {
  const candidates = [
    item.metadataId,
    item.scannedRecordId,
    item.id,
    state.promotionId ? `wrestling-${state.promotionId}-${item.id}` : null,
    item.promotionName ? `wrestling-${item.promotionName.toLowerCase()}-${item.id}` : null,
  ].filter(Boolean);

  return candidates.map((id) => metadataIndex[id]).find(Boolean) ?? (item.files?.length ? { id: item.id, files: item.files } : null);
}

function getPrimaryGenreFromRecord(record) {
  return record?.genre ?? record?.genres?.[0] ?? record?.provider?.genres?.[0] ?? null;
}

function normalizeDisplayGenre(value) {
  const genre = cleanDisplayText(value);
  if (!genre || /^(unsorted|collection|american)$/i.test(genre)) return null;
  return genre;
}

function getPrimaryGenreForItem(item) {
  const override = getItemMetadataOverride(item.id);
  const record = getMetadataRecordForItem(item);
  return normalizeDisplayGenre(override.genre) ?? normalizeDisplayGenre(getPrimaryGenreFromRecord(record)) ?? normalizeDisplayGenre(item.genres?.[0]) ?? normalizeDisplayGenre(item.genre);
}

function getItemMeta(item) {
  const override = getItemMetadataOverride(item.id);
  if (item.mediaType === "movie") return [override.year ?? item.year, getPrimaryGenreForItem(item)].filter(Boolean).join(" / ") || "Metadata pending";
  if (item.mediaType === "tv") {
    const details = tvDetailIndex[item.id] ?? tvDetailIndex[slugify(item.title)] ?? null;
    return [override.year ?? item.years ?? item.year ?? "Years pending", normalizeDisplayGenre(override.genre) ?? normalizeDisplayGenre(details?.genres?.[0]) ?? getPrimaryGenreForItem(item) ?? "TV"].filter(Boolean).join(" / ");
  }
  return [formatDisplayDate(item.date), item.promotionName ?? item.promotion].filter(Boolean).join(" / ");
}

function renderEpisodeChips(episodes) {
  return `
    <div class="episode-strip">
      ${episodes.map(([code, title]) => `<span title="${escapeHtml(title)}">${code}</span>`).join("")}
    </div>
  `;
}

function renderWrestlingHome() {
  const availablePromotions = getWrestlingPromotionsForMode();
  const filtered = availablePromotions.filter((promotion) =>
    [promotion.name, promotion.cardName, promotion.sortName]
      .filter(Boolean)
      .some((name) => name.toLowerCase().includes(state.query.toLowerCase())),
  );
  const sections = buildPromotionHomeSections(filtered);

  return `
    <div class="section-heading">
      <div>
        <h1 class="metropolis-title" data-text="Wrestling">Wrestling</h1>
        <p class="muted">${state.wrestlingMode === "media" ? "Only scanned wrestling files are shown." : "Full database archive for checking metadata coverage."}</p>
      </div>
      ${renderWrestlingModeToggle()}
    </div>
    <div class="promotion-home-sections">
      ${sections.map(renderPromotionHomeSection).join("") || `<div class="empty">No scanned wrestling media found yet.</div>`}
    </div>
  `;
}

function renderWrestlingModeToggle() {
  return `
    <div class="segmented" aria-label="Wrestling mode">
      <button type="button" data-wrestling-mode="media" class="${state.wrestlingMode === "media" ? "active" : ""}">Media</button>
      <button type="button" data-wrestling-mode="archive" class="${state.wrestlingMode === "archive" ? "active" : ""}">Archive</button>
    </div>
  `;
}

function buildPromotionHomeSections(filtered) {
  const visible = new Set(filtered.map((promotion) => promotion.id));
  const sectionDefinitions = [
    {
      title: "Major Promotions",
      groups: [{ title: null, promotions: promotions.filter((promotion) => promotion.homeSection === "major") }],
    },
    {
      title: "Active Promotions",
      groups: groupedPromotions("active"),
    },
    {
      title: "Defunct Promotions",
      groups: groupedPromotions("defunct"),
    },
  ];

  return sectionDefinitions
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({
          ...group,
          promotions: group.promotions.filter((promotion) => visible.has(promotion.id)),
        }))
        .filter((group) => group.promotions.length),
    }))
    .filter((section) => section.groups.length);
}

function groupedPromotions(homeSection) {
  return ["US", "Canada", "UK & Ireland", "Japan", "Mexico", "Other"]
    .map((country) => ({
      title: country,
      promotions: promotions
        .filter((promotion) => promotion.homeSection === homeSection && promotion.region === country)
        .sort((a, b) => getPromotionSortName(a).localeCompare(getPromotionSortName(b))),
    }))
    .filter((group) => group.promotions.length);
}

function getPromotionSortName(promotion) {
  return promotion.sortName ?? promotion.cardName ?? promotion.name;
}

function renderPromotionHomeSection(section) {
  const promotionCount = section.groups.reduce((total, group) => total + group.promotions.length, 0);
  const contents = section.groups.map((group) => renderPromotionGroup(group, section.title)).join("");
  const collapsible = state.wrestlingMode === "archive" && section.title !== "Major Promotions";
  if (collapsible) {
    return `
      <details class="promotion-home-section promotion-collapsible" open>
        <summary class="lane-head promotion-collapse-summary">
          <h2>${escapeHtml(section.title)}</h2>
          <span class="muted">${promotionCount} promotions</span>
        </summary>
        ${contents}
      </details>
    `;
  }
  return `
    <section class="promotion-home-section">
      <div class="lane-head">
        <h2>${escapeHtml(section.title)}</h2>
        <span class="muted">${promotionCount} promotions</span>
      </div>
      ${contents}
    </section>
  `;
}

function renderPromotionGroup(group, parentTitle = "") {
  const contents = `<div class="promotion-grid">${group.promotions.map(renderPromotionCard).join("")}</div>`;
  const collapsible = state.wrestlingMode === "archive" && parentTitle !== "Major Promotions" && Boolean(group.title);
  if (collapsible) {
    return `
      <details class="promotion-group promotion-subsection" open>
        <summary><h3>${escapeHtml(group.title)}</h3><span class="muted">${group.promotions.length}</span></summary>
        ${contents}
      </details>
    `;
  }
  return `
    <section class="promotion-group">
      ${group.title ? `<h3>${escapeHtml(group.title)}</h3>` : ""}
      ${contents}
    </section>
  `;
}

function renderPromotionCard(promotion) {
  const cardName = promotion.cardName ?? promotion.name;
  return `
    <button class="promotion-card major-promotion-card" type="button" data-promotion="${promotion.id}" aria-label="${escapeHtml(`${cardName}, ${promotion.activeYears ?? "active years pending"}`)}">
      <div class="promotion-logo major-promotion-logo" style="--logo-a:${promotion.colors[0]};--logo-b:${promotion.colors[1]}">
        ${renderPromotionLogo(promotion)}
      </div>
      <div class="promotion-active-years">${escapeHtml(promotion.activeYears ?? "Years pending")}</div>
    </button>
  `;
}

function promotionNameFitStyle(name) {
  const length = name.length;
  const size = Math.max(0.52, Math.min(1.08, 18 / Math.max(length, 1)));
  return `font-size:${size}rem`;
}

function renderPromotionDetail() {
  const promotion = getPromotion(state.promotionId);
  ensureSelectedPromotionYear(promotion);
  const events = getVisiblePromotionEvents(promotion, state.selectedYear);
  const filteredEvents = filterEvents(events);
  const specials = filterEvents(events.filter((event) => event.type !== "weekly"));
  const hasVisibleMedia = filteredEvents.length || getVisibleShowLanes(promotion, state.selectedYear).length;
  const hasChampionships = Boolean(championshipSectionsByPromotion[promotion.id]) || getPromotionChampionships(promotion).length;
  const hasPromotionHub = promotion.id === "cyberfight";

  const promotionMarkup = `
    <div class="promotion-detail promotion-detail-${promotion.id}">
      <button class="icon-button promotion-back promotion-page-back" type="button" data-action="back">Back</button>
      <div class="hero">
        <div class="hero-logo" style="--logo-a:${promotion.colors[0]};--logo-b:${promotion.colors[1]}">
          ${renderPromotionLogo(promotion)}
        </div>
        <div class="hero-copy">
          <h1>${promotion.name}</h1>
          <p class="muted">${promotion.summary}</p>
          ${renderToolbar(promotion)}
        </div>
      </div>
      ${
        hasVisibleMedia || hasChampionships || hasPromotionHub
          ? renderPromotionView(promotion, filteredEvents, specials)
          : renderPlaceholder(promotion)
      }
    </div>
  `;
  return promotionMarkup;
}

function renderPromotionView(promotion, filteredEvents, specials) {
  if (promotion.id === "cyberfight") return renderCyberFightHub();
  if (state.view === "timeline") return renderTimeline(filteredEvents);
  if (state.view === "documentaries") return renderDocumentaryArchive(promotion);
  if (state.view === "extreme-fancam") return renderExtremeFancamArchive(promotion);
  if (state.view === "championships") return renderChampionshipsView(promotion);
  if (isEventBasedPromotion(promotion)) return renderEventArchive(promotion);
  return renderOverview(promotion, specials);
}

function renderPromotionLogo(promotion) {
  return `
    ${promotion.logoUrl ? `<img src="${escapeHtml(promotion.logoUrl)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}
    <span>${promotion.logo}</span>
  `;
}

function renderToolbar(promotion) {
  const promotionYears = getVisiblePromotionYears(promotion);
  if (isEventBasedPromotion(promotion)) {
    return `
      <div class="toolbar">
        <div class="segmented" aria-label="Promotion view">
          <button type="button" data-view="overview" class="${state.view === "overview" ? "active" : ""}">Events</button>
        </div>
        <button type="button" class="detached-tab ${state.view === "championships" ? "active" : ""}" data-view="championships">
          Championships
        </button>
        ${renderPromotionRefreshControl(promotion)}
      </div>
    `;
  }

  return `
    <div class="toolbar">
      <select class="select" aria-label="Choose year" data-action="year">
        ${promotionYears
          .map(
            (year) =>
              `<option value="${year}" ${year === state.selectedYear ? "selected" : ""}>${year}</option>`,
          )
          .join("")}
      </select>
      <div class="segmented" aria-label="Promotion view">
        <button type="button" data-view="overview" class="${state.view === "overview" ? "active" : ""}">Shows</button>
        <button type="button" data-view="timeline" class="${state.view === "timeline" ? "active" : ""}">Timeline</button>
      </div>
      ${
        promotion.id === "wwe"
          ? `<button type="button" class="detached-tab ${state.view === "documentaries" ? "active" : ""}" data-view="documentaries">Documentaries</button>`
          : ""
      }
      ${
        promotion.id === "ecw"
          ? `<button type="button" class="detached-tab ${state.view === "extreme-fancam" ? "active" : ""}" data-view="extreme-fancam">Extreme Fancam</button>`
          : ""
      }
      <button type="button" class="detached-tab ${state.view === "championships" ? "active" : ""}" data-view="championships">
        Championships
      </button>
      ${renderPromotionRefreshControl(promotion)}
    </div>
  `;
}

function renderPromotionRefreshControl(promotion) {
  if (state.wrestlingMode !== "archive") return "";
  return `<button class="promotion-toolbar-refresh" type="button" data-action="refresh-promotion-year" title="Reload ${escapeHtml(promotion.name)} ${state.selectedYear} from TWDB" aria-label="Refresh ${escapeHtml(promotion.name)} ${state.selectedYear}"><img src="./assets/icons/refresh-wrestling.png" alt="" /></button>`;
}

function renderChampionshipsView(promotion) {
  if (championshipSectionsByPromotion[promotion.id]) {
    return renderGroupedChampionshipsView(championshipSectionsByPromotion[promotion.id]);
  }

  const championships = getPromotionChampionships(promotion);

  return `
    <section class="championships-panel">
      <div class="lane-head">
        <h2>Championships</h2>
        <span class="muted">${championships.length} titles</span>
      </div>
      <div class="championship-grid">
        ${
          championships.map(renderChampionshipCard).join("") ||
          `<div class="empty">No championship histories have been imported for this promotion yet.</div>`
        }
      </div>
    </section>
  `;
}

function renderGroupedChampionshipsView(sections) {
  const championships = sections.flatMap((section) =>
    section.groups.flatMap((group) => group.championships),
  );

  return `
    <section class="championships-panel grouped-championships">
      <div class="lane-head">
        <h2>Championships</h2>
        <span class="muted">${championships.length} titles</span>
      </div>
      ${sections.map(renderChampionshipSection).join("")}
    </section>
  `;
}

function renderChampionshipSection(section) {
  return `
    <section class="championship-section">
      <div class="championship-section-head">
        <h3>${escapeHtml(section.title)}</h3>
      </div>
      ${section.groups.map(renderChampionshipGroup).join("")}
    </section>
  `;
}

function renderChampionshipGroup(group) {
  const columnClass = group.columns ? ` cols-${group.columns}` : "";
  return `
    <section class="championship-subsection">
      <div class="championship-subhead">
        <h4>${escapeHtml(group.title)}</h4>
        <span class="muted">${group.championships.length} titles</span>
      </div>
      <div class="championship-grid${columnClass}">
        ${group.championships.map(renderChampionshipCard).join("")}
      </div>
    </section>
  `;
}

function renderChampionshipCard(championship) {
  const record = wrestlingReferenceIndex.championships.find((item) => item.id === championship.id);
  const resolved = record ? { ...championship, ...record, imageUrl: championship.imageUrl ?? record.imageUrl } : championship;
  const imageClass = resolved.imageMode ? ` ${escapeHtml(resolved.imageMode)}` : "";
  const fallback = resolved.fallbackImageUrl ?? championshipPlaceholderDataUri(resolved.name, resolved.cardType === "achievement" ? "Honor" : "Title", resolved.id.split("-")[0]);
  const hasHistory = getChampionshipReigns(resolved.id).length > 0 || wrestlingReferenceIndex.tournaments.some((item) => item.id === resolved.id);
  const promotionMarkup = `
    <article class="championship-card${hasHistory ? " interactive" : ""}" ${hasHistory ? `data-championship-id="${escapeHtml(resolved.id)}" tabindex="0"` : ""}>
      <div class="championship-belt-frame${imageClass}">
        ${
          resolved.imageUrl
            ? `<img src="${escapeHtml(resolved.imageUrl)}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${escapeHtml(fallback)}'; this.closest('.championship-belt-frame').classList.add('fallback-image');" />`
            : `<span class="belt-placeholder">Image Needed</span>`
        }
      </div>
      <div class="championship-card-name">
        <h3>${escapeHtml(resolved.name)}</h3>
      </div>
    </article>
  `;
  return promotionMarkup;
}

function renderChampionshipDetailPage(championshipId) {
  const tournament = wrestlingReferenceIndex.tournaments.find((item) => item.id === championshipId);
  if (tournament) return renderTournamentDetailPage(tournament);
  const record = wrestlingReferenceIndex.championships.find((item) => item.id === championshipId);
  if (!record) return `<button class="icon-button title-back" type="button" data-action="back-title">Back</button><div class="empty">Championship history is unavailable.</div>`;
  const presentation = findChampionshipPresentation(championshipId);
  const championship = presentation ? { ...presentation, ...record, imageUrl: presentation.imageUrl ?? record.imageUrl } : record;
  const reigns = getChampionshipReigns(championshipId);
  const historySections = getChampionshipHistorySections(championship, reigns);
  const orderedSections = state.championshipSort === "date-desc"
    ? [...historySections].reverse().map((section) => ({ ...section, reigns: [...section.reigns].reverse() }))
    : historySections;
  const hasDefenses = reigns.some((reign) => getChampionshipDefenseCount(reign) != null);
  const officialWweUnitedStatesReigns = championship.id === "wwe-wwe-united-states"
    ? reigns.filter((reign) => reign.dateWon >= "2003-07-27")
    : null;
  const displayRecord = officialWweUnitedStatesReigns
    ? calculateChampionshipStats(officialWweUnitedStatesReigns)
    : { currentChampion: championship.currentChampion, established: championship.established, stats: championship.recordStats ?? {} };
  const stats = displayRecord.stats;
  const statCards = [
    ["Established", formatMetadataDate(displayRecord.established)],
    [championship.status === "retired" ? "Final Champion" : "Current Champion", displayRecord.currentChampion],
    ["Inaugural Champion", stats.inauguralChampion],
    ["Most Reigns", formatChampionshipRecord(stats.mostReigns)],
    ["Longest Reign", formatChampionshipRecord(stats.longestReign)],
    ["Shortest Reign", formatChampionshipRecord(stats.shortestReign)],
    ["Longest Combined", formatChampionshipRecord(stats.longestCombinedReign)],
    ["Youngest Champion", formatChampionshipRecord(stats.youngestChampion)],
    ["Oldest Champion", formatChampionshipRecord(stats.oldestChampion)],
  ].filter(([, value]) => value);
  return `
    <div class="championship-detail-page">
      <button class="icon-button title-back" type="button" data-action="back-title">Back</button>
      <section class="championship-detail-hero">
        <div class="championship-detail-belt"><img src="${escapeHtml(championship.imageUrl ?? championshipPlaceholderDataUri(championship.name, "Title", "aew"))}" alt="${escapeHtml(championship.name)}" onerror="this.onerror=null;this.src='${escapeHtml(championshipPlaceholderDataUri(championship.name, "Title", "aew"))}'" /></div>
        <div class="championship-detail-copy">
          <span class="eyebrow">Championship History</span>
          <h1>${escapeHtml(championship.name)}</h1>
          <div class="championship-record-grid">${statCards.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div>
        </div>
      </section>
      <section class="championship-history-panel">
        <div class="lane-head"><h2>Title History</h2><div class="championship-history-controls"><span class="muted">${reigns.length} entries</span><div class="segmented" aria-label="Title history order"><button type="button" data-action="championship-sort" data-sort="date-asc" class="${state.championshipSort === "date-asc" ? "active" : ""}">Oldest first</button><button type="button" data-action="championship-sort" data-sort="date-desc" class="${state.championshipSort === "date-desc" ? "active" : ""}">Newest first</button></div></div></div>
        <div class="championship-table-wrap">
          <table class="championship-history-table">
            <thead><tr><th>No.</th><th>Champion</th><th>Date Won</th><th>Location</th><th>Reign</th><th>Days</th>${hasDefenses ? "<th>Defenses</th>" : ""}<th>Event</th><th>Notes</th></tr></thead>
            <tbody>${orderedSections.map((section) => renderChampionshipHistorySection(section, championship, hasDefenses)).join("")}</tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function getChampionshipHistorySections(championship, reigns) {
  if (["wcw-united-states-heavyweight-championship", "wcw-wcw-united-states-heavyweight-title"].includes(championship.id)) {
    return [
      { reigns: reigns.filter((reign) => !reign.dateWon || reign.dateWon <= "2001-03-18") },
      {
        label: "WCW was bought by the WWF in March 2001. All subsequent reigns were under the WWF banner.",
        reigns: reigns.filter((reign) => reign.dateWon > "2001-03-18" && reign.dateWon <= "2001-11-18"),
        afterLabel: "Revived as the WWE United States Championship",
        afterChampionshipId: "wwe-wwe-united-states",
      },
    ];
  }
  if (championship.id === "wwe-wwe-united-states") {
    return [
      {
        label: "Reigns until 2001 were as the WCW United States Championship",
        championshipId: "wcw-united-states-heavyweight-championship",
        reigns: reigns.filter((reign) => reign.dateWon >= "2001-03-18" && reign.dateWon <= "2001-11-18"),
      },
      {
        label: "Revived as the WWE United States Championship",
        reigns: reigns.filter((reign) => reign.dateWon >= "2003-07-27"),
      },
    ];
  }
  return [{ reigns }];
}

function calculateChampionshipStats(reigns) {
  const valid = reigns.filter((reign) => !/vacat|deactivat|unified/i.test(reign.champion ?? ""));
  const reignCounts = new Map();
  const combinedDays = new Map();
  valid.forEach((reign) => {
    reignCounts.set(reign.champion, (reignCounts.get(reign.champion) ?? 0) + 1);
    combinedDays.set(reign.champion, (combinedDays.get(reign.champion) ?? 0) + (Number(reign.days) || 0));
  });
  const mostReigns = [...reignCounts].sort((a, b) => b[1] - a[1])[0];
  const longestCombined = [...combinedDays].sort((a, b) => b[1] - a[1])[0];
  const timed = valid.filter((reign) => Number.isFinite(Number(reign.days)) && Number(reign.days) >= 0);
  const longest = [...timed].sort((a, b) => Number(b.days) - Number(a.days))[0];
  const shortest = [...timed].sort((a, b) => Number(a.days) - Number(b.days))[0];
  return {
    established: valid[0]?.dateWon,
    currentChampion: valid.at(-1)?.champion,
    stats: {
      inauguralChampion: valid[0]?.champion,
      mostReigns: mostReigns ? { champion: mostReigns[0], value: mostReigns[1], unit: "reigns" } : null,
      longestReign: longest ? { champion: longest.champion, value: Number(longest.days), unit: "days" } : null,
      shortestReign: shortest ? { champion: shortest.champion, value: Number(shortest.days), unit: "days" } : null,
      longestCombinedReign: longestCombined ? { champion: longestCombined[0], value: longestCombined[1], unit: "days" } : null,
    },
  };
}

function renderChampionshipHistorySection(section, championship, hasDefenses) {
  const colspan = hasDefenses ? 9 : 8;
  const label = section.label
    ? `<tr class="championship-era-break"><td colspan="${colspan}">${section.championshipId ? `<button type="button" data-championship-id="${escapeHtml(section.championshipId)}">${escapeHtml(section.label)}</button>` : escapeHtml(section.label)}</td></tr>`
    : "";
  const rows = section.reigns.map((reign) => renderChampionshipReignRow(reign, championship, hasDefenses)).join("");
  const after = section.afterLabel
    ? `<tr class="championship-era-break championship-era-link"><td colspan="${colspan}"><button type="button" data-championship-id="${escapeHtml(section.afterChampionshipId)}">${escapeHtml(section.afterLabel)}</button></td></tr>`
    : "";
  return `${label}${rows}${after}`;
}

function findChampionshipPresentation(championshipId) {
  const grouped = Object.values(championshipSectionsByPromotion)
    .flatMap((sections) => sections)
    .flatMap((section) => section.groups ?? [])
    .flatMap((group) => group.championships ?? []);
  const groupedMatch = grouped.find((item) => item.id === championshipId);
  if (groupedMatch) return groupedMatch;
  const wcwMatch = wcwChampionshipLayout.find((item) => item.ids.includes(championshipId));
  return wcwMatch ? { id: championshipId, name: wcwMatch.name, imageUrl: wcwMatch.imageUrl, imageMode: wcwMatch.imageMode } : null;
}

function renderTournamentDetailPage(tournament) {
  if (["royal-rumble-list", "money-in-the-bank-list", "elimination-chamber-list"].includes(tournament.pageType)) {
    return renderWweAchievementListPage(tournament);
  }
  if (tournament.pageType === "round-robin") return renderRoundRobinAchievementPage(tournament);
  if (tournament.pageType === "king-of-the-ring") return renderKingOfTheRingPage(tournament);
  if (tournament.pageType === "annual-award") return renderAnnualAwardPage(tournament);
  return `
    <div class="championship-detail-page tournament-detail-page">
      <button class="icon-button title-back" type="button" data-action="back-title">Back</button>
      <section class="championship-detail-hero tournament-detail-hero">
        <div class="championship-detail-belt"><img src="${escapeHtml(tournament.imageUrl ?? championshipPlaceholderDataUri(tournament.name, "Tournament", "aew"))}" alt="${escapeHtml(tournament.name)}" onerror="this.onerror=null;this.src='${championshipPlaceholderDataUri(tournament.name, "Tournament", "aew")}'" /></div>
        <div class="championship-detail-copy">
          <span class="eyebrow">Tournament History</span>
          <h1>${escapeHtml(tournament.name)}</h1>
          <div class="championship-record-grid">
            <div><span>Established</span><strong>${escapeHtml(formatMetadataDate(tournament.established))}</strong></div>
            <div><span>Format</span><strong>${escapeHtml(tournament.format ?? "Single elimination")}</strong></div>
            <div><span>Editions</span><strong>${escapeHtml(tournament.editions?.length ?? 0)}</strong></div>
          </div>
        </div>
      </section>
      <section class="championship-history-panel tournament-results-panel">
        <div class="lane-head"><h2>Tournament Winners</h2><span class="muted">Newest first</span></div>
        <div class="championship-table-wrap">
          <table class="championship-history-table tournament-results-table">
            <thead><tr><th>Year</th><th>Winner</th><th>Runner Up</th><th>Final</th><th>World Title Match</th></tr></thead>
            <tbody>${[...(tournament.results ?? [])].sort((a, b) => b.year - a.year).map(renderTournamentResultRow).join("")}</tbody>
          </table>
        </div>
      </section>
      <section class="tournament-brackets-panel">
        <div class="lane-head"><h2>Brackets</h2><span class="muted">Reverse chronological order</span></div>
        ${(tournament.editions ?? []).map(renderTournamentEdition).join("")}
      </section>
    </div>
  `;
}

function renderWweAchievementListPage(tournament) {
  const rows = [...(tournament.results ?? [])].sort((a, b) => String(b.date ?? b.dateWon ?? b.year ?? "").localeCompare(String(a.date ?? a.dateWon ?? a.year ?? "")));
  const table = tournament.pageType === "royal-rumble-list"
    ? renderRoyalRumbleTable(rows)
    : tournament.pageType === "money-in-the-bank-list"
      ? renderMoneyInTheBankTable(rows)
      : renderEliminationChamberTable(rows);
  return `
    <div class="championship-detail-page tournament-detail-page achievement-list-page">
      <button class="icon-button title-back" type="button" data-action="back-title">Back</button>
      ${renderAchievementHero(tournament, tournament.eyebrow ?? "WWE Accomplishment")}
      <section class="championship-history-panel tournament-results-panel">
        <div class="lane-head"><h2>${escapeHtml(tournament.tableTitle ?? "Winners")}</h2><span class="muted">Newest first</span></div>
        <div class="championship-table-wrap">${table}</div>
      </section>
    </div>
  `;
}

function renderRoyalRumbleTable(rows) {
  return `<table class="championship-history-table accomplishment-table royal-rumble-table">
    <thead><tr><th>Date</th><th>Winner</th><th>Entry Number</th><th>Location</th><th>Venue</th><th>Event</th><th>Championship Match</th><th>Notes</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td>${escapeHtml(formatMetadataDate(row.date))}</td>
      <td>${tournamentPersonLink(row.winner, row.personId)}</td>
      <td>${escapeHtml(row.entryNumber ?? "—")}</td>
      <td>${escapeHtml(row.location ?? "—")}</td>
      <td>${escapeHtml(row.venue ?? "—")}</td>
      <td>${achievementEventLink(row.event, row.date, row.eventId)}</td>
      <td>${achievementMatchLink(row.championshipMatch)}</td>
      <td>${achievementNotesButton(row.notes, `${row.winner ?? "Royal Rumble"} notes`)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function renderMoneyInTheBankTable(rows) {
  return `<table class="championship-history-table accomplishment-table money-in-the-bank-table">
    <thead><tr><th>Year</th><th>Winner</th><th>Date Won</th><th>Location</th><th>Event</th><th>Held For</th><th>Cashed In On</th><th>Location</th><th>Event</th><th>For</th><th>Notes</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td>${escapeHtml(row.year ?? String(row.dateWon ?? "").slice(0, 4))}</td>
      <td>${tournamentPersonLink(row.winner, row.personId)}</td>
      <td>${escapeHtml(formatMetadataDate(row.dateWon))}</td>
      <td>${escapeHtml(row.location ?? "—")}</td>
      <td>${achievementEventLink(row.event, row.dateWon, row.eventId)}</td>
      <td>${escapeHtml(row.heldFor ?? "—")}</td>
      <td>${escapeHtml(formatMetadataDate(row.cashIn?.date))}</td>
      <td>${escapeHtml(row.cashIn?.location ?? "—")}</td>
      <td>${achievementEventLink(row.cashIn?.event, row.cashIn?.date, row.cashIn?.eventId)}</td>
      <td>${achievementChampionshipLink(row.championship, row.championshipId, row.cashIn?.date)}</td>
      <td>${achievementNotesButton(row.notes, `${row.winner ?? "Money in the Bank"} notes`)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function renderEliminationChamberTable(rows) {
  return `<table class="championship-history-table accomplishment-table elimination-chamber-table">
    <thead><tr><th>No.</th><th>Winner</th><th>Date</th><th>Location</th><th>Event</th><th>Prize</th><th>Championship Match</th><th>Other Participants</th><th>Notes</th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td>${escapeHtml(row.number ?? "—")}</td>
      <td>${tournamentPersonLink(row.winner, row.personId)}</td>
      <td>${escapeHtml(formatMetadataDate(row.date))}</td>
      <td>${escapeHtml(row.location ?? "—")}</td>
      <td>${achievementEventLink(row.event, row.date, row.eventId, recurringAchievementEventLabel(row.event, row.date))}</td>
      <td>${achievementChampionshipLink(row.prize, row.prizeChampionshipId, row.date)}</td>
      <td>${achievementMatchEventLink(row.championshipMatch)}</td>
      <td>${escapeHtml(row.participants ?? "—")}</td>
      <td>${achievementNotesButton(row.notes, `${row.event ?? "Elimination Chamber"} notes`)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function achievementEventLink(eventName, date, eventId = "", label = "") {
  if (!eventName) return "—";
  const target = findAchievementEventTarget(eventName, date, "wwe", eventId);
  const text = label || eventName;
  return target
    ? `<button type="button" class="championship-event-link" data-title-id="${escapeHtml(target.id)}">${escapeHtml(text)}</button>`
    : state.wrestlingMode === "archive" && date
      ? `<button type="button" class="championship-event-link" data-action="open-achievement-event" data-promotion-id="wwe" data-event-name="${escapeHtml(eventName)}" data-event-date="${escapeHtml(date)}" data-event-id="${escapeHtml(eventId)}">${escapeHtml(text)}</button>`
      : escapeHtml(text);
}

function achievementMatchEventLink(match) {
  if (!match) return "—";
  if (typeof match === "string") return escapeHtml(match);
  if (!match.event) return escapeHtml(match.text ?? "—");
  return achievementEventLink(match.event, match.date, match.eventId, match.text || recurringAchievementEventLabel(match.event, match.date));
}

function recurringAchievementEventLabel(eventName, date) {
  const year = String(date ?? "").slice(0, 4);
  const name = String(eventName ?? "").replace(/\s*\((?:19|20)\d{2}\)\s*$/, "").trim();
  return year && !new RegExp(`\\b${year}\\b`).test(name) ? `${name} (${year})` : name;
}

function achievementMatchLink(match) {
  if (!match) return "—";
  if (typeof match === "string") return escapeHtml(match);
  const championship = achievementChampionshipLink(match.championship, match.championshipId, match.date);
  const event = match.event
    ? achievementEventLink(match.event, match.date, match.eventId, match.event)
    : "";
  if (championship !== "—" && event) return `${championship} match at ${event}`;
  return championship !== "—" ? `${championship} match` : event || "—";
}

function achievementChampionshipLink(name, championshipId = "", date = "") {
  if (!name) return "—";
  const canonicalId = championshipId || canonicalWweChampionshipId(name, date);
  const championship = wweChampionshipSections
    .flatMap((section) => section.groups.flatMap((group) => group.championships))
    .find((item) => item.id === canonicalId);
  return championship
    ? `<button type="button" class="championship-event-link" data-championship-id="${escapeHtml(championship.id)}">${escapeHtml(name)}</button>`
    : escapeHtml(name);
}

function canonicalWweChampionshipId(name, date = "") {
  const normalized = normalizeTitleForMatch(name).replace(/^(?:wwf|wwe)\s+/, "");
  const year = Number(String(date).slice(0, 4)) || 9999;
  if (normalized.includes("universal")) return "wwe-wwe-universal";
  if (normalized.includes("world heavyweight")) {
    return year <= 2013 ? "wwe-wwe-world-heavyweight-2002" : "wwe-wwe-world-heavyweight";
  }
  if (/women\s*s\s+world/.test(normalized)) return "wwe-wwe-womens-world";
  if (/wwe\s+women\s*s/.test(normalized) || /^women\s*s\s+championship$/.test(normalized)) return "wwe-wwe-womens-championship";
  if (normalized.includes("divas")) return "wwe-wwe-divas";
  if (normalized.includes("intercontinental")) return "wwe-wwe-intercontinental";
  if (normalized.includes("united states")) return "wwe-wwe-united-states";
  if (normalized.includes("ecw")) return "wwe-ecw-world-heavyweight";
  if (normalized.includes("undisputed") || normalized.includes("wwe championship") || normalized.includes("world wrestling federation")) return "wwe-wwe-championship";
  return "";
}

function achievementNotesButton(notes, title) {
  return notes
    ? `<button type="button" class="achievement-notes-button" data-action="open-notes-overlay" data-notes-title="${escapeHtml(title)}" data-notes="${escapeHtml(notes)}">Notes</button>`
    : "—";
}

function findAchievementEventTarget(eventName, date, promotionId, eventId = "") {
  if (!eventName || !date) return null;
  const promotion = getPromotion(promotionId);
  const candidates = state.wrestlingMode === "media"
    ? getLocalWrestlingRecordsForPromotion(promotion).map(metadataRecordToTimelineItem)
    : getGeneratedWrestlingRecords(promotionId).map(libraryRecordToTimelineItem);
  return resolveCanonicalWrestlingEventTarget({ candidates, promotionId, eventName, date, eventId });
}

function canonicalWweEventKey(name) {
  return canonicalWrestlingEventKey(name, "wwe")
    .replace(/\b(?:19|20)\d{2}\b/g, "")
    .replace(/\bnight\s+(?:1|2|one|two)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCanonicalWrestlingEventTarget({ candidates = [], promotionId = "", eventName = "", date = "", eventId = "" } = {}) {
  const datedCandidates = date ? candidates.filter((item) => item.date === date) : candidates;
  if (!datedCandidates.length) return null;
  const requestedKey = canonicalWrestlingEventKey(eventName, promotionId);
  const direct = eventId
    ? datedCandidates.find((item) => item.id === eventId || item.referenceId === eventId)
    : null;
  const directKey = direct ? canonicalWrestlingEventKey(direct.title ?? direct.showName, promotionId) : "";
  const matching = datedCandidates.filter((item) => {
    const itemKey = canonicalWrestlingEventKey(item.title ?? item.showName, promotionId);
    return eventKeysMatch(itemKey, requestedKey) || eventKeysMatch(itemKey, directKey);
  });
  const pool = matching.length ? matching : direct ? [direct] : [];
  if (!pool.length) return null;
  return [...pool].sort((left, right) => {
    const rightKey = canonicalWrestlingEventKey(right.title ?? right.showName, promotionId);
    const leftKey = canonicalWrestlingEventKey(left.title ?? left.showName, promotionId);
    const rightScore = wrestlingEventHydrationScore(right) + (rightKey === requestedKey ? 20 : 0);
    const leftScore = wrestlingEventHydrationScore(left) + (leftKey === requestedKey ? 20 : 0);
    return rightScore - leftScore || String(left.id).localeCompare(String(right.id));
  })[0];
}

function canonicalWrestlingEventKey(name, promotionId = "") {
  const promotionNames = [promotionId, "wwf", "wwe", "aew", "wcw", "ecw", "tna", "impact wrestling", "roh", "njpw", "ajpw"]
    .filter(Boolean)
    .map(escapeRegex)
    .join("|");
  return normalizeTitleForMatch(name)
    .replace(new RegExp(`^(?:${promotionNames})\\s+`), "")
    .replace(/\bwrestlemania\s+([ivxlcdm]+)\b/gi, (match, numeral) => {
      const number = romanNumeralToNumber(numeral);
      return number ? `wrestlemania ${number}` : match;
    })
    .replace(/\b(?:19|20)\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function romanNumeralToNumber(value = "") {
  const digits = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  const characters = String(value).toUpperCase().split("");
  if (!characters.length || characters.some((character) => !digits[character])) return null;
  return characters.reduce((total, character, index) => {
    const current = digits[character];
    const next = digits[characters[index + 1]] ?? 0;
    return total + (current < next ? -current : current);
  }, 0);
}

function eventKeysMatch(left = "", right = "") {
  return Boolean(left && right) && (left === right || left.includes(right) || right.includes(left));
}

function wrestlingEventHydrationScore(item = {}) {
  const matches = Number(item.matchCount ?? item.matches?.length ?? 0) || 0;
  const detailFields = [item.summary, item.venue, item.location, item.attendance, item.mainEvent, item.posterUrl, item.stillUrl]
    .filter((value) => value !== null && value !== undefined && String(value).trim()).length;
  return matches * 25 + detailFields * 3 + (item.referenceId ? 1 : 0);
}

function renderKingOfTheRingPage(tournament) {
  const results = [...(tournament.results ?? [])].sort((a, b) => b.year - a.year);
  const editions = [...(tournament.editions ?? [])].sort((a, b) => b.year - a.year);
  return `
    <div class="championship-detail-page tournament-detail-page king-of-the-ring-page">
      <button class="icon-button title-back" type="button" data-action="back-title">Back</button>
      ${renderAchievementHero(tournament, "WWE Tournament")}
      <section class="championship-history-panel tournament-results-panel">
        <div class="lane-head"><h2>Tournament Winners</h2><span class="muted">Newest first</span></div>
        <div class="championship-table-wrap">
          <table class="championship-history-table tournament-results-table king-of-the-ring-table">
            <thead><tr><th>Year</th><th>Winner</th><th>Defeated</th><th>Date</th><th>Location</th><th>Event</th><th>Championship Match</th></tr></thead>
            <tbody>${results.map((result) => `<tr>
              <td><strong>${escapeHtml(result.year)}</strong></td>
              <td>${tournamentPersonLink(result.winner, result.winnerPersonId)}</td>
              <td>${tournamentPersonLink(result.runnerUp, result.runnerUpPersonId)}</td>
              <td>${escapeHtml(formatMetadataDate(result.final?.date))}</td>
              <td>${escapeHtml(result.final?.venue ?? "—")}</td>
              <td>${achievementEventLink(result.final?.event, result.final?.date, result.final?.eventId)}</td>
              <td>${achievementMatchEventLink(result.worldTitleMatch)}</td>
            </tr>`).join("")}</tbody>
          </table>
        </div>
      </section>
      <section class="tournament-brackets-panel king-of-the-ring-brackets">
        <div class="lane-head"><h2>Full Tournament Brackets</h2><span class="muted">Select a year</span></div>
        ${editions.map((edition, index) => `
          <details class="tournament-edition" ${index === 0 ? "open" : ""}>
            <summary><strong>${escapeHtml(edition.year)}</strong><span>${escapeHtml(edition.rounds?.length ?? 0)} rounds</span></summary>
            <div class="tournament-rounds">${(edition.rounds ?? []).map((round) => `<section class="tournament-round"><h4>${escapeHtml(round.name)}</h4>${(round.matches ?? []).map(renderTournamentMatch).join("")}</section>`).join("")}</div>
          </details>
        `).join("")}
      </section>
    </div>
  `;
}

function renderRoundRobinAchievementPage(tournament) {
  const results = [...(tournament.results ?? [])].sort((a, b) => b.year - a.year);
  return `
    <div class="championship-detail-page tournament-detail-page annual-achievement-page">
      <button class="icon-button title-back" type="button" data-action="back-title">Back</button>
      ${renderAchievementHero(tournament, "Round-Robin Tournament")}
      <section class="championship-history-panel tournament-results-panel">
        <div class="lane-head"><h2>Tournament Results</h2><span class="muted">Newest first</span></div>
        <div class="championship-table-wrap">
          <table class="championship-history-table tournament-results-table">
            <thead><tr><th>Year</th><th>Winner</th><th>League / Points</th><th>Runner Up</th><th>League / Points</th><th>Final</th></tr></thead>
            <tbody>${results.map(renderRoundRobinResultRow).join("")}</tbody>
          </table>
        </div>
      </section>
      <section class="tournament-brackets-panel achievement-editions-panel">
        <div class="lane-head"><h2>League Standings</h2><span class="muted">Blue and Gold leagues</span></div>
        ${results.map((result, index) => renderRoundRobinEdition(result, index)).join("")}
      </section>
    </div>
  `;
}

function renderAnnualAwardPage(tournament) {
  const results = [...(tournament.results ?? [])].sort((a, b) => b.year - a.year);
  return `
    <div class="championship-detail-page tournament-detail-page annual-achievement-page">
      <button class="icon-button title-back" type="button" data-action="back-title">Back</button>
      ${renderAchievementHero(tournament, "Annual Achievement")}
      <section class="championship-history-panel tournament-results-panel">
        <div class="lane-head"><h2>Winners</h2><span class="muted">Newest first</span></div>
        <div class="championship-table-wrap">
          <table class="championship-history-table tournament-results-table">
            <thead><tr><th>Year</th><th>Winner</th><th>Runner Up</th><th>Final</th><th>Notes</th></tr></thead>
            <tbody>${results.map(renderAnnualAwardResultRow).join("")}</tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

function renderAchievementHero(tournament, eyebrow) {
  const mostWins = formatChampionshipRecord(tournament.records?.mostWins);
  return `
    <section class="championship-detail-hero tournament-detail-hero">
      <div class="championship-detail-belt"><img src="${escapeHtml(tournament.imageUrl ?? championshipPlaceholderDataUri(tournament.name, eyebrow, "aew"))}" alt="${escapeHtml(tournament.name)}" onerror="this.onerror=null;this.src='${championshipPlaceholderDataUri(tournament.name, eyebrow, "aew")}'" /></div>
      <div class="championship-detail-copy">
        <span class="eyebrow">${escapeHtml(eyebrow)}</span>
        <h1>${escapeHtml(tournament.name)}</h1>
        <div class="championship-record-grid">
          <div><span>Established</span><strong>${escapeHtml(formatMetadataDate(tournament.established))}</strong></div>
          <div><span>Format</span><strong>${escapeHtml(tournament.format ?? "Annual")}</strong></div>
          ${tournament.prize ? `<div><span>Prize</span><strong>${escapeHtml(tournament.prize)}</strong></div>` : ""}
          ${mostWins ? `<div><span>Most Wins</span><strong>${escapeHtml(mostWins)}</strong></div>` : ""}
        </div>
      </div>
    </section>
  `;
}

function renderRoundRobinResultRow(result) {
  const finalTarget = findTournamentEventTarget(result.final);
  const finalLabel = `<strong>${escapeHtml(formatMetadataDate(result.final?.date))}</strong><span>${escapeHtml(result.final?.event ?? "")}</span><small>${escapeHtml(result.final?.venue ?? "")}</small>`;
  return `<tr><td><strong>${escapeHtml(result.year)}</strong></td><td>${tournamentPersonLink(result.winner, result.winnerPersonId)}</td><td>${escapeHtml(`${result.winnerLeague} / ${result.winnerPoints}`)}</td><td>${tournamentPersonLink(result.runnerUp, result.runnerUpPersonId)}</td><td>${escapeHtml(`${result.runnerUpLeague} / ${result.runnerUpPoints}`)}</td><td>${finalTarget ? `<button type="button" class="championship-event-link tournament-table-event" data-title-id="${escapeHtml(finalTarget.id)}">${finalLabel}</button>` : `<div class="tournament-table-event">${finalLabel}</div>`}</td></tr>`;
}

function renderAnnualAwardResultRow(result) {
  const finalTarget = findTournamentEventTarget(result.final);
  const finalLabel = `<strong>${escapeHtml(formatMetadataDate(result.final?.date))}</strong><span>${escapeHtml(result.final?.event ?? "")}</span><small>${escapeHtml(result.final?.venue ?? "")}</small>`;
  return `<tr><td><strong>${escapeHtml(result.year)}</strong></td><td>${tournamentPersonLink(result.winner, result.winnerPersonId)}</td><td>${tournamentPersonLink(result.runnerUp, result.runnerUpPersonId)}</td><td>${finalTarget ? `<button type="button" class="championship-event-link tournament-table-event" data-title-id="${escapeHtml(finalTarget.id)}">${finalLabel}</button>` : `<div class="tournament-table-event">${finalLabel}</div>`}</td><td>${escapeHtml(result.notes || "")}</td></tr>`;
}

function renderRoundRobinEdition(result, index = 0) {
  return `
    <details class="tournament-edition round-robin-edition" ${index === 0 ? "open" : ""}>
      <summary><strong>${escapeHtml(result.year)}</strong><span>${escapeHtml(result.winner)} defeated ${escapeHtml(result.runnerUp)}</span></summary>
      <div class="round-robin-edition-content">
      <div class="round-robin-leagues">
        ${Object.entries(result.leagues ?? {}).map(([name, entrants]) => `
          <section class="round-robin-league">
            <h4>${escapeHtml(name)} League</h4>
            <ol>${entrants.map((entrant) => `<li><span>${tournamentPersonLink(entrant.name, entrant.personId)}</span><strong>${entrant.points == null ? "—" : escapeHtml(entrant.points)}</strong>${entrant.note ? `<small>${escapeHtml(entrant.note)}</small>` : ""}</li>`).join("")}</ol>
          </section>
        `).join("")}
      </div>
      ${renderRoundRobinMatches(result.matches)}
      </div>
    </details>
  `;
}

function renderRoundRobinMatches(matches = []) {
  if (!matches.length) return "";
  return `
    <section class="round-robin-match-list">
      <h4>Complete Tournament Matches</h4>
      <div class="championship-table-wrap">
        <table class="championship-history-table">
          <thead><tr><th>Date</th><th>League</th><th>Match</th><th>Show / Venue</th><th>Time</th></tr></thead>
          <tbody>${matches.map((match) => {
            const target = findTournamentEventTarget({ date: match.date, event: match.show });
            const show = `<strong>${escapeHtml(match.show)}</strong><small>${escapeHtml(match.venue)}</small>`;
            return `<tr><td>${escapeHtml(formatMetadataDate(match.date))}</td><td>${escapeHtml(match.league)}</td><td>${escapeHtml(match.match)}</td><td>${target ? `<button type="button" class="championship-event-link tournament-table-event" data-title-id="${escapeHtml(target.id)}">${show}</button>` : `<div class="tournament-table-event">${show}</div>`}</td><td>${escapeHtml(match.time)}</td></tr>`;
          }).join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderTournamentResultRow(result) {
  const finalTarget = findTournamentEventTarget(result.final);
  const titleTarget = findTournamentEventTarget(result.worldTitleMatch);
  const winner = tournamentPersonLink(result.winner, result.winnerPersonId);
  const runnerUp = tournamentPersonLink(result.runnerUp, result.runnerUpPersonId);
  const finalLabel = `<strong>${escapeHtml(formatMetadataDate(result.final?.date))}</strong><span>${escapeHtml(result.final?.event ?? "")}</span><small>${escapeHtml(result.final?.venue ?? "")}</small>`;
  const titleLabel = escapeHtml(result.worldTitleMatch?.text ?? "TBD");
  return `<tr><td><strong>${escapeHtml(result.year)}</strong></td><td>${winner}</td><td>${runnerUp}</td><td>${finalTarget ? `<button type="button" class="championship-event-link tournament-table-event" data-title-id="${escapeHtml(finalTarget.id)}">${finalLabel}</button>` : `<div class="tournament-table-event">${finalLabel}</div>`}</td><td>${titleTarget ? `<button type="button" class="championship-event-link" data-title-id="${escapeHtml(titleTarget.id)}">${titleLabel}</button>` : titleLabel}</td></tr>`;
}

function renderTournamentEdition(edition) {
  return `
    <article class="tournament-edition">
      <h3>${escapeHtml(edition.year)}</h3>
      <div class="tournament-rounds">
        ${(edition.rounds ?? []).map((round) => `<section class="tournament-round"><h4>${escapeHtml(round.name)}</h4>${round.matches.map(renderTournamentMatch).join("")}</section>`).join("")}
      </div>
    </article>
  `;
}

function renderTournamentMatch(match) {
  const target = state.promotionId === "wwe" ? null : findTournamentEventTarget(match);
  const competitors = String(match.match ?? "").split(/\s+vs\.?\s+/i).map((name) => name.trim()).filter(Boolean);
  const competitorsMarkup = competitors.length === 2
    ? competitors.map((name) => `<div class="tournament-competitor${normalizeTitleForMatch(name) === normalizeTitleForMatch(match.winner) ? " winner" : ""}">${escapeHtml(name)}</div>`).join("")
    : `<div class="tournament-competitor winner">${escapeHtml(match.match)}</div>`;
  const eventLabel = `${formatMetadataDate(match.date)} · ${match.event || "Event"}`;
  const eventMarkup = state.promotionId === "wwe" && match.date
    ? achievementEventLink(match.event || "WWE event", match.date, match.eventId, eventLabel)
    : target
      ? `<button type="button" class="championship-event-link" data-title-id="${escapeHtml(target.id)}">${escapeHtml(eventLabel)}</button>`
      : escapeHtml(eventLabel);
  return `<article class="tournament-match">${competitorsMarkup}<div class="tournament-match-meta">${eventMarkup}${match.time ? `<span>${escapeHtml(match.time)}</span>` : ""}</div></article>`;
}

function tournamentPersonLink(name, personId) {
  return personId ? `<button type="button" class="championship-person-link" data-person-id="${escapeHtml(personId)}">${escapeHtml(name)}</button>` : escapeHtml(name ?? "—");
}

function findTournamentEventTarget(record = {}) {
  if (!record?.date) return null;
  const promotion = getPromotion("aew");
  const candidates = state.wrestlingMode === "media"
    ? getLocalWrestlingRecordsForPromotion(promotion).map(metadataRecordToTimelineItem)
    : getGeneratedWrestlingRecords("aew").map(libraryRecordToTimelineItem);
  return resolveCanonicalWrestlingEventTarget({
    candidates,
    promotionId: "aew",
    eventName: record.event,
    date: record.date,
    eventId: record.eventId,
  });
}

function renderChampionshipReignRow(reign, championship, showDefenses = false) {
  const promotionId = championship?.promotionId ?? championship?.id?.split("-")[0] ?? "aew";
  const target = findChampionshipEventTarget(reign, promotionId);
  const champion = reign.personId
    ? `<button type="button" class="championship-person-link" data-person-id="${escapeHtml(reign.personId)}">${escapeHtml(reign.champion)}</button>`
    : escapeHtml(reign.champion);
  const label = formatChampionshipEventLabel(reign.event, reign.dateWon, promotionId);
  const canLink = !isUnlinkedChampionshipEvent(reign.event);
  const event = target
    ? `<button type="button" class="championship-event-link championship-reign-event" data-title-id="${escapeHtml(target.id)}">${label}</button>`
    : canLink
      ? `<button type="button" class="championship-event-link championship-reign-event" data-action="open-championship-event" data-promotion-id="${escapeHtml(promotionId)}" data-event-name="${escapeHtml(reign.event)}" data-event-date="${escapeHtml(reign.dateWon)}">${label}</button>`
      : `<span class="championship-reign-event">${label}</span>`;
  const notes = cleanChampionshipNotes(reign.notes, reign.recognizedDays, reign.days);
  const defenseCount = getChampionshipDefenseCount(reign);
  const defenses = showDefenses ? `<td>${defenseCount == null ? "—" : `<button type="button" class="achievement-notes-button" data-action="open-defense-overlay" data-championship-id="${escapeHtml(championship.id)}" data-reign-number="${escapeHtml(reign.number)}" data-date-won="${escapeHtml(reign.dateWon)}">${escapeHtml(defenseCount)}</button>`}</td>` : "";
  return `<tr><td>${escapeHtml(reign.number)}</td><td>${champion}</td><td>${escapeHtml(formatMetadataDate(reign.dateWon))}</td><td>${escapeHtml(reign.location || "—")}</td><td>${escapeHtml(reign.reign || "—")}</td><td>${escapeHtml(reign.days ?? "—")}</td>${defenses}<td>${event}</td><td>${achievementNotesButton(notes, `${reign.champion ?? "Championship reign"} notes`)}</td></tr>`;
}

function getChampionshipDefenseCount(reign = {}) {
  if (Array.isArray(reign.titleDefenses)) return reign.titleDefenses.length;
  if (Array.isArray(reign.defenseDetails)) return reign.defenseDetails.length;
  const value = reign.successfulDefenses ?? reign.defenses;
  return value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : value;
}

function cleanChampionshipNotes(notes, recognizedDays, days) {
  let value = String(notes ?? "").replace(/^&lt;/, "<").trim();
  const leadingNumber = value.match(/^((?:<\s*)?[\d,]+|—)\s+(?=\S)/)?.[1];
  const clutter = new Set([recognizedDays, days].filter((item) => item != null).map((item) => Number(item).toLocaleString("en-US")));
  const normalizedValue = value.replace(/^<\s*/, "");
  if (/^(?:<\s*)?[\d,]+$/.test(value) || clutter.has(normalizedValue) || value === "—") return "";
  if (leadingNumber) value = value.slice(leadingNumber.length).trim();
  return value;
}

function formatChampionshipEventLabel(eventName, date, promotionId) {
  const source = String(eventName || "—").trim();
  const raw = source.replace(/^(?:WWF|WWE)\s+/i, "").trim();
  if (promotionId !== "wwe" || !date || raw === "—") return escapeHtml(raw);
  const year = String(date).slice(0, 4);
  const networkShow = source.match(/^(?:WWF|WWE)\s+on\s+(.+)$/i);
  if (networkShow) return `<span>${escapeHtml(source)}</span><small>${escapeHtml(formatMetadataDate(date))}</small>`;
  const weekly = raw.match(/^(Raw|SmackDown|NXT(?:\s+UK)?|ECW|Main Event|Superstars(?:\s+of\s+Wrestling)?|Heat|Velocity|Shotgun Saturday Night|Championship Wrestling|Prime Time Wrestling)(?:\s+.*)?$/i);
  if (weekly) return `<span>${escapeHtml(weekly[1])}</span><small>${escapeHtml(formatMetadataDate(date))}</small>`;
  if (/^WrestleMania\s+(?:\d+|[IVXLCDM]+)$/i.test(raw)) return escapeHtml(raw);
  const recurring = /^(?:Royal Rumble|Survivor Series|SummerSlam|Money in the Bank|Elimination Chamber|Backlash|Extreme Rules|Night of Champions|Clash at the Castle|Crown Jewel|Hell in a Cell|Payback|Fastlane|TLC|No Mercy|Unforgiven|Armageddon|Judgment Day|Vengeance|Cyber Sunday|Taboo Tuesday|New Year'?s Revolution|The Great American Bash)(?:\s*[:—-].*)?$/i.test(raw);
  if (recurring && !new RegExp(`\\b${year}\\b`).test(raw)) return escapeHtml(`${raw} ${year}`);
  return escapeHtml(raw);
}

function isUnlinkedChampionshipEvent(eventName) {
  return !eventName || /^(?:—|house show|live event)$/i.test(String(eventName).trim());
}

function formatChampionshipRecord(record) {
  if (!record) return null;
  if (typeof record === "string") return record;
  return [record.champion, record.value != null ? `${record.value}${record.unit ? ` ${record.unit}` : ""}` : null].filter(Boolean).join(" / ");
}

function findChampionshipEventTarget(reign, promotionId = "aew") {
  const promotion = getPromotion(promotionId);
  const candidates = state.wrestlingMode === "media"
    ? getLocalWrestlingRecordsForPromotion(promotion).map(metadataRecordToTimelineItem)
    : getGeneratedWrestlingRecords(promotionId, Number(String(reign.dateWon).slice(0, 4))).map(libraryRecordToTimelineItem);
  return resolveCanonicalWrestlingEventTarget({
    candidates,
    promotionId,
    eventName: reign.event,
    date: reign.dateWon,
    eventId: reign.eventId,
  });
}

function renderOverview(promotion, specials) {
  if (["njpw", "ajpw"].includes(promotion.id)) return renderJapaneseTourOverview(promotion, specials);
  const deferredWweWorld = promotion.id === "wwe" ? specials.filter(isWweWorldAtWrestleMania) : [];
  const columnSpecials = promotion.id === "wwe" ? specials.filter((item) => !isWweWorldAtWrestleMania(item)) : specials;
  const showLanes = getVisibleShowLanes(promotion, state.selectedYear);
  const renderedShowLanes = [];
  for (const show of showLanes) {
    renderedShowLanes.push(renderShowLane(promotion, show));
  }
  const eventRows = columnSpecials.map(renderEventRow).join("");
  return `
    <div class="layout-two promotion-overview">
      <div class="lane weekly-column">
        <div class="lane-head">
          <h2>Weekly Shows</h2>
          <span class="muted">Season ${state.selectedYear}</span>
        </div>
        ${renderedShowLanes.join("")}
      </div>
      <aside class="lane events-column">
        <div class="lane-head">
          <h2>Events & Specials</h2>
          <span class="muted">${columnSpecials.length} items</span>
        </div>
        ${renderVerticalEventCarousel(columnSpecials, `events-${promotion.id}-${state.selectedYear}`, "No specials found for this year.")}
      </aside>
    </div>
    ${deferredWweWorld.length ? `<div class="shelf-stack wwe-world-shelf">${renderPosterShelf("WWE World at WrestleMania", chronologicalNjpwItems(deferredWweWorld), "title", renderEventArchiveCard)}</div>` : ""}
  `;
}

function isWweWorldAtWrestleMania(item) {
  return /\bWWE\s+World\s+(?:at|At)\s+WrestleMania\b/i.test([item?.title, item?.tourName, item?.series, item?.showName].filter(Boolean).join(" "));
}

function renderJapaneseTourOverview(promotion, visibleItems) {
  const items = visibleItems.filter((item) => item.year === state.selectedYear);
  const hasStrong = promotion.id === "njpw" && isNjpwStrongYear(state.selectedYear);
  const strong = hasStrong ? chronologicalNjpwItems(items.filter(isNjpwStrongItem)) : [];
  const tours = items.filter((item) => isJapaneseTourItem(item) && !isNjpwStrongItem(item));
  const events = chronologicalNjpwItems(items.filter((item) => !isJapaneseTourItem(item) && !isNjpwStrongItem(item)));
  const tourGroups = getNjpwTourGroups(tours);
  return `
    <div class="layout-two promotion-overview japanese-tour-overview promotion-overview-${promotion.id}">
      <div class="lane weekly-column tour-column">
        <div class="lane-head">
          <h2>Tours</h2>
          <span class="muted">${tours.length + strong.length} dates</span>
        </div>
        <div class="shelf-stack">
          ${strong.length ? renderPosterShelf("NJPW Strong", strong, "title", renderEventArchiveCard) : ""}
          ${tourGroups.map((group) => renderPosterShelf(group.title, group.items, "title", renderEventArchiveCard)).join("")}
          ${!strong.length && !tourGroups.length ? `<div class="empty">No tour dates found for this year.</div>` : ""}
        </div>
      </div>
      <aside class="lane events-column">
        <div class="lane-head"><h2>Events &amp; Specials</h2><span class="muted">${events.length} items</span></div>
        ${renderVerticalEventCarousel(events, `events-${promotion.id}-${state.selectedYear}`, "No events found for this year.")}
      </aside>
    </div>
  `;
}

function isJapaneseTourItem(item) {
  return item?.catalogSection === "tours" || Boolean(item?.tourName) || /\s+-\s+(?:Day|Tag)\s+\d+\b/i.test(item?.title ?? "");
}

function getNjpwTourGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const title = item.tourName || item.title.replace(/\s+-\s+(?:Day|Tag)\s+\d+\b.*$/i, "");
    const key = normalizeTitleForMatch(title);
    const group = groups.get(key) ?? { title: formatNjpwTourTitle(title), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, items: chronologicalNjpwItems(group.items) }))
    .sort((left, right) => getArchiveDateKey(left.items[0]).localeCompare(getArchiveDateKey(right.items[0])) || left.title.localeCompare(right.title));
}

function formatNjpwTourTitle(title = "") {
  if (/^NJPW Road To The New Beginning(?:\s+20\d{2})?$/i.test(title)) return "Road To The New Beginning";
  return title;
}

function chronologicalNjpwItems(items) {
  return [...items].sort((left, right) => getArchiveDateKey(left).localeCompare(getArchiveDateKey(right)) || left.title.localeCompare(right.title));
}

function isNjpwStrongYear(year) {
  return Number(year) >= 2020 && Number(year) <= 2023;
}

function isNjpwStrongItem(item) {
  return /\bNJPW\s+Strong\b/i.test([item?.title, item?.series, item?.showName].filter(Boolean).join(" "));
}

function renderEventArchive(promotion) {
  const events = sortEventArchiveItems(filterEvents(getVisiblePromotionArchiveItems(promotion)));
  if (promotion.id === "njpw") return renderNjpwEventArchive(events);
  return `
    <section class="lane event-archive">
      <div class="lane-head event-archive-head">
        <div>
          <h2>Events</h2>
          <span class="muted">${events.length} ${events.length === 1 ? "event" : "events"}</span>
        </div>
        ${renderEventSortControl()}
      </div>
      <div class="library-grid event-archive-grid">
        ${events.map(renderEventArchiveCard).join("") || `<div class="empty">No events match your search.</div>`}
      </div>
    </section>
  `;
}

function renderNjpwEventArchive(events) {
  const strong = chronologicalNjpwItems(events.filter((item) => isNjpwStrongYear(item.year) && isNjpwStrongItem(item)));
  const tours = events.filter((item) => item.catalogSection === "tours" && !isNjpwStrongItem(item));
  const specials = chronologicalNjpwItems(events.filter((item) => item.catalogSection !== "tours" && !isNjpwStrongItem(item)));
  const tourGroups = getNjpwTourGroups(tours);
  return `
    <section class="lane event-archive njpw-event-archive">
      <div class="lane-head event-archive-head">
        <div><h2>NJPW Archive</h2><span class="muted">${events.length} event dates</span></div>
        ${renderEventSortControl()}
      </div>
      <div class="shelf-stack">
        ${strong.length ? renderPosterShelf("NJPW Strong", strong, "title", renderEventArchiveCard) : ""}
        ${tourGroups.map((group) => renderPosterShelf(group.title, group.items, "title", renderEventArchiveCard)).join("")}
        ${renderPosterShelf("Events & Specials", specials, "title", renderEventArchiveCard)}
      </div>
    </section>
  `;
}

function renderDocumentaryArchive(promotion) {
  if (promotion.id !== "wwe") return renderPlaceholder(promotion);
  const documentaries = filterEvents(getWweDocumentaryItems());
  const categories = getWweDocumentaryCategories();
  return `
    <section class="lane event-archive documentary-archive">
      <div class="lane-head event-archive-head">
        <div>
          <h2>Documentaries</h2>
          <span class="muted">${documentaries.length} titles / ${categories.length} sections</span>
        </div>
        ${renderEventSortControl("Sort documentaries")}
      </div>
       <div class="shelf-stack documentary-shelves">
         ${categories.map((category) => renderPosterShelf(category.title, getWweDocumentariesForCategory(category, documentaries), "title", renderEventArchiveCard)).join("")}
       </div>
    </section>
  `;
}

function renderEventSortControl(label = "Sort events") {
  return `
    <select class="select" aria-label="${escapeHtml(label)}" data-action="event-sort">
      <option value="date-desc" ${state.eventSort === "date-desc" ? "selected" : ""}>Newest first</option>
      <option value="date-asc" ${state.eventSort === "date-asc" ? "selected" : ""}>Oldest first</option>
      <option value="title-asc" ${state.eventSort === "title-asc" ? "selected" : ""}>A-Z</option>
      <option value="title-desc" ${state.eventSort === "title-desc" ? "selected" : ""}>Z-A</option>
    </select>
  `;
}

function renderEventArchiveCard(item) {
  const meta = [formatArchiveDate(item), item.releaseCode, item.location, item.venue].filter(Boolean).join(" / ");
  const displayTitle = getDisplayTitle(item);
  return `
    <article class="media-card library-card event-archive-card ${item.status}" title="${escapeHtml(displayTitle)}" data-title-id="${item.id}">
      ${renderPosterBlock(item)}
      ${renderMediaStoplightButton(item)}
      ${renderWatchedIndicator(item)}
      <div class="card-body">
        <div class="card-title">${escapeHtml(displayTitle)}</div>
        <div class="card-meta">${escapeHtml(meta)}</div>
        <div class="tag-row">
          <span class="tag">${escapeHtml(item.eventLabel ?? "Event")}</span>
          ${item.matchCount ? `<span class="tag">${item.matchCount} matches</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderShowLane(promotion, show) {
  const episodes = filterEvents(getVisibleShowEpisodes(promotion, show, state.selectedYear));
  const episodeIds = episodes.slice(0, 200).map((episode) => episode.id);
  return `
    <section class="lane">
      <div class="lane-head">
        <h3>${show.name}</h3>
        <div class="show-lane-tools"><span class="muted">${episodes.length} episodes</span>${episodes.length ? `<button class="show-match-gear" type="button" data-action="open-wrestling-series-match" data-series-name="${escapeHtml(show.name)}" data-item-id="${escapeHtml(episodes[0].id)}" data-item-ids="${escapeHtml(episodeIds.join("|"))}" title="Match artwork or refresh this show" aria-label="Match artwork or refresh ${escapeHtml(show.name)}">&#9881;</button>` : ""}</div>
      </div>
      <div class="carousel">
        ${episodes.map(renderMediaCard).join("") || `<div class="empty">No episodes in this year.</div>`}
      </div>
    </section>
  `;
}

function renderMediaCard(item) {
  return `
    <article class="media-card" data-title-id="${item.id}" tabindex="0">
      ${renderPosterBlock(item)}
      ${renderMediaStoplightButton(item)}
      ${renderWatchedIndicator(item)}
      <div class="card-body">
        <div class="card-title">${escapeHtml(getDisplayTitle(item))}</div>
        <div class="card-meta">${formatDisplayDate(item.date)}</div>
        <div class="tag-row">
          ${item.episodeNumber ? `<span class="tag">E${String(item.episodeNumber).padStart(2, "0")}</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderEventRow(item) {
  return `
    <article class="event-row" data-title-id="${item.id}" tabindex="0" role="button">
      ${renderPosterBlock(item, "event-thumb")}
      <div class="event-date">${formatShortDate(item.date)}</div>
      <div>
        <div class="event-name">${escapeHtml(getDisplayTitle(item))}</div>
        <div class="card-meta">${item.eventLabel ?? item.metadataSource}</div>
      </div>
      ${renderMediaStoplightButton(item)}
    </article>
  `;
}

function renderVerticalEventCarousel(items, id, emptyMessage) {
  const hasOverflow = items.length > 7;
  return `
    <div class="vertical-event-carousel" data-vertical-event-carousel>
      <button class="vertical-event-arrow vertical-event-arrow-up" type="button" data-action="scroll-event-carousel" data-carousel-id="${escapeHtml(id)}" data-direction="-1" aria-label="Scroll events up" disabled>&#9650;</button>
      <div class="event-list event-carousel-viewport" id="${escapeHtml(id)}" data-event-carousel-viewport tabindex="0">
        ${items.map(renderEventRow).join("") || `<div class="empty">${escapeHtml(emptyMessage)}</div>`}
      </div>
      <button class="vertical-event-arrow vertical-event-arrow-down" type="button" data-action="scroll-event-carousel" data-carousel-id="${escapeHtml(id)}" data-direction="1" aria-label="Scroll events down" ${hasOverflow ? "" : "disabled"}>&#9660;</button>
    </div>
  `;
}

function updateVerticalEventCarouselControls(viewport) {
  const shell = viewport?.closest("[data-vertical-event-carousel]");
  if (!shell) return;
  const atTop = viewport.scrollTop <= 2;
  const atBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2;
  const up = shell.querySelector(".vertical-event-arrow-up");
  const down = shell.querySelector(".vertical-event-arrow-down");
  if (up) up.disabled = atTop;
  if (down) down.disabled = atBottom;
}

function renderTimeline(events) {
  return `
    <div class="control-panel">
      <div>
        <h2>${state.selectedYear} Timeline</h2>
        <p class="muted">Weekly shows and PPVs are merged into one chronological run.</p>
      </div>
      <span class="muted">${events.length} items</span>
    </div>
    <div class="timeline">
      ${events.map(renderTimelineRow).join("") || `<div class="empty">No items match your search.</div>`}
    </div>
  `;
}

function renderTimelineRow(item) {
  const name = getDisplayTitle(item) || (item.type === "weekly" ? item.showName : item.title);
  const detail =
    item.type === "weekly"
      ? item.episodeNumber
        ? `Episode ${item.episodeNumber}`
        : item.eventType ?? item.metadataSource
      : item.metadataSource;
  const label = item.type === "weekly" ? item.shortName : item.eventLabel;

  return `
    <article class="timeline-row ${item.type === "ppv" ? "ppv" : ""}" data-title-id="${item.id}" tabindex="0">
      ${renderPosterBlock(item, "timeline-thumb")}
      <div class="event-date">${formatDisplayDate(item.date)}</div>
      <div>
        <div class="event-name">${escapeHtml(name)}</div>
        <div class="card-meta">${detail}</div>
      </div>
      <span class="type-pill">${label}</span>
    </article>
  `;
}

function renderPlaceholder(promotion) {
  return `
    <div class="empty">
      ${promotion.name} is wired into the promotion model. Add show schedules, PPV data, and TMDB mappings to unlock the same timeline views.
    </div>
  `;
}

function bindEvents() {
  bindMetadataContextAccess();
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.section = button.dataset.section;
      const requestedSection = state.section;
      const detailLoad = requestedSection === "movies"
        ? ensureMovieDetailIndex()
        : requestedSection === "tv"
          ? ensureTvDetailIndex()
          : null;
      detailLoad?.then(() => {
        if (state.section === requestedSection) scheduleHydrationRender(0);
      });
      state.navigationStack = [];
      state.selectedChampionshipId = null;
      state.promotionId = null;
      pendingPromotionId = null;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      state.selectedTvSeason = null;
      state.selectedTvEpisodeId = null;
      state.selectedTvSubcollection = null;
      state.selectedTvGuideItemId = null;
      state.selectedCollectionId = null;
      state.selectedMcuSeasonId = null;
      state.selectedMcuShowId = null;
      state.selectedCriterionView = "home";
      state.selectedCriterionEclipseId = null;
      state.selectedCriterionSubCollectionId = null;
      state.titleCardView = "full";
      state.query = "";
      state.castOverlay = null;
      state.subView = button.dataset.targetSubview ?? "home";
      render();
    });
  });

  document.querySelectorAll("[data-subview]").forEach((button) => {
    button.addEventListener("click", () => {
      state.subView = button.dataset.subview;
      state.navigationStack = [];
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      state.selectedTvSeason = null;
      state.selectedTvEpisodeId = null;
      if (state.subView !== "guide") state.selectedTvGuideItemId = null;
      state.selectedCollectionId = null;
      state.castOverlay = null;
      state.selectedMcuSeasonId = null;
      state.selectedMcuShowId = null;
      state.selectedCriterionView = "home";
      state.selectedCriterionEclipseId = null;
      state.selectedCriterionSubCollectionId = null;
      render();
    });
  });

  document.querySelectorAll("[data-wrestling-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.wrestlingMode = button.dataset.wrestlingMode;
      state.navigationStack = [];
      state.promotionId = null;
      pendingPromotionId = null;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      state.selectedTvSeason = null;
      state.selectedTvEpisodeId = null;
      state.selectedTvSubcollection = null;
      state.selectedTvGuideItemId = null;
      state.selectedCollectionId = null;
      state.selectedMcuSeasonId = null;
      state.selectedMcuShowId = null;
      state.selectedCriterionView = "home";
      state.selectedCriterionEclipseId = null;
      state.selectedCriterionSubCollectionId = null;
      render();
    });
  });

  document.querySelectorAll("[data-promotion]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.view = "overview";
      state.promotionId = button.dataset.promotion;
      pendingPromotionId = state.promotionId;
      state.navigationStack = [];
      state.selectedChampionshipId = null;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      state.selectedTvSeason = null;
      state.selectedTvEpisodeId = null;
      state.selectedTvSubcollection = null;
      state.selectedTvGuideItemId = null;
      state.selectedCollectionId = null;
      state.selectedMcuSeasonId = null;
      state.selectedMcuShowId = null;
      state.selectedCriterionView = "home";
      state.selectedCriterionEclipseId = null;
      state.selectedCriterionSubCollectionId = null;
      state.titleCardView = "full";
      state.eventSort = "date-desc";
      const promotion = getPromotion(state.promotionId);
      try {
        state.selectedYear = getRememberedPromotionYear(promotion.id)
          ?? (promotion.id === "wwe" && state.wrestlingMode === "archive" ? new Date().getFullYear() : getDefaultPromotionYear(promotion));
        render();
      } catch (error) {
        console.error(`Promotion navigation failed for ${promotion.id}`, error);
        render();
      }

      if (state.wrestlingMode === "archive" && !isPromotionLibraryReady(promotion.id)) {
        ensureGeneratedPromotionLibrary(promotion.id, state.selectedYear).then(() => {
          if (state.section !== "wrestling" || pendingPromotionId !== promotion.id) return;
          try {
            state.promotionId = promotion.id;
            const availableYears = getVisiblePromotionYears(promotion);
            if (!availableYears.includes(Number(state.selectedYear))) state.selectedYear = getDefaultPromotionYear(promotion);
            rememberPromotionYear(promotion.id, state.selectedYear);
            if (state.metadataMenu || state.metadataOverlay) preservePageScrollForNextRender();
            render();
          } catch (error) {
            console.error(`Promotion hydration render failed for ${promotion.id}`, error);
          }
        });
      }
    });
  });

  document.querySelector("[data-action='back']")?.addEventListener("click", () => {
    state.promotionId = null;
    pendingPromotionId = null;
    render();
  });

  document.querySelectorAll("[data-action='scroll-event-carousel']").forEach((button) => {
    button.addEventListener("click", () => {
      const viewport = document.getElementById(button.dataset.carouselId);
      if (!viewport) return;
      viewport.scrollBy({ top: Number(button.dataset.direction) * viewport.clientHeight * 0.86, behavior: "smooth" });
      window.setTimeout(() => updateVerticalEventCarouselControls(viewport), 360);
    });
  });
  document.querySelectorAll("[data-event-carousel-viewport]").forEach((viewport) => {
    updateVerticalEventCarouselControls(viewport);
    viewport.addEventListener("scroll", () => updateVerticalEventCarouselControls(viewport), { passive: true });
  });

  document.querySelectorAll("[data-action='back-page']").forEach((button) => {
    button.addEventListener("click", () => {
      goBackOnePage();
    });
  });
  document.querySelectorAll("[data-action='back-curated-shelf']").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCuratedShelfId = null;
      render();
    });
  });

  document.querySelectorAll("[data-action='back-title']").forEach((button) => {
    button.addEventListener("click", () => {
      goBackOnePage();
    });
  });

  document.querySelector("[data-action='toggle-library-mode']")?.addEventListener("click", () => {
    state.libraryMode = state.libraryMode === "media" ? "archive" : "media";
    state.wrestlingMode = state.libraryMode;
    render();
  });
  document.querySelectorAll("[data-action='rescan']").forEach((button) => {
    button.addEventListener("click", async () => {
      if (metadataStatus?.state === "scanning") return;
      metadataStatus = { ...(metadataStatus ?? {}), state: "scanning", startedAt: new Date().toISOString(), error: null };
      render();
      const response = await fetch("./api/metadata/rescan", { method: "POST" }).catch(() => null);
      if (response?.ok) {
        metadataStatus = await response.json().catch(() => metadataStatus);
      }
      await refreshMetadataStatus();
      render();
    });
  });

  document.querySelector("[data-action='watch-teebee']")?.addEventListener("click", () => {
    startTeebeeShuffle();
  });

  document.querySelector("[data-action='doan-watch-teebee']")?.addEventListener("click", () => {
    powerOffTeebee();
  });

  document.querySelector("[data-action='toggle-tv-guide-theater']")?.addEventListener("click", () => {
    state.tvGuideTheaterMode = !state.tvGuideTheaterMode;
    render();
  });

  document.querySelectorAll("[data-action='random-tv-episode']").forEach((button) => {
    button.addEventListener("click", () => {
      const located = getRandomTvEpisodeLocationForShow(button.dataset.tvShowId);
      if (!located) return;
      pushNavigationState();
      launchTvEpisodePlayback(located.episode.id);
    });
  });

  document.querySelectorAll("[data-action='play-title']").forEach((button) => {
    button.addEventListener("click", () => {
      const item = getTitleItem(button.dataset.titleId);
      launchTitlePlayback(item, { startOver: button.dataset.startOver === "true" });
    });
  });

  document.querySelectorAll("[data-action='play-tv-episode']").forEach((button) => {
    button.addEventListener("click", () => {
      launchTvEpisodePlayback(button.dataset.playTvEpisodeId, { startOver: button.dataset.startOver === "true" });
    });
  });

  document.querySelectorAll("[data-stream-setting]").forEach((select) => {
    select.addEventListener("change", () => {
      writeStreamSelection(select.dataset.streamSetting, select.dataset.streamKind, select.value);
      render();
    });
  });

  document.querySelectorAll("[data-action='open-cast-overlay']").forEach((button) => {
    button.addEventListener("click", () => {
      state.castOverlay = getCastOverlayPayload(button.dataset.castContext, button.dataset.castTitle);
      render();
    });
  });

  document.querySelectorAll("[data-action='close-cast-overlay']").forEach((button) => {
    button.addEventListener("click", () => {
      state.castOverlay = null;
      render();
    });
  });

  document.querySelectorAll("[data-action='open-notes-overlay']").forEach((button) => {
    button.addEventListener("click", () => {
      state.notesOverlay = { title: button.dataset.notesTitle ?? "Notes", notes: button.dataset.notes ?? "" };
      render();
    });
  });

  document.querySelectorAll("[data-action='close-notes-overlay']").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target.closest(".notes-overlay-panel") && event.target.dataset.action !== "close-notes-overlay") return;
      state.notesOverlay = null;
      render();
    });
  });

  document.querySelectorAll("[data-action='open-defense-overlay']").forEach((button) => {
    button.addEventListener("click", () => {
      const reign = wrestlingReferenceIndex.titleReigns.find((item) => item.championshipId === button.dataset.championshipId && String(item.number) === String(button.dataset.reignNumber) && String(item.dateWon ?? "") === String(button.dataset.dateWon ?? ""));
      if (!reign) return;
      state.defenseOverlay = {
        title: `${reign.champion ?? "Champion"} — Title Defenses`,
        defenses: reign.titleDefenses ?? reign.defenseDetails ?? [],
      };
      render();
    });
  });

  document.querySelectorAll("[data-action='close-defense-overlay']").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target.closest(".defense-overlay-panel") && event.target.dataset.action !== "close-defense-overlay") return;
      state.defenseOverlay = null;
      render();
    });
  });

  document.querySelectorAll("[data-action='open-wrestling-series-match']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const itemIds = String(button.dataset.itemIds ?? "").split("|").filter(Boolean);
      state.metadataOverlay = {
        type: "wrestling-series-match",
        itemId: button.dataset.itemId,
        itemIds,
        batchItemIds: itemIds,
        seriesName: button.dataset.seriesName,
      };
      render();
    });
  });

  document.querySelectorAll("[data-action='wrestling-lane-provider']").forEach((button) => {
    button.addEventListener("click", async () => {
      const overlay = state.metadataOverlay;
      if (!overlay?.itemId) return;
      if (button.dataset.provider === "TWDB") {
        state.metadataOverlay = null;
        removeGeneratedPromotionYear(state.promotionId, state.selectedYear);
        await ensureGeneratedPromotionLibrary(state.promotionId, state.selectedYear);
        showMetadataToast("success", `${overlay.seriesName} refreshed from TWDB`);
        render();
        return;
      }
      const query = {
        title: overlay.seriesName,
        year: "",
        agent: button.dataset.provider,
        language: "English",
      };
      state.metadataOverlay = {
        type: "fix-match",
        itemId: overlay.itemId,
        query,
        loading: true,
        searched: false,
        batchItemIds: overlay.itemIds,
        seriesName: overlay.seriesName,
      };
      render();
      state.metadataOverlay = {
        ...(await searchMetadataMatches(overlay.itemId, query)),
        batchItemIds: overlay.itemIds,
        seriesName: overlay.seriesName,
      };
      render();
    });
  });

  document.querySelectorAll(".toby-season-episode-list").forEach((list) => {
    list.addEventListener("scroll", updateTobyMoreEpisodeIndicators, { passive: true });
  });
  updateTobyMoreEpisodeIndicators();

  document.querySelectorAll("[data-tv-guide-hover]").forEach((button) => {
    const selectGuideItem = () => {
      updateTvGuideSelection(button.dataset.tvGuideHover);
    };
    button.addEventListener("mouseenter", selectGuideItem);
    button.addEventListener("focus", selectGuideItem);
  });

  document.removeEventListener("keydown", handleTvGuideKeydown);
  document.addEventListener("keydown", handleTvGuideKeydown);
  document.removeEventListener("keydown", handleGlobalKeyboard);
  document.addEventListener("keydown", handleGlobalKeyboard);

  document.querySelector("[data-action='year']")?.addEventListener("change", async (event) => {
    const requestedYear = Number(event.target.value);
    state.selectedYear = requestedYear;
    if (state.wrestlingMode === "archive" && state.promotionId) {
      await ensureGeneratedPromotionLibrary(state.promotionId, requestedYear);
    }
    state.selectedYear = requestedYear;
    rememberPromotionYear(state.promotionId, requestedYear);
    render();
  });

  document.querySelector("[data-action='refresh-promotion-year']")?.addEventListener("click", async () => {
    const promotionId = state.promotionId;
    const year = state.selectedYear;
    if (!promotionId || !year) return;
    removeGeneratedPromotionYear(promotionId, year);
    showMetadataToast("success", `Reloading ${year} from TWDB…`);
    state.preserveScrollOnRender = true;
    render();
    await ensureGeneratedPromotionLibrary(promotionId, year);
    showMetadataToast("success", `${year} refreshed from TWDB`);
    render();
  });

  document.querySelector("[data-action='event-sort']")?.addEventListener("change", (event) => {
    state.eventSort = event.target.value;
    render();
  });

  document.querySelectorAll("[data-action='championship-sort']").forEach((button) => {
    button.addEventListener("click", () => {
      state.championshipSort = button.dataset.sort === "date-desc" ? "date-desc" : "date-asc";
      render();
    });
  });

  document.querySelector("[data-action='toggle-collection-sort']")?.addEventListener("click", () => {
    state.collectionSort = state.collectionSort === "az" ? "za" : "az";
    render();
  });

  document.querySelectorAll("[data-card-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.titleCardView = button.dataset.cardView;
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      state.view = button.dataset.view;
      try {
        render();
      } catch (error) {
        console.error(`Promotion view failed for ${state.promotionId}:${state.view}`, error);
      }
    });
  });

  document.querySelectorAll("[data-batcave-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.batcaveView = button.dataset.batcaveView;
      render();
    });
  });
  document.querySelectorAll("[data-batcave-wrestling-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.batcaveWrestlingMode = button.dataset.batcaveWrestlingMode;
      state.batcaveWrestlingPromotionId = null;
      render();
    });
  });
  document.querySelectorAll("[data-batcave-wrestling-promotion]").forEach((button) => {
    button.addEventListener("click", async () => {
      const promotionId = button.dataset.batcaveWrestlingPromotion;
      if (state.batcaveWrestlingMode === "archive") await ensureAllGeneratedPromotionYears(promotionId);
      state.batcaveWrestlingPromotionId = promotionId;
      render();
    });
  });
  document.querySelector("[data-batcave-media-sort]")?.addEventListener("change", (event) => { state.batcaveMediaSort = event.target.value; render(); });
  document.querySelectorAll("[data-batcave-media-tag]").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) state.batcaveMediaTags.add(input.dataset.batcaveMediaTag); else state.batcaveMediaTags.delete(input.dataset.batcaveMediaTag);
    render();
  }));
  document.querySelectorAll("[data-batcave-details]").forEach((details) => details.addEventListener("toggle", () => {
    const key = details.dataset.batcaveDetails;
    if (key.startsWith("media:")) {
      const id = key.slice(6);
      if (details.open) state.batcaveMediaOpenSections.add(id); else state.batcaveMediaOpenSections.delete(id);
    } else if (details.open) state.batcaveUnmatchedOpenSections.add(key); else state.batcaveUnmatchedOpenSections.delete(key);
  }));
  document.querySelectorAll("[data-batcave-media-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.batcaveMediaOpenSections = button.dataset.batcaveMediaToggle === "expand" ? new Set([...state.batcaveMediaTags]) : new Set();
    render();
  }));
  document.querySelectorAll("[data-dismiss-unmatched]").forEach((button) => button.addEventListener("click", async () => {
    const itemId = button.dataset.dismissUnmatched;
    const item = getTitleItem(itemId);
    try {
      await persistMetadataOverride(itemId, { unmatchedDismissed: { dismissedAt: new Date().toISOString(), path: item?.files?.[0]?.path ?? null } });
      state.metadataToast = "Removed from unmatched files. The media file was not deleted.";
      render();
    } catch (error) {
      state.metadataToast = error.message;
      render();
    }
  }));
  document.querySelectorAll("[data-action='open-batcave-metadata']").forEach((card) => {
    const openEditor = () => {
      const itemId = card.dataset.metadataId ?? card.dataset.titleId;
      const item = getTitleItem(itemId);
      if (!item) return;
      state.batcaveMetadataDraft = buildBatcaveMetadataDraft(item);
      state.metadataMenu = null;
      state.metadataOverlay = { type: "batcave-metadata", itemId, allocatorPath: [] };
      render();
    };
    card.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openEditor(); });
    card.addEventListener("keydown", (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      openEditor();
    });
  });
  document.querySelectorAll("[data-allocator-node]").forEach((button) => button.addEventListener("click", () => {
    captureBatcaveMetadataDraft();
    state.metadataOverlay.collectionsTaggerOpen = true;
    const depth = Number(button.dataset.allocatorDepth);
    const path = [...(state.metadataOverlay?.allocatorPath ?? [])].slice(0, depth);
    path[depth] = button.dataset.allocatorNode;
    const tree = getBatcaveCollectionAllocatorTree();
    const node = getAllocatorNodeAtPath(tree, path, depth);
    state.metadataOverlay.allocatorPath = path;
    if (node && !(node.children ?? []).length) {
      const nodes = path.map((id, index) => getAllocatorNodeAtPath(tree, path, index)).filter(Boolean);
      const pathLabels = nodes.map((entry) => entry.label);
      const allocation = {
        id: path.join("/"),
        pathIds: path,
        pathLabels,
        rootId: path[0],
        collectionId: path[1] ?? path[0],
        sectionId: path.length > 2 ? path.at(-1) : "featured",
        color: nodes[0]?.color ?? "#d8b35d",
      };
      const existing = state.batcaveMetadataDraft.allocations ?? [];
      if (!existing.some((entry) => entry.id === allocation.id)) existing.push(allocation);
    }
    render();
  }));
  document.querySelectorAll("[data-remove-allocation]").forEach((button) => button.addEventListener("click", () => {
    captureBatcaveMetadataDraft();
    state.metadataOverlay.collectionsTaggerOpen = true;
    state.batcaveMetadataDraft.allocations.splice(Number(button.dataset.removeAllocation), 1);
    render();
  }));
  document.querySelectorAll("[data-metadata-tagger]").forEach((details) => details.addEventListener("toggle", () => {
    if (!state.metadataOverlay) return;
    if (details.dataset.metadataTagger === "collections") state.metadataOverlay.collectionsTaggerOpen = details.open;
    if (details.dataset.metadataTagger === "tv-guide") state.metadataOverlay.tvGuideTaggerOpen = details.open;
    if (details.dataset.metadataTagger === "franchise") state.metadataOverlay.franchiseTaggerOpen = details.open;
  }));
  document.querySelectorAll("[data-remove-franchise-member]").forEach((button) => button.addEventListener("click", () => {
    captureBatcaveMetadataDraft();
    state.batcaveMetadataDraft.franchiseMemberIds = (state.batcaveMetadataDraft.franchiseMemberIds ?? []).filter((id) => id !== button.dataset.removeFranchiseMember);
    state.metadataOverlay.franchiseTaggerOpen = true;
    render();
  }));
  document.querySelectorAll("[data-open-franchise-page]").forEach((button) => button.addEventListener("click", () => {
    pushNavigationState();
    state.metadataOverlay = null;
    state.metadataMenu = null;
    state.selectedCollectionId = null;
    state.selectedTitleId = button.dataset.openFranchisePage;
    render();
  }));
  document.querySelectorAll("[data-tv-guide-channel-id]").forEach((button) => button.addEventListener("click", () => {
    captureBatcaveMetadataDraft();
    const channelId = button.dataset.tvGuideChannelId;
    const saved = new Set(state.batcaveMetadataDraft.savedTvGuideChannelIds ?? []);
    if (saved.has(channelId)) saved.delete(channelId); else saved.add(channelId);
    state.batcaveMetadataDraft.savedTvGuideChannelIds = [...saved];
    state.batcaveMetadataDraft.tvGuideChannelIds = [...new Set([...saved, ...(state.batcaveMetadataDraft.inferredTvGuideChannelIds ?? [])])];
    state.metadataOverlay.tvGuideTaggerOpen = true;
    render();
  }));
  document.querySelector("[data-action='save-batcave-metadata']")?.addEventListener("click", async (event) => {
    event.preventDefault();
    captureBatcaveMetadataDraft();
    const itemId = event.currentTarget.dataset.metadataId;
    const item = getTitleItem(itemId);
    const draft = state.batcaveMetadataDraft;
    const metadata = {
      ...getItemMetadataOverride(itemId),
      title: draft.title.trim(),
      year: String(draft.year).trim(),
      genre: draft.genre.trim(),
      rating: draft.rating.trim(),
      summary: draft.summary.trim(),
      collections: draft.allocations.map((allocation) => allocation.pathLabels.join("/")),
      collectionAllocations: draft.allocations,
      collectionExclusions: (draft.inferredAllocationIds ?? []).filter((id) => !draft.allocations.some((allocation) => allocation.id === id)),
      tvGuideChannelIds: draft.savedTvGuideChannelIds ?? [],
      posterUrl: document.querySelector("[data-custom-poster-url]")?.value?.trim() ?? getItemMetadataOverride(itemId).posterUrl ?? "",
      backdropUrl: document.querySelector("[data-custom-backdrop-url]")?.value?.trim() ?? getItemMetadataOverride(itemId).backdropUrl ?? "",
      phase: "batcave-master-editor",
    };
    try {
      const overrides = {
        [itemId]: {
          metadata,
          identity: { title: item?.title ?? itemId, year: item?.year ?? item?.startYear ?? "", mediaType: item?.mediaType ?? "movie" },
        },
      };
      if (draft.franchiseId) {
        const oldMembers = getTitleItem(draft.franchiseId)?.memberIds ?? [];
        const memberIds = [...new Set(draft.franchiseMemberIds ?? [])];
        overrides[draft.franchiseId] = {
          metadata: {
            ...getItemMetadataOverride(draft.franchiseId),
            recordType: "franchise",
            title: draft.franchiseTitle.trim() || "Untitled Franchise",
            summary: draft.franchiseSummary.trim(),
            posterUrl: draft.franchisePosterUrl.trim(),
            backdropUrl: draft.franchiseBackdropUrl.trim(),
            memberIds,
            mixtapeKeys: draft.franchiseMixtapeKeys ?? [],
          },
          identity: { title: draft.franchiseTitle.trim() || "Untitled Franchise", mediaType: "franchise" },
        };
        [...new Set([...oldMembers, ...memberIds])].forEach((memberId) => {
          const existing = getItemMetadataOverride(memberId);
          const franchiseIds = new Set(existing.franchiseIds ?? []);
          if (memberIds.includes(memberId)) franchiseIds.add(draft.franchiseId); else franchiseIds.delete(draft.franchiseId);
          overrides[memberId] = { ...(overrides[memberId] ?? {}), metadata: { ...existing, ...(overrides[memberId]?.metadata ?? {}), franchiseIds: [...franchiseIds] } };
        });
      }
      await persistMetadataOverridesBatch(overrides);
      state.batcaveMetadataDraft = { ...draft, title: metadata.title, year: metadata.year, genre: metadata.genre, rating: metadata.rating, summary: metadata.summary };
      state.metadataOverlay = { ...state.metadataOverlay, notice: "Metadata, artwork, collection, TV Guide, and franchise data saved." };
      showMetadataToast("success", "Metadata saved");
    } catch (error) {
      state.metadataOverlay = { ...state.metadataOverlay, notice: `Save failed: ${error.message}` };
      showMetadataToast("error", "Metadata save failed");
    }
    render();
  });

  document.querySelectorAll("[data-batcave-edit-collection]").forEach((button) => {
    button.addEventListener("click", () => {
      state.batcaveCollectionId = button.dataset.batcaveEditCollection;
      state.batcaveCollectionDeleteChecks = 0;
      const selected = getGroupedCollections().flatMap((group) => group.collections.map((collection) => ({ ...collection, groupTitle: group.title }))).find((collection) => collection.id === state.batcaveCollectionId);
      state.batcaveCollectionDraft = buildCollectionDraft(selected);
      render();
    });
  });

  document.querySelector("[data-batcave-new-collection]")?.addEventListener("click", () => {
    state.batcaveCollectionId = "__new";
    state.batcaveCollectionDeleteChecks = 0;
    state.batcaveCollectionDraft = buildCollectionDraft(null);
    render();
  });

  document.querySelectorAll("[data-action='close-collection-editor']").forEach((button) => button.addEventListener("click", () => {
    state.batcaveCollectionId = null;
    state.batcaveCollectionDraft = null;
    state.batcaveCollectionDeleteChecks = 0;
    render();
  }));
  document.querySelector("[data-action='add-collection-carousel']")?.addEventListener("click", () => {
    state.batcaveCollectionDraft = readCollectionDraftFromEditor();
    if ((state.batcaveCollectionDraft.carousels ?? []).length < 11) state.batcaveCollectionDraft.carousels.push({ title: `Carousel ${state.batcaveCollectionDraft.carousels.length + 1}`, itemIds: [], button: { label: "", align: "left", size: 1, layout: "horizontal", line: 1 } });
    render();
  });
  document.querySelectorAll("[data-action='save-collection']").forEach((button) => button.addEventListener("click", async () => {
    const collection = readCollectionDraftFromEditor();
    const response = await fetch("./api/collections", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ collection }) });
    const payload = await response.json();
    if (!response.ok) return showMetadataToast("error", payload.error ?? "Collection save failed");
    collectionOverrides = payload.data;
    state.batcaveCollectionId = null;
    state.batcaveCollectionDraft = null;
    state.batcaveCollectionDeleteChecks = 0;
    showMetadataToast("success", "Collection saved");
    render();
  }));
  document.querySelector("[data-action='delete-collection']")?.addEventListener("click", async () => {
    state.batcaveCollectionDeleteChecks += 1;
    if (state.batcaveCollectionDeleteChecks < 3) { state.batcaveCollectionDraft = readCollectionDraftFromEditor(); render(); return; }
    const collectionId = state.batcaveCollectionId;
    const response = await fetch("./api/collections", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ collectionId }) });
    const payload = await response.json();
    if (!response.ok) { state.batcaveCollectionDeleteChecks = 0; return showMetadataToast("error", payload.error ?? "Collection deletion failed"); }
    collectionOverrides = payload.data;
    state.batcaveCollectionId = null;
    state.batcaveCollectionDraft = null;
    state.batcaveCollectionDeleteChecks = 0;
    showMetadataToast("success", "Collection deleted");
    render();
  });
  document.querySelectorAll("[data-carousel-search]").forEach((input) => input.addEventListener("input", () => {
    const editor = input.closest("[data-carousel-index]");
    const results = editor.querySelector("[data-collection-search-results]");
    results.innerHTML = getCollectionSearchItems(input.value).map((item) => `<button type="button" data-search-item-id="${escapeHtml(item.id)}">${escapeHtml(getDisplayTitle(item))}<small>${escapeHtml([item.year ?? item.startYear, item.mediaType].filter(Boolean).join(" / "))}</small></button>`).join("");
    results.querySelectorAll("[data-search-item-id]").forEach((button) => button.addEventListener("click", () => {
      state.batcaveCollectionDraft = readCollectionDraftFromEditor();
      const carousel = state.batcaveCollectionDraft.carousels[Number(editor.dataset.carouselIndex)];
      carousel.itemIds = [...new Set([...(carousel.itemIds ?? []), button.dataset.searchItemId])];
      render();
    }));
  }));
  document.querySelectorAll("[data-action='remove-carousel-item']").forEach((button) => button.addEventListener("click", () => {
    const editor = button.closest("[data-carousel-index]");
    state.batcaveCollectionDraft = readCollectionDraftFromEditor();
    const carousel = state.batcaveCollectionDraft.carousels[Number(editor.dataset.carouselIndex)];
    carousel.itemIds = carousel.itemIds.filter((id) => id !== button.dataset.itemId);
    render();
  }));
  document.querySelectorAll("[data-format]").forEach((button) => button.addEventListener("click", () => button.classList.toggle("active")));
  document.querySelectorAll("[data-size-step]").forEach((button) => button.addEventListener("click", () => {
    const next = Number(button.dataset.buttonSize ?? 1) % 5 + 1;
    button.dataset.buttonSize = String(next);
    button.querySelector("small").textContent = String(next);
    button.title = `Text size ${next}`;
  }));
  document.querySelectorAll("[data-layout]").forEach((button) => button.addEventListener("click", () => {
    button.closest(".collection-button-toolbar").querySelectorAll("[data-layout]").forEach((entry) => entry.classList.toggle("active", entry === button));
  }));
  document.querySelectorAll("[data-align]").forEach((button) => button.addEventListener("click", () => {
    button.closest(".collection-button-toolbar").querySelectorAll("[data-align]").forEach((entry) => entry.classList.toggle("active", entry === button));
  }));
  document.querySelectorAll("[data-asset-import]").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const url = new URL("./api/assets/import", window.location.href);
    url.searchParams.set("kind", input.dataset.assetImport);
    url.searchParams.set("filename", file.name);
    const response = await fetch(`${url.pathname}${url.search}`, { method: "POST", headers: { "content-type": file.type || "application/octet-stream" }, body: file });
    const payload = await response.json();
    if (!response.ok) return showMetadataToast("error", payload.error ?? "Image import failed");
    const target = input.dataset.assetImport === "hero" ? document.querySelector("[data-hero-image]") : document.querySelector("[data-button-image]");
    target.value = payload.path;
    state.batcaveCollectionDraft = readCollectionDraftFromEditor();
    if (input.dataset.assetImport === "hero") state.batcaveCollectionDraft.heroImage = payload.path;
    else state.batcaveCollectionDraft.buttonImage = payload.path;
    showMetadataToast("success", "Image imported");
  }));

  document.querySelectorAll("[data-action='metadata-menu']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.blur();
      openMetadataContextMenu(button, event.clientX, event.clientY);
    });
  });

  document.querySelectorAll("[data-action='metadata-command']").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      preservePageScrollForNextRender();
      await handleMetadataCommand(button.dataset.command, button.dataset.metadataId, button.dataset);
    });
  });

  document.querySelectorAll("[data-action='close-metadata-menu']").forEach((button) => {
    button.addEventListener("click", () => {
      preservePageScrollForNextRender();
      state.metadataMenu = null;
      render();
    });
  });

  document.querySelectorAll("[data-action='close-metadata-overlay']").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target.closest("[data-metadata-panel]") && event.target.dataset.action !== "close-metadata-overlay") return;
      preservePageScrollForNextRender();
      state.metadataOverlay = null;
      state.batcaveMetadataDraft = null;
      render();
    });
  });
  document.querySelectorAll("[data-action='open-championship-event']").forEach((button) => {
    button.addEventListener("click", async () => {
      const promotionId = button.dataset.promotionId || "wwe";
      const dateWon = button.dataset.eventDate;
      const year = Number(String(dateWon).slice(0, 4));
      if (state.wrestlingMode === "archive") await ensureGeneratedPromotionLibrary(promotionId, year);
      const target = findChampionshipEventTarget({ event: button.dataset.eventName, dateWon }, promotionId);
      if (!target) {
        showMetadataToast("error", "This title change does not yet have a corresponding event in the archive.");
        render();
        return;
      }
      if (target.matchCount && !getWrestlingMatchesForItem(target)) await ensureWrestlingMatchDetails(target);
      pushNavigationState();
      state.selectedChampionshipId = null;
      state.selectedTitleId = target.id;
      state.selectedPersonId = null;
      state.titleCardView = "full";
      render();
    });
  });
  document.querySelectorAll("[data-action='open-achievement-event']").forEach((button) => {
    button.addEventListener("click", async () => {
      const promotionId = button.dataset.promotionId || "wwe";
      const date = button.dataset.eventDate;
      const year = Number(String(date).slice(0, 4));
      if (state.wrestlingMode === "archive") await ensureGeneratedPromotionLibrary(promotionId, year);
      const target = findAchievementEventTarget(button.dataset.eventName, date, promotionId, button.dataset.eventId);
      if (!target) {
        showMetadataToast("error", "That event is not yet available in this archive year.");
        render();
        return;
      }
      if (target.matchCount && !getWrestlingMatchesForItem(target)) await ensureWrestlingMatchDetails(target);
      pushNavigationState();
      state.selectedChampionshipId = null;
      state.selectedTitleId = target.id;
      state.selectedPersonId = null;
      state.titleCardView = "full";
      render();
    });
  });
  document.querySelectorAll("[data-title-id]:not([data-action])").forEach((card) => {
    card.addEventListener("click", async () => {
      let item = resolveTitleCardItem(card);
      if (item?.targetCollectionId) {
        pushNavigationState();
        state.selectedCollectionId = item.targetCollectionId;
        state.selectedTitleId = null;
        state.selectedPersonId = null;
        render();
        return;
      }
      if (item?.mediaType === "wrestling" && item.matchCount && !getWrestlingMatchesForItem(item)) {
        await ensureWrestlingMatchDetails(item);
      }
      if (item?.mediaType === "movie") await ensureMovieDetailIndex();
      if (item?.mediaType === "tv") await ensureTvDetailIndex();
      item = resolveTitleCardItem(card, item);
      if (!item) {
        showMetadataToast("error", "This title changed during the library refresh. Reloading the shelf.");
        invalidateMediaCaches();
        render();
        return;
      }
      pushNavigationState();
      state.playbackOriginCollectionId = state.section === "collections" ? state.selectedCollectionId : null;
      state.selectedChampionshipId = null;
      state.selectedTitleId = item.id;
      state.selectedPersonId = null;
      state.selectedCollectionId = null;
      state.selectedMcuSeasonId = null;
      state.selectedMcuShowId = null;
      state.selectedCriterionEclipseId = null;
      state.selectedCriterionSubCollectionId = null;
      state.selectedTvSeason = null;
      state.selectedTvEpisodeId = null;
      state.selectedTvGuideItemId = null;
      state.titleCardView = "full";
      state.castOverlay = null;
      render();
    });
    card.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      let item = resolveTitleCardItem(card);
      if (item?.targetCollectionId) {
        pushNavigationState();
        state.selectedCollectionId = item.targetCollectionId;
        state.selectedTitleId = null;
        state.selectedPersonId = null;
        render();
        return;
      }
      if (item?.mediaType === "wrestling" && item.matchCount && !getWrestlingMatchesForItem(item)) {
        await ensureWrestlingMatchDetails(item);
      }
      if (item?.mediaType === "movie") await ensureMovieDetailIndex();
      if (item?.mediaType === "tv") await ensureTvDetailIndex();
      item = resolveTitleCardItem(card, item);
      if (!item) {
        showMetadataToast("error", "This title changed during the library refresh. Reloading the shelf.");
        invalidateMediaCaches();
        render();
        return;
      }
      pushNavigationState();
      state.playbackOriginCollectionId = state.section === "collections" ? state.selectedCollectionId : null;
      state.selectedChampionshipId = null;
      state.selectedTitleId = item.id;
      state.selectedPersonId = null;
      state.selectedCollectionId = null;
      state.selectedMcuSeasonId = null;
      state.selectedMcuShowId = null;
      state.selectedCriterionEclipseId = null;
      state.selectedCriterionSubCollectionId = null;
      state.selectedTvSeason = null;
      state.selectedTvEpisodeId = null;
      state.selectedTvGuideItemId = null;
      state.titleCardView = "full";
      render();
    });
  });

  document.querySelectorAll("[data-collection-id]").forEach((card) => {
    const openCollection = () => {
      pushNavigationState();
      state.returnPage = captureReturnPage();
      state.section = "collections";
      state.selectedCollectionId = card.dataset.collectionId;
      state.resetCuratedJumpRail = true;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      state.selectedTvSeason = null;
      state.selectedTvEpisodeId = null;
      state.selectedTvGuideItemId = null;
      state.selectedMcuSeasonId = null;
      state.selectedMcuShowId = null;
      state.selectedCriterionView = card.dataset.collectionId === "criterion" ? "home" : state.selectedCriterionView;
      state.selectedCriterionEclipseId = null;
      state.selectedCriterionSubCollectionId = null;
      state.selectedIndiaView = card.dataset.collectionId === "cinema-of-india" ? "home" : state.selectedIndiaView;
      state.selectedIndiaLanguageId = null;
      render();
      requestAnimationFrame(scrollPageTop);
      setTimeout(scrollPageTop, 80);
      setTimeout(scrollPageTop, 240);
    };
    card.addEventListener("click", openCollection);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCollection();
    });
  });

  document.querySelectorAll("[data-mcu-season-id]").forEach((card) => {
    const openSeason = () => {
      pushNavigationState();
      state.selectedMcuSeasonId = card.dataset.mcuSeasonId;
      state.selectedCollectionId = null;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      state.selectedMcuShowId = null;
      render();
    };
    card.addEventListener("click", openSeason);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSeason();
    });
  });

  document.querySelectorAll("[data-mcu-show-id]").forEach((card) => {
    const openShow = () => {
      pushNavigationState();
      state.selectedMcuShowId = card.dataset.mcuShowId;
      state.selectedMcuSeasonId = null;
      state.selectedCollectionId = null;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      render();
    };
    card.addEventListener("click", openShow);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openShow();
    });
  });

  document.querySelectorAll("[data-mcu-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(`#mcu-${button.dataset.mcuJump}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-library-letter]").forEach((button) => {
    button.addEventListener("click", () => {
      const letter = button.dataset.libraryLetter;
      const targetId = letter === "0-9" ? "numbers" : letter.toLowerCase();
      document.querySelector(`#library-letter-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-curated-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.querySelector(`#curated-${button.dataset.curatedJump}`) ?? document.querySelector("#curated-continue");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll("[data-curated-view-all]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCuratedShelfId = button.dataset.curatedViewAll;
      render();
    });
  });

  document.querySelectorAll("[data-collection-group-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelector(`#collection-group-${button.dataset.collectionGroupJump}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-india-view]").forEach((button) => {
    button.addEventListener("click", () => {
      pushNavigationState();
      state.selectedCollectionId = "cinema-of-india";
      state.selectedIndiaView = button.dataset.indiaView;
      state.selectedIndiaLanguageId = null;
      render();
    });
  });

  document.querySelectorAll("[data-india-language-id]").forEach((button) => {
    button.addEventListener("click", () => {
      pushNavigationState();
      state.selectedCollectionId = "cinema-of-india";
      state.selectedIndiaView = "languages";
      state.selectedIndiaLanguageId = button.dataset.indiaLanguageId;
      render();
    });
  });

  document.querySelector("[data-action='india-home']")?.addEventListener("click", () => {
    pushNavigationState();
    state.selectedCollectionId = "cinema-of-india";
    state.selectedIndiaView = "home";
    state.selectedIndiaLanguageId = null;
    render();
  });

  document.querySelector("[data-action='india-languages']")?.addEventListener("click", () => {
    pushNavigationState();
    state.selectedCollectionId = "cinema-of-india";
    state.selectedIndiaView = "languages";
    state.selectedIndiaLanguageId = null;
    render();
  });

  document.querySelectorAll("[data-criterion-view]").forEach((button) => {
    button.addEventListener("click", () => {
      pushNavigationState();
      state.selectedCollectionId = "criterion";
      state.selectedCriterionView = button.dataset.criterionView;
      state.selectedCriterionEclipseId = null;
      state.selectedCriterionSubCollectionId = null;
      render();
    });
  });

  document.querySelectorAll("[data-criterion-eclipse-id]").forEach((card) => {
    const openSet = () => {
      pushNavigationState();
      state.selectedCollectionId = "criterion";
      state.selectedCriterionEclipseId = card.dataset.criterionEclipseId;
      state.selectedCriterionSubCollectionId = null;
      render();
    };
    card.addEventListener("click", openSet);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSet();
    });
  });

  document.querySelectorAll("[data-criterion-subcollection-id]").forEach((card) => {
    const openCollection = () => {
      pushNavigationState();
      state.selectedCollectionId = "criterion";
      state.selectedCriterionSubCollectionId = card.dataset.criterionSubcollectionId;
      state.selectedCriterionEclipseId = null;
      render();
    };
    card.addEventListener("click", openCollection);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCollection();
    });
  });

  document.querySelector("[data-action='criterion-discover']")?.addEventListener("click", () => {
    const candidates = criterionCollectionIndex?.archiveItems ?? [];
    if (!candidates.length) return;
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    pushNavigationState();
    state.selectedTitleId = item.id;
    state.selectedCollectionId = null;
    state.selectedCriterionEclipseId = null;
    state.selectedCriterionSubCollectionId = null;
    render();
  });

  document.querySelectorAll("[data-tv-season]").forEach((card) => {
    const openSeason = () => {
      const legacy = String(card.dataset.tvSeason ?? "").split(":");
      const showId = card.dataset.tvShowId || legacy.slice(0, -1).join(":");
      const seasonNumber = card.dataset.tvSeasonNumber || legacy.at(-1);
      const show = getTvTitleItem(showId);
      if (!show) return;
      pushNavigationState();
      state.selectedTitleId = show.id;
      state.selectedTvSeason = { showId: show.id, seasonNumber: Number(seasonNumber) };
      state.selectedTvSubcollection = null;
      state.selectedTvEpisodeId = null;
      state.castOverlay = null;
      render();
    };
    card.addEventListener("click", openSeason);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSeason();
    });
  });

  document.querySelectorAll("[data-tv-subcollection]").forEach((card) => {
    const openSubcollection = () => {
      const show = getTvTitleItem(card.dataset.tvShowId);
      if (!show || !card.dataset.tvSubcollection) return;
      pushNavigationState();
      state.selectedTitleId = show.id;
      state.selectedTvSeason = null;
      state.selectedTvEpisodeId = null;
      state.selectedTvSubcollection = { showId: show.id, collectionId: card.dataset.tvSubcollection };
      state.castOverlay = null;
      render();
    };
    card.addEventListener("click", openSubcollection);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSubcollection();
    });
  });

  document.querySelectorAll("[data-tv-episode-id]").forEach((card) => {
    const openEpisode = () => {
      const episodeId = card.dataset.tvEpisodeId;
      if (!episodeId) return;
      const located = findTvEpisode(episodeId);
      pushNavigationState();
      state.selectedTitleId = located?.show?.id ?? state.selectedTitleId;
      state.selectedTvSeason = located ? { showId: located.show.id, seasonNumber: located.season.seasonNumber } : state.selectedTvSeason;
      state.selectedTvSubcollection = null;
      state.selectedTvEpisodeId = episodeId;
      state.castOverlay = null;
      render();
    };
    card.addEventListener("click", openEpisode);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openEpisode();
    });
  });

  document.querySelectorAll("[data-person-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      pushNavigationState();
      state.selectedChampionshipId = null;
      state.selectedPersonId = button.dataset.personId;
      render();
      if (String(button.dataset.personId).startsWith("director-") && button.dataset.personName) {
        await ensureDirectorFilmography(button.dataset.personId, button.dataset.personName);
        if (state.selectedPersonId === button.dataset.personId) render();
      }
    });
  });

  document.querySelectorAll("[data-championship-id]").forEach((card) => {
    const openChampionship = () => {
      pushNavigationState();
      state.selectedChampionshipId = card.dataset.championshipId;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      render();
    };
    card.addEventListener("click", openChampionship);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openChampionship();
    });
  });

  document.querySelector(".search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
    const search = document.querySelector(".search");
    search?.focus();
    search?.setSelectionRange?.(state.query.length, state.query.length);
  });
}

function renderExtremeFancamArchive(promotion) {
  if (promotion.id !== "ecw") return renderPlaceholder(promotion);
  const items = filterEvents(ecwExtremeFancamItems);
  const years = [...new Set(items.map((item) => Number(item.year)).filter(Boolean))].sort((a, b) => a - b);
  return `
    <section class="lane event-archive documentary-archive extreme-fancam-archive">
      <div class="lane-head event-archive-head">
        <div>
          <h2>ECW Extreme Fancam</h2>
          <span class="muted">${items.length} home-video releases / ${years.length} years</span>
        </div>
        ${renderEventSortControl("Sort Fancam releases")}
      </div>
      <div class="shelf-stack documentary-shelves">
        ${years.map((year) => renderPosterShelf(String(year), items.filter((item) => Number(item.year) === year), "title", renderEventArchiveCard)).join("")}
      </div>
    </section>
  `;
}

function goBackOnePage() {
  if (restoreNavigationState()) return;

  if (state.selectedChampionshipId) {
    state.selectedChampionshipId = null;
  } else if (state.selectedPersonId || state.selectedTvEpisodeId || state.selectedTvSubcollection || state.selectedMcuSeasonId || state.selectedMcuShowId) {
    const wasMcuSeason = Boolean(state.selectedMcuSeasonId);
    const wasMcuShow = Boolean(state.selectedMcuShowId);
    state.selectedPersonId = null;
    state.selectedTvEpisodeId = null;
    state.selectedTvSubcollection = null;
    state.selectedMcuSeasonId = null;
    state.selectedMcuShowId = null;
    if (wasMcuSeason || wasMcuShow) state.selectedCollectionId = "mcu";
  } else if (state.selectedCriterionEclipseId || state.selectedCriterionSubCollectionId) {
    state.selectedCriterionEclipseId = null;
    state.selectedCriterionSubCollectionId = null;
  } else if (state.selectedTvSeason) {
    state.selectedTvSeason = null;
  } else if (state.selectedTitleId) {
    const wasMcuTitle = Boolean(mcuDetailIndex[state.selectedTitleId]);
    const wasCriterionTitle = Boolean(criterionDetailIndex[state.selectedTitleId]);
    state.selectedPersonId = null;
    state.selectedTitleId = null;
    if (wasMcuTitle) state.selectedCollectionId = "mcu";
    if (wasCriterionTitle) state.selectedCollectionId = "criterion";
  } else if (state.selectedCollectionId) {
    if (state.selectedCuratedShelfId) {
      state.selectedCuratedShelfId = null;
    } else if (state.selectedCollectionId === "criterion" && state.selectedCriterionView !== "home") {
      state.selectedCriterionView = "home";
    } else if (state.selectedCollectionId === "cinema-of-india" && state.selectedIndiaLanguageId) {
      state.selectedIndiaView = "languages";
      state.selectedIndiaLanguageId = null;
    } else if (state.selectedCollectionId === "cinema-of-india" && state.selectedIndiaView !== "home") {
      state.selectedIndiaView = "home";
    } else if (state.returnPage) {
      restoreReturnPage();
    } else {
      state.selectedCollectionId = null;
      state.selectedCriterionView = "home";
      state.selectedIndiaView = "home";
      state.selectedIndiaLanguageId = null;
    }
  } else if (state.promotionId) {
    pendingPromotionId = null;
    state.promotionId = null;
  } else if (state.subView !== "home") {
    state.subView = "home";
  } else if (state.section !== "home") {
    state.section = "home";
    state.query = "";
  }

  render();
}

function pushNavigationState() {
  const snapshot = captureNavigationState();
  const previous = state.navigationStack.at(-1);
  const comparableSnapshot = { ...snapshot, scrollX: 0, scrollY: 0 };
  const comparablePrevious = previous ? { ...previous, scrollX: 0, scrollY: 0 } : null;
  if (comparablePrevious && JSON.stringify(comparablePrevious) === JSON.stringify(comparableSnapshot)) return;
  state.navigationStack.push(snapshot);
  if (state.navigationStack.length > 60) state.navigationStack.shift();
}

function captureNavigationState() {
  return {
    section: state.section,
    promotionId: state.promotionId,
    selectedTitleId: state.selectedTitleId,
    selectedPersonId: state.selectedPersonId,
    selectedChampionshipId: state.selectedChampionshipId,
    selectedTvSeason: state.selectedTvSeason ? { ...state.selectedTvSeason } : null,
    selectedTvSubcollection: state.selectedTvSubcollection ? { ...state.selectedTvSubcollection } : null,
    selectedTvEpisodeId: state.selectedTvEpisodeId,
    selectedTvGuideItemId: state.selectedTvGuideItemId,
    selectedCollectionId: state.selectedCollectionId,
    selectedCuratedShelfId: state.selectedCuratedShelfId,
    selectedMcuSeasonId: state.selectedMcuSeasonId,
    selectedMcuShowId: state.selectedMcuShowId,
    selectedCriterionView: state.selectedCriterionView,
    selectedCriterionEclipseId: state.selectedCriterionEclipseId,
    selectedCriterionSubCollectionId: state.selectedCriterionSubCollectionId,
    selectedIndiaView: state.selectedIndiaView,
    selectedIndiaLanguageId: state.selectedIndiaLanguageId,
    selectedYear: state.selectedYear,
    view: state.view,
    subView: state.subView,
    wrestlingMode: state.wrestlingMode,
    eventSort: state.eventSort,
    championshipSort: state.championshipSort,
    collectionSort: state.collectionSort,
    batcaveView: state.batcaveView,
    titleCardView: state.titleCardView,
    query: state.query,
    returnPage: state.returnPage ? { ...state.returnPage } : null,
    tvGuideTheaterMode: state.tvGuideTheaterMode,
    scrollX: globalThis.window?.scrollX ?? 0,
    scrollY: globalThis.window?.scrollY ?? 0,
    scrollContainers: captureScrollContainers(),
  };
}

function restoreNavigationState() {
  const previous = state.navigationStack.pop();
  if (!previous) return false;

  Object.assign(state, {
    section: previous.section ?? "home",
    promotionId: previous.promotionId ?? null,
    selectedTitleId: previous.selectedTitleId ?? null,
    selectedPersonId: previous.selectedPersonId ?? null,
    selectedChampionshipId: previous.selectedChampionshipId ?? null,
    selectedTvSeason: previous.selectedTvSeason ? { ...previous.selectedTvSeason } : null,
    selectedTvSubcollection: previous.selectedTvSubcollection ? { ...previous.selectedTvSubcollection } : null,
    selectedTvEpisodeId: previous.selectedTvEpisodeId ?? null,
    selectedTvGuideItemId: previous.selectedTvGuideItemId ?? null,
    selectedCollectionId: previous.selectedCollectionId ?? null,
    selectedCuratedShelfId: previous.selectedCuratedShelfId ?? null,
    selectedMcuSeasonId: previous.selectedMcuSeasonId ?? null,
    selectedMcuShowId: previous.selectedMcuShowId ?? null,
    selectedCriterionView: previous.selectedCriterionView ?? "home",
    selectedCriterionEclipseId: previous.selectedCriterionEclipseId ?? null,
    selectedCriterionSubCollectionId: previous.selectedCriterionSubCollectionId ?? null,
    selectedIndiaView: previous.selectedIndiaView ?? "home",
    selectedIndiaLanguageId: previous.selectedIndiaLanguageId ?? null,
    selectedYear: previous.selectedYear ?? state.selectedYear,
    view: previous.view ?? "overview",
    subView: previous.subView ?? "home",
    wrestlingMode: previous.wrestlingMode ?? "media",
    eventSort: previous.eventSort ?? "date-desc",
    championshipSort: previous.championshipSort ?? "date-asc",
    collectionSort: previous.collectionSort ?? "az",
    batcaveView: previous.batcaveView ?? "overview",
    titleCardView: previous.titleCardView ?? "full",
    query: previous.query ?? "",
    returnPage: previous.returnPage ? { ...previous.returnPage } : null,
    tvGuideTheaterMode: Boolean(previous.tvGuideTheaterMode),
    castOverlay: null,
  preserveScrollOnRender: false,
  });

  render();
  requestAnimationFrame(() => {
    globalThis.window?.scrollTo(previous.scrollX ?? 0, previous.scrollY ?? 0);
    restoreScrollContainers(previous.scrollContainers);
  });
  return true;
}

function captureScrollContainers() {
  return [...document.querySelectorAll("[id]")]
    .filter((element) => element.scrollLeft || element.scrollTop)
    .map((element) => ({
      id: element.id,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    }));
}

function restoreScrollContainers(containers = []) {
  containers.forEach((container) => {
    const element = document.getElementById(container.id);
    if (!element) return;
    element.scrollLeft = container.scrollLeft ?? 0;
    element.scrollTop = container.scrollTop ?? 0;
  });
}

function capturePreservedPageScroll() {
  const content = document.querySelector(".content");
  const scrollables = [...document.querySelectorAll(".carousel, .episode-carousel, .toby-tv-season-carousel, .toby-tv-episode-carousel, [data-event-carousel-viewport]")];
  return {
    scrollX: globalThis.window?.scrollX ?? 0,
    scrollY: globalThis.window?.scrollY ?? 0,
    contentScrollLeft: content?.scrollLeft ?? 0,
    contentScrollTop: content?.scrollTop ?? 0,
    containers: captureScrollContainers(),
    scrollables: scrollables.map((element, index) => ({ index, scrollLeft: element.scrollLeft, scrollTop: element.scrollTop })),
  };
}

function preservePageScrollForNextRender() {
  state.preserveScrollOnRender = true;
  state.pendingScrollRestore = capturePreservedPageScroll();
  return state.pendingScrollRestore;
}

function restorePreservedPageScroll(snapshot) {
  if (!snapshot) return;
  globalThis.window?.scrollTo(snapshot.scrollX ?? 0, snapshot.scrollY ?? 0);
  const content = document.querySelector(".content");
  if (content) {
    content.scrollLeft = snapshot.contentScrollLeft ?? 0;
    content.scrollTop = snapshot.contentScrollTop ?? 0;
  }
  restoreScrollContainers(snapshot.containers);
  const scrollables = [...document.querySelectorAll(".carousel, .episode-carousel, .toby-tv-season-carousel, .toby-tv-episode-carousel, [data-event-carousel-viewport]")];
  snapshot.scrollables?.forEach(({ index, scrollLeft, scrollTop }) => {
    const element = scrollables[index];
    if (!element) return;
    element.scrollLeft = scrollLeft ?? 0;
    element.scrollTop = scrollTop ?? 0;
  });
}

function captureReturnPage() {
  return {
    section: state.section,
    subView: state.subView,
    selectedCollectionId: state.selectedCollectionId,
    selectedCriterionView: state.selectedCriterionView,
    selectedCriterionEclipseId: state.selectedCriterionEclipseId,
    selectedCriterionSubCollectionId: state.selectedCriterionSubCollectionId,
    selectedIndiaView: state.selectedIndiaView,
    selectedIndiaLanguageId: state.selectedIndiaLanguageId,
  };
}

function restoreReturnPage() {
  const previous = state.returnPage;
  state.returnPage = null;
  state.section = previous.section ?? "home";
  state.subView = previous.subView ?? "home";
  state.selectedCollectionId = previous.selectedCollectionId ?? null;
  state.selectedCriterionView = previous.selectedCriterionView ?? "home";
  state.selectedCriterionEclipseId = previous.selectedCriterionEclipseId ?? null;
  state.selectedCriterionSubCollectionId = previous.selectedCriterionSubCollectionId ?? null;
  state.selectedIndiaView = previous.selectedIndiaView ?? "home";
  state.selectedIndiaLanguageId = previous.selectedIndiaLanguageId ?? null;
  state.selectedTitleId = null;
  state.selectedPersonId = null;
  state.selectedTvSeason = null;
  state.selectedTvEpisodeId = null;
  state.selectedTvGuideItemId = null;
  state.selectedMcuSeasonId = null;
  state.selectedMcuShowId = null;
}

async function refreshMetadataStatus() {
  const response = await fetch("./api/metadata/status", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return;

  const nextStatus = await response.json();
  const finishedScan = metadataStatus?.state === "scanning" && nextStatus.state && nextStatus.state !== "scanning";
  const changed = JSON.stringify(nextStatus) !== JSON.stringify(metadataStatus);
  metadataStatus = nextStatus;
  if (finishedScan) {
    await loadGeneratedMetadata(false);
    await loadMetadataOverrides(false);
  }
  if (changed) scheduleHydrationRender(500);
}

async function loadGeneratedMetadata(shouldRender = true) {
  const response = await fetch("./src/metadata.generated.json", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return;
  const data = await response.json();
  generatedMetadata = data;
  metadataIndex = Object.fromEntries((data.records ?? []).map((record) => [record.id, record]));
    invalidateMediaCaches();
  ensureMediaPreflightIndex();
  getGeneratedCollectionFolderEntries.cache = null;
  if (shouldRender) scheduleHydrationRender();
}

async function loadMetadataOverrides(shouldRender = true) {
  const response = await fetch("./api/metadata/overrides", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return;
  metadataOverrides = await response.json();
  invalidateMediaCaches();
  if (shouldRender) scheduleHydrationRender();
}
async function loadCollectionOverrides(shouldRender = true) {
  const response = await fetch("./api/collections", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return;
  collectionOverrides = await response.json();
  if (shouldRender) scheduleHydrationRender();
}
function filterLibraryItems(items) {
  const query = state.query.trim().toLowerCase();
  if (!query) return items;

  return items.filter((item) =>
    [item.title, item.country, item.genre, item.status, item.years]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query)),
  );
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key];
    groups[value] = groups[value] ?? [];
    groups[value].push(item);
    return groups;
  }, {});
}

function renderCyberFightHub() {
  const children = ["ddt", "noah", "tjpw"].map(getPromotion);
  return `
    <section class="lane cyberfight-hub">
      <div class="lane-head">
        <h2>CyberFight Promotions</h2>
        <span class="muted">${children.length} brands</span>
      </div>
      <div class="promotion-grid">
        ${children.map(renderPromotionCard).join("")}
      </div>
    </section>
  `;
}

function renderCollectionShelfCard(collection) {
  const items = collection.itemIds.map(getCollectionItem).filter(Boolean);
  return `
    <article class="collection-shelf-card" style="--poster-a:${collection.posterA};--poster-b:${collection.posterB}" aria-label="${escapeHtml(collection.title)}" data-collection-id="${collection.id}" tabindex="0">
      ${
        collection.buttonImage
          ? `<div class="collection-button-art"><img src="${escapeHtml(collection.buttonImage)}" alt="" loading="lazy" /></div>`
          : `<div class="collection-shelf-art">${items.slice(0, 3).map((item) => renderPosterBlock(item, "mini-poster")).join("")}</div>`
      }
    </article>
  `;
}

function setGeneratedWrestlingLibrary(records, loadedPromotionIds = []) {
  generatedWrestlingLibrary = records;
  generatedWrestlingById = new Map();
  loadedGeneratedPromotionIds = new Set(loadedPromotionIds);
  generatedWrestlingByPromotion = new Map();
  generatedWrestlingByPromotionYear = new Map();

  for (const record of records) {
    generatedWrestlingById.set(record.id, record);
    if (record.referenceId) generatedWrestlingById.set(record.referenceId, record);
    if (!record.promotionId) continue;
    const promotionRecords = generatedWrestlingByPromotion.get(record.promotionId) ?? [];
    promotionRecords.push(record);
    generatedWrestlingByPromotion.set(record.promotionId, promotionRecords);

    if (!record.year) continue;
    const yearKey = `${record.promotionId}:${record.year}`;
    const yearRecords = generatedWrestlingByPromotionYear.get(yearKey) ?? [];
    yearRecords.push(record);
    generatedWrestlingByPromotionYear.set(yearKey, yearRecords);
  }

  // Source imports can carry different IDs (or Roman/Arabic spellings) for the
  // same dated event. Point every equivalent ID at the richest record so cards,
  // championship histories, and accomplishment tables all open one page.
  const eventIdentityGroups = new Map();
  for (const record of records) {
    if (record.recordType !== "event" || !record.promotionId || !record.date) continue;
    const identity = `${record.promotionId}|${record.date}|${canonicalWrestlingEventKey(record.title ?? record.displayTitle, record.promotionId)}`;
    eventIdentityGroups.set(identity, [...(eventIdentityGroups.get(identity) ?? []), record]);
  }
  for (const group of eventIdentityGroups.values()) {
    if (group.length < 2) continue;
    const canonical = [...group].sort((left, right) => wrestlingEventHydrationScore(right) - wrestlingEventHydrationScore(left))[0];
    for (const alias of group) {
      generatedWrestlingById.set(alias.id, canonical);
      if (alias.referenceId) generatedWrestlingById.set(alias.referenceId, canonical);
    }
  }
}

function addGeneratedWrestlingRecords(records) {
  const existingIds = new Set(generatedWrestlingLibrary.map((record) => record.id));
  const nextRecords = records.filter((record) => !existingIds.has(record.id));
  if (!nextRecords.length) return;
  setGeneratedWrestlingLibrary([...generatedWrestlingLibrary, ...nextRecords], loadedGeneratedPromotionIds);
}

function removeGeneratedPromotionYear(promotionId, year) {
  setGeneratedWrestlingLibrary(
    generatedWrestlingLibrary.filter((record) => !(record.promotionId === promotionId && Number(record.year) === Number(year))),
    loadedGeneratedPromotionIds,
  );
  loadedGeneratedPromotionYears.delete(`${promotionId}:${year}`);
  generatedPromotionYearLoadPromises.delete(`${promotionId}:${year}`);
}

function isPromotionLibraryReady(promotionId, year = state.selectedYear) {
  if (generatedPromotionYearIndexes.get(promotionId)?.length) return loadedGeneratedPromotionYears.has(`${promotionId}:${year}`);
  return loadedGeneratedPromotionIds.has(promotionId);
}

async function ensureGeneratedPromotionLibrary(promotionId, year = null) {
  const years = await ensureGeneratedPromotionYearIndex(promotionId);
  if (years.length) {
    const requestedYear = Number(year);
    const selectedYear = years.includes(requestedYear) ? requestedYear : years.at(-1);
    await ensureGeneratedPromotionYear(promotionId, selectedYear);
    if (promotionId === "wwe") {
      ensureSingleGeneratedPromotionLibrary("evolve").then(() => {
        if (state.section === "wrestling" && state.promotionId === "wwe" && Number(state.selectedYear) === selectedYear) {
          state.preserveScrollOnRender = true;
          render();
        }
      });
    }
    scheduleGeneratedPromotionBackgroundWarmup(promotionId, selectedYear, years);
    return;
  }
  await ensureSingleGeneratedPromotionLibrary(promotionId);
}

async function ensureGeneratedPromotionYearIndex(promotionId) {
  if (generatedPromotionYearIndexes.has(promotionId)) return generatedPromotionYearIndexes.get(promotionId);
  const data = await fetch(`./src/wrestling-library-${promotionId}-index.generated.json`, { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : { years: [] }))
    .catch(() => ({ years: [] }));
  const years = (data.years ?? []).map(Number).filter(Boolean).sort((a, b) => a - b);
  generatedPromotionYearIndexes.set(promotionId, years);
  generatedPromotionYearVersions.set(promotionId, data.generatedAt ?? "1");
  return years;
}

async function ensureGeneratedPromotionYear(promotionId, year) {
  const key = `${promotionId}:${year}`;
  if (loadedGeneratedPromotionYears.has(key)) return;
  if (!generatedPromotionYearLoadPromises.has(key)) {
    generatedPromotionYearLoadPromises.set(
      key,
      fetch(generatedPromotionYearPageUrl(promotionId, year), { cache: "force-cache" })
        .then((response) => (response.ok ? response.json() : { records: [] }))
        .then((data) => {
          addGeneratedWrestlingRecords(data.records ?? []);
          loadedGeneratedPromotionIds.add(promotionId);
          loadedGeneratedPromotionYears.add(key);
        })
        .catch((error) => {
          console.error(`Promotion archive page failed for ${key}`, error);
          loadedGeneratedPromotionYears.add(key);
        }),
    );
  }
  await generatedPromotionYearLoadPromises.get(key);
}

function generatedPromotionYearPageUrl(promotionId, year) {
  const version = generatedPromotionYearVersions.get(promotionId) ?? "1";
  return `./src/wrestling-library-pages/${promotionId}-${year}.generated.json?v=${encodeURIComponent(version)}`;
}

function scheduleGeneratedPromotionBackgroundWarmup(promotionId, selectedYear, years) {
  if (generatedPromotionBackgroundWarmups.has(promotionId)) return;
  generatedPromotionBackgroundWarmups.add(promotionId);
  const queue = years
    .filter((year) => year !== selectedYear)
    .sort((left, right) => Math.abs(right - selectedYear) - Math.abs(left - selectedYear));

  const warmNext = () => {
    const year = queue.pop();
    if (!year) return;
    const run = () => {
      // Warm the HTTP cache only. Parsing every year would recreate the old
      // multi-megabyte startup and DOM cost we are avoiding.
      fetch(generatedPromotionYearPageUrl(promotionId, year), { cache: "force-cache" })
        .catch(() => null)
        .finally(warmNext);
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 1800 });
    else window.setTimeout(run, 250);
  };

  warmNext();
}

async function ensureAllGeneratedPromotionYears(promotionId) {
  const years = await ensureGeneratedPromotionYearIndex(promotionId);
  const extraLoads = promotionId === "wwe" ? [ensureSingleGeneratedPromotionLibrary("evolve")] : [];
  await Promise.all([...extraLoads, ...years.map((year) => ensureGeneratedPromotionYear(promotionId, year))]);
}

async function ensureSingleGeneratedPromotionLibrary(promotionId) {
  if (loadedGeneratedPromotionIds.has(promotionId)) return;
  if (!generatedPromotionLoadPromises.has(promotionId)) {
    generatedPromotionLoadPromises.set(
      promotionId,
      fetch(`./src/wrestling-library-${promotionId}.generated.json`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : { records: [] }))
        .then((data) => {
          addGeneratedWrestlingRecords(data.records ?? []);
          loadedGeneratedPromotionIds.add(promotionId);
        })
        .catch((error) => {
          console.error(`Promotion archive load failed for ${promotionId}`, error);
          loadedGeneratedPromotionIds.add(promotionId);
        }),
    );
  }
  await generatedPromotionLoadPromises.get(promotionId);
}

function getGeneratedWrestlingRecords(promotionId, year = null) {
  if (year == null) return generatedWrestlingByPromotion.get(promotionId) ?? [];
  return generatedWrestlingByPromotionYear.get(`${promotionId}:${year}`) ?? [];
}

function sortByDate(items) {
  return [...items].sort((a, b) => String(b.addedAt ?? "").localeCompare(String(a.addedAt ?? "")));
}

function prioritizeItems(items, priorityIds = []) {
  const priority = new Map(priorityIds.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aRank = priority.has(a.id) ? priority.get(a.id) : Number.POSITIVE_INFINITY;
    const bRank = priority.has(b.id) ? priority.get(b.id) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return 0;
  });
}

function getCollectionItem(id, options = {}) {
  const liveItem = [...getMovieLibraryItems(), ...getTvLibraryItems()].find((item) => item.id === id);
  if (liveItem || options.mediaOnly || state.libraryMode === "media") return liveItem ?? null;
  return movieDetailIndex[id] ?? mcuDetailIndex[id] ?? criterionDetailIndex[id];
}

function curatedSection(title, items, options = {}) {
  return {
    id: slugify(title),
    title,
    items,
    ...options,
  };
}

function curatedItem(title, year, mediaType = "movie", genre = "Collection") {
  return {
    id: `curated-${slugify(title)}-${year ?? "tba"}`,
    title,
    year,
    mediaType,
    genre,
    status: "complete",
    country: "Curated",
    posterA: "#171717",
    posterB: "#c6a35d",
    posterUrl: null,
    posterCode: buildPosterCode(title),
    watchProgress: 0,
    inWatchlist: false,
    addedAt: year ? `${year}-01-01` : "2000-01-01",
  };
}

function curatedTvItem(title, year, genre = "TV", id = null) {
  return {
    ...curatedItem(title, year, "tv", genre),
    id: id ?? `curated-${slugify(title)}-${year ?? "tba"}`,
  };
}

const cinemaOfIndiaLanguages = [
  ["hindi", "Hindi", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤Ãƒâ€šÃ‚Â¹ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¥ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬", "Pather Panchali"],
  ["telugu", "Telugu", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â°Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â±ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â°Ãƒâ€šÃ‚Â²ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â±Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â°ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â±Ãƒâ€šÃ‚Â", "RRR"],
  ["tamil", "Tamil", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â®Ãƒâ€šÃ‚Â¤ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â®Ãƒâ€šÃ‚Â®ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â®Ãƒâ€šÃ‚Â¿ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â®Ãƒâ€šÃ‚Â´ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¯Ãƒâ€šÃ‚Â", "Court"],
  ["kannada", "Kannada", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â²ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â²Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â³Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â²Ãƒâ€šÃ‚Â¨ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â²Ãƒâ€šÃ‚Â¡", "Kantara"],
  ["malayalam", "Malayalam", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â´Ãƒâ€šÃ‚Â®ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â´Ãƒâ€šÃ‚Â²ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â´Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â´Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â´Ãƒâ€šÃ‚Â³ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â´ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡", "Kummatty"],
  ["marathi", "Marathi", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤Ãƒâ€šÃ‚Â®ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤Ãƒâ€šÃ‚Â°ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¥ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬", "Court"],
  ["punjabi", "Punjabi", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¨Ãƒâ€šÃ‚ÂªÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â©Ãƒâ€šÃ‚Â°ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¨Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¨Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¨Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â©ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬", "The Lunchbox"],
  ["bengali", "Bengali", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¦Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¦Ãƒâ€šÃ‚Â²ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¦Ãƒâ€šÃ‚Â¾", "Aparajito"],
  ["gujarati", "Gujarati", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚ÂªÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â«Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â Ãƒâ€šÃ‚ÂªÃƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚ÂªÃƒâ€šÃ‚Â°ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚ÂªÃƒâ€šÃ‚Â¾ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚ÂªÃƒâ€šÃ‚Â¤ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â«ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬", "Hellaro"],
  ["more", "More", "ÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÆ’Ã‚Â Ãƒâ€šÃ‚Â¤Ãƒâ€šÃ‚Â°", "Cinema of India"],
];

const cinemaOfIndiaPageSpecs = [
  {
    id: "gateway",
    title: "Gateway Collections",
    description: "Starting points for new routes through Indian cinema.",
    heroImage: "./assets/collections/cinema-of-india/gateway-hero.png",
    posterA: "#071923",
    posterB: "#80cce2",
    menuRows: [
      ["essential-films", "first-steps", "beyond-bollywood"],
      ["parallel-cinema", "family-friendly", "great-mythologies"],
      ["action-starter", "musicals-starter", "award-winners"],
    ],
    sections: [
      curatedSection("25 Essential Indian Films", [curatedItem("Pather Panchali", 1955, "movie", "Indian Cinema")], { id: "essential-films", menuLabel: "25 Essential\nIndian Films" }),
      curatedSection("First Steps Into Indian Cinema", [curatedItem("Monsoon Wedding", 2001, "movie", "Indian Cinema")], { id: "first-steps", menuLabel: "First Steps Into\nIndian Cinema" }),
      curatedSection("Beyond Bollywood", [curatedItem("Court", 2014, "movie", "Indian Cinema")], { id: "beyond-bollywood" }),
      curatedSection("Parallel Cinema: The Indian New Wave", [curatedItem("Aparajito", 1956, "movie", "Indian Cinema")], { id: "parallel-cinema", menuLabel: "Parallel Cinema:\nThe Indian New Wave" }),
      curatedSection("Family-Friendly Films", [curatedItem("Zokkomon", 2011, "movie", "Family")], { id: "family-friendly", menuLabel: "Family-Friendly\nFilms" }),
      curatedSection("The Great Mythologies", [curatedItem("BÃƒÆ’Ã¢â‚¬Å¾Ãƒâ€šÃ‚Âhubali: The Beginning", 2015, "movie", "Epic")], { id: "great-mythologies", menuLabel: "The Great\nMythologies" }),
      curatedSection("Indian Action Starter Pack", [curatedItem("RRR", 2022, "movie", "Action")], { id: "action-starter", menuLabel: "Indian Action\nStarter Pack" }),
      curatedSection("Bollywood Musicals Starter Pack", [curatedItem("Dangal", 2016, "movie", "Musical")], { id: "musicals-starter", menuLabel: "Bollywood Musicals\nStarter Pack" }),
      curatedSection("Award Winners Worth Watching", [curatedItem("Gandhi", 1982, "movie", "Drama")], { id: "award-winners", menuLabel: "Award Winners\nWorth Watching" }),
    ],
  },
  {
    id: "languages",
    title: "Languages",
    description: "Language pathways through Indian cinema.",
    heroImage: "./assets/collections/cinema-of-india/languages-hero.png",
    posterA: "#102823",
    posterB: "#f1ae4f",
    menuRows: [cinemaOfIndiaLanguages.map(([id]) => id)],
    sections: cinemaOfIndiaLanguages.map(([id, title, nativeName, seed]) =>
      curatedSection(title, [curatedItem(seed, null, "movie", `${title} Cinema`)], { id, menuLabel: `${title}\n${nativeName}` }),
    ),
  },
  {
    id: "genres",
    title: "Genres",
    description: "Genre routes from mythology to modern crime stories.",
    heroImage: "./assets/collections/cinema-of-india/genres-hero.png",
    posterA: "#071629",
    posterB: "#9cc9f4",
    sections: [
      curatedSection("Historical", [curatedItem("Mughal-e-Azam", 1960, "movie", "Historical")]),
      curatedSection("Mythology & Fantasy", [curatedItem("BÃƒÆ’Ã¢â‚¬Å¾Ãƒâ€šÃ‚Âhubali 2: The Conclusion", 2017, "movie", "Fantasy")]),
      curatedSection("Musical", [curatedItem("Lagaan", 2001, "movie", "Musical")]),
      curatedSection("Action", [curatedItem("RRR", 2022, "movie", "Action")]),
      curatedSection("Crime", [curatedItem("Gangs of Wasseypur", 2012, "movie", "Crime")]),
      curatedSection("Thriller", [curatedItem("Tumbbad", 2018, "movie", "Thriller")]),
      curatedSection("Family", [curatedItem("Zokkomon", 2011, "movie", "Family")]),
      curatedSection("Devotional", [curatedItem("Sant Tukaram", 1936, "movie", "Devotional")]),
      curatedSection("Art House / Parallel Cinema", [curatedItem("Court", 2014, "movie", "Art House")], { id: "art-house-parallel-cinema" }),
      curatedSection("Romance", [curatedItem("Monsoon Wedding", 2001, "movie", "Romance")]),
      curatedSection("Comedy", [curatedItem("3 Idiots", 2009, "movie", "Comedy")]),
      curatedSection("Drama", [curatedItem("The World of Apu", 1959, "movie", "Drama")]),
    ],
  },
  {
    id: "box-office-smash",
    title: "Box Office Smash",
    description: "Crowd-pleasers, record breakers, and mega-hit pathways.",
    heroImage: "./assets/collections/cinema-of-india/box-office-smash-hero.png",
    posterA: "#142a22",
    posterB: "#f0a151",
    sections: [
      curatedSection("Highest Grossing Indian Films", [curatedItem("Dangal", 2016, "movie", "Box Office")]),
      curatedSection("Highest Grossing Hindi", [curatedItem("Pathaan", 2023, "movie", "Box Office")]),
      curatedSection("Highest Grossing Telugu", [curatedItem("BÃƒÆ’Ã¢â‚¬Å¾Ãƒâ€šÃ‚Âhubali 2: The Conclusion", 2017, "movie", "Box Office")]),
      curatedSection("Highest Grossing Tamil", [curatedItem("Jailer", 2023, "movie", "Box Office")]),
      curatedSection("Highest Grossing Kannada", [curatedItem("K.G.F: Chapter 2", 2022, "movie", "Box Office")]),
      curatedSection("Highest Grossing Malayalam", [curatedItem("Manjummel Boys", 2024, "movie", "Box Office")]),
      curatedSection("Highest Grossing Marathi", [curatedItem("Sairat", 2016, "movie", "Box Office")]),
      curatedSection("Highest Grossing Punjabi", [curatedItem("Carry on Jatta 3", 2023, "movie", "Box Office")]),
      curatedSection("Highest Grossing Bengali", [curatedItem("Chander Pahar", 2013, "movie", "Box Office")]),
      curatedSection("Highest Grossing Gujarati", [curatedItem("Chhello Divas", 2015, "movie", "Box Office")]),
      curatedSection("Highest Grossing Other Languages", [curatedItem("Kantara", 2022, "movie", "Box Office")]),
      curatedSection("Highest Grossing by Decade", [curatedItem("Sholay", 1975, "movie", "Box Office")]),
    ],
  },
  {
    id: "cultural-legacy",
    title: "Cultural Legacy",
    description: "Milestones, movements, and living memory.",
    heroImage: "./assets/collections/cinema-of-india/cultural-legacy-hero.png",
    posterA: "#102112",
    posterB: "#d7a45a",
    sections: [
      curatedSection("Essential Films", [curatedItem("Pather Panchali", 1955, "movie", "Essential")]),
      curatedSection("Box Office Smash", [curatedItem("Sholay", 1975, "movie", "Box Office")]),
      curatedSection("Modern Cinema", [curatedItem("RRR", 2022, "movie", "Modern Cinema")]),
      curatedSection("Classics", [curatedItem("Mother India", 1957, "movie", "Classic")]),
      curatedSection("Directors' Hits", [curatedItem("Salaam Bombay!", 1988, "movie", "Director")]),
      curatedSection("Golden Age", [curatedItem("Mughal-e-Azam", 1960, "movie", "Golden Age")]),
      curatedSection("Crime", [curatedItem("Gangs of Wasseypur", 2012, "movie", "Crime")]),
      curatedSection("Romance", [curatedItem("Dilwale Dulhania Le Jayenge", 1995, "movie", "Romance")]),
      curatedSection("Action", [curatedItem("RRR", 2022, "movie", "Action")]),
      curatedSection("Musicals", [curatedItem("Lagaan", 2001, "movie", "Musical")]),
    ],
  },
];

function buildCinemaOfIndiaCollection() {
  return {
    id: "cinema-of-india",
    title: "Cinema of India",
    description: "Language pathways, gateway shelves, regional film cultures, box-office legends, and cultural landmarks.",
    heroImage: "./assets/collections/cinema-of-india/hero.png",
    buttonImage: "./assets/collections/cinema-of-india/button.png",
    showHeroText: false,
    continueTitle: "Continue Watching",
    posterA: "#130c07",
    posterB: "#f3a44b",
    menuRows: [["gateway", "languages", "genres", "box-office-smash", "cultural-legacy"]],
    sections: cinemaOfIndiaPageSpecs.map((page) =>
      curatedSection(page.title, [curatedItem(page.sections[0]?.items?.[0]?.title ?? page.title, null, "movie", "Indian Cinema")], {
        id: page.id,
      }),
    ),
    indiaPages: cinemaOfIndiaPageSpecs,
  };
}

curatedCollectionPages.splice(movieGenreCollectionSpecs.length, 0, buildCinemaOfIndiaCollection());

function buildMovieGenreCollections() {
  return movieGenreCollectionSpecs.map((spec) => buildCuratedSpecCollection(spec, {
    description: `${spec.title} shelves inside Toby's 24-hour video aisles.`,
    continueTitle: "Current Rentals",
    newArrivals: false,
  }));
}

function buildProfileCollections() {
  return profileCollectionSpecs.map((spec) => {
    if (spec.sections?.some((section) => Array.isArray(section.items))) {
      return {
        id: spec.id,
        title: spec.title,
        description: spec.description,
        heroImage: spec.heroImage,
        buttonImage: spec.buttonImage ?? spec.heroImage,
        showHeroText: false,
        continueTitle: spec.continueTitle ?? "Continue Watching",
        posterA: spec.posterA,
        posterB: spec.posterB,
        menuRows: spec.menuRows ?? [spec.sections.map((section) => section.id)],
        sections: spec.sections,
      };
    }
    return buildCuratedSpecCollection(spec, {
      description: spec.description,
      continueTitle: "Continue Watching",
      newArrivals: false,
    });
  });
}

function buildCuratedSpecCollection(spec, options = {}) {
  const sectionIds = spec.sections.map(slugify);
  const seedItems = spec.sections.map((section, index) =>
    curatedItem(spec.seed[index] ?? section, inferCuratedYear(spec.seed[index] ?? section, index), "movie", section),
  );
  return {
    id: spec.id,
    title: spec.title,
    description: options.description ?? `${spec.title} collection routes.`,
    heroImage: spec.heroImage,
    buttonImage: spec.buttonImage ?? spec.heroImage,
    showHeroText: false,
    continueTitle: options.continueTitle ?? "Continue Watching",
    posterA: spec.posterA,
    posterB: spec.posterB,
    menuRows: buildCuratedMenuRows(options.newArrivals ? ["new-arrivals", ...sectionIds] : sectionIds),
    sections: [
      ...(options.newArrivals ? [curatedSection("New Arrivals", seedItems.slice(0, 6), { id: "new-arrivals" })] : []),
      ...spec.sections.map((section, index) => curatedSection(section, [seedItems[index]], { id: sectionIds[index] })),
    ],
  };
}

function buildCuratedMenuRows(sectionIds, rowSize = 5) {
  const rows = [];
  for (let index = 0; index < sectionIds.length; index += rowSize) {
    rows.push(sectionIds.slice(index, index + rowSize));
  }
  return rows;
}

function inferCuratedYear(title, index = 0) {
  const knownYears = {
    "12 Angry Men": 1957,
    "Alien": 1979,
    "Arrival": 2016,
    "Back to the Future": 1985,
    "Batman: The Animated Series": 1992,
    "Bend It Like Beckham": 2002,
    "Beverly Hills Cop": 1984,
    "Big": 1988,
    "Big Trouble in Little China": 1986,
    "Blade Runner": 1982,
    "Bosom Buddies": 1980,
    "Caddyshack": 1980,
    "Casablanca": 1942,
    "Children of Men": 2006,
    "Coming to America": 1988,
    "Conan the Barbarian": 1982,
    "Do the Right Thing": 1989,
    "Dr. No": 1962,
    "Dumb and Dumber": 1994,
    "Dune": 2021,
    "Duck Soup": 1933,
    "Enter the Dragon": 1973,
    "Forrest Gump": 1994,
    "Four Weddings and a Funeral": 1994,
    "Friday": 1995,
    "Friday Night Lights": 2004,
    "Goldfinger": 1964,
    "Heat": 1995,
    "Jason and the Argonauts": 1963,
    "Labyrinth": 1986,
    "Mad Max: Fury Road": 2015,
    "Manchester by the Sea": 2016,
    "Mission: Impossible": 1996,
    "Monty Python and the Holy Grail": 1975,
    "Never Say Never Again": 1983,
    "On Her Majesty's Secret Service": 1969,
    "Philadelphia": 1993,
    "Planes, Trains and Automobiles": 1987,
    "Portrait of a Lady on Fire": 2019,
    "Raging Bull": 1980,
    "Raiders of the Lost Ark": 1981,
    "Saving Private Ryan": 1998,
    "Schindler's List": 1993,
    "Senna": 2010,
    "Sideways": 2004,
    "Stagecoach": 1939,
    "Star Wars": 1977,
    "Stop Making Sense": 1984,
    "The 400 Blows": 1959,
    "The Dirty Dozen": 1967,
    "The Fly": 1986,
    "The Fog of War": 2003,
    "The General": 1926,
    "The Godfather": 1972,
    "The Good, the Bad and the Ugly": 1966,
    "The Holiday": 2006,
    "The Karate Kid": 1984,
    "The Odd Couple": 1968,
    "The Philadelphia Story": 1940,
    "The Princess Bride": 1987,
    "The Revenant": 2015,
    "The Spy Who Loved Me": 1977,
    "The Terminal": 2004,
    "The Terminator": 1984,
    "The War of the Worlds": 1953,
    "The World at War": 1973,
    "There Will Be Blood": 2007,
    "Videodrome": 1983,
    "When Harry Met Sally...": 1989,
    "White Sun of the Desert": 1970,
    "You've Got Mail": 1998,
  };
  return knownYears[title] ?? 1980 + index;
}

function slugify(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(" ", "-");
}

function getHomeWrestlingItems() {
  const generatedHomeItems = generatedWrestlingLibrary
    .filter((item) => [1997, 1998].includes(item.year))
    .filter((item) => item.watchProgress > 0 || item.inWatchlist)
    .slice(0, 8);
  const wwe = getPromotion("wwe");
  const wcw = getPromotion("wcw");
  const items = [
    [getYearEvents(wwe, 2001).find((item) => item.title === "WrestleMania X-Seven"), "WWE"],
    [getYearEvents(wcw, 1997).find((item) => item.title === "Starrcade"), "WCW"],
    [
      getYearEvents(wcw, 1998).find(
        (item) => item.showName === "Monday Nitro" && item.date === "1998-01-05",
      ),
      "WCW",
    ],
    [
      getYearEvents(wwe, 2000).find(
        (item) => item.showName === "SmackDown" && item.date === "2000-08-24",
      ),
      "WWE",
    ],
  ].filter(([item]) => Boolean(item));

  return [
    ...generatedHomeItems,
    ...items.map(([item, promotionName], index) => ({
      ...item,
      id: `home-wrestling-${item.id}`,
      metadataId: `wrestling-${promotionName.toLowerCase()}-${item.id}`,
      mediaType: "wrestling",
      country: item.promotionName ?? "Wrestling",
      genre: item.eventLabel ?? "Weekly",
      status: "complete",
      title: item.type === "weekly" ? item.showName : item.title,
      posterCode: item.type === "weekly" ? item.shortName : item.posterCode,
      inWatchlist: index < 2,
      watchProgress: index === 0 ? 71 : index === 2 ? 34 : 0,
      addedAt: `2026-05-${String(20 - index).padStart(2, "0")}`,
      promotionName,
    })),
  ];
}

function getVisiblePromotionEvents(promotion, year) {
  if (state.wrestlingMode === "media") {
    return getLocalWrestlingRecordsForPromotion(promotion)
      .filter((item) => item.year === year)
      .map(metadataRecordToTimelineItem)
      .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
  }

  const generated = getGeneratedWrestlingRecords(promotion.id, year).map(libraryRecordToTimelineItem);
  const seeded = getYearEvents(promotion, year);
  if (!generated.length) return seeded;
  return dedupeTimelineItems(generated).sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
}

function getVisiblePromotionArchiveItems(promotion) {
  const sourceItems =
    state.wrestlingMode === "media"
      ? getLocalWrestlingRecordsForPromotion(promotion).map(metadataRecordToTimelineItem)
      : (() => {
          const generated = getGeneratedWrestlingRecords(promotion.id)
            .filter((item) => item.recordType === "event")
            .map(libraryRecordToTimelineItem);
          return generated.length ? dedupeTimelineItems(generated) : promotion.ppvs;
        })();

  return sourceItems.map((item) => ({
    ...item,
    matches: item.matches ?? parseWrestlingMatches(item.summary),
    mediaType: "wrestling",
    promotionId: promotion.id,
    promotionName: promotion.name,
    posterCode: item.posterCode ?? promotion.logo,
    country: item.location ?? promotion.name,
    genre: item.eventLabel ?? "Event",
    status: state.wrestlingMode === "media" ? "complete" : item.posterUrl ? "complete" : "missing-poster",
    watchProgress: item.watchProgress ?? 0,
    inWatchlist: item.inWatchlist ?? false,
    files: state.wrestlingMode === "media" ? item.files : [],
  }));
}

function getWweDocumentaryItems() {
  if (state.wrestlingMode === "media") return getLiveWweDocumentaryItems();
  return getWweDocumentaryArchiveItems();
}

function getWweDocumentaryArchiveItems() {
  const items = wweDocumentaries.map((item) => ({
    ...item,
    mediaType: "wrestling",
    promotionId: "wwe",
    promotionName: "World Wrestling Entertainment",
    country: "Documentary",
    genre: "Documentary",
    status: item.posterUrl ? "complete" : "missing-poster",
    documentaryCategory: getWweDocumentaryCategory(item),
    files: [],
    watchProgress: 0,
    inWatchlist: false,
  }));
  const byTitle = new Map();
  items.forEach((item) => {
    const key = normalizeTitleForMatch(item.title);
    const existing = byTitle.get(key);
    if (!existing || documentaryCategoryRank(item) > documentaryCategoryRank(existing) || (documentaryCategoryRank(item) === documentaryCategoryRank(existing) && itemCompletenessScore(item) > itemCompletenessScore(existing))) byTitle.set(key, item);
  });
  return [...byTitle.values()];
}

function documentaryCategoryRank(item) {
  return /^others?$/i.test(item?.documentaryCategory ?? "") ? 0 : 1;
}

function getLiveWweDocumentaryItems() {
  const seededByTitle = new Map(wweDocumentaries.map((item) => [normalizeTitleForMatch(item.title), item]));
  return getLocalWrestlingRecords()
    .filter((record) => (record.files ?? []).some((file) => isWweDocumentaryPath(file.path)))
    .map((record) => {
      const seeded = seededByTitle.get(normalizeTitleForMatch(record.title));
      const file = (record.files ?? []).find((candidate) => isWweDocumentaryPath(candidate.path));
      return {
        ...(seeded ?? {}),
        ...metadataRecordToTimelineItem(record),
        id: record.id,
        mediaType: "wrestling",
        promotionId: "wwe",
        promotionName: "World Wrestling Entertainment",
        country: "Documentary",
        genre: "Documentary",
        eventLabel: "Documentary",
        documentaryCategory: getDocumentaryFolderFromPath(file?.path) ?? getWweDocumentaryCategory(seeded ?? record),
        status: "complete",
        files: record.files ?? [],
      };
    });
}

function getWweDocumentaryCategories() {
  if (wweDocumentaryCategoryIndex.categories?.length) return wweDocumentaryCategoryIndex.categories;
  return ["Championships", "Wrestler Biographies", "Wrestler Match Collections", "Teams & Factions", "Promotions", "Promotion Match Collections", "Show Collections", "Women in Wrestling", "Coliseum Home Video", "Match Types", "The WrestleMania Anthology", "The Royal Rumble Anthology", "The Survivor Series Anthology", "The Summerslam Anthology", "Other"].map((title) => ({ folder: title === "Other" ? "Others" : title, title }));
}

function getWweDocumentariesForCategory(category, documentaries) {
  const items = documentaries.filter((item) => normalizeTitleForMatch(item.documentaryCategory) === normalizeTitleForMatch(category.folder));
  return [...items, ...getWweAnthologyItems(category)].sort((a, b) => getDisplayTitle(a).localeCompare(getDisplayTitle(b)));
}

function getWweAnthologyItems(category) {
  const keyword = /wrestlemania/i.test(category.title) ? "wrestlemania" : /royal rumble/i.test(category.title) ? "royal rumble" : /survivor series/i.test(category.title) ? "survivor series" : /summerslam/i.test(category.title) ? "summerslam" : null;
  if (!keyword) return [];
  const promotion = getPromotion("wwe");
  return getVisiblePromotionArchiveItems(promotion).filter((item) => normalizeTitleForMatch(item.title).includes(keyword));
}

function getWweDocumentaryCategory(item) {
  const key = normalizeTitleForMatch(item?.title);
  const assigned = (wweDocumentaryCategoryIndex.assignments ?? []).find((entry) => entry.key === key || normalizeTitleForMatch(entry.title) === key);
  return assigned?.category ?? "Others";
}

function isWweDocumentaryPath(filePath) {
  return /[\\/]Wrestling[\\/]Major Promotions[\\/]WWFE[\\/]Documentaries[\\/]/i.test(String(filePath ?? ""));
}

function getDocumentaryFolderFromPath(filePath) {
  const parts = String(filePath ?? "").split(/[\\/]+/);
  const index = parts.findIndex((part) => /^Documentaries$/i.test(part));
  return index >= 0 ? parts[index + 1] ?? null : null;
}

function parseWrestlingMatches(summary = "") {
  const text = String(summary).replace(/\s+/g, " ").trim();
  if (!/^\d+\.\s+/.test(text)) return null;
  const matches = [...text.matchAll(/(?:^|\s)(\d+)\.\s+(.+?)(?=\s+\d+\.\s+|$)/g)].map((match) => ({
    order: Number(match[1]),
    match: match[2].trim(),
    stipulation: "Match",
    winner: null,
    result: null,
  }));
  return matches.length ? matches : null;
}

function sortEventArchiveItems(items) {
  const sorted = [...items];
  if (state.eventSort === "date-asc") return sorted.sort((a, b) => getArchiveDateKey(a).localeCompare(getArchiveDateKey(b)) || a.title.localeCompare(b.title));
  if (state.eventSort === "title-asc") return sorted.sort((a, b) => a.title.localeCompare(b.title) || getArchiveDateKey(a).localeCompare(getArchiveDateKey(b)));
  if (state.eventSort === "title-desc") return sorted.sort((a, b) => b.title.localeCompare(a.title) || getArchiveDateKey(b).localeCompare(getArchiveDateKey(a)));
  return sorted.sort((a, b) => getArchiveDateKey(b).localeCompare(getArchiveDateKey(a)) || a.title.localeCompare(b.title));
}

function isEventBasedPromotion(promotion) {
  return promotion.presentation === "events";
}

function formatArchiveDate(item) {
  if (item.date) return formatDisplayDate(item.date);
  if (item.listedYear) return String(item.listedYear);
  return "Date TBD";
}

function getArchiveDateKey(item) {
  if (item.date) return item.date;
  if (item.listedYear) return `${item.listedYear}-01-01`;
  return "0000-00-00";
}

function getVisiblePromotionYears(promotion) {
  if (state.wrestlingMode === "media") {
    const yearsWithMedia = [
      ...new Set(getLocalWrestlingRecordsForPromotion(promotion).map((record) => record.year).filter(Boolean)),
    ].sort((a, b) => a - b);
    if (yearsWithMedia.length) return yearsWithMedia;
  }

  const pagedYears = generatedPromotionYearIndexes.get(promotion.id);
  if (pagedYears?.length) return pagedYears;

  const generatedYears = [
    ...new Set(
      getGeneratedWrestlingRecords(promotion.id)
        .map((record) => record.year)
        .filter(Boolean),
    ),
  ].sort((a, b) => a - b);

  return generatedYears.length ? generatedYears : getPromotionYears(promotion);
}

function getDefaultPromotionYear(promotion) {
  return getVisiblePromotionYears(promotion).at(-1) ?? state.selectedYear;
}

const PROMOTION_YEAR_STORAGE_KEY = "tobytube.wrestling.last-promotion-years";

function readRememberedPromotionYears() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROMOTION_YEAR_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getRememberedPromotionYear(promotionId) {
  if (!promotionId) return null;
  const year = Number(readRememberedPromotionYears()[promotionId]);
  return Number.isFinite(year) && year > 0 ? year : null;
}

function rememberPromotionYear(promotionId, year) {
  const normalizedYear = Number(year);
  if (!promotionId || !Number.isFinite(normalizedYear) || normalizedYear <= 0) return;
  try {
    localStorage.setItem(PROMOTION_YEAR_STORAGE_KEY, JSON.stringify({ ...readRememberedPromotionYears(), [promotionId]: normalizedYear }));
  } catch {
    // Browsing should continue even when storage is unavailable.
  }
}

function ensureSelectedPromotionYear(promotion) {
  const years = getVisiblePromotionYears(promotion);
  const rememberedYear = getRememberedPromotionYear(promotion.id);
  if (state.wrestlingMode === "archive" && rememberedYear && !isPromotionLibraryReady(promotion.id, rememberedYear)) {
    state.selectedYear = rememberedYear;
    return;
  }
  if (years.length && !years.includes(state.selectedYear)) {
    state.selectedYear = years.includes(rememberedYear) ? rememberedYear : years.at(-1);
  }
  rememberPromotionYear(promotion.id, state.selectedYear);
}

function dedupeTimelineItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key =
      item.type === "weekly"
        ? `${item.date}|${slugify(item.title ?? item.showName ?? "")}`
        : `special|${item.date}|${slugify(item.title ?? "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getVisibleShowEpisodes(promotion, show, year) {
  if (state.wrestlingMode === "media") {
    return getLocalWrestlingRecords()
      .filter((item) => item.year === year && sameSeries(item.series, show.name))
      .filter((item) => getPromotionIdForRecord(item) === promotion.id || (promotion.id === "wwe" && getPromotionIdForRecord(item) === "evolve" && sameSeries(show.name, "Evolve")))
      .map(metadataRecordToTimelineItem);
  }

  const generatedRecords = promotion.id === "wwe" && sameSeries(show.name, "Evolve")
    ? getGeneratedWrestlingRecords("evolve", year)
    : getGeneratedWrestlingRecords(promotion.id, year);
  const generated = generatedRecords
    .filter((item) => item.recordType !== "event")
    .filter((item) => sameSeries(item.series, show.name))
    .map(libraryRecordToTimelineItem);
  if (generated.length) return generated;
  return Number.isInteger(show.weekday) ? getShowEpisodes(show, year) : [];
}

function getVisibleShowLanes(promotion, year) {
  if (state.wrestlingMode === "media") {
    const localRecords = promotion.id === "wwe"
      ? getLocalWrestlingRecords().filter((item) => ["wwe", "evolve"].includes(getPromotionIdForRecord(item)))
      : getLocalWrestlingRecordsForPromotion(promotion);
    const series = localRecords
      .filter((item) => item.year === year && item.series)
      .map((item) => item.series)
      .filter(Boolean);
    return [...new Set(series)]
      .map((name) => ({
        id: slugify(name),
        name,
        shortName: shortNameForSeries(name),
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      }))
      .sort((a, b) => sortShowsForPromotion(promotion, year, a, b));
  }

  const seeded = promotion.shows.filter((show) => showAiredInYear(show, year));
  const seededNames = new Set(seeded.map((show) => slugify(show.name)));
  const promotionRecords = promotion.id === "wwe"
    ? [...getGeneratedWrestlingRecords("wwe", year), ...getGeneratedWrestlingRecords("evolve", year).filter((item) => item.recordType !== "event")]
    : getGeneratedWrestlingRecords(promotion.id, year);
  const seriesCounts = promotionRecords
    .filter((item) => item.recordType !== "event")
    .reduce((counts, item) => {
      if (!item.series || /^@|^tv-taping\s+@/i.test(item.series)) return counts;
      counts[item.series] = (counts[item.series] ?? 0) + 1;
      return counts;
    }, {});
  const uniqueGenerated = Object.entries(seriesCounts)
    .filter(([series, count]) => count > 1 && ![...seededNames].some((name) => sameSeries(series, name)))
    .map(([series]) => series)
    .sort((a, b) => a.localeCompare(b));

  return [
    ...seeded,
    ...uniqueGenerated.map((series) => ({
      id: slugify(series),
      name: series,
      shortName: shortNameForSeries(series),
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    })),
  ].sort((a, b) => sortShowsForPromotion(promotion, year, a, b));
}

function showAiredInYear(show, year) {
  const startYear = Number(String(show.startDate ?? "").slice(0, 4));
  const endYear = show.endDate ? Number(String(show.endDate).slice(0, 4)) : Infinity;
  return (!Number.isFinite(startYear) || startYear <= year) && endYear >= year;
}

function sortShowsForPromotion(promotion, year, a, b) {
  const rankDelta = showRankForPromotion(promotion, year, a) - showRankForPromotion(promotion, year, b);
  if (rankDelta) return rankDelta;
  return a.name.localeCompare(b.name);
}

function showRankForPromotion(promotion, year, show) {
  if (promotion.id === "wwe") return wweShowRank(year, show);
  if (promotion.id === "aew") return rankedShowKey(show, [
    ["dynamite"],
    ["collision"],
    ["rampage"],
    ["dark"],
    ["dark-elevation"],
  ]);
  if (promotion.id === "wcw") return rankedShowKey(show, [
    ["nitro"],
    ["thunder"],
    ["saturday-night"],
    ["pro"],
  ]);
  if (promotion.id === "ecw") return rankedShowKey(show, [
    ["hardcore-tv"],
    ["ecw-on-tnn", "tnn"],
  ]);
  return 20;
}

function rankedShowKey(show, rankedKeys) {
  const key = slugify(show.name);
  const exactIndex = rankedKeys.findIndex((keys) =>
    keys.some((rankedKey) => key === rankedKey || key.endsWith(`-${rankedKey}`)),
  );
  if (exactIndex >= 0) return exactIndex;
  const index = rankedKeys.findIndex((keys) => keys.some((rankedKey) => key.includes(rankedKey)));
  return index >= 0 ? index : 20;
}

function wweShowRank(year, show) {
  const key = slugify(show.name);
  if (year < 1993) {
    if (key.includes("championship-wrestling")) return 0;
    if (key.includes("superstars")) return 1;
    if (key.includes("prime-time")) return 2;
  }
  if (key.includes("raw")) return 0;
  if (year < 1999 && key.includes("superstars")) return 1;
  if (key.includes("smackdown")) return 1;
  if (key === "ecw" || key.includes("wwe-ecw") || key.includes("nxt")) return 2;
  if (key.includes("heat")) return year < 1999 ? 2 : 3;
  if (key.includes("jakked") || key.includes("metal") || key.includes("velocity")) return 4;
  return 20;
}

function getWrestlingPromotionsForMode() {
  if (state.wrestlingMode === "archive") return promotions;

  const promotionIds = new Set(getLocalWrestlingRecords().map((record) => getPromotionIdForRecord(record)).filter(Boolean));
  return promotions.filter((promotion) => promotionIds.has(promotion.id));
}

function getLocalWrestlingRecords() {
  return Object.values(metadataIndex).filter(
    (record) => record.mediaType === "wrestling" && (record.files?.length ?? 0) > 0,
  );
}

function getLocalWrestlingRecordsForPromotion(promotion) {
  return getLocalWrestlingRecords().filter((record) => getPromotionIdForRecord(record) === promotion.id);
}

function getPromotionIdForRecord(record) {
  if (record.promotionId && promotions.some((promotion) => promotion.id === record.promotionId)) return record.promotionId;
  const promotionText = slugify(record.promotion ?? record.files?.[0]?.parsed?.promotion ?? "");
  const matched = promotions.find((promotion) => {
    const names = [promotion.id, promotion.name, promotion.logo].map(slugify);
    return names.includes(promotionText);
  });
  if (matched) return matched.id;
  if (["wwe", "wwf", "wwfe", "world-wrestling-entertainment", "world-wrestling-federation"].includes(promotionText)) return "wwe";
  if (promotionText === "wcw") return "wcw";
  if (promotionText === "ecw") return "ecw";
  if (promotionText === "aew") return "aew";
  if (promotionText === "pwg" || promotionText === "pro-wrestling-guerrilla") return "pwg";
  if (promotionText === "roh" || promotionText === "ring-of-honor") return "roh";
  if (["tna", "impact", "impact-wrestling", "total-nonstop-action"].includes(promotionText)) return "tna";
  if (promotionText === "njpw" || promotionText === "new-japan-pro-wrestling") return "njpw";
  return null;
}

function metadataRecordToTimelineItem(record) {
  const isWeekly = Boolean(record.series);
  return {
    ...record,
    promotionId: getPromotionIdForRecord(record),
    type: isWeekly ? "weekly" : /pay-per-view|ppv/i.test(record.eventType ?? "") ? "ppv" : "special",
    showName: record.series ?? record.title,
    shortName: shortNameForSeries(record.series ?? record.title),
    posterCode: record.posterCode ?? shortNameForSeries(record.title),
    metadataSource: "Scanned Media",
    eventLabel: record.eventType ?? (isWeekly ? "Weekly" : "Special Event"),
    watchProgress: record.watchProgress ?? 0,
    status: record.files?.length ? "complete" : "dummy",
  };
}

function libraryRecordToTimelineItem(record) {
  const isSpecial = record.recordType
    ? record.recordType === "event"
    : /special|pay.?per.?view|premium live|major event/i.test(record.eventType ?? "");
  if (isSpecial) {
    return {
      ...record,
      type: /pay-per-view|ppv|major/i.test(record.eventType ?? "") ? "ppv" : "special",
      metadataSource: "Reference DB",
      eventLabel: record.eventType ?? "Special Event",
    };
  }

  return {
    ...record,
    showName: record.series ?? record.displayTitle ?? record.title,
    shortName: shortNameForSeries(record.series),
    type: "weekly",
    metadataSource: "Reference DB",
    eventLabel: record.eventType,
  };
}

function getPromotionChampionships(promotion) {
  if (promotion.id === "wcw") return getWcwChampionships();

  const promotionPattern = new RegExp(`\\b${escapeRegex(promotion.id)}\\b|${escapeRegex(promotion.name)}`, "i");
  return wrestlingReferenceIndex.championships
    .filter((championship) => getChampionshipReigns(championship.id).length > 0)
    .filter((championship) => championship.promotionId === promotion.id || promotionPattern.test(championship.name ?? ""))
    .sort((a, b) => {
      const reignDelta = getChampionshipReigns(b.id).length - getChampionshipReigns(a.id).length;
      return reignDelta || a.name.localeCompare(b.name);
    });
}

function getWcwChampionships() {
  const usedIds = new Set();
  const ordered = wcwChampionshipLayout.map((definition) => {
    const championship = definition.ids
      .map((id) => wrestlingReferenceIndex.championships.find((item) => item.id === id))
      .find(Boolean);
    definition.ids.forEach((id) => usedIds.add(id));
    return {
      ...(championship ?? { id: definition.ids[0], sourceIds: [] }),
      name: definition.name,
      imageUrl: definition.imageUrl,
      imageMode: definition.imageMode,
    };
  });
  const remaining = wrestlingReferenceIndex.championships
    .filter((championship) => (championship.sourceIds ?? []).includes("wikipedia-championship-template"))
    .filter((championship) => /WCW/i.test(championship.name ?? ""))
    .filter((championship) => !usedIds.has(championship.id))
    .map((championship) => ({
      ...championship,
      imageUrl: wcwChampionshipImageMap[championship.id] ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...ordered, ...remaining];
}

function getChampionshipReigns(championshipId) {
  return wrestlingReferenceIndex.titleReigns
    .filter((reign) => reign.championshipId === championshipId)
    .sort((a, b) => String(a.dateWon ?? "").localeCompare(String(b.dateWon ?? "")));
}

function sameSeries(importedSeries = "", seededSeries = "") {
  const imported = slugify(importedSeries);
  const seeded = slugify(seededSeries);
  if (seeded.includes("raw")) return imported.includes("raw");
  if (seeded.includes("smackdown")) return imported.includes("smackdown");
  if (seeded.includes("heat")) return imported.includes("heat");
  if (seeded.includes("jakked") || seeded.includes("metal")) return imported.includes("jakked") || imported.includes("metal");
  if (seeded.includes("velocity")) return imported.includes("velocity");
  if (seeded.includes("shotgun")) return imported.includes("shotgun");
  if (seeded.includes("super-astros")) return imported.includes("super-astros") || imported.includes("s-per-astros");
  if (seeded.includes("superstars")) return imported.includes("superstars");
  if (seeded.includes("prime-time")) return imported.includes("prime-time");
  if (seeded.includes("wrestling-challenge")) return imported.includes("wrestling-challenge") || imported === "challenge";
  if (seeded.includes("championship-wrestling")) return imported.includes("championship-wrestling");
  if (seeded.includes("all-american")) return imported.includes("all-american");
  if (seeded.includes("action-zone")) return imported.includes("action-zone");
  if (seeded.includes("hardcore-tv")) return imported.includes("hardcore-tv");
  if (seeded.includes("ecw-on-tnn") || seeded.endsWith("on-tnn")) return imported.includes("ecw-on-tnn") || imported.endsWith("on-tnn");
  if (seeded === "ecw" || seeded.includes("wwe-ecw")) return imported === "ecw" || imported.includes("wwe-ecw");
  if (seeded.includes("nxt")) return imported.includes("nxt");
  if (seeded.includes("confidential")) return imported.includes("confidential");
  if (seeded.includes("bottom-line")) return imported.includes("bottom-line");
  if (seeded.includes("after-burn")) return imported.includes("after-burn") || imported.includes("afterburn");
  if (seeded.includes("experience")) return imported.includes("experience");
  if (seeded.includes("vintage")) return imported.includes("vintage");
  if (seeded.includes("nitro")) return imported.includes("nitro");
  if (seeded.includes("thunder")) return imported.includes("thunder");
  if (seeded.includes("saturday-night")) return imported.includes("saturday-night");
  if (seeded.includes("main-event")) return imported.includes("main-event");
  if (seeded.includes("worldwide") || seeded.includes("world-wide")) return imported.includes("worldwide") || imported.includes("world-wide");
  if (seeded === "pro" || seeded.includes("wcw-pro")) return imported === "pro" || imported.includes("wcw-pro");
  if (seeded.includes("power-hour")) return imported.includes("power-hour");
  if (seeded.includes("honorclub")) return imported.includes("honorclub");
  return imported === seeded;
}

function shortNameForSeries(series = "") {
  const normalized = String(series ?? "").toLowerCase();
  if (normalized.includes("nxt")) return "NXT";
  if (normalized === "ecw" || normalized.includes("wwe ecw")) return "ECW";
  if (normalized.includes("smackdown")) return "SD";
  if (normalized.includes("heat")) return "HEAT";
  if (normalized.includes("jakked")) return "JAK";
  if (normalized.includes("metal")) return "MTL";
  if (normalized.includes("velocity")) return "VEL";
  if (normalized.includes("shotgun")) return "SSN";
  if (normalized.includes("super astros") || normalized.includes("sÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âºper astros")) return "AST";
  if (normalized.includes("superstars")) return "SST";
  if (normalized.includes("prime time")) return "PTW";
  if (normalized.includes("challenge")) return "CHAL";
  if (normalized.includes("raw")) return "RAW";
  return buildPosterCode(series ?? "");
}

function buildPosterCode(title = "") {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatStatus(status) {
  return status
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function filterEvents(events) {
  const query = state.query.trim().toLowerCase();
  if (!query) return events;

  return events.filter((event) =>
    [event.title, event.showName, event.metadataSource]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  );
}

function formatShortDate(isoDate) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${isoDate}T00:00:00`));
}

function escapeHtml(value) {
  return cleanDisplayText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cleanDisplayText(value) {
  const text = String(value ?? "");
  if (isMojibakeText(text)) return "";
  return text
    .replace(/[\u2010-\u2015]/g, " - ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isMojibakeText(text) {
  if (!text) return false;
  const sample = String(text);
  const hits = (sample.match(/Ã|Â|â|Æ|€|�/g) ?? []).length;
  return hits >= 3 || hits / Math.max(sample.length, 1) > 0.08;
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

render();
