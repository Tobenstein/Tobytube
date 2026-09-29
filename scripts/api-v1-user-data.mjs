import { randomUUID } from "node:crypto";

export function createUserDataState() { return { version: 1, users: {} }; }

export function getUserData(state, userId, now = Date.now()) {
  if (!userId) throw dataError("USER_REQUIRED", "userId is required", 400);
  state.users ??= {};
  state.users[userId] ??= { mixtapes: [], ratings: {}, progress: {}, activity: [], processedEventIds: [] };
  const data = state.users[userId];
  if (!data.mixtapes.some((tape) => tape.kind === "watch-later")) {
    data.mixtapes.unshift({ id: `${userId}-watch-later`, name: "Watch Later", kind: "watch-later", itemIds: [], version: 1, createdAt: iso(now), updatedAt: iso(now) });
  }
  return data;
}

export function listMixtapes(state, userId, now) { return getUserData(state, userId, now).mixtapes.map(publicMixtape); }

export function createMixtape(state, userId, name, now = Date.now()) {
  const cleanName = String(name ?? "").trim().slice(0, 80);
  if (!cleanName) throw dataError("INVALID_MIXTAPE", "A Mixtape name is required", 400);
  const data = getUserData(state, userId, now);
  const tape = { id: randomUUID(), name: cleanName, kind: "custom", itemIds: [], version: 1, createdAt: iso(now), updatedAt: iso(now) };
  data.mixtapes.push(tape);
  return publicMixtape(tape);
}

export function updateMixtape(state, userId, mixtapeId, patch, expectedVersion, now = Date.now()) {
  const tape = findMixtape(state, userId, mixtapeId, now);
  assertVersion(tape, expectedVersion);
  if (tape.kind === "watch-later" && patch?.name && patch.name !== "Watch Later") throw dataError("PROTECTED_MIXTAPE", "Watch Later cannot be renamed", 409);
  if (patch?.name !== undefined) {
    const name = String(patch.name).trim().slice(0, 80);
    if (!name) throw dataError("INVALID_MIXTAPE", "A Mixtape name is required", 400);
    tape.name = name;
  }
  if (patch?.itemIds !== undefined) tape.itemIds = uniqueIds(patch.itemIds);
  bump(tape, now);
  return publicMixtape(tape);
}

export function deleteMixtape(state, userId, mixtapeId, expectedVersion) {
  const data = getUserData(state, userId);
  const tape = findMixtape(state, userId, mixtapeId);
  assertVersion(tape, expectedVersion);
  if (tape.kind === "watch-later") throw dataError("PROTECTED_MIXTAPE", "Watch Later cannot be deleted", 409);
  data.mixtapes = data.mixtapes.filter((entry) => entry.id !== mixtapeId);
  return true;
}

export function setMixtapeItem(state, userId, mixtapeId, itemId, present, expectedVersion, now = Date.now()) {
  const tape = findMixtape(state, userId, mixtapeId, now);
  assertVersion(tape, expectedVersion);
  const id = String(itemId ?? "").trim();
  if (!id) throw dataError("ITEM_REQUIRED", "itemId is required", 400);
  const hasItem = tape.itemIds.includes(id);
  if (present && !hasItem) { tape.itemIds.push(id); bump(tape, now); }
  if (!present && hasItem) { tape.itemIds = tape.itemIds.filter((entry) => entry !== id); bump(tape, now); }
  return publicMixtape(tape);
}

export function setRating(state, userId, itemId, quarterStars, now = Date.now()) {
  if (!Number.isInteger(quarterStars) || quarterStars < 4 || quarterStars > 20) throw dataError("INVALID_RATING", "quarterStars must be an integer from 4 through 20", 400);
  const data = getUserData(state, userId, now);
  const rating = { itemId, quarterStars, ratedAt: iso(now) };
  data.ratings[itemId] = rating;
  appendActivity(data, { eventId: `rating:${itemId}:${quarterStars}:${now}`, type: "rating", itemId, occurredAt: iso(now), quarterStars });
  return { ...rating };
}

export function clearRating(state, userId, itemId) { const data = getUserData(state, userId); const existed = Boolean(data.ratings[itemId]); delete data.ratings[itemId]; return existed; }

export function setProgress(state, userId, input, now = Date.now()) {
  const eventId = String(input?.eventId ?? "").trim();
  const itemId = String(input?.itemId ?? "").trim();
  if (!eventId || !itemId) throw dataError("INVALID_PROGRESS", "eventId and itemId are required", 400);
  const data = getUserData(state, userId, now);
  if (data.processedEventIds.includes(eventId)) return { ...data.progress[itemId], duplicate: true };
  const seconds = Math.max(0, Math.floor(Number(input.seconds) || 0));
  const durationSeconds = Math.max(seconds, Math.floor(Number(input.durationSeconds) || 0));
  const completed = Boolean(data.progress[itemId]?.completed || input.completed || (durationSeconds && seconds >= durationSeconds - 5));
  const progress = { itemId, seconds, durationSeconds, completed, updatedAt: iso(now), eventId };
  data.progress[itemId] = progress;
  appendActivity(data, { eventId, type: completed ? "complete" : input.type ?? "progress", itemId, occurredAt: iso(now), seconds, durationSeconds });
  rememberEvent(data, eventId);
  return { ...progress, duplicate: false };
}

export function recentActivity(state, userId, limit = 50) { return getUserData(state, userId).activity.slice(0, Math.max(1, Math.min(100, Number(limit) || 50))).map((entry) => ({ ...entry })); }

function findMixtape(state, userId, mixtapeId, now) { const tape = getUserData(state, userId, now).mixtapes.find((entry) => entry.id === mixtapeId); if (!tape) throw dataError("MIXTAPE_NOT_FOUND", "Mixtape not found", 404); return tape; }
function assertVersion(tape, expected) { if (Number(expected) !== tape.version) throw dataError("VERSION_CONFLICT", "The Mixtape changed on another device", 409, { current: publicMixtape(tape) }); }
function bump(tape, now) { tape.version += 1; tape.updatedAt = iso(now); }
function uniqueIds(values) { return [...new Set((Array.isArray(values) ? values : []).map((id) => String(id).trim()).filter(Boolean))].slice(0, 1000); }
function publicMixtape(tape) { return { ...tape, itemIds: [...tape.itemIds] }; }
function appendActivity(data, event) { data.activity = [event, ...data.activity.filter((entry) => entry.eventId !== event.eventId)].slice(0, 2000); }
function rememberEvent(data, eventId) { data.processedEventIds = [eventId, ...data.processedEventIds.filter((id) => id !== eventId)].slice(0, 5000); }
function iso(now) { return new Date(now).toISOString(); }
function dataError(code, message, statusCode, details) { const error = new Error(message); error.code = code; error.statusCode = statusCode; error.details = details; return error; }
