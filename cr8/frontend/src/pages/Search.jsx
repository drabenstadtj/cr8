import { useState } from 'react'
import { api } from '../api.js'
import Nav from '../components/Nav.jsx'
import ArtImage from '../components/ArtImage.jsx'
import styles from './Search.module.css'

function BinaryThrobber() {
  const [count, setCount] = useState(0)
  useState(() => {
    const id = setInterval(() => setCount((c) => (c + 1) % 16), 150)
    return () => clearInterval(id)
  }, [])
  return (
    <div className={styles.throbber}>
      {[3, 2, 1, 0].map((bit) => (
        <div
          key={bit}
          className={`${styles.throbberPixel} ${count & (1 << bit) ? styles.throbberPixelOn : ''}`}
        />
      ))}
    </div>
  )
}

const PAGE_SIZE = 20

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'recordings', label: 'Tracks' },
  { value: 'releases', label: 'Albums' },
  { value: 'artists', label: 'Artists' },
]

export default function Search() {
  const [type, setType] = useState('all')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(null)
  const [requested, setRequested] = useState(new Set())

  async function doSearch(t, off = 0) {
    setError('')
    setLoading(true)
    try {
      const params = new URLSearchParams({ offset: off })
      if (title) params.set('title', title)
      if (artist) params.set('artist', artist)
      if (album && t === 'recordings') params.set('album', album)
      if (t === 'artists') {
        params.delete('title')
        params.delete('artist')
        params.set('name', title || artist)
      }

      const data = await api.get(`/search/${t}?${params}`)
      setResults(data.results)
      setTotal(data.total)
      setOffset(off)
    } catch (err) {
      setError(err.data?.error || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  async function browseArtist(mbid, name) {
    setTitle(name)
    setArtist('')
    setType('releases')
    setError('')
    setLoading(true)
    try {
      const data = await api.get(`/search/artist/${mbid}/releases?offset=0`)
      setResults(data.results)
      setTotal(data.total)
      setOffset(0)
    } catch (err) {
      setError(err.data?.error || 'Browse failed')
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e) {
    e.preventDefault()
    if (!title.trim() && !artist.trim()) return
    doSearch(type, 0)
  }

  function handleTypeChange(t) {
    setType(t)
    setResults([])
    setTotal(null)
    setOffset(0)
  }

  async function handleRequest(result) {
    setSubmitting(result.mbid)
    setError('')
    const isTrack = type === 'recordings' || result.resultType === 'recording'
    try {
      await api.post('/requests', {
        mbid: result.mbid,
        title: result.title,
        artist: result.artist,
        album: result.album,
        type: isTrack ? 'TRACK' : 'ALBUM',
        coverArt: result.coverArt || null,
      })
      setRequested((prev) => new Set(prev).add(result.mbid))
    } catch (err) {
      if (err.status === 409) {
        setError(err.data?.error === 'already_in_library' ? 'Already in library' : 'Already requested')
      } else {
        setError(err.data?.error || 'Failed to submit request')
      }
    } finally {
      setSubmitting(null)
    }
  }

  function mbUrl(r) {
    const t = r.resultType === 'recording' ? 'recording' : r.resultType === 'artist' ? 'artist' : 'release'
    return `https://musicbrainz.org/${t}/${r.mbid}`
  }

  function typeLabel(r) {
    if (r.resultType === 'recording' || type === 'recordings') return 'Track'
    if (r.resultType === 'release' || type === 'releases') return 'Album'
    if (r.resultType === 'artist' || type === 'artists') return 'Artist'
    return ''
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = total ? Math.ceil(total / PAGE_SIZE) : null

  return (
    <>
      <Nav />
      <div className="wrap">
        <form className={styles.controls} onSubmit={handleSearch}>
          <div className={styles.typeFilters}>
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`${styles.typeFilter} ${type === t.value ? styles.typeFilterActive : ''}`}
                onClick={() => handleTypeChange(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className={styles.fields}>
            <input
              className={styles.input}
              placeholder={type === 'artists' ? 'Artist name' : 'Title'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {type !== 'artists' && (
              <input
                className={styles.input}
                placeholder="Artist"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
              />
            )}
            {type === 'recordings' && (
              <input
                className={styles.input}
                placeholder="Album"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
              />
            )}
          </div>
          <button type="submit">Search</button>
        </form>

        {error && <p className={styles.error}>{error}</p>}

        <ul className={styles.results}>
          {loading && <BinaryThrobber />}
          {!loading && results.map((r) => {
            const isArtist = r.resultType === 'artist' || type === 'artists'
            const label = typeLabel(r)
            return (
              <li key={r.mbid} className={styles.result}>
                {isArtist
                  ? <ArtImage placeholderClassName={styles.resultArtPlaceholder} />
                  : <ArtImage src={r.coverArt} imgClassName={styles.resultArt} placeholderClassName={styles.resultArtPlaceholder} />
                }
                <div className={styles.resultInfo}>
                  <span className={styles.resultTypeLabel}>{label}</span>
                  <div className={styles.resultTitle}>
                    <a href={mbUrl(r)} target="_blank" rel="noreferrer">
                      {isArtist ? r.name : r.title}
                    </a>
                  </div>
                  <div className={styles.resultMeta}>
                    {isArtist ? r.artistType : r.artist}
                    {r.date && <span>{r.date.slice(0, 4)}</span>}
                    {r.trackCount && <span>{r.trackCount} tracks</span>}
                  </div>
                </div>
                {isArtist
                  ? <button onClick={() => browseArtist(r.mbid, r.name)}>Browse</button>
                  : r.inLibrary
                    ? <span className={styles.inLibrary}>In library</span>
                    : <button
                        disabled={submitting === r.mbid || requested.has(r.mbid)}
                        onClick={() => handleRequest(r)}
                      >
                        {submitting === r.mbid ? '...' : requested.has(r.mbid) ? 'Requested' : 'Request'}
                      </button>
                }
              </li>
            )
          })}
        </ul>

        {!loading && totalPages > 1 && (
          <div className={styles.pagination}>
            <button disabled={offset === 0} onClick={() => doSearch(type, offset - PAGE_SIZE)}>Prev</button>
            <span>{page} / {totalPages}</span>
            <button disabled={offset + PAGE_SIZE >= total} onClick={() => doSearch(type, offset + PAGE_SIZE)}>Next</button>
          </div>
        )}
      </div>
    </>
  )
}
