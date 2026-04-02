import { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'
import Nav from '../components/Nav.jsx'
import ArtImage from '../components/ArtImage.jsx'
import { useConfig } from '../App.jsx'
import styles from './Home.module.css'

const STATUS_LABEL = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SEARCHING: 'Searching',
  DOWNLOADING: 'Downloading',
  COMPLETE: 'Complete',
  FAILED: 'Failed',
}

const IN_PROGRESS = ['PENDING', 'APPROVED', 'SEARCHING', 'DOWNLOADING']

function Card({ r, navidromeUrl }) {
  return (
    <div className={styles.card}>
      <ArtImage src={r.coverArt} imgClassName={styles.art} placeholderClassName={styles.artPlaceholder} />
      <div className={styles.info}>
        <div className={styles.title}>{r.title}</div>
        <div className={styles.artist}>{r.artist}</div>
        <div className={styles.footer}>
          <span className={`${styles.status} ${styles[`status${r.status}`]}`}>
            {STATUS_LABEL[r.status]}
          </span>
          {r.status === 'COMPLETE' && navidromeUrl && (
            <button className={styles.listenLink} onClick={async () => {
              const { url } = await api.get(`/requests/${r.id}/listen`)
              window.open(url, '_blank', 'noreferrer')
            }}>Listen ↗</button>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ label, items, navidromeUrl }) {
  const shelfRef = useRef(null)

  function scroll(dir) {
    const shelf = shelfRef.current
    if (!shelf) return
    const card = shelf.firstElementChild
    if (!card) return
    const step = card.offsetWidth + 12
    const visible = Math.round(shelf.offsetWidth / step)
    shelf.scrollBy({ left: dir * visible * step, behavior: 'smooth' })
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeading}>{label}</div>
        <div className={styles.arrows}>
          <button className={styles.arrow} onClick={() => scroll(-1)}>←</button>
          <button className={styles.arrow} onClick={() => scroll(1)}>→</button>
        </div>
      </div>
      {items.length === 0
        ? <p className={styles.empty}>Nothing here yet.</p>
        : <div className={styles.shelf} ref={shelfRef}>
            {items.map((r) => <Card key={r.id} r={r} navidromeUrl={navidromeUrl} />)}
          </div>
      }
    </div>
  )
}

export default function Home() {
  const { navidromeUrl } = useConfig()
  const [activity, setActivity] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/requests/activity')
      .then(setActivity)
      .catch(() => setError('Failed to load'))
  }, [])

  const recentlyAdded = activity.filter((r) => r.status === 'COMPLETE')
  const inProgress = activity.filter((r) => IN_PROGRESS.includes(r.status))

  return (
    <>
      <Nav />
      <div className="wrap">
        {error && <p className={styles.error}>{error}</p>}
        <Section label="Recently Added" items={recentlyAdded} navidromeUrl={navidromeUrl} />
        <Section label="Recent Requests" items={activity} navidromeUrl={navidromeUrl} />
        <Section label="In Progress" items={inProgress} navidromeUrl={navidromeUrl} />
      </div>
    </>
  )
}
