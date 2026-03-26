import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../App.jsx'
import styles from './Auth.module.css'

export default function Register() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('token') || ''
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const { token } = await api.post('/auth/register', { ...form, token: inviteToken })
      login(token)
      navigate('/')
    } catch (err) {
      setError(err.data?.error || 'Registration failed')
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.logo}>cr8</h1>
      {!inviteToken && <p className={styles.error}>Invalid or missing invite link.</p>}
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          placeholder="Username"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <input
          className={styles.input}
          type="password"
          placeholder="Password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.button} type="submit" disabled={!inviteToken}>Register</button>
      </form>
      <p className={styles.footer}>Already have an account? <Link to="/login">Log in</Link></p>
    </div>
  )
}
