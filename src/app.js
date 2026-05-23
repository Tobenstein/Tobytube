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
} from "./data.js";

const state = {
  section: "home",
  promotionId: null,
  selectedTitleId: null,
  selectedPersonId: null,
  selectedYear: 2001,
  view: "overview",
  subView: "home",
  query: "",
};

const app = document.querySelector("#app");
let tmdbPosters = {};
let metadataIndex = {};
let wrestlingMetadataIndex = {};
let generatedWrestlingLibrary = [];
let metadataStatus = null;

fetch("./src/tmdb-posters.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : {}))
  .then((data) => {
    tmdbPosters = data;
    render();
  })
  .catch(() => {});

fetch("./src/metadata.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : { records: [] }))
  .then((data) => {
    metadataIndex = Object.fromEntries((data.records ?? []).map((record) => [record.id, record]));
    render();
  })
  .catch(() => {});

fetch("./src/wrestling-metadata.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : {}))
  .then((data) => {
    wrestlingMetadataIndex = data;
    render();
  })
  .catch(() => {});

fetch("./src/wrestling-library.generated.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : { records: [] }))
  .then((data) => {
    generatedWrestlingLibrary = data.records ?? [];
    render();
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
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main">
        ${renderTopbar()}
        <section class="content">
          ${renderContent()}
        </section>
      </main>
    </div>
  `;

  bindEvents();
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
        ${navButton("home", "Home", "Start", state.section === "home")}
        ${navButton("movies", "Movies", String(movies.length), state.section === "movies")}
        ${navButton("tv", "TV", String(tvShows.length), state.section === "tv")}
        ${navButton("wrestling", "Wrestling", String(promotions.length), state.section === "wrestling")}
        ${navButton("collections", "Collections", String(mediaCollections.length), state.section === "collections")}
      </nav>
    </aside>
  `;
}

function navButton(section, label, count, active) {
  return `
    <button class="nav-button ${active ? "active" : ""}" type="button" data-section="${section}">
      <span>${label}</span>
      <span class="nav-count">${count}</span>
    </button>
  `;
}

function renderTopbar() {
  return `
    <header class="topbar">
      <input class="search" type="search" placeholder="Search library" value="${escapeHtml(state.query)}" />
      <div class="topbar-actions">
        <button class="scan-button" type="button" data-action="rescan">Rescan</button>
        <div class="profile-pill">${renderMetadataStatus()}</div>
      </div>
    </header>
  `;
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
  if (state.selectedPersonId) return renderPersonScreen(state.selectedPersonId);
  if (state.selectedTitleId) return renderTitleScreen(getTitleItem(state.selectedTitleId));
  if (state.section === "home") return renderHomePage();
  if (state.section === "movies") return renderMoviesHome();
  if (state.section === "tv") return renderTvHome();
  if (state.section === "collections") return renderCollectionsHome();
  return state.promotionId ? renderPromotionDetail() : renderWrestlingHome();
}

function renderHomePage() {
  const mixedContinue = [
    ...movies.filter((item) => item.watchProgress > 0),
    ...tvShows.filter((item) => item.watchProgress > 0),
    ...getHomeWrestlingItems().filter((item) => item.watchProgress > 0),
  ];
  const mixedWatchlist = [
    ...movies.filter((item) => item.inWatchlist),
    ...tvShows.filter((item) => item.inWatchlist),
    ...getHomeWrestlingItems().filter((item) => item.inWatchlist),
  ];

  return `
    ${renderLibraryHeader("Home", "The front door: your libraries, in-progress media, watchlist, and fresh additions.")}
    <div class="shelf-stack">
      ${renderMediaHubShelf()}
      ${renderContinueShelf(mixedContinue)}
      ${renderPosterShelf("My Watchlist", mixedWatchlist, "item", renderMixedCard)}
      ${renderPosterShelf("Recently Added Movies", sortByDate(movies).slice(0, 10), "movie")}
      ${renderPosterShelf("Recently Added TV", sortByDate(tvShows), "show", renderTvCard)}
      ${renderPosterShelf("Recently Added Wrestling", getHomeWrestlingItems(), "item", renderMixedCard)}
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
    },
    {
      section: "tv",
      title: "TV",
      meta: `${tvShows.length} shows`,
      visual: "tv",
    },
    {
      section: "wrestling",
      title: "Wrestling",
      meta: `${promotions.length} promotions`,
      visual: "wrestling",
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
                  ${renderHubVisual(hub.visual)}
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

function renderHubVisual(visual) {
  if (visual === "tv") {
    return `
      <div class="retro-tv">
        <div class="tv-antenna"></div>
        <div class="tv-screen">TV</div>
        <div class="tv-feet"></div>
      </div>
    `;
  }

  if (visual === "wrestling") {
    return `
      <div class="stage-scene ring-scene">
        <div class="stage-curtains"></div>
        <div class="ring">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
  }

  return `
    <div class="stage-scene movie-scene">
      <div class="stage-curtains"></div>
      <div class="movie-screen"></div>
      <div class="stage-floor"></div>
    </div>
  `;
}

function renderMoviesHome() {
  const filtered = filterLibraryItems(movies);
  const grouped = groupBy(filtered, "country");

  if (state.subView === "library") return renderLibraryPage("Movies Library", filtered, renderLibraryCard);
  if (state.subView === "collections") return renderCollectionsPage("Movie Collections", "movie");

  return `
    ${renderLibraryHeader("Movies", "Recommendations, recovery rows, watchlist sparks, and browsable shelves for an uneven film library.", "movies")}
    <div class="shelf-stack">
      ${renderContinueShelf(filtered)}
      ${renderPosterShelf("Recently Added", sortByDate(filtered).slice(0, 10), "movie")}
      ${renderPosterShelf("From My Watchlist", filtered.filter((item) => item.inWatchlist), "movie")}
      ${["American", "British", "French", "Japanese"]
        .map((country) => renderPosterShelf(country, grouped[country] ?? [], "movie"))
        .join("")}
    </div>
  `;
}

function renderTvHome() {
  const filtered = filterLibraryItems(tvShows);

  if (state.subView === "library") return renderLibraryPage("TV Library", filtered, renderTvCard);
  if (state.subView === "collections") return renderCollectionsPage("TV Collections", "tv");

  return `
    ${renderLibraryHeader("TV", "Continue rows, recent additions, watchlist fragments, and sparse episode coverage.", "tv")}
    <div class="shelf-stack">
      ${renderContinueShelf(filtered)}
      ${renderPosterShelf("Recently Added", sortByDate(filtered), "show", renderTvCard)}
      ${renderPosterShelf("From My Watchlist", filtered.filter((item) => item.inWatchlist), "show", renderTvCard)}
      ${renderLibraryPage("All Shows", filtered, renderTvCard, true)}
    </div>
  `;
}

function renderCollectionsHome() {
  return `
    ${renderLibraryHeader("Collections", "Mixed shelves can hold movies and TV together: manual lists, moods, projects, or cleanup queues.")}
    ${renderCollectionsGrid(mediaCollections)}
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
          ${renderPosterBlock(item, "title-poster-art")}
        </div>
        <div class="title-copy">
          <div>
            <h1>${escapeHtml(item.title)}</h1>
            <p class="title-tagline">${escapeHtml(details.tagline ?? details.summary ?? "Metadata will appear here once this title is matched.")}</p>
          </div>
          ${renderTitleMetadataList(item, details)}
          <div class="title-actions">
            <button class="play-button" type="button">Play</button>
            <button class="icon-button" type="button">Add to Watchlist</button>
          </div>
          ${renderPlaybackSettings(details)}
        </div>
      </section>
      ${renderCastShelf(cast)}
      ${renderMatchCard(details)}
    </div>
  `;
}

function renderPersonScreen(personId) {
  const person = peopleIndex[personId];
  const items = (person?.libraryIds ?? []).map(getTitleItem).filter(Boolean);

  return `
    <div class="title-screen">
      <button class="icon-button" type="button" data-action="back-title">Back</button>
      <div class="section-heading">
        <div>
          <h1>${person?.name ?? "Cast Member"}</h1>
          <p class="muted">Other media in your library featuring this person.</p>
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

function renderCastShelf(cast) {
  if (!cast.length) return "";

  return `
    <section class="lane">
      <div class="lane-head">
        <h2>Cast & Crew</h2>
        <span class="muted">${cast.length} people</span>
      </div>
      <div class="cast-carousel">
        ${cast
          .map(
            (person) => `
              <button class="cast-card" type="button" data-person-id="${person.id}">
                <div class="cast-avatar">${person.name.slice(0, 1)}</div>
                <div>
                  <div class="card-title">${person.name}</div>
                  <div class="card-meta">${person.role}</div>
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
  if (!details.matches?.length) return "";

  return `
    <section class="match-panel">
      <div class="lane-head">
        <h2>Card</h2>
        <span class="muted">${details.matches.length} matches</span>
      </div>
      <div class="match-list">
        ${details.matches
          .map(
            (match) => `
              <article class="match-row">
                <span>${match.order}</span>
                <div>
                  <strong>${escapeHtml(match.match)}</strong>
                  <p class="card-meta">${escapeHtml(match.stipulation)}${match.time ? ` / ${escapeHtml(match.time)}` : ""}</p>
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
    return {
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
      matches: wrestlingMetadata.spoilerSafeMatches ?? wrestlingMetadata.matches,
      mainEvent: getMainEvent(wrestlingMetadata.spoilerSafeMatches ?? wrestlingMetadata.matches),
      settings: seeded.settings ?? defaultSettings(item),
    };
  }

  if (item.mediaType === "wrestling") {
    return {
      ...seeded,
      summary:
        item.location || item.venue
          ? `${item.title} from ${[item.venue, item.location].filter(Boolean).join(", ")}.`
          : "Reference metadata imported from the wrestling database.",
      releaseDate: item.date,
      country: item.location ?? item.country ?? null,
      location: item.location ?? item.city ?? null,
      language: "English",
      directorLabel: "Promotion",
      director: item.promotionName,
      runtime: item.matches?.length ? `${item.matches.length} matches` : null,
      venue: item.venue,
      matches: item.matches,
      mainEvent: getMainEvent(item.matches),
      settings: seeded.settings ?? defaultSettings(item),
    };
  }

  return {
    summary: item.mediaType === "tv" ? "Series metadata will be hydrated from TVDB/TMDB." : "Movie metadata will be hydrated from TMDB.",
    releaseDate: item.year ?? item.years ?? item.date,
    country: item.country ?? item.promotionName,
    language: "Unknown",
    director: null,
    runtime: null,
    ...seeded,
    settings: seeded.settings ?? defaultSettings(item),
  };
}

function getMainEvent(matches = []) {
  const mainEvent = matches.at(-1)?.match;
  return mainEvent ? mainEvent.replace(/\s+/g, " ").trim() : null;
}

function getTitleItem(id) {
  const currentPromotion = state.promotionId ? getPromotion(state.promotionId) : null;
  const promotionEvents = currentPromotion ? getYearEvents(currentPromotion, state.selectedYear) : [];
  return (
    movies.find((item) => item.id === id) ??
    tvShows.find((item) => item.id === id) ??
    getHomeWrestlingItems().find((item) => item.id === id || item.metadataId === id) ??
    generatedWrestlingLibrary.find((item) => item.id === id || item.referenceId === id) ??
    promotionEvents.find((item) => item.id === id) ??
    null
  );
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

function renderLibraryHeader(title, subtitle, scopedSection = null) {
  return `
    <div class="section-heading">
      <div>
        <h1>${title}</h1>
        <p class="muted">${subtitle}</p>
      </div>
      ${scopedSection ? renderSubnav(scopedSection) : ""}
    </div>
  `;
}

function renderSubnav(section) {
  return `
    <div class="segmented" aria-label="${section} view">
      ${["home", "library", "collections"]
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
        <div class="card-title">${item.title}</div>
        <div class="card-meta">${meta}</div>
        <div class="progress-track"><span style="width:${item.watchProgress}%"></span></div>
        <div class="card-meta">${item.watchProgress}% watched</div>
      </div>
    </article>
  `;
}

function renderPosterShelf(title, items, kind, renderer = renderLibraryCard) {
  return `
    <section class="lane">
      <div class="lane-head">
        <h2>${title}</h2>
        <span class="muted">${items.length} ${items.length === 1 ? kind : `${kind}s`}</span>
      </div>
      <div class="carousel">
        ${items.map(renderer).join("") || `<div class="empty">No items match your search.</div>`}
      </div>
    </section>
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
    <article class="collection-card" style="--poster-a:${collection.posterA};--poster-b:${collection.posterB}">
      <div class="collection-pile">
        ${items.slice(0, 4).map((item) => renderPosterBlock(item, "mini-poster")).join("")}
      </div>
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
  return `
    <article class="media-card library-card ${item.status}" title="${escapeHtml(item.title)}" data-title-id="${item.id}">
      ${renderPosterBlock(item)}
      <div class="card-body">
        <div class="card-title">${item.title}</div>
        <div class="card-meta">${getItemMeta(item)}</div>
        <div class="tag-row">
          <span class="tag">${item.country}</span>
          <span class="tag ${item.status}">${formatStatus(item.status)}</span>
        </div>
      </div>
    </article>
  `;
}

function renderMixedCard(item) {
  if (item.mediaType === "tv") return renderTvCard(item);
  return renderLibraryCard(item);
}

function renderTvCard(show) {
  const progress =
    show.episodesTotal === null
      ? `${show.episodesAvailable} episodes`
      : `${show.episodesAvailable}/${show.episodesTotal} episodes`;

  return `
    <article class="media-card tv-card ${show.status}" data-title-id="${show.id}">
      ${renderPosterBlock(show)}
      <div class="card-body">
        <div class="card-title">${show.title}</div>
        <div class="card-meta">${show.years} / ${show.country}</div>
        <div class="tag-row">
          <span class="tag">${progress}</span>
          <span class="tag ${show.status}">${formatStatus(show.status)}</span>
        </div>
        ${show.episodes ? renderEpisodeChips(show.episodes) : ""}
      </div>
    </article>
  `;
}

function renderPosterBlock(item, extraClass = "") {
  const metadataRecord = getMetadataRecordForItem(item);
  const metadataArt = metadataRecord?.art;
  const wrestlingMetadata =
    wrestlingMetadataIndex[item.metadataId] ??
    wrestlingMetadataIndex[item.id] ??
    wrestlingMetadataIndex[metadataRecord?.id] ??
    wrestlingMetadataIndex[`${slugify(item.title)}-${item.year}`] ??
    wrestlingMetadataIndex[slugify(item.title)];
  const posterUrl =
    wrestlingMetadata?.posterUrl ??
    metadataArt?.posterUrl ??
    tmdbPosters[metadataRecord?.id]?.posterUrl ??
    tmdbPosters[item.id]?.posterUrl ??
    item.posterUrl;
  const image = posterUrl
    ? `<img src="${escapeHtml(posterUrl)}" alt="" loading="lazy" onerror="this.remove();this.parentElement.classList.add('poster-fallback')" />`
    : "";
  const missingClass = item.status === "missing-poster" ? "poster-missing" : "";
  const posterA = item.posterA ?? metadataArt?.colors?.[0] ?? "#202329";
  const posterB = item.posterB ?? metadataArt?.colors?.[1] ?? "#d8b35d";
  return `
    <div class="poster ${missingClass} ${extraClass}" style="--poster-a:${posterA};--poster-b:${posterB}">
      ${image}
      <div class="poster-code">${item.status === "missing-poster" ? "?" : item.posterCode}</div>
    </div>
  `;
}

function getMetadataRecordForItem(item) {
  const candidates = [
    item.metadataId,
    item.id,
    state.promotionId ? `wrestling-${state.promotionId}-${item.id}` : null,
    item.promotionName ? `wrestling-${item.promotionName.toLowerCase()}-${item.id}` : null,
  ].filter(Boolean);

  return candidates.map((id) => metadataIndex[id]).find(Boolean);
}

function getItemMeta(item) {
  if (item.mediaType === "movie") return `${item.year} / ${item.genre}`;
  if (item.mediaType === "tv") return item.years;
  return `${formatDisplayDate(item.date)} / ${item.promotionName ?? item.promotion}`;
}

function renderEpisodeChips(episodes) {
  return `
    <div class="episode-strip">
      ${episodes.map(([code, title]) => `<span title="${escapeHtml(title)}">${code}</span>`).join("")}
    </div>
  `;
}

function renderWrestlingHome() {
  const filtered = promotions.filter((promotion) =>
    promotion.name.toLowerCase().includes(state.query.toLowerCase()),
  );

  return `
    <div class="section-heading">
      <div>
        <h1>Wrestling</h1>
        <p class="muted">Promotions first, then shows, specials, and timeline browsing.</p>
      </div>
    </div>
    <div class="promotion-grid">
      ${filtered.map(renderPromotionCard).join("")}
    </div>
  `;
}

function renderPromotionCard(promotion) {
  const yearCount = new Set(promotion.ppvs.map((event) => event.year)).size;
  const showCount = promotion.shows.length;
  return `
    <button class="promotion-card" type="button" data-promotion="${promotion.id}">
      <div class="promotion-logo" style="--logo-a:${promotion.colors[0]};--logo-b:${promotion.colors[1]}">
        ${renderPromotionLogo(promotion)}
      </div>
      <div class="promotion-meta">
        <div class="promotion-name">${promotion.name}</div>
        <div class="promotion-stats">${showCount} shows / ${promotion.ppvs.length} events / ${yearCount || 0} years</div>
        <p class="muted">${promotion.summary}</p>
      </div>
    </button>
  `;
}

function renderPromotionDetail() {
  const promotion = getPromotion(state.promotionId);
  const events = getVisiblePromotionEvents(promotion, state.selectedYear);
  const filteredEvents = filterEvents(events);
  const specials = filterEvents(events.filter((event) => event.type !== "weekly"));

  return `
    <div class="hero">
      <div class="hero-copy">
        <button class="icon-button" type="button" data-action="back">Back</button>
        <h1>${promotion.name}</h1>
        <p class="muted">${promotion.summary}</p>
        ${renderToolbar(promotion)}
      </div>
      <div class="hero-logo" style="--logo-a:${promotion.colors[0]};--logo-b:${promotion.colors[1]}">
        ${renderPromotionLogo(promotion)}
      </div>
    </div>
    ${
      promotion.shows.length || promotion.ppvs.length
        ? state.view === "timeline"
          ? renderTimeline(filteredEvents)
          : renderOverview(promotion, specials)
        : renderPlaceholder(promotion)
    }
  `;
}

function renderPromotionLogo(promotion) {
  return `
    ${promotion.logoUrl ? `<img src="${escapeHtml(promotion.logoUrl)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}
    <span>${promotion.logo}</span>
  `;
}

function renderToolbar(promotion) {
  const promotionYears = getPromotionYears(promotion);
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
        <button type="button" data-view="timeline" class="${state.view === "timeline" ? "active" : ""}">By Year</button>
      </div>
    </div>
  `;
}

function renderOverview(promotion, specials) {
  return `
    <div class="layout-two promotion-overview">
      <div class="lane weekly-column">
        <div class="lane-head">
          <h2>Weekly Shows</h2>
          <span class="muted">Season ${state.selectedYear}</span>
        </div>
        ${getVisibleShowLanes(promotion, state.selectedYear).map((show) => renderShowLane(show)).join("")}
      </div>
      <aside class="lane events-column">
        <div class="lane-head">
          <h2>Events & Specials</h2>
          <span class="muted">${specials.length} items</span>
        </div>
        <div class="event-list">
          ${specials.map(renderEventRow).join("") || `<div class="empty">No specials found for this year.</div>`}
        </div>
      </aside>
    </div>
  `;
}

function renderShowLane(show) {
  const episodes = filterEvents(getVisibleShowEpisodes(show, state.selectedYear));
  return `
    <section class="lane">
      <div class="lane-head">
        <h3>${show.name}</h3>
        <span class="muted">${episodes.length} episodes</span>
      </div>
      <div class="carousel">
        ${episodes.slice(0, 24).map(renderMediaCard).join("") || `<div class="empty">No episodes in this year.</div>`}
      </div>
    </section>
  `;
}

function renderMediaCard(item) {
  return `
    <article class="media-card" data-title-id="${item.id}">
      ${renderPosterBlock(item)}
      <div class="card-body">
        <div class="card-title">${item.title}</div>
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
    <button class="event-row" type="button" data-title-id="${item.id}">
      ${renderPosterBlock(item, "event-thumb")}
      <div class="event-date">${formatShortDate(item.date)}</div>
      <div>
        <div class="event-name">${item.title}</div>
        <div class="card-meta">${item.eventLabel ?? item.metadataSource}</div>
      </div>
    </button>
  `;
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
  const name = item.type === "weekly" ? item.showName : item.title;
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
        <div class="event-name">${name}</div>
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
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => {
      state.section = button.dataset.section;
      state.promotionId = null;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      state.query = "";
      state.subView = "home";
      render();
    });
  });

  document.querySelectorAll("[data-subview]").forEach((button) => {
    button.addEventListener("click", () => {
      state.subView = button.dataset.subview;
      render();
    });
  });

  document.querySelectorAll("[data-promotion]").forEach((button) => {
    button.addEventListener("click", () => {
      state.promotionId = button.dataset.promotion;
      state.selectedTitleId = null;
      state.selectedPersonId = null;
      const promotion = getPromotion(state.promotionId);
      const promotionYears = getPromotionYears(promotion);
      if (!promotionYears.includes(state.selectedYear)) {
        state.selectedYear = promotionYears.at(-1);
      }
      state.view = "overview";
      render();
    });
  });

  document.querySelector("[data-action='back']")?.addEventListener("click", () => {
    state.promotionId = null;
    render();
  });

  document.querySelector("[data-action='back-title']")?.addEventListener("click", () => {
    state.selectedTitleId = null;
    state.selectedPersonId = null;
    render();
  });

  document.querySelector("[data-action='rescan']")?.addEventListener("click", async () => {
    await fetch("./api/metadata/rescan", { method: "POST" }).catch(() => null);
    await refreshMetadataStatus();
  });

  document.querySelector("[data-action='year']")?.addEventListener("change", (event) => {
    state.selectedYear = Number(event.target.value);
    render();
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      render();
    });
  });

  document.querySelectorAll("[data-title-id]").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedTitleId = card.dataset.titleId;
      state.selectedPersonId = null;
      render();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      state.selectedTitleId = card.dataset.titleId;
      state.selectedPersonId = null;
      render();
    });
  });

  document.querySelectorAll("[data-person-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPersonId = button.dataset.personId;
      render();
    });
  });

  document.querySelector(".search")?.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
    document.querySelector(".search")?.focus();
  });
}

