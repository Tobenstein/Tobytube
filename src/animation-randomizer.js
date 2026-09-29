export const ANIMATION_TV_EPISODES_PER_MOVIE = 10;

export function getNextAnimationMediaKind(session = {}, availability = {}) {
  const tvCount = Math.max(0, Number(availability.tvCount) || 0);
  const movieCount = Math.max(0, Number(availability.movieCount) || 0);
  if (!tvCount) return null;
  if (
    session.moviesEnabled &&
    movieCount > 0 &&
    Number(session.tvEpisodesSinceMovie) >= ANIMATION_TV_EPISODES_PER_MOVIE
  ) return "movie";
  return "tv";
}

export function selectAnimationRandomCandidate(entries, recentKeys = [], random = Math.random) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const recent = new Set(recentKeys ?? []);
  const fresh = entries.filter((entry) => !recent.has(entry?.key));
  const candidates = fresh.length ? fresh : entries;
  const roll = Number(random());
  const normalized = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.9999999999999999) : 0;
  return candidates[Math.floor(normalized * candidates.length)] ?? candidates[0] ?? null;
}

export function appendAnimationRandomHistory(session, entry) {
  if (!session || !entry) return null;
  const history = Array.isArray(session.history) ? session.history : [];
  const currentIndex = Number.isInteger(session.historyIndex) ? session.historyIndex : history.length - 1;
  session.history = [...history.slice(0, currentIndex + 1), entry];
  session.historyIndex = session.history.length - 1;
  return entry;
}

export function moveAnimationRandomHistory(session, offset) {
  if (!session || !Array.isArray(session.history) || !session.history.length) return null;
  const currentIndex = Number.isInteger(session.historyIndex) ? session.historyIndex : session.history.length - 1;
  const targetIndex = currentIndex + Number(offset || 0);
  if (targetIndex < 0 || targetIndex >= session.history.length) return null;
  session.historyIndex = targetIndex;
  return session.history[targetIndex] ?? null;
}
