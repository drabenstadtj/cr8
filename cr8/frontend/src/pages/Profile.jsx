import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Nav from '../components/Nav.jsx'
import styles from './Profile.module.css'

export default function Profile() {
    const [lbUsername, setLbUsername] = useState('')
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(true)
    const [lastfm, setLastfm] = useState({ linked: false, apiKey: null })

    useEffect(() => {
        Promise.all([
            api.get('/auth/me'),
            api.get('/lastfm/status').catch(() => ({ linked: false, apiKey: null })),
        ])
            .then(([user, lfm]) => {
                setLbUsername(user.listenbrainzUsername || '')
                setLastfm(lfm)
            })
            .catch(() => setError('Failed to load profile'))
            .finally(() => setLoading(false))
    }, [])

    async function handleSave(e) {
        e.preventDefault()
        setError(null)
        setSaved(false)
        try {
            await api.patch('/auth/me', { listenbrainzUsername: lbUsername || null })
            setSaved(true)
        } catch (err) {
            setError(err.message || 'Failed to save')
        }
    }

    function handleLinkLastFm() {
        const cb = `${window.location.origin}/lastfm/callback`
        window.location.href = `https://www.last.fm/api/auth/?api_key=${lastfm.apiKey}&cb=${encodeURIComponent(cb)}`
    }

    async function handleUnlinkLastFm() {
        setError(null)
        try {
            await api.delete('/lastfm/link')
            setLastfm((s) => ({ ...s, linked: false }))
        } catch (err) {
            setError(err.message || 'Failed to unlink Last.fm')
        }
    }

    return (
        <>
            <Nav />
            <main className={styles.page}>
                <h1 className={styles.heading}>Profile</h1>
                {loading ? null : (
                    <>
                        <form className={styles.form} onSubmit={handleSave}>
                            <label className={styles.label}>
                                ListenBrainz username
                                <input
                                    className={styles.input}
                                    type="text"
                                    value={lbUsername}
                                    onChange={(e) => { setLbUsername(e.target.value); setSaved(false) }}
                                    placeholder="your-listenbrainz-username"
                                    maxLength={64}
                                />
                            </label>
                            <p className={styles.hint}>
                                Used for personalised music exploration. Leave blank to opt out.
                            </p>
                            {error && <p className={styles.error}>{error}</p>}
                            {saved && <p className={styles.success}>Saved.</p>}
                            <button type="submit" className={styles.button}>Save</button>
                        </form>

                        {lastfm.apiKey && (
                            <div className={styles.section}>
                                <p className={styles.sectionLabel}>Last.fm scrobbling</p>
                                <p className={styles.hint}>
                                    {lastfm.linked
                                        ? 'Your Last.fm account is linked. Gonic will scrobble tracks as you play them.'
                                        : 'Link your Last.fm account to scrobble from Gonic.'}
                                </p>
                                {lastfm.linked ? (
                                    <button className={styles.button} onClick={handleUnlinkLastFm}>Unlink Last.fm</button>
                                ) : (
                                    <button className={styles.button} onClick={handleLinkLastFm}>Link Last.fm</button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
        </>
    )
}
