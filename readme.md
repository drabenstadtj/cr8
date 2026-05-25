# cr8

A self-hosted music acquisition and streaming system.

---

## Overview

cr8 has two main systems:

1. **The Request Pipeline** — users search for music, request it, and it gets downloaded
2. **The ListenBrainz Flow** — an automated weekly job that fetches personal music recommendations, downloads them, and populates a playlist

---

## External Services

| Service | Role |
|---|---|
| **MusicBrainz** | Music metadata and search — source of MBIDs |
| **Soulseek (slskd)** | P2P file search and download |
| **ListenBrainz** | Weekly personalised music recommendations |
| **Gonic** | Music server — library, streaming, playlists, user accounts, Last.fm |
| **Betanin** | Runs beets to tag and organise downloaded files into the library |

---

## Data Entities

### User
- `username`, `password`, `role` (USER or ADMIN)
- `listenbrainzUsername` — optional, links to ListenBrainz for the weekly flow

### Invite
- One-time token required to register
- Can have an optional expiry date
- Tracks who created it and who used it

### Request
The core unit of work — one piece of music to be downloaded.

| Field | Purpose |
|---|---|
| `mbid` | MusicBrainz ID identifying the music |
| `title`, `artist`, `album` | Metadata |
| `type` | TRACK or ALBUM |
| `status` | Current state in the pipeline |
| `rejectedReason` | Set by admin when rejecting |
| `slskdSearchId` | Soulseek search ID during the search phase |
| `slskdUsername` | Soulseek peer being downloaded from |
| `slskdFilename` | File path (tracks) or directory path (albums) |
| `downloadRetries` | Number of retry attempts so far |
| `lbTrackTitles` | JSON array of LB tracks that triggered this request |
| `coverArt` | URL from coverartarchive.org |

---

## System 1 — The Request Pipeline

### Request Lifecycle

```
PENDING → APPROVED → SEARCHING → DOWNLOADING → COMPLETE
        ↘ REJECTED              ↘ FAILED
```

FAILED requests are automatically reset to APPROVED and retried up to 3 times before staying FAILED.

Admin users skip PENDING and go straight to APPROVED on submission.

### Stages

**PENDING**
A user has submitted a request. It waits for admin approval.

**APPROVED**
Admin has approved the request. The download worker picks it up on its next poll (every 15 seconds).

**SEARCHING**
The worker constructs a search query and sends it to Soulseek:
- TRACK: `Artist - Title`
- ALBUM: `Artist Album`

It polls until the search completes, then scores the results. Files are ranked by format (FLAC > MP3 > OGG > M4A), bitrate, and whether the peer has a free upload slot. Albums are grouped by directory and ranked by file count, format quality, and bitrate.

**DOWNLOADING**
The best candidate has been queued in Soulseek. The worker polls the download state every 15 seconds.

For albums, all files in the directory are tracked together. If individual files fail, they are requeued from the same peer. If all files are rejected by the peer, or retries are exhausted, the request resets to APPROVED for a fresh search.

**COMPLETE**
All files have downloaded successfully. Three things happen:
1. Betanin is triggered to import and tag the files
2. Gonic rescans the library to index the new files
3. If the request came from the ListenBrainz flow, the relevant tracks are added to the weekly playlist

**FAILED**
The search found no suitable candidates. The request stays FAILED until manually retried or deleted.

### Search Filtering

Soulseek results are filtered before ranking:
- Only FLAC, MP3, OGG, M4A files are considered
- Minimum bitrate of 192 kbps
- Files containing blacklisted keywords (karaoke, instrumental, acappella, cover, bootleg, tribute, live) are rejected unless those words appear in the track title or artist name
- Duration must be within ±10 seconds of the known duration (when available)
- Albums must have at least 2 files and no duplicate track numbers

---

## System 2 — The ListenBrainz Flow

### Purpose

Every week, fetch each user's ListenBrainz recommendations, download any music not already in the library, and add the tracks to a shared weekly playlist in Gonic.

### Schedule

Runs automatically every **Monday at 08:30** (ListenBrainz generates weekly playlists around 08:00 UTC Monday).

Can also be triggered manually from the admin panel.

### Flow

1. Fetch each user's `weekly-exploration` playlist from ListenBrainz
2. Group tracks by album — each unique album becomes one ALBUM Request
3. Skip albums already in the Gonic library or already requested
4. Create the Request with status APPROVED, storing the specific LB tracks in `lbTrackTitles`
5. The request enters the normal download pipeline
6. When the download completes, the tracks in `lbTrackTitles` are searched for in Gonic and added to the weekly playlist

### Weekly Playlist

- Lives in Gonic, not in the cr8 database
- Named `Weekly Exploration YYYY-Www` (ISO week number)
- A new playlist is created each week
- Tracks are added as downloads complete throughout the week
- The playlist is public — all users see it in their music client

---

## API

### Auth (`/api/auth`)
| Method | Path | Description |
|---|---|---|
| POST | `/register` | Register with an invite token |
| POST | `/login` | Log in, receive JWT |
| GET | `/me` | Current user profile |
| PATCH | `/me` | Update ListenBrainz username |

### Search (`/api/search`)
| Method | Path | Description |
|---|---|---|
| GET | `/recordings` | Search tracks on MusicBrainz |
| GET | `/releases` | Search albums on MusicBrainz |
| GET | `/artists` | Search artists on MusicBrainz |
| GET | `/all` | Combined search across all three |
| GET | `/artist/:mbid/releases` | Browse an artist's releases |
| GET | `/lookup/:mbid` | Look up a specific MBID |

Search results are annotated with whether the music is already in the Gonic library.

### Requests (`/api/requests`)
| Method | Path | Description |
|---|---|---|
| POST | `/` | Submit a request |
| GET | `/` | Current user's requests |
| GET | `/activity` | Last 30 requests across all users |
| GET | `/stats` | Request counts by status |
| GET | `/:id` | Single request |
| GET | `/:id/listen` | Resolve Gonic playback URL |

### Admin (`/api/admin`)
| Method | Path | Description |
|---|---|---|
| GET | `/requests` | All requests with user info |
| PATCH | `/requests/:id` | Approve or reject a request |
| DELETE | `/requests/:id` | Delete a request |
| DELETE | `/requests` | Clear all requests |
| POST | `/invites` | Generate an invite token |
| GET | `/invites` | List all invites |
| DELETE | `/invites/:id` | Revoke an invite |
| GET | `/users` | List all users |
| DELETE | `/users/:id` | Delete a user |
| POST | `/exploration/run` | Manually trigger the LB exploration |
| POST | `/playlist/rebuild` | Rebuild the weekly playlist from LB |

### Last.fm (`/api/lastfm`)
| Method | Path | Description |
|---|---|---|
| GET | `/status` | Check if Last.fm is linked |
| POST | `/link` | Link Last.fm via token |
| DELETE | `/link` | Unlink Last.fm |

---

## Auth

- Invite-only registration
- JWT tokens, valid for 30 days
- Two roles: USER and ADMIN
- Gonic user accounts are created automatically on registration

---

## Deployment

Built and deployed via GitHub Actions on push to `main` or `develop`. Images are pushed to GHCR and pulled on the server.

```
ghcr.io/drabenstadtj/cr8-backend
ghcr.io/drabenstadtj/cr8-frontend
```
