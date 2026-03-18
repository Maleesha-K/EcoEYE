import { motion } from 'framer-motion'
import {
    Zap,
    Users,
    Leaf,
    Activity,
    Power,
    Thermometer,
    Lightbulb,
    Fan,
    Camera,
    Wifi,
    Cpu,
    ArrowUpRight,
    ArrowDownRight,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from 'recharts'
import './Dashboard.css'

const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.08 } },
    exit: { opacity: 0, y: -16, transition: { duration: 0.2 } },
}

const itemVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
}

const energyData = [
    { time: '00:00', usage: 4.2, saved: 1.8 },
    { time: '03:00', usage: 2.1, saved: 3.4 },
    { time: '06:00', usage: 3.8, saved: 2.2 },
    { time: '09:00', usage: 7.5, saved: 3.1 },
    { time: '12:00', usage: 8.2, saved: 4.0 },
    { time: '15:00', usage: 6.9, saved: 3.6 },
    { time: '18:00', usage: 5.1, saved: 2.8 },
    { time: '21:00', usage: 3.4, saved: 2.1 },
    { time: '24:00', usage: 2.8, saved: 1.9 },
]

const initialZones = [
    {
        id: 1,
        name: 'Lounge Area',
        occupancy: 3,
        maxOccupancy: 8,
        active: true,
        devices: [
            { name: 'Lights', icon: 'lightbulb', on: true },
            { name: 'AC', icon: 'thermometer', on: true },
            { name: 'Fan', icon: 'fan', on: false },
        ],
    },
    {
        id: 2,
        name: 'Desk Area',
        occupancy: 5,
        maxOccupancy: 12,
        active: true,
        devices: [
            { name: 'Lights', icon: 'lightbulb', on: true },
            { name: 'AC', icon: 'thermometer', on: true },
            { name: 'Fan', icon: 'fan', on: true },
        ],
    },
    {
        id: 3,
        name: 'Hallway',
        occupancy: 0,
        maxOccupancy: 6,
        active: false,
        devices: [
            { name: 'Lights', icon: 'lightbulb', on: false },
            { name: 'Fan', icon: 'fan', on: false },
        ],
    },
    {
        id: 4,
        name: 'Conference Room',
        occupancy: 0,
        maxOccupancy: 10,
        active: false,
        devices: [
            { name: 'Lights', icon: 'lightbulb', on: false },
            { name: 'AC', icon: 'thermometer', on: false },
            { name: 'Fan', icon: 'fan', on: false },
        ],
    },
]

const DeviceIcon = ({ type, size = 14 }) => {
    switch (type) {
        case 'lightbulb': return <Lightbulb size={size} />
        case 'thermometer': return <Thermometer size={size} />
        case 'fan': return <Fan size={size} />
        default: return <Power size={size} />
    }
}

