import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Nav from '../components/Nav.jsx'
import styles from './Admin.module.css'

const STATUS_LABEL = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SEARCHING: 'Searching',
  DOWNLOADING: 'Downloading',
  COMPLETE: 'Complete',
  FAILED: 'Failed',
}

export default function Admin() {
  const [requests, setRequests] = useState([])
  const [invites, setInvites] = useState([])
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [explorationMsg, setExplorationMsg] = useState('')
  const [playlistMsg, setPlaylistMsg] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/admin/requests'),
      api.get('/admin/invites'),
      api.get('/admin/users'),
    ]).then(([reqs, invs, usrs]) => {
      setRequests(reqs)
      setInvites(invs)
      setUsers(usrs)
    }).catch(() => setError('Failed to load admin data'))
  }, [])

  async function handleAction(id, action, reason) {
    try {
      const updated = await api.patch(`/admin/requests/${id}`, { action, reason })
      setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)))
    } catch (err) {
      setError(err.data?.error || 'Action failed')
    }
  }

  function ask(message, onConfirm) {
    setConfirm({ message, onConfirm })
  }

  async function handleDeleteRequest(id) {
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
      setInvites((prev) => [invite, ...prev])
    } catch {
      setError('Failed to generate invite')
    }
  }

  async function revokeInvite(id) {
    try {
      await api.delete(`/admin/invites/${id}`)
      setInvites((prev) => prev.filter((i) => i.id !== id))
    } catch {
      setError('Failed to revoke invite')
    }
  }

  async function deleteUser(id) {
    try {
      await api.delete(`/admin/users/${id}`)
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (err) {
      setError(err.data?.error || 'Failed to delete user')
    }
  }

  async function clearRequests() {
    try {
      await api.delete('/admin/requests')
      setRequests([])
    } catch {
      setError('Failed to clear requests')
    }
  }

  async function runExploration() {
    try {
      await api.post('/admin/exploration/run', {})
      setExplorationMsg('Exploration triggered — check back shortly for new requests.')
    } catch {
      setExplorationMsg('Failed to trigger exploration.')
    }
  }

  async function rebuildPlaylist() {
    try {
      const res = await api.post('/admin/playlist/rebuild', {})
      setPlaylistMsg(`Rebuilding playlist for ${res.albums} albums — this may take a few minutes.`)
    } catch {
      setPlaylistMsg('Failed to trigger playlist rebuild.')
    }
  }

  function copyInviteLink(token) {
    navigator.clipboard.writeText(`${window.location.origin}/register?token=${token}`)
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
          <div className={styles.sectionHeader}>
            <h3>Actions</h3>
            <button onClick={runExploration}>Run exploration</button>
            <button onClick={rebuildPlaylist}>Rebuild playlist</button>
            <button className={styles.dimButton} onClick={() => ask('Clear all requests?', clearRequests)}>Clear requests</button>
          </div>
          {explorationMsg && <p className={styles.empty}>{explorationMsg}</p>}
          {playlistMsg && <p className={styles.empty}>{playlistMsg}</p>}
        </section>

        <section className={styles.section}>
          <h3>Pending requests</h3>
          {pending.length === 0 && <p className={styles.empty}>None.</p>}
          <ul className={styles.list}>
            {pending.map((r) => (
              <li key={r.id} className={styles.item}>
                <span className={styles.itemInfo}>
                  <strong>{r.title}</strong> — {r.artist}
                  <span className={styles.itemMeta}> by {r.user?.username}</span>
                </span>
                <button onClick={() => handleAction(r.id, 'approve')}>Approve</button>
                <button onClick={() => handleAction(r.id, 'reject', prompt('Rejection reason (optional):'))}>Reject</button>
                <button className={styles.dimButton} onClick={() => ask(`Delete "${r.title}"?`, () => handleDeleteRequest(r.id))}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h3>All requests</h3>
          {others.length === 0 && <p className={styles.empty}>None.</p>}
          <ul className={styles.list}>
            {others.map((r) => (
              <li key={r.id} className={styles.item}>
                <span className={styles.itemInfo}>
                  <strong>{r.title}</strong> — {r.artist}
                </span>
                <span className={styles.badge}>{STATUS_LABEL[r.status] || r.status}</span>
                <button className={styles.dimButton} onClick={() => ask(`Delete "${r.title}"?`, () => handleDeleteRequest(r.id))}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Invites</h3>
            <button onClick={generateInvite}>Generate</button>
          </div>
          {invites.length === 0 && <p className={styles.empty}>No invites yet.</p>}
          <ul className={styles.list}>
            {invites.map((inv) => (
              <li key={inv.id} className={styles.item}>
                <span className={styles.itemInfo}>
                  <span className={styles.token}>{inv.token.slice(0, 16)}…</span>
                  {inv.usedAt
                    ? <span className={styles.itemMeta}> user created: {inv.usedByUsername || inv.usedBy || 'unknown'}</span>
                    : inv.expiresAt && new Date(inv.expiresAt) < new Date()
                      ? <span className={styles.itemMeta}> expired</span>
                      : <span className={styles.itemMeta}> unused</span>
                  }
                </span>
                {!inv.usedAt && (
                  <button className={styles.dimButton} onClick={() => copyInviteLink(inv.token)}>Copy link</button>
                )}
                {!inv.usedAt && (
                  <button className={styles.dimButton} onClick={() => revokeInvite(inv.id)}>Revoke</button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h3>Users</h3>
          {users.length === 0 && <p className={styles.empty}>No users.</p>}
          <ul className={styles.list}>
            {users.map((u) => (
              <li key={u.id} className={styles.item}>
                <span className={styles.itemInfo}>
                  <strong>{u.username}</strong>
                </span>
                <span className={styles.badge}>{u.role}</span>
                <span className={styles.itemMeta}>{new Date(u.createdAt).toLocaleDateString()}</span>
                {u.role !== 'ADMIN' && (
                  <button className={styles.dimButton} onClick={() => ask(`Delete user "${u.username}"?`, () => deleteUser(u.id))}>Delete</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {confirm && (
        <div className={styles.overlay} onClick={() => setConfirm(null)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <p className={styles.dialogMessage}>{confirm.message}</p>
            <div className={styles.dialogActions}>
              <button className={styles.dimButton} onClick={() => setConfirm(null)}>Cancel</button>
              <button onClick={() => { confirm.onConfirm(); setConfirm(null) }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
