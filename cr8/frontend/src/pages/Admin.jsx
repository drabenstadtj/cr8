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

function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function Admin() {
  const [requests, setRequests] = useState([])
  const [invites, setInvites] = useState([])
  const [users, setUsers] = useState([])
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [explorationMsg, setExplorationMsg] = useState('')
  const [playlistMsg, setPlaylistMsg] = useState('')
  const [timeline, setTimeline] = useState(null)

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

  useEffect(() => {
    function fetchStatus() {
      api.get('/admin/status').then(setStatus).catch(() => {})
    }
    fetchStatus()
    const id = setInterval(fetchStatus, 30000)
    return () => clearInterval(id)
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

  async function openTimeline(request) {
    const events = await api.get(`/admin/requests/${request.id}/events`).catch(() => [])
    setTimeline({ request, events })
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

        {status && (
          <section className={styles.section}>
            <h3>System</h3>

            <div className={styles.workerRow}>
              <span>
                <span className={styles.statusLabel}>Worker</span>
                {status.worker.isRunning
                  ? 'Polling…'
                  : status.worker.lastPollAt
                    ? `Idle — last polled ${formatTime(status.worker.lastPollAt)}`
                    : 'Not yet polled'
                }
              </span>
            </div>

            <div className={styles.statusGrid} style={{ marginTop: 14 }}>
              {Object.entries(status.services).map(([name, s]) => (
                <div key={name} className={styles.statusRow}>
                  <span className={styles.statusLabel}>{name}</span>
                  {!s
                    ? <span className={styles.statusSkipped}>—</span>
                    : s.skipped
                      ? <span className={styles.statusSkipped}>not configured</span>
                      : s.ok
                        ? <>
                            <span className={styles.statusOk}>ok</span>
                            {s.latencyMs != null && <span className={styles.statusLatency}>{s.latencyMs}ms</span>}
                          </>
                        : <span className={styles.statusFail}>{s.error || 'unreachable'}</span>
                  }
                </div>
              ))}
            </div>

            {status.exploration && (
              <div style={{ marginTop: 14 }}>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>Last run</span>
                  <span className={
                    status.exploration.outcome === 'ok' ? styles.statusOk
                    : status.exploration.outcome === 'empty' ? styles.statusSkipped
                    : styles.statusFail
                  }>
                    {status.exploration.outcome}
                  </span>
                  <span className={styles.statusLatency}>{formatTime(status.exploration.startedAt)}</span>
                </div>
                <div className={styles.statusRow} style={{ marginTop: 4 }}>
                  <span className={styles.statusLabel} />
                  <span className={styles.statusLatency}>
                    {status.exploration.usersProcessed} users · {status.exploration.requestsCreated} created · {status.exploration.albumsSkipped} skipped
                    {status.exploration.failures?.length > 0 && ` · ${status.exploration.failures.length} failed`}
                  </span>
                </div>
                {status.exploration.failures?.map((f, i) => (
                  <div key={i} className={styles.statusRow} style={{ marginTop: 2 }}>
                    <span className={styles.statusLabel} />
                    <span className={styles.statusFail}>{f.lbUser}: {f.error}</span>
                  </div>
                ))}
              </div>
            )}

            {status.stuckRequests?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <span className={styles.statusLabel} style={{ color: '#c07878' }}>Stuck</span>
                <div style={{ marginTop: 6 }}>
                  {status.stuckRequests.map((r) => (
                    <div key={r.id} className={styles.stuckItem}>
                      <strong>{r.title}</strong> — {r.artist}
                      <span className={styles.itemMeta}> {r.status} since {formatTime(r.statusUpdatedAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

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
                  {r.status === 'FAILED' && r.rejectedReason && (
                    <span className={styles.itemMeta}> — {r.rejectedReason}</span>
                  )}
                </span>
                <span className={styles.badge}>{STATUS_LABEL[r.status] || r.status}</span>
                <button className={styles.dimButton} onClick={() => openTimeline(r)}>History</button>
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

      {timeline && (
        <div className={styles.overlay} onClick={() => setTimeline(null)}>
          <div className={`${styles.dialog} ${styles.timelineDialog}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.timelineTitle}>
              <strong>{timeline.request.title}</strong> — {timeline.request.artist}
              <small>{STATUS_LABEL[timeline.request.status] || timeline.request.status}</small>
            </div>
            <div className={styles.timeline}>
              {timeline.events.length === 0
                ? <p className={styles.timelineEmpty}>No history yet.</p>
                : timeline.events.map((e) => (
                  <div key={e.id} className={styles.timelineEvent}>
                    <div className={styles.timelineRow}>
                      <span className={styles.timelineArrow}>
                        {e.from} <span>→</span> {e.to}
                      </span>
                      <span className={styles.timelineTime}>{formatTime(e.createdAt)}</span>
                    </div>
                    {e.reason && <div className={styles.timelineReason}>{e.reason}</div>}
                  </div>
                ))
              }
            </div>
            <div className={styles.dialogActions}>
              <button onClick={() => setTimeline(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

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
