import { describe, it, expect } from 'vitest'
import { collectCandidates, collectAlbumCandidates } from '../src/features/requests/scoring.js'

// Minimal fake response builder
function makeResponse({ username = 'peer', hasFreeUploadSlot = true, files = [] } = {}) {
  return { username, hasFreeUploadSlot, files }
}

function makeFile({ filename, ext = 'flac', bitRate = 320, bitDepth = 16, length = 200, size = 1000000 } = {}) {
  return { filename, extension: ext, bitRate, bitDepth, length, size }
}

// ─── collectCandidates ────────────────────────────────────────────────────────

describe('collectCandidates', () => {
  it('returns matching file', () => {
    const responses = [
      makeResponse({
        files: [makeFile({ filename: '\\Music\\Radiohead\\Creep.flac' })],
      }),
    ]
    const result = collectCandidates(responses, { title: 'Creep', artist: 'Radiohead', album: null, durationS: null })
    expect(result).toHaveLength(1)
    expect(result[0].filename).toContain('Creep')
  })

  it('rejects files without title match', () => {
    const responses = [
      makeResponse({
        files: [makeFile({ filename: '\\Music\\Radiohead\\Karma Police.flac' })],
      }),
    ]
    const result = collectCandidates(responses, { title: 'Creep', artist: 'Radiohead', album: null, durationS: null })
    expect(result).toHaveLength(0)
  })

  it('rejects files without artist match', () => {
    const responses = [
      makeResponse({
        files: [makeFile({ filename: '\\Music\\Coldplay\\Creep.flac' })],
      }),
    ]
    const result = collectCandidates(responses, { title: 'Creep', artist: 'Radiohead', album: null, durationS: null })
    expect(result).toHaveLength(0)
  })

  it('strips feat. credits when matching artist', () => {
    const responses = [
      makeResponse({
        files: [makeFile({ filename: '\\Music\\Drake\\Nonstop.flac' })],
      }),
    ]
    const result = collectCandidates(responses, {
      title: 'Nonstop',
      artist: 'Drake feat. Somebody',
      album: null,
      durationS: null,
    })
    expect(result).toHaveLength(1)
  })

  it('rejects blacklisted keyword not in title or artist', () => {
    const responses = [
      makeResponse({
        files: [makeFile({ filename: '\\Music\\Radiohead\\Creep (karaoke).flac' })],
      }),
    ]
    const result = collectCandidates(responses, { title: 'Creep', artist: 'Radiohead', album: null, durationS: null })
    expect(result).toHaveLength(0)
  })

  it('allows blacklisted keyword when it appears in title', () => {
    const responses = [
      makeResponse({
        files: [makeFile({ filename: '\\Music\\Weird Al\\Karaoke Song.flac' })],
      }),
    ]
    const result = collectCandidates(responses, { title: 'Karaoke Song', artist: 'Weird Al', album: null, durationS: null })
    expect(result).toHaveLength(1)
  })

  it('rejects files below minimum bitrate', () => {
    const responses = [
      makeResponse({
        files: [makeFile({ filename: '\\Music\\Radiohead\\Creep.mp3', ext: 'mp3', bitRate: 128 })],
      }),
    ]
    const result = collectCandidates(responses, { title: 'Creep', artist: 'Radiohead', album: null, durationS: null })
    expect(result).toHaveLength(0)
  })

  it('rejects unsupported file extensions', () => {
    const responses = [
      makeResponse({
        files: [makeFile({ filename: '\\Music\\Radiohead\\Creep.wma', ext: 'wma' })],
      }),
    ]
    const result = collectCandidates(responses, { title: 'Creep', artist: 'Radiohead', album: null, durationS: null })
    expect(result).toHaveLength(0)
  })

  it('sorts: free slot first, then extension quality, then bitrate', () => {
    const responses = [
      makeResponse({
        username: 'peer_busy',
        hasFreeUploadSlot: false,
        files: [makeFile({ filename: '\\Music\\Radiohead\\Creep.flac', bitRate: 1411 })],
      }),
      makeResponse({
        username: 'peer_free_mp3',
        hasFreeUploadSlot: true,
        files: [makeFile({ filename: '\\Music\\Radiohead\\Creep.mp3', ext: 'mp3', bitRate: 320 })],
      }),
      makeResponse({
        username: 'peer_free_flac',
        hasFreeUploadSlot: true,
        files: [makeFile({ filename: '\\Music\\Radiohead\\Creep.flac', bitRate: 1411 })],
      }),
    ]
    const result = collectCandidates(responses, { title: 'Creep', artist: 'Radiohead', album: null, durationS: null })
    expect(result[0].username).toBe('peer_free_flac')
    expect(result[1].username).toBe('peer_free_mp3')
    expect(result[2].username).toBe('peer_busy')
  })

  it('filters by duration tolerance when durationS is provided', () => {
    const responses = [
      makeResponse({
        files: [
          makeFile({ filename: '\\Music\\Radiohead\\Creep.flac', length: 200 }),
          makeFile({ filename: '\\Music\\Radiohead\\Creep (ext).flac', length: 400 }),
        ],
      }),
    ]
    const result = collectCandidates(responses, { title: 'Creep', artist: 'Radiohead', album: null, durationS: 200 })
    expect(result).toHaveLength(1)
    expect(result[0].filename).toContain('Creep.flac')
  })

  it('caps results at 3 candidates', () => {
    const files = Array.from({ length: 6 }, (_, i) =>
      makeFile({ filename: `\\Radiohead\\peer${i}\\Creep.flac` })
    )
    const responses = files.map((f, i) =>
      makeResponse({ username: `peer${i}`, files: [f] })
    )
    const result = collectCandidates(responses, { title: 'Creep', artist: 'Radiohead', album: null, durationS: null })
    expect(result.length).toBeLessThanOrEqual(3)
  })
})

