import { useState } from 'react'
import { Eye, Lock, User } from 'lucide-react'
import './Login.css'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      })

      const raw = await res.text()
      const data = raw ? JSON.parse(raw) : {}
      if (!res.ok) {
        throw new Error(data.error || 'Login failed')
      }

      onLogin(data.token, data.username)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card glass-card">
        <div className="login-brand">
          <div className="login-brand-icon">
            <Eye size={22} />
          </div>
          <div>
            <h1>EcoEYE Secure Access</h1>
            <p>Offline controller for LAN-only deployments</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Username
            <div className="login-input-wrap">
              <User size={16} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </label>

          <label>
            Password
            <div className="login-input-wrap">
              <Lock size={16} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="login-hint">
            First boot default: username <strong>admin</strong>, password <strong>changeme</strong>
          </div>
        </form>
      </div>
    </div>
  )
}
