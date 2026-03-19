import { Routes, Route, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatAssistant from './components/ChatAssistant'
import Dashboard from './pages/Dashboard'
import Zones from './pages/Zones'
import InitialSetup from './pages/InitialSetup'
import Analytics from './pages/Analytics'
import AIPredictions from './pages/AIPredictions'
import Settings from './pages/Settings'
import Login from './pages/Login'
import './App.css'

function App() {
  const navigate = useNavigate()
  const [token, setToken] = useState(localStorage.getItem('ecoeye_token') || '')
  const [username, setUsername] = useState(localStorage.getItem('ecoeye_user') || '')

  useEffect(() => {
    if (!token) {
      return
    }

    fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Session expired')
        }
        return res.json()
      })
      .catch(() => {
        localStorage.removeItem('ecoeye_token')
        localStorage.removeItem('ecoeye_user')
        setToken('')
        setUsername('')
      })
  }, [token])

  const handleLogin = (newToken, newUsername) => {
    localStorage.setItem('ecoeye_token', newToken)
    localStorage.setItem('ecoeye_user', newUsername)
    setToken(newToken)
    setUsername(newUsername)
    navigate('/')
  }

  const handleLogout = () => {
    localStorage.removeItem('ecoeye_token')
    localStorage.removeItem('ecoeye_user')
    setToken('')
    setUsername('')
    navigate('/')
  }

  if (!token) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="app-layout">
      <Sidebar username={username} onLogout={handleLogout} />
      <main className="main-content">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/setup" element={<InitialSetup token={token} />} />
            <Route path="/zones" element={<Zones />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/predictions" element={<AIPredictions />} />
            <Route path="/settings" element={<Settings token={token} />} />
          </Routes>
        </AnimatePresence>
      </main>
      <ChatAssistant token={token} />
    </div>
  )
}

export default App
