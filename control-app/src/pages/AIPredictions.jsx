import { motion, AnimatePresence } from 'framer-motion'
import { useState, useRef, useEffect } from 'react'
import {
    Brain,
    Sparkles,
    Send,
    Lightbulb,
    ThermometerSun,
    Clock,
    Users,
    Zap,
    Fan,
    BatteryCharging,
    AlertTriangle,
    CheckCircle2,
    ArrowRight,
    Bot,
    User,
    Loader2,
} from 'lucide-react'
import './AIPredictions.css'

const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.06 } },
    exit: { opacity: 0, y: -16 },
}
const itemVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
}

/* ── AI Suggestions ── */
const suggestions = [
    {
        icon: <Clock size={15} />,
        title: 'Schedule HVAC shutdown on weekends',
        detail: 'Occupancy drops significantly on Sat–Sun',
        savings: '~78 kWh/mo',
        priority: 'High',
    },
    {
        icon: <Lightbulb size={15} />,
        title: 'Switch corridors to motion-triggered lighting',
        detail: 'Hallways idle 65% of operating hours',
        savings: '~12 kWh/mo',
        priority: 'High',
    },
    {
        icon: <Users size={15} />,
        title: 'Pre-cool zones 30 min before peak hours',
        detail: 'Reduces compressor strain at peak',
        savings: '~25 kWh/mo',
        priority: 'Medium',
    },
    {
        icon: <ThermometerSun size={15} />,
        title: 'Increase hysteresis delay to 90 seconds',
        detail: 'Cuts compressor cycling by ~25%',
        savings: '~30 kWh/mo',
        priority: 'Medium',
    },
    {
        icon: <Fan size={15} />,
        title: 'Use fans instead of AC when occupancy < 3',
        detail: 'Low-occupancy zones don\'t need full cooling',
        savings: '~40 kWh/mo',
        priority: 'High',
    },
    {
        icon: <BatteryCharging size={15} />,
        title: 'Turn off devices in empty zones within 60s',
        detail: 'Current delay is 5 min — reduce it',
        savings: '~18 kWh/mo',
        priority: 'Medium',
    },
    {
        icon: <Zap size={15} />,
        title: 'Dim lights to 60% in low-traffic periods',
        detail: 'After 18:00 occupancy drops below 20%',
        savings: '~8 kWh/mo',
        priority: 'Low',
    },
]

/* ── AI Chat Responses ── */
const aiResponses = {
    default: "I'm the EcoEYE AI assistant. I can help with energy optimization, zone configuration, device scheduling, and system analysis. Ask me anything!",
    energy: "Based on current data, your biggest energy savings opportunity is **weekend HVAC shutdown** (~78 kWh/month). The cafeteria and lounge also have high idle times — consider reducing AC runtime there by 30%.",
    zone: "You currently have 6 zones configured. The **Server Room** runs 24/7 with precision AC — this is your highest per-zone consumer. The **Hallway** and **Conference Room** have zero occupancy most hours and can be scheduled for auto-shutdown.",
    schedule: "I recommend staggering startup times across zones:\n• **07:00** — Desk Area, Cafeteria\n• **08:00** — Lounge, Conference Room\n• **09:00** — Hallway (motion-only)\n\nThis avoids simultaneous HVAC load and reduces peak demand by ~15%.",
    camera: "All 6 zones have camera coverage. For optimal AI detection, ensure cameras have:\n• Minimum **15 FPS** inference rate\n• Clear line-of-sight to entry/exit points\n• Avoid backlighting from windows",
    savings: "Projected monthly savings if all suggestions are implemented:\n• Lighting: **20 kWh**\n• HVAC: **133 kWh**\n• Fans/misc: **58 kWh**\n• **Total: ~211 kWh/month** (~$31 cost reduction)",
    occupancy: "Peak occupancy patterns:\n• **Monday 12:00** has the highest (10 people)\n• Weekends average under 2 people\n• After 18:00, all zones drop below 3 people\n\nAutomate shutdown for zones idle after 18:30.",
}

function getAIResponse(input) {
    const lower = input.toLowerCase()
    if (lower.includes('energy') || lower.includes('power') || lower.includes('consumption') || lower.includes('usage'))
        return aiResponses.energy
    if (lower.includes('zone') || lower.includes('room') || lower.includes('area'))
        return aiResponses.zone
    if (lower.includes('schedule') || lower.includes('time') || lower.includes('startup') || lower.includes('when'))
        return aiResponses.schedule
    if (lower.includes('camera') || lower.includes('cctv') || lower.includes('detection') || lower.includes('ai'))
        return aiResponses.camera
    if (lower.includes('save') || lower.includes('cost') || lower.includes('money') || lower.includes('reduce'))
        return aiResponses.savings
    if (lower.includes('occupancy') || lower.includes('people') || lower.includes('peak') || lower.includes('crowd'))
        return aiResponses.occupancy
    return "That's a great question! Based on the analytics I've processed, I'd suggest checking the **Analytics** tab for specific data trends, then come back to ask me about optimization strategies for what you find."
}

