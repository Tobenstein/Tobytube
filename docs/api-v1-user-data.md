# API v1 User Data

Stage 4 stores each authenticated user's Watch Later tape, custom Mixtapes, exact quarter-star ratings, playback progress, and basic activity separately from the Control Centre catalogue.

- Watch Later is created automatically and cannot be renamed or deleted.
- Custom Mixtapes support creation, rename/reorder, deletion, and idempotent item add/remove.
- Mixtape mutations require the current integer `version`; stale devices receive HTTP 409 with the current representation.
- Ratings use integer `quarterStars` from 4 through 20.
- Progress writes require a client-generated `eventId`. Retrying an event does not duplicate or rewrite history.
- Stores are keyed by the authenticated session's user ID; clients cannot submit another user ID.
- All routes require a valid Bearer access token and an enabled account.

Persistent state is stored in `config/api-v1-user-data.json`. Phase 2 diary/Profile/Year in Review may consume this normalized data later, but those experiences are not part of Stage 4.
