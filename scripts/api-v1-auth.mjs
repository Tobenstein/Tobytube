import { createHash, randomBytes, randomInt, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAIRING_TTL_MS = 10 * 60 * 1000;
const SCRYPT_OPTIONS = Object.freeze({ cost: 32768, blockSize: 8, parallelization: 1, maxmem: 64 * 1024 * 1024 });

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 1024) throw new Error("Password must contain 12 to 1024 characters.");
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, 32, SCRYPT_OPTIONS);
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] = String(encoded).split("$");
    if (algorithm !== "scrypt") return false;
    const expected = Buffer.from(hashValue, "base64url");
    const actual = Buffer.from(await scrypt(String(password).normalize("NFKC"), Buffer.from(saltValue, "base64url"), expected.length, {
      cost: Number(cost), blockSize: Number(blockSize), parallelization: Number(parallelization), maxmem: 64 * 1024 * 1024,
    }));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function hashSecret(secret) {
  return createHash("sha256").update(String(secret)).digest("base64url");
}

export function createAuthState() {
  return { version: 1, pairingCodes: [], sessions: [], credentials: {} };
}

export function createPairingCode(state, userId, now = Date.now()) {
  if (!userId) throw new Error("userId is required");
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const pairing = { id: randomUUID(), userId, codeHash: hashSecret(code), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + PAIRING_TTL_MS).toISOString(), attemptsRemaining: 5, consumedAt: null };
  state.pairingCodes = [...state.pairingCodes.filter((entry) => Date.parse(entry.expiresAt) > now && !entry.consumedAt), pairing];
  return { code, pairing: publicPairing(pairing) };
}

export function claimPairingCode(state, { code, deviceName, platform = "android" }, now = Date.now()) {
  const codeHash = hashSecret(String(code ?? ""));
  const pairing = state.pairingCodes.find((entry) => !entry.consumedAt && Date.parse(entry.expiresAt) > now && safeHashEqual(entry.codeHash, codeHash));
  if (!pairing) return null;
  if (!String(deviceName ?? "").trim()) throw new Error("deviceName is required");
  pairing.consumedAt = new Date(now).toISOString();
  return createSession(state, { userId: pairing.userId, deviceName: String(deviceName).trim().slice(0, 100), platform }, now);
}

export function rotateRefreshToken(state, refreshToken, now = Date.now()) {
  const tokenHash = hashSecret(refreshToken);
  const current = state.sessions.find((session) => !session.revokedAt && Date.parse(session.refreshExpiresAt) > now && safeHashEqual(session.refreshTokenHash, tokenHash));
  if (!current) return null;
  current.revokedAt = new Date(now).toISOString();
  current.replacedBy = "rotation";
  return createSession(state, { userId: current.userId, deviceId: current.deviceId, deviceName: current.deviceName, platform: current.platform }, now);
}

export function authenticateAccessToken(state, accessToken, now = Date.now()) {
  const tokenHash = hashSecret(accessToken);
  const session = state.sessions.find((entry) => !entry.revokedAt && Date.parse(entry.accessExpiresAt) > now && safeHashEqual(entry.accessTokenHash, tokenHash));
  return session ? publicSession(session) : null;
}

export function revokeSession(state, sessionId, now = Date.now()) {
  const session = state.sessions.find((entry) => entry.id === sessionId && !entry.revokedAt);
  if (!session) return false;
  session.revokedAt = new Date(now).toISOString();
  return true;
}

export function createAttemptLimiter({ maximum = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map();
  return {
    allow(key, now = Date.now()) {
      const recent = (attempts.get(key) ?? []).filter((time) => now - time < windowMs);
      attempts.set(key, recent);
      return recent.length < maximum;
    },
    recordFailure(key, now = Date.now()) { attempts.set(key, [...(attempts.get(key) ?? []).filter((time) => now - time < windowMs), now]); },
    clear(key) { attempts.delete(key); },
  };
}

function createSession(state, identity, now) {
  const accessToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(48).toString("base64url");
  const session = {
    id: randomUUID(), userId: identity.userId, deviceId: identity.deviceId ?? randomUUID(), deviceName: identity.deviceName, platform: identity.platform,
    accessTokenHash: hashSecret(accessToken), refreshTokenHash: hashSecret(refreshToken), createdAt: new Date(now).toISOString(), lastActiveAt: new Date(now).toISOString(),
    accessExpiresAt: new Date(now + ACCESS_TTL_MS).toISOString(), refreshExpiresAt: new Date(now + REFRESH_TTL_MS).toISOString(), revokedAt: null,
  };
  state.sessions.push(session);
  return { accessToken, refreshToken, session: publicSession(session) };
}

function publicSession(session) {
  return { id: session.id, userId: session.userId, deviceId: session.deviceId, deviceName: session.deviceName, platform: session.platform, createdAt: session.createdAt, lastActiveAt: session.lastActiveAt, accessExpiresAt: session.accessExpiresAt, refreshExpiresAt: session.refreshExpiresAt };
}

function publicPairing(pairing) { return { id: pairing.id, userId: pairing.userId, createdAt: pairing.createdAt, expiresAt: pairing.expiresAt }; }
function safeHashEqual(left, right) { const a = Buffer.from(String(left)); const b = Buffer.from(String(right)); return a.length === b.length && timingSafeEqual(a, b); }
