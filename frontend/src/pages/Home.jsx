import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Nav from '../components/Nav.jsx'
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

export default function Home() {
  const { navidromeUrl } = useConfig()
  const [activity, setActivity] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/requests/activity')
      .then(setActivity)
      .catch(() => setError('Failed to load'))
  }, [])

  return (
    <>
      <Nav />
      <div className="wrap">
        {error && <p className={styles.error}>{error}</p>}
        <h2 className={styles.heading}>Recently Requested</h2>
        {activity.length === 0 && !error && (
          <p className={styles.empty}>No requests yet.</p>
        )}
        <div className={styles.grid}>
          {activity.map((r) => (
            <div key={r.id} className={styles.card}>
              {r.coverArt
                ? <img className={styles.art} src={r.coverArt} alt="" />
                : <div className={styles.artPlaceholder} />
              }
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
          ))}
        </div>
      </div>
    </>
  )
}
