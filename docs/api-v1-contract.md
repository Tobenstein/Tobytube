# Tobytube Streaming Client API v1

Status: `1.0.0-preview.1` contract preview.

This API is additive. It is mounted at `/api/v1` beside the Control Centre's legacy local-web endpoints. Phase 1 work must not redirect, rename, or reinterpret existing scanner, matcher, collection, metadata, or playback routes.

## Available now

- `GET /api/v1`
- `GET /api/v1/capabilities`
- `GET /api/v1/contract`

Every response uses one of these envelopes:

```json
{ "ok": true, "apiVersion": "1.0.0-preview.1", "data": {}, "meta": {} }
```

```json
{ "ok": false, "apiVersion": "1.0.0-preview.1", "error": { "code": "CODE", "message": "Explanation" } }
```

Declared but unfinished routes return HTTP 501 with `NOT_IMPLEMENTED`. Clients must use capability negotiation and must not assume that a route is active merely because it appears in the contract.

## Compatibility rules

- Existing fields will not change meaning inside API v1.
- New optional fields and capability flags may be added without changing the major version.
- Removing a field, changing its type/meaning, or changing authorization semantics requires a new major version.
- All resource IDs are opaque, stable strings. Clients must not parse IDs for business meaning.
- All dates are RFC 3339 UTC timestamps.
- Lists use opaque cursor pagination.
- Ratings are integer quarter-stars: 4–20 maps to 1.00–5.00 display stars.
- Mutating endpoints will support idempotency and/or resource versions before they become available.

## Security invariants

- Authorization is evaluated by the server before serialization.
- Failure to authenticate or evaluate policy denies access.
- Filtered objects cannot be recovered from search, rows, details, artwork, recommendations, TV Guide, or playback URLs.
- Client payloads never contain physical paths, provider credentials, password hashes, administrative metadata, or reusable media-server secrets.
- A client receives expiring playback decisions rather than direct access to `M:`, `T:`, or `W:`.
- Capability flags remain false until implementation and authorization tests pass.

The executable source of truth is `scripts/api-v1-contract.mjs`; `npm run test:api-v1` validates versioning, route uniqueness, envelopes, rating representation, capability honesty, and sensitive-data leakage examples.
