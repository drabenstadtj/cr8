import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'

export default function LastFmCallback() {
    const [error, setError] = useState(null)
    const navigate = useNavigate()

    useEffect(() => {
        const token = new URLSearchParams(window.location.search).get('token')
        if (!token) {
            setError('No token received from Last.fm.')
            return
        }
        api.post('/lastfm/link', { token })
            .then(() => navigate('/profile', { replace: true }))
            .catch((err) => setError(err.message || 'Failed to link Last.fm account.'))
    }, [navigate])

    if (error) {
        return (
            <main style={{ padding: '24px 20px', maxWidth: 400, margin: '0 auto' }}>
                <p style={{ color: 'var(--fg)', opacity: 0.6 }}>{error}</p>
                <button onClick={() => navigate('/profile')}>Back to profile</button>
            </main>
        )
    }

    return null
}
