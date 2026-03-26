import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Nav from '../components/Nav.jsx'
import styles from './Admin.module.css'

export default function Admin() {
  const [requests, setRequests] = useState([])
  const [inviteResult, setInviteResult] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/admin/requests')
      .then(setRequests)
      .catch(() => setError('Failed to load requests'))
  }, [])

  async function handleAction(id, action, reason) {
    try {
      const updated = await api.patch(`/admin/requests/${id}`, { action, reason })
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)))
    } catch (err) {
      setError(err.data?.error || 'Action failed')
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/admin/requests/${id}`)
      setRequests((prev) => prev.filter((r) => r.id !== id))
    } catch {
      setError('Failed to delete request')
    }
  }

  async function generateInvite() {
    try {
      const invite = await api.post('/admin/invites', {})
      setInviteResult(`${window.location.origin}/register?token=${invite.token}`)
    } catch {
      setError('Failed to generate invite')
    }
  }

  const pending = requests.filter((r) => r.status === 'PENDING')
  const others = requests.filter((r) => r.status !== 'PENDING')

  return (
    <>
      <Nav />
      <div className="wrap">
        <h2>Admin</h2>
        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.section}>
          <h3>Pending requests</h3>
          {pending.length === 0 && <p>None.</p>}
          <ul className={styles.list}>
            {pending.map((r) => (
              <li key={r.id} className={styles.item}>
                <span className={styles.itemInfo}>
                  <strong>{r.title}</strong> — {r.artist}
                  <span className={styles.itemBy}> by {r.user?.username}</span>
                </span>
                <button className={styles.approveButton} onClick={() => handleAction(r.id, 'approve')}>Approve</button>
                <button className={styles.rejectButton} onClick={() => {
                  const reason = prompt('Rejection reason (optional):')
                  handleAction(r.id, 'reject', reason)
                }}>Reject</button>
                <button className={styles.deleteButton} onClick={() => handleDelete(r.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h3>All requests</h3>
          <ul className={styles.list}>
            {others.map((r) => (
              <li key={r.id} className={styles.item}>
                <span className={styles.itemInfo}><strong>{r.title}</strong> — {r.artist}</span>
                <span className={styles.itemBy}>{r.status}</span>
                <button className={styles.deleteButton} onClick={() => handleDelete(r.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h3>Invite</h3>
          <button className={styles.inviteButton} onClick={generateInvite}>Generate invite link</button>
          {inviteResult && <p className={styles.inviteResult}>{inviteResult}</p>}
        </section>
      </div>
    </>
  )
}