/* ── Quick Prompts ── */
const quickPrompts = [
    'How can I save more energy?',
    'What are the peak occupancy times?',
    'Suggest a zone schedule',
    'How much can I save monthly?',
]

export default function AIPredictions() {
    const [messages, setMessages] = useState([
        { role: 'ai', text: aiResponses.default },
    ])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const chatEndRef = useRef(null)
    const inputRef = useRef(null)

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isTyping])

    const sendMessage = (text) => {
        const msg = text || input.trim()
        if (!msg) return

        setMessages((prev) => [...prev, { role: 'user', text: msg }])
        setInput('')
        setIsTyping(true)

        // Simulate AI thinking
        setTimeout(() => {
            const reply = getAIResponse(msg)
            setMessages((prev) => [...prev, { role: 'ai', text: reply }])
            setIsTyping(false)
        }, 800 + Math.random() * 600)
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    return (
        <motion.div
            className="predictions-page"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
        >
            {/* Header */}
            <motion.div className="page-header" variants={itemVariants}>
                <div>
                    <div className="ai-badge">
                        <Sparkles size={11} />
                        EDGE AI
                    </div>
                    <h1 className="page-title">AI Suggestions</h1>
                    <p className="page-desc">Smart recommendations & interactive assistant</p>
                </div>
            </motion.div>

            <div className="ai-layout">
                {/* Left — Suggestions */}
                <motion.div className="suggestions-panel" variants={itemVariants}>
                    <div className="panel-title">
                        <Lightbulb size={13} />
                        Optimization Suggestions
                    </div>
                    <div className="suggestions-list">
                        {suggestions.map((s, i) => (
                            <motion.div
                                className="suggestion-row"
                                key={i}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                whileHover={{ x: 2 }}
                            >
                                <div className={`sug-icon sug-icon--${s.priority.toLowerCase()}`}>
                                    {s.icon}
                                </div>
                                <div className="sug-content">
                                    <div className="sug-title">{s.title}</div>
                                    <div className="sug-detail">{s.detail}</div>
                                </div>
                                <div className="sug-meta">
                                    <span className="sug-savings">{s.savings}</span>
                                    <span className={`sug-priority sug-priority--${s.priority.toLowerCase()}`}>
                                        {s.priority}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                    <div className="total-savings-bar glass-card">
                        <Zap size={14} />
                        <span>Total potential savings</span>
                        <strong>~211 kWh/month</strong>
                    </div>
                </motion.div>

                {/* Right — AI Chat */}
                <motion.div className="chat-panel glass-card" variants={itemVariants}>
                    <div className="chat-header">
                        <div className="chat-header-left">
                            <div className="chat-avatar">
                                <Brain size={16} />
                            </div>
                            <div>
                                <div className="chat-agent-name">EcoEYE AI</div>
                                <div className="chat-agent-status">
                                    <span className="status-dot-sm" />
                                    Online
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="chat-messages">
                        <AnimatePresence>
                            {messages.map((msg, i) => (
                                <motion.div
                                    className={`chat-msg chat-msg--${msg.role}`}
                                    key={i}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className={`msg-avatar msg-avatar--${msg.role}`}>
                                        {msg.role === 'ai' ? <Bot size={14} /> : <User size={14} />}
                                    </div>
                                    <div className={`msg-bubble msg-bubble--${msg.role}`}>
                                        {msg.text.split('\n').map((line, li) => (
                                            <p key={li}>
                                                {line.split(/(\*\*[^*]+\*\*)/).map((part, pi) =>
                                                    part.startsWith('**') && part.endsWith('**')
                                                        ? <strong key={pi}>{part.slice(2, -2)}</strong>
                                                        : part
                                                )}
                                            </p>
                                        ))}
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {isTyping && (
                            <motion.div
                                className="chat-msg chat-msg--ai"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                            >
                                <div className="msg-avatar msg-avatar--ai">
                                    <Bot size={14} />
                                </div>
                                <div className="msg-bubble msg-bubble--ai typing-bubble">
                                    <Loader2 size={14} className="spin" />
                                    <span>Thinking…</span>
                                </div>
                            </motion.div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Quick prompts */}
                    <div className="quick-prompts">
                        {quickPrompts.map((q, i) => (
                            <button
                                className="quick-prompt-btn"
                                key={i}
                                onClick={() => sendMessage(q)}
                            >
                                {q}
                            </button>
                        ))}
                    </div>

                    {/* Input */}
                    <div className="chat-input-bar">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Ask EcoEYE AI anything…"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <motion.button
                            className="chat-send-btn"
                            onClick={() => sendMessage()}
                            whileTap={{ scale: 0.92 }}
                            disabled={!input.trim()}
                        >
                            <Send size={16} />
                        </motion.button>
                    </div>
                </motion.div>
            </div>
        </motion.div>
    )
}
