import { useState, useEffect } from 'react'
import { api } from '../api.js'
import Nav from '../components/Nav.jsx'
import styles from './Profile.module.css'

export default function Profile() {
    const [lbUsername, setLbUsername] = useState('')
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get('/auth/me')
            .then((u) => setLbUsername(u.listenbrainzUsername || ''))
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

    return (
        <>
            <Nav />
            <main className={styles.page}>
                <h1 className={styles.heading}>Profile</h1>
                {loading ? null : (
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
                )}
            </main>
        </>
    )
}
