import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../App.jsx'
import styles from './Auth.module.css'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const { token } = await api.post('/auth/login', form)
      login(token)
      navigate('/')
    } catch (err) {
      setError(err.data?.error || 'Login failed')
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.logo}>cr8</h1>
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
        <button className={styles.button} type="submit">Log in</button>
      </form>
      <p className={styles.footer}>Have an invite? <Link to="/register">Register</Link></p>
    </div>
  )
}
