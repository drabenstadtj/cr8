import crypto from 'crypto'
import { config } from '../config.js'

const PROBE_INTERVAL_MS = 60_000

const results = {
  slskd: null,
  gonic: null,
  listenbrainz: null,
  betanin: null,
  musicbrainz: null,
}

export function getServiceStatus() {
  return { ...results }
}

export function startProbes(log) {
  runAll(log)
  setInterval(() => runAll(log), PROBE_INTERVAL_MS)
}

async function runAll(log) {
  const [slskd, gonic, listenbrainz, betanin, musicbrainz] = await Promise.all([
    probeSlskd(),
    probeGonic(),
    probeListenBrainz(),
    probeBetanin(),
    probeMusicBrainz(),
  ])
  results.slskd = slskd
  results.gonic = gonic
  results.listenbrainz = listenbrainz
  results.betanin = betanin
  results.musicbrainz = musicbrainz

  const failed = Object.entries(results)
    .filter(([, v]) => v && !v.ok && !v.skipped)
    .map(([k]) => k)

  if (failed.length) {
    log.warn({ services: failed }, 'Service probe failures')
  }
}

async function probeSlskd() {
  if (!config.SLSKD_URL) {
    return { ok: false, skipped: true, error: 'Not configured', checkedAt: null }
  }
  const start = Date.now()
  try {
    const res = await fetch(`${config.SLSKD_URL}/api/v0/application`, {
      headers: { 'X-API-Key': config.SLSKD_API_KEY },
      signal: AbortSignal.timeout(5000),
    })
    return { ok: res.ok, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: err.message }
  }
}

async function probeGonic() {
  if (!config.GONIC_URL) {
    return { ok: false, skipped: true, error: 'Not configured', checkedAt: null }
  }
  const start = Date.now()
  try {
    const salt = Math.random().toString(36).slice(2)
    const token = crypto.createHash('md5').update(config.GONIC_PASSWORD + salt).digest('hex')
    const params = new URLSearchParams({ u: config.GONIC_USER, t: token, s: salt, v: '1.16.1', c: 'cr8', f: 'json' })
    const res = await fetch(`${config.GONIC_URL}/rest/ping.view?${params}`, { signal: AbortSignal.timeout(5000) })
    const latencyMs = Date.now() - start
    if (!res.ok) return { ok: false, latencyMs, checkedAt: new Date().toISOString(), error: `HTTP ${res.status}` }
    const data = await res.json()
    const status = data?.['subsonic-response']?.status
    return {
      ok: status === 'ok',
      latencyMs,
      checkedAt: new Date().toISOString(),
      error: status !== 'ok' ? (data?.['subsonic-response']?.error?.message ?? 'Auth failed') : undefined,
    }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: err.message }
  }
}

async function probeListenBrainz() {
  const start = Date.now()
  try {
    const res = await fetch('https://api.listenbrainz.org/1/stats/sitewide/artists?count=1', {
      signal: AbortSignal.timeout(8000),
    })
    return { ok: res.status < 500, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: res.status >= 500 ? `HTTP ${res.status}` : undefined }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: err.message }
  }
}

async function probeBetanin() {
  if (!config.BETANIN_URL) {
    return { ok: false, skipped: true, error: 'Not configured', checkedAt: null }
  }
  const start = Date.now()
  try {
    const res = await fetch(`${config.BETANIN_URL}/api/torrents`, {
      headers: config.BETANIN_API_KEY ? { 'X-API-Key': config.BETANIN_API_KEY } : {},
      signal: AbortSignal.timeout(5000),
    })
    // 401 means reachable but unauthenticated — service is up
    const ok = res.ok || res.status === 401
    return { ok, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: ok ? undefined : `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: err.message }
  }
}

async function probeMusicBrainz() {
  const start = Date.now()
  try {
    const res = await fetch('https://musicbrainz.org/ws/2/', {
      headers: { 'User-Agent': 'cr8/0.1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    // MusicBrainz returns 400 for an empty path query — service is up
    const ok = res.status < 500
    return { ok, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: ok ? undefined : `HTTP ${res.status}` }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: err.message }
  }
}
