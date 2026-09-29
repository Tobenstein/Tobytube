# API v1 Authentication and Device Pairing

Status: server-side security core and loopback pairing/session endpoints implemented. The server remains bound to `127.0.0.1`; LAN exposure is intentionally disabled.

## Implemented

- Password hashing/verification primitive using asynchronous scrypt, unique 16-byte salts, and encoded cost parameters.
- Eight-digit, ten-minute, one-use pairing codes stored only as SHA-256 hashes.
- Random opaque access tokens (15 minutes) and refresh tokens (30 days), stored only as hashes.
- Refresh-token rotation: the token used for rotation is immediately revoked and cannot be replayed.
- Per-device session identity, expiry, logout/revocation, disabled-user checks, and generic authentication failures.
- In-memory attempt throttling for pairing and refresh failures.
- Local-only pairing-code creation, verified through `request.socket.remoteAddress`.

Available after a server restart:

- `POST /api/v1/admin/pairing-codes` — loopback only; body `{ "userId": "..." }`.
- `POST /api/v1/pairing/claim` — body `{ "code": "12345678", "deviceName": "Pixel", "platform": "android" }`.
- `POST /api/v1/auth/refresh` — rotates a refresh token.
- `GET /api/v1/auth/me` — validates a Bearer access token.
- `POST /api/v1/auth/logout` — revokes the current Bearer session.

Raw codes and tokens appear only in the one response that issues them. `config/api-v1-auth.json` contains hashes and session metadata, never reusable plaintext secrets. `config/users.json` remains free of password hashes and tokens, so existing Batcave user responses cannot expose credentials.

## Deliberately not enabled

- LAN binding or internet access;
- password-login endpoint or password enrollment UI;
- Batcave pairing-code/device-revocation UI;
- proxy-header trust;
- authenticated catalogue or playback.

Before LAN binding, add persistent/cross-process rate limiting, Batcave device management, TLS/private-network configuration, backup handling for credential state, and end-to-end HTTP tests. Never trust `X-Forwarded-For` until a specific trusted reverse proxy is configured.

The implementation follows Node's documented asynchronous `crypto.scrypt`, cryptographically secure random generation, and `timingSafeEqual` primitives: https://nodejs.org/api/crypto.html. Loopback enforcement uses the raw socket exposed as `request.socket`: https://nodejs.org/api/http.html.
