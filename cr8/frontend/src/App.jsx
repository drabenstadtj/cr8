import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, createContext, useContext } from 'react'
import { api, setToken, clearToken, decodeToken } from './api.js'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Home from './pages/Home.jsx'
import Search from './pages/Search.jsx'
import Requests from './pages/Requests.jsx'
import Admin from './pages/Admin.jsx'
import Profile from './pages/Profile.jsx'
import LastFmCallback from './pages/LastFmCallback.jsx'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)
export const useConfig = () => useContext(ConfigContext)
const ConfigContext = createContext({})

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? children : <Navigate to="/login" replace />
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState({})

  useEffect(() => {
    api.get('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
    api.get('/config').then(setConfig).catch(() => {})
  }, [])

  function login(token) {
    setToken(token)
    setUser(decodeToken(token))
  }

  function logout() {
    clearToken()
    setUser(null)
  }

  return (
    <ConfigContext.Provider value={config}>
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/search" element={<RequireAuth><Search /></RequireAuth>} />
        <Route path="/requests" element={<RequireAuth><Requests /></RequireAuth>} />
        <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/lastfm/callback" element={<RequireAuth><LastFmCallback /></RequireAuth>} />
      </Routes>
    </AuthContext.Provider>
    </ConfigContext.Provider>
  )
}
