import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../App.jsx'
import styles from './Nav.module.css'

export default function Nav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  function linkClass(path) {
    return `${styles.link} ${pathname === path ? styles.active : ''}`.trim()
  }

  return (
    <nav className={styles.nav}>
      <span className={styles.logo}>cr8</span>
      <button className={linkClass('/')} onClick={() => navigate('/')}>Search</button>
      <button className={linkClass('/requests')} onClick={() => navigate('/requests')}>My requests</button>
      {user?.role === 'ADMIN' && (
        <button className={linkClass('/admin')} onClick={() => navigate('/admin')}>Admin</button>
      )}
      <button className={styles.link} onClick={logout}>Log out</button>
    </nav>
  )
}
