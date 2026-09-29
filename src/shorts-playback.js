export const SHORT_PLAYBACK_SEQUENTIAL = "sequential";
export const SHORT_PLAYBACK_RANDOM_POOL = "random-pool";

export function getNextSequentialShortId(shortIds, currentId) {
  if (!Array.isArray(shortIds) || !shortIds.length) return null;
  const index = shortIds.indexOf(currentId);
  return index >= 0 && index < shortIds.length - 1 ? shortIds[index + 1] : null;
}

export function selectRandomShortId(shortIds, currentId = null, random = Math.random) {
  const uniqueIds = [...new Set((shortIds ?? []).filter(Boolean))];
  if (!uniqueIds.length) return null;
  const alternatives = uniqueIds.length > 1 ? uniqueIds.filter((id) => id !== currentId) : uniqueIds;
  const roll = Number(random());
  const normalized = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.9999999999999999) : 0;
  return alternatives[Math.floor(normalized * alternatives.length)] ?? alternatives[0] ?? null;
}
