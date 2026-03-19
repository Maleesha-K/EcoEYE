import { useState } from 'react'
import { Bot, MessageCircle, Send, X } from 'lucide-react'
import './ChatAssistant.css'

export default function ChatAssistant({ token }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Hi. I am your local offline assistant. Ask me about status, zones, or settings.',
    },
  ])

  const sendMessage = async () => {
    const message = input.trim()
    if (!message || loading) {
      return
    }

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: message }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Assistant unavailable')
      }

      setMessages((prev) => [...prev, { role: 'assistant', text: data.reply }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: err.message }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="chatbot-shell">
      {open && (
        <div className="chatbot-panel glass-card">
          <div className="chatbot-header">
            <div className="chatbot-title">
              <Bot size={14} />
              Local Assistant
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant">
              <X size={14} />
            </button>
          </div>

          <div className="chatbot-messages">
            {messages.map((m, idx) => (
              <div className={`chatbot-msg chatbot-msg--${m.role}`} key={`${m.role}-${idx}`}>
                {m.text}
              </div>
            ))}
          </div>

          <div className="chatbot-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  sendMessage()
                }
              }}
              placeholder="Ask for status or settings"
            />
            <button onClick={sendMessage} disabled={loading}>
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      <button className="chatbot-fab" onClick={() => setOpen((prev) => !prev)}>
        <MessageCircle size={16} />
        Assistant
      </button>
    </div>
  )
}
