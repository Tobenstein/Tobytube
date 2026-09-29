# API v1 Android Playback Contract

Stage 5 introduces a playback decision model without changing the Control Centre web player.

An authenticated Android client will submit its supported video/audio codecs and HLS capability. After account-policy evaluation, the server chooses:

- progressive direct delivery for supported MP4/M4V/MOV/WebM/Matroska combinations;
- HLS compatibility conversion when a codec is unsupported and HLS is available;
- fragmented MP4 conversion as the final fallback.

The client receives an opaque, 15-minute playback decision containing session ID, API URL, protocol, MIME type, expiry, duration, resume position, seekability, delivery mode, and safe audio/video/subtitle track descriptors. It never receives a drive path.

Playback sessions are bound to both user and device. A valid token from another device cannot reuse the playback session; denials use a generic not-available response.

Media3 supports progressive MP4, WebM, and Matroska plus HLS, while actual sample decoding depends on the device. Track selection is therefore represented as safe track metadata and client capabilities rather than server assumptions. See:

- https://developer.android.com/media/media3/exoplayer/supported-formats
- https://developer.android.com/media/media3/exoplayer/track-selection
- https://developer.android.com/media/media3/exoplayer/network-stacks

The negotiation core is implemented and tested, but `/api/v1/playback/sessions` remains disabled until a safe catalogue projection can resolve an opaque item ID to internal media and pass complete access context into the policy evaluator. The current Control Centre playback endpoints are unchanged.
