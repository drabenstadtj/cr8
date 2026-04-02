import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Nav from '../components/Nav.jsx'
import ArtImage from '../components/ArtImage.jsx'
import styles from './Search.module.css'

function BinaryThrobber() {
  const [count, setCount] = useState(0)
  useEffect(() => {
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

const TYPES = [
  { value: 'all', label: 'All' },
  { value: 'recordings', label: 'Tracks' },
  { value: 'releases', label: 'Albums' },
  { value: 'artists', label: 'Artists' },
]

export default function Search() {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(null)
  const [requested, setRequested] = useState(new Set())

  async function doSearch(q, t) {
    setError('')
    setLoading(true)
    try {
      const data = await api.get(`/search/${t}?q=${encodeURIComponent(q)}`)
      setResults(data)
    } catch (err) {
      setError(err.data?.error || 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    doSearch(query, type)
  }

  async function browseArtist(artist) {
    setQuery(artist.name)
    setType('releases')
    setError('')
    setLoading(true)
    try {
      const data = await api.get(`/search/artist/${artist.mbid}/releases`)
      setResults(data)
    } catch (err) {
      setError(err.data?.error || 'Browse failed')
    } finally {
      setLoading(false)
    }
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

  function typeLabel(r) {
    if (r.resultType === 'recording' || type === 'recordings') return 'Track'
    if (r.resultType === 'release' || type === 'releases') return 'Album'
    if (r.resultType === 'artist' || type === 'artists') return 'Artist'
    return ''
  }

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
                onClick={() => { setType(t.value); if (query.trim()) doSearch(query, t.value); else setResults([]) }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            className={styles.input}
            placeholder="Search artist, title..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
                  <div className={styles.resultTitle}>{isArtist ? r.name : r.title}</div>
                  <div className={styles.resultMeta}>
                    <span className={styles.resultType}>{label}</span>
                    {isArtist ? r.artistType : r.artist}
                  </div>
                </div>
                {isArtist
                  ? <button onClick={() => browseArtist(r)}>Browse</button>
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
      </div>
    </>
  )
}
