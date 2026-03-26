# cr8

A self-hosted music request platform. Users search for music and submit requests, the server handles downloading and library ingestion automatically. Similar in concept to Jellyseerr/Overseerr but for music.

---

## Concept

Users are invited via a token link, register an account, and can search for tracks or albums using MusicBrainz. Requests are queued and require admin approval before any download is triggered. Once approved, the backend searches slskd, selects the best file match, downloads it, and drops it into a watched folder for beets to import into Navidrome.

---

## Stack

- **Frontend**: React
- **Backend**: Node.js with Fastify
- **Database**: SQLite via Prisma ORM
- **Deployment**: Docker + docker-compose

---

## Integrations

### MusicBrainz

- Free, open, no API key required
- Search recordings, releases, artists by name — returns MBIDs
- Lookup by MBID returns full metadata: title, artist credits, ISRC, release info, duration
- Cover art via Cover Art Archive (same MBID)
- Rate limit: 1 req/sec unauthenticated — frontend must debounce search input
- Base URL: `https://musicbrainz.org/ws/2/`
- All responses available as JSON (`fmt=json`)

### slskd

- API key authenticated via `X-API-Key` header
- Full download flow is confirmed workable (see reference implementation):
    1. `POST /api/v0/searches` with `{"searchText": "artist - title"}` — returns search ID
    2. Poll `GET /api/v0/searches/{id}` until `isComplete: true`
    3. `GET /api/v0/searches/{id}/responses` — returns file results per user
    4. Filter results by extension, bitrate, bitdepth, filename match, duration match
    5. `POST /api/v0/transfers/downloads/{username}` with `[{filename, size}]` — queues download
    6. Poll `GET /api/v0/transfers/downloads` — monitor progress by matching username + filename
    7. `DELETE /api/v0/searches/{id}` — clean up search when done
    8. `DELETE /api/v0/transfers/downloads/{username}/{id}?remove=false` then `?remove=true` — clean up download record
- File selection criteria: preferred extensions ranked in order, minimum bitrate, minimum bit depth, filename must contain artist + title, duration within 10 seconds of expected

### Navidrome

- Navidrome auto-monitors its library folder for new files
- cr8 drops completed downloads into a folder beets watches; beets imports/tags and moves files into the Navidrome library folder
- Navidrome native API (`/api/*`) can be used to check library for duplicates via search — authenticate with `POST /auth/login`, use JWT in `X-ND-Authorization: Bearer TOKEN` header
- Native API is undocumented and unstable — use only for duplicate checking, not for auth or user management
- Subsonic API (`/rest/*`) is stable (v1.16.1) — `search3` endpoint usable for checking if a track already exists in the library

---

## Auth

cr8 manages its own user accounts in SQLite, independent of Navidrome.

- Admin generates invite tokens with optional expiry
- Users register via invite link: pick username + password, token is consumed
- Roles: `admin`, `user`
- No open registration
- Navidrome account creation out of scope for now

---

## Request Lifecycle

```
pending -> approved -> searching -> downloading -> complete
                \-> rejected
                                \-> failed
```

- `pending`: submitted by user, awaiting admin action
- `approved`: admin approved, queued for slskd
- `rejected`: admin rejected, visible to user with optional reason
- `searching`: slskd search in progress
- `downloading`: file queued/downloading in slskd
- `complete`: file landed in download dir
- `failed`: slskd search or download failed

---

## Duplicate Handling

On submission, cr8 checks:

1. Existing requests table — if same MBID already exists, show that request's status instead of creating a new one ("already requested")
2. Navidrome library via Subsonic `search3` — if track already in library, block submission and show "already in library"

Duplicates are surfaced to the user, not silently dropped.

---

## Database Schema (Prisma)

```prisma
model User {
  id        String    @id @default(cuid())
  username  String    @unique
  password  String
  role      Role      @default(USER)
  requests  Request[]
  createdAt DateTime  @default(now())
}

model Invite {
  id        String    @id @default(cuid())
  token     String    @unique
  createdBy String
  usedBy    String?
  expiresAt DateTime?
  usedAt    DateTime?
}

model Request {
  id               String   @id @default(cuid())
  mbid             String
  title            String
  artist           String
  album            String?
  type             RequestType @default(TRACK)
  status           Status   @default(PENDING)
  rejectedReason   String?
  slskdSearchId    String?
  slskdUsername    String?
  slskdFilename    String?
  user             User     @relation(fields: [userId], references: [id])
  userId           String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

enum Role {
  ADMIN
  USER
}

enum Status {
  PENDING
  APPROVED
  REJECTED
  SEARCHING
  DOWNLOADING
  COMPLETE
  FAILED
}

enum RequestType {
  TRACK
  ALBUM
}
```

---

## Key Open Questions

- Beets import is out of scope for now — need to decide later how cr8 knows a download is fully imported into Navidrome vs just sitting in the download dir
- Per-user request rate limiting — not designed yet, worth adding before any public invite use
- Navidrome user provisioning — deferred, cr8 auth is standalone for now