async function refreshMetadataStatus() {
  const response = await fetch("./api/metadata/status", { cache: "no-store" }).catch(() => null);
  if (!response?.ok) return;

  const nextStatus = await response.json();
  const changed = JSON.stringify(nextStatus) !== JSON.stringify(metadataStatus);
  metadataStatus = nextStatus;
  if (changed) render();
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

function sortByDate(items) {
  return [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

function getCollectionItem(id) {
  return [...movies, ...tvShows].find((item) => item.id === id);
}

function slugify(value = "") {
  return value
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
  const generated = generatedWrestlingLibrary
    .filter((item) => item.promotionId === promotion.id && item.year === year)
    .map(libraryRecordToTimelineItem);
  const seeded = getYearEvents(promotion, year);
  if (!generated.length) return seeded;
  const seededSpecials = seeded.filter((event) => event.type !== "weekly");
  return [...generated, ...seededSpecials].sort((a, b) => a.date.localeCompare(b.date));
}

function getVisibleShowEpisodes(show, year) {
  const generated = generatedWrestlingLibrary
    .filter((item) => item.year === year && sameSeries(item.series, show.name))
    .map(libraryRecordToTimelineItem);
  return generated.length ? generated : getShowEpisodes(show, year);
}

function getVisibleShowLanes(promotion, year) {
  const seeded = [...promotion.shows];
  const seededNames = new Set(seeded.map((show) => slugify(show.name)));
  const seriesCounts = generatedWrestlingLibrary
    .filter((item) => item.promotionId === promotion.id && item.year === year)
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
  ];
}

function libraryRecordToTimelineItem(record) {
  return {
    ...record,
    showName: record.series ?? record.displayTitle ?? record.title,
    shortName: shortNameForSeries(record.series),
    type: "weekly",
    metadataSource: "Reference DB",
    eventLabel: record.eventType,
  };
}

function sameSeries(importedSeries = "", seededSeries = "") {
  const imported = slugify(importedSeries);
  const seeded = slugify(seededSeries);
  if (seeded.includes("raw")) return imported.includes("raw");
  if (seeded.includes("smackdown")) return imported.includes("smackdown");
  if (seeded.includes("heat")) return imported.includes("heat");
  if (seeded.includes("jakked")) return imported.includes("jakked");
  return imported === seeded;
}

function shortNameForSeries(series = "") {
  const normalized = series.toLowerCase();
  if (normalized.includes("smackdown")) return "SD";
  if (normalized.includes("heat")) return "HEAT";
  if (normalized.includes("jakked")) return "JAK";
  if (normalized.includes("metal")) return "MTL";
  if (normalized.includes("shotgun")) return "SSN";
  if (normalized.includes("super astros") || normalized.includes("súper astros")) return "AST";
  if (normalized.includes("superstars")) return "SST";
  if (normalized.includes("raw")) return "RAW";
  return buildPosterCode(series);
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
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
