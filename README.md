# Framed 2.0

A daily guess-the-movie-from-a-frame game, served at https://framed.russellland.dev. Frames are pulled
straight from a local movie library.

- **Daily**: one movie a day (midnight America/New_York), six frames, six guesses.
- **Endless**: random movies, unlocked once the daily is finished. Never a scheduled daily.
- **Accounts**: email-only sign-in links; optional morning email over SMTP.
- **Admin** (`/admin`): ingest status, per-movie frame curation, the schedule, users.

## How frames are made

`src/lib/server/library.ts` scans `FRAMED_MOVIES_DIR` (one folder per movie,
`Title (Year) {imdb-tt…}`) every `FRAMED_SCAN_MINUTES`. Each new title is processed in the
background: ffprobe, letterbox detection (`cropdetect` at several points, union of the boxes),
then `FRAMED_CANDIDATES` frames spread across 8–90% of the runtime (skipping logos and credits),
HDR tone-mapped when tagged, scored with sharp (`media.ts`), and stored as WebP under
`FRAMED_FRAMES_DIR/<title id>/<token>.webp`. The best frame from each sixth of the film fills
positions 1–6. Admins can reorder, swap, grab a frame at an exact time, or reprocess.

Removed folders are marked `missing` (never deleted, so past puzzles keep their frames). A scan
that sees far fewer folders than expected (library not mounted) marks nothing missing.

## Running

Needs Node 24+, PostgreSQL, ffmpeg (with zscale for HDR), and an SMTP server that accepts mail
from the app. The app creates and migrates its tables on startup (`src/lib/server/db.ts`); give
it an empty database and a role that owns it.

**Local dev:** copy `.env.example` to `.env`, fill it in (see `src/lib/server/config.ts` for every
variable), and `npm run dev`. Set `FRAMED_INGEST=off` and `FRAMED_EMAIL=off` if another instance
is already doing that work against the same database.

**Docker:** `docker build -t framed .` and run it with your env file, the movie library mounted
read-only at `FRAMED_MOVIES_DIR`, and a persistent volume at `FRAMED_FRAMES_DIR` (`/data/frames`
by default). It listens on port 3000; put it behind a reverse proxy for HTTPS and set
`ADDRESS_HEADER` (e.g. `X-Real-IP`) so the sign-in rate limit sees real client IPs.

## License

[MIT](LICENSE) © 2026 russellland.dev. The code is open source; movie frames and metadata are not
part of this repository and belong to their respective rights holders.