// ─── collectAlbumCandidates ───────────────────────────────────────────────────

describe('collectAlbumCandidates', () => {
  it('groups files by directory and returns matching group', () => {
    const dir = '\\Music\\Radiohead\\OK Computer\\'
    const responses = [
      makeResponse({
        files: [
          makeFile({ filename: `${dir}01 - Airbag.flac` }),
          makeFile({ filename: `${dir}02 - Paranoid Android.flac` }),
          makeFile({ filename: `${dir}03 - Subterranean Homesick Alien.flac` }),
        ],
      }),
    ]
    const result = collectAlbumCandidates(responses, { artist: 'Radiohead', album: 'OK Computer' })
    expect(result).toHaveLength(1)
    expect(result[0].files).toHaveLength(3)
  })

  it('rejects groups with fewer than 2 files', () => {
    const responses = [
      makeResponse({
        files: [makeFile({ filename: '\\Radiohead\\OK Computer\\01 - Airbag.flac' })],
      }),
    ]
    const result = collectAlbumCandidates(responses, { artist: 'Radiohead', album: 'OK Computer' })
    expect(result).toHaveLength(0)
  })

  it('rejects groups with duplicate track numbers', () => {
    const dir = '\\Music\\Radiohead\\OK Computer\\'
    const responses = [
      makeResponse({
        files: [
          makeFile({ filename: `${dir}01 - Airbag.flac` }),
          makeFile({ filename: `${dir}01 - Paranoid Android.flac` }), // duplicate track 1
        ],
      }),
    ]
    const result = collectAlbumCandidates(responses, { artist: 'Radiohead', album: 'OK Computer' })
    expect(result).toHaveLength(0)
  })

  it('rejects directories that match neither artist nor album', () => {
    const responses = [
      makeResponse({
        files: [
          makeFile({ filename: '\\Music\\Coldplay\\A Rush Of Blood\\01 - Politik.flac' }),
          makeFile({ filename: '\\Music\\Coldplay\\A Rush Of Blood\\02 - In My Place.flac' }),
        ],
      }),
    ]
    const result = collectAlbumCandidates(responses, { artist: 'Radiohead', album: 'OK Computer' })
    expect(result).toHaveLength(0)
  })

  it('prefers free slot peers', () => {
    const busyDir = '\\Music\\Radiohead\\OK Computer\\'
    const freeDir = '\\Music\\Radiohead\\OK Computer\\'
    const responses = [
      makeResponse({
        username: 'busy_peer',
        hasFreeUploadSlot: false,
        files: [
          makeFile({ filename: `${busyDir}01 - Airbag.flac` }),
          makeFile({ filename: `${busyDir}02 - Paranoid Android.flac` }),
        ],
      }),
      makeResponse({
        username: 'free_peer',
        hasFreeUploadSlot: true,
        files: [
          makeFile({ filename: `${freeDir}01 - Airbag.flac` }),
          makeFile({ filename: `${freeDir}02 - Paranoid Android.flac` }),
        ],
      }),
    ]
    const result = collectAlbumCandidates(responses, { artist: 'Radiohead', album: 'OK Computer' })
    expect(result[0].username).toBe('free_peer')
  })

  it('prefers groups with more files when slot is equal', () => {
    const responses = [
      makeResponse({
        username: 'peer_small',
        hasFreeUploadSlot: true,
        files: [
          makeFile({ filename: '\\Radiohead\\OK Computer\\01 - Track.flac' }),
          makeFile({ filename: '\\Radiohead\\OK Computer\\02 - Track.flac' }),
        ],
      }),
      makeResponse({
        username: 'peer_large',
        hasFreeUploadSlot: true,
        files: [
          makeFile({ filename: '\\Radiohead\\OK Computer\\01 - Track.flac' }),
          makeFile({ filename: '\\Radiohead\\OK Computer\\02 - Track.flac' }),
          makeFile({ filename: '\\Radiohead\\OK Computer\\03 - Track.flac' }),
          makeFile({ filename: '\\Radiohead\\OK Computer\\04 - Track.flac' }),
        ],
      }),
    ]
    const result = collectAlbumCandidates(responses, { artist: 'Radiohead', album: 'OK Computer' })
    expect(result[0].username).toBe('peer_large')
  })
})
