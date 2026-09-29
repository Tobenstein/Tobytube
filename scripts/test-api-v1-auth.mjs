import assert from "node:assert/strict";
import { authenticateAccessToken, claimPairingCode, createAttemptLimiter, createAuthState, createPairingCode, hashPassword, hashSecret, revokeSession, rotateRefreshToken, verifyPassword } from "./api-v1-auth.mjs";

const passwordHash = await hashPassword("correct horse battery staple");
assert.match(passwordHash, /^scrypt\$32768\$8\$1\$/);
assert.equal(await verifyPassword("correct horse battery staple", passwordHash), true);
assert.equal(await verifyPassword("incorrect password", passwordHash), false);
assert.equal(passwordHash.includes("correct horse"), false);

const now = Date.parse("2026-08-20T12:00:00Z");
const state = createAuthState();
const issuedPairing = createPairingCode(state, "viewer", now);
assert.match(issuedPairing.code, /^\d{8}$/);
assert.equal(JSON.stringify(state).includes(issuedPairing.code), false, "pairing codes must be stored only as hashes");
assert.equal(claimPairingCode(state, { code: "00000000", deviceName: "Wrong" }, now), null);

const claimed = claimPairingCode(state, { code: issuedPairing.code, deviceName: "Pixel Test" }, now);
assert.equal(claimed.session.userId, "viewer");
assert.equal(JSON.stringify(state).includes(claimed.accessToken), false, "access tokens must not be stored raw");
assert.equal(JSON.stringify(state).includes(claimed.refreshToken), false, "refresh tokens must not be stored raw");
assert.equal(claimPairingCode(state, { code: issuedPairing.code, deviceName: "Replay" }, now), null, "pairing codes are one-use");
assert.equal(authenticateAccessToken(state, claimed.accessToken, now)?.deviceName, "Pixel Test");
assert.equal(authenticateAccessToken(state, claimed.accessToken, now + (16 * 60 * 1000)), null, "access tokens expire");

const rotated = rotateRefreshToken(state, claimed.refreshToken, now + 1000);
assert.ok(rotated?.accessToken);
assert.equal(rotateRefreshToken(state, claimed.refreshToken, now + 2000), null, "refresh tokens rotate once");
assert.equal(authenticateAccessToken(state, rotated.accessToken, now + 2000)?.userId, "viewer");
assert.equal(revokeSession(state, rotated.session.id, now + 3000), true);
assert.equal(authenticateAccessToken(state, rotated.accessToken, now + 4000), null);

const expired = createPairingCode(state, "viewer", now);
assert.equal(claimPairingCode(state, { code: expired.code, deviceName: "Late" }, now + (11 * 60 * 1000)), null);
assert.equal(hashSecret("secret"), hashSecret("secret"));

const limiter = createAttemptLimiter({ maximum: 2, windowMs: 1000 });
assert.equal(limiter.allow("client", now), true);
limiter.recordFailure("client", now);
limiter.recordFailure("client", now + 1);
assert.equal(limiter.allow("client", now + 2), false);
assert.equal(limiter.allow("client", now + 1001), true);

console.log("api v1 auth core ok (password, pairing, rotation, expiry, revocation, throttle)");