function AnimatedCounter({ value, suffix = '' }) {
    const [display, setDisplay] = useState(0)
    useEffect(() => {
        let start = 0
        const end = parseFloat(value)
        const duration = 1200
        const startTime = performance.now()
        function step(now) {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setDisplay(Math.round(eased * end * 10) / 10)
            if (progress < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
    }, [value])
    return <>{Number.isInteger(value) ? Math.round(display) : display.toFixed(1)}{suffix}</>
}

export default function Dashboard() {
    const [zones, setZones] = useState(initialZones)

    const toggleZone = (zoneId) => {
        setZones((prev) =>
            prev.map((z) =>
                z.id === zoneId
                    ? {
                        ...z,
                        active: !z.active,
                        devices: z.devices.map((d) => ({ ...d, on: !z.active })),
                    }
                    : z
            )
        )
    }

    const activeZones = zones.filter((z) => z.active).length
    const totalOccupancy = zones.reduce((sum, z) => sum + z.occupancy, 0)

    return (
        <motion.div
            className="dashboard"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
        >
            {/* Hero */}
            <motion.section className="hero" variants={itemVariants}>
                <div className="hero-badge">
                    <Activity size={12} />
                    <span>LIVE MONITORING</span>
                </div>
                <h1 className="hero-title">
                    CONTROL
                    <br />
                    YOUR <span className="hero-highlight">ENERGY</span>
                </h1>
                <p className="hero-subtitle">
                    Intelligent occupancy-based energy optimization. Real-time AI vision
                    processing with autonomous IoT control.
                </p>
                <div className="hero-actions">
                    <button className="btn-primary" onClick={() => document.getElementById('zones-section')?.scrollIntoView({ behavior: 'smooth' })}>
                        <Power size={16} />
                        Manage Zones
                    </button>
                    <div className="hero-links">
                        <span>MQTT</span>
                        <span>·</span>
                        <span>EDGE AI</span>
                        <span>·</span>
                        <span>IoT</span>
                    </div>
                </div>
            </motion.section>

            {/* Stats */}
            <motion.section className="stats-grid" variants={itemVariants}>
                {[
                    {
                        label: 'Active Zones',
                        value: activeZones,
                        total: zones.length,
                        icon: <Zap size={18} />,
                        trend: '+1',
                        up: true
                    },
                    {
                        label: 'Occupancy',
                        value: totalOccupancy,
                        total: zones.reduce((s, z) => s + z.maxOccupancy, 0),
                        icon: <Users size={18} />,
                        trend: '-2',
                        up: false
                    },
                    {
                        label: 'Energy Saved',
                        value: 34.2,
                        suffix: '%',
                        icon: <Activity size={18} />,
                        trend: '+5.1%',
                        up: true
                    },
                    {
                        label: 'CO₂ Reduced',
                        value: 2.8,
                        suffix: 't',
                        icon: <Leaf size={18} />,
                        trend: '+0.3t',
                        up: true
                    },
                ].map((stat, i) => (
                    <motion.div
                        className="stat-card glass-card"
                        key={i}
                        whileHover={{ y: -2 }}
                        transition={{ type: 'spring', stiffness: 300 }}
                    >
                        <div className="stat-header">
                            <div className="stat-icon">{stat.icon}</div>
                            <div className={`stat-trend ${stat.up ? 'trend-up' : 'trend-down'}`}>
                                {stat.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {stat.trend}
                            </div>
                        </div>
                        <div className="stat-value">
                            <AnimatedCounter value={stat.value} suffix={stat.suffix || ''} />
                            {stat.total && (
                                <span className="stat-total">/ {stat.total}</span>
                            )}
                        </div>
                        <div className="stat-label">{stat.label}</div>
                    </motion.div>
                ))}
            </motion.section>

            {/* Zone Controls */}
            <motion.section id="zones-section" variants={itemVariants}>
                <div className="section-title">ZONE CONTROLS</div>
                <div className="zones-grid">
                    {zones.map((zone) => (
                        <motion.div
                            className={`zone-card glass-card ${zone.active ? 'zone-card--active' : ''}`}
                            key={zone.id}
                            whileHover={{ y: -3 }}
                            transition={{ type: 'spring', stiffness: 300 }}
                        >
                            <div className="zone-header">
                                <div>
                                    <h3 className="zone-name">{zone.name}</h3>
                                    <div className="zone-occupancy">
                                        <Users size={12} />
                                        <span>
                                            {zone.occupancy} / {zone.maxOccupancy}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    className={`zone-toggle ${zone.active ? 'zone-toggle--on' : ''}`}
                                    onClick={() => toggleZone(zone.id)}
                                    aria-label={`Toggle ${zone.name}`}
                                >
                                    <motion.div
                                        className="zone-toggle-knob"
                                        layout
                                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                    />
                                </button>
                            </div>
                            <div className="zone-devices">
                                {zone.devices.map((device, di) => (
                                    <div
                                        className={`device-chip ${device.on ? 'device-chip--on' : ''}`}
                                        key={di}
                                    >
                                        <DeviceIcon type={device.icon} />
                                        <span>{device.name}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="zone-bar-container">
                                <motion.div
                                    className="zone-bar"
                                    initial={{ width: 0 }}
                                    animate={{
                                        width: `${(zone.occupancy / zone.maxOccupancy) * 100}%`,
                                    }}
                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.section>

            {/* Energy Chart */}
            <motion.section className="chart-section" variants={itemVariants}>
                <div className="section-title">ENERGY CONSUMPTION — 24H</div>
                <div className="chart-card glass-card">
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={energyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="savedGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                            <XAxis
                                dataKey="time"
                                stroke="#444"
                                tick={{ fill: '#999', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                stroke="#444"
                                tick={{ fill: '#999', fontSize: 11 }}
                                axisLine={false}
                                tickLine={false}
                                unit=" kWh"
                            />
                            <Tooltip
                                contentStyle={{
                                    background: '#111',
                                    border: '1px solid #222',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '0.8rem',
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="usage"
                                stroke="#ffffff"
                                strokeWidth={2}
                                fill="url(#usageGrad)"
                                name="Usage"
                            />
                            <Area
                                type="monotone"
                                dataKey="saved"
                                stroke="#22c55e"
                                strokeWidth={2}
                                fill="url(#savedGrad)"
                                name="Saved"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </motion.section>

            {/* System Status */}
            <motion.section className="system-section" variants={itemVariants}>
                <div className="section-title">SYSTEM STATUS</div>
                <div className="system-grid">
                    {[
                        {
                            icon: <Camera size={18} />,
                            label: 'CCTV Feeds',
                            value: '4 Active',
                            status: 'online',
                        },
                        {
                            icon: <Wifi size={18} />,
                            label: 'MQTT Broker',
                            value: 'Connected',
                            status: 'online',
                        },
                        {
                            icon: <Cpu size={18} />,
                            label: 'Edge Device',
                            value: 'RPi 4 — 42°C',
                            status: 'online',
                        },
                        {
                            icon: <Activity size={18} />,
                            label: 'AI Inference',
                            value: '23 FPS',
                            status: 'online',
                        },
                    ].map((item, i) => (
                        <div className="system-card glass-card" key={i}>
                            <div className="system-card-icon">{item.icon}</div>
                            <div className="system-card-info">
                                <div className="system-card-label">{item.label}</div>
                                <div className="system-card-value">{item.value}</div>
                            </div>
                            <div className={`status-dot status-dot--${item.status}`} />
                        </div>
                    ))}
                </div>
            </motion.section>
        </motion.div>
    )
}
