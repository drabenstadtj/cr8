import { useState } from 'react'
import { api } from '../api.js'
import Nav from '../components/Nav.jsx'
import styles from './Search.module.css'

const TYPES = [
  { value: 'recordings', label: 'Tracks' },
  { value: 'releases', label: 'Albums' },
]

export default function Search() {
const [query, setQuery] = useState('')
  const [type, setType] = useState('recordings')
  const [results, setResults] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(null)
  const [requested, setRequested] = useState(new Set())

  async function handleSearch(e) {
    e.preventDefault()
    if (!query.trim()) return
    setError('')
    try {
      const data = await api.get(`/search/${type}?q=${encodeURIComponent(query)}`)
      setResults(data)
    } catch (err) {
      setError(err.data?.error || 'Search failed')
    }
  }

  async function handleRequest(result) {
    setSubmitting(result.mbid)
    setError('')
    try {
      await api.post('/requests', {
        mbid: result.mbid,
        title: result.title,
        artist: result.artist,
        album: result.album,
        type: type === 'recordings' ? 'TRACK' : 'ALBUM',
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
              onClick={() => { setType(t.value); setResults([]) }}
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
        <button className={styles.searchButton} type="submit">Search</button>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      <ul className={styles.results}>
        {results.map((r) => (
          <li key={r.mbid} className={styles.result}>
            {r.coverArt
              ? <img className={styles.resultArt} src={r.coverArt} alt="" />
              : <div className={styles.resultArtPlaceholder} />
            }
            <div className={styles.resultInfo}>
              <div className={styles.resultTitle}>{r.title}</div>
              <div className={styles.resultMeta}>
                <span className={styles.resultType}>{type === 'recordings' ? 'Track' : 'Album'}</span>
                {r.artist}
              </div>
            </div>
            <button
              className={styles.requestButton}
              disabled={submitting === r.mbid || requested.has(r.mbid)}
              onClick={() => handleRequest(r)}
            >
              {submitting === r.mbid ? '...' : requested.has(r.mbid) ? 'Requested' : 'Request'}
            </button>
          </li>
        ))}
      </ul>
      </div>
    </>
  )
}
