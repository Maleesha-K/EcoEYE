import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Zap,
  CalendarDays,
  Gauge,
  Coins,
  TimerReset,
  BatteryCharging,
  ArrowUpRight,
  ArrowDownRight,
  Leaf,
  Clock3,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  PieChart,
  Pie,
} from 'recharts'
import './EnergyDashboard.css'

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, staggerChildren: 0.07 } },
  exit: { opacity: 0, y: -16 },
}

const itemVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
}

const palette = ['#ffffff', '#cfcfcf', '#9a9a9a', '#707070', '#4d4d4d', '#2c2c2c']

const formatMonthLabel = (monthKey) => {
  const [year, month] = String(monthKey).split('-').map((item) => Number(item))
  if (!year || !month) return monthKey
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 1))
}

const formatDuration = (seconds) => {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

function MetricCard({ icon, label, value, detail, up = true }) {
  return (
    <div className="energy-metric glass-card">
      <div className="energy-metric-top">
        <div className="energy-metric-icon">{icon}</div>
        <div className={`energy-metric-badge ${up ? 'trend-up' : 'trend-down'}`}>
          {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {detail}
        </div>
      </div>
      <div className="energy-metric-value">{value}</div>
      <div className="energy-metric-label">{label}</div>
    </div>
  )
}

export default function EnergyDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ratePerKwh, setRatePerKwh] = useState(0.15)
  const [payload, setPayload] = useState({ months: [], recentEvents: [], openSessions: [], currentMonth: null })

  useEffect(() => {
    const controller = new AbortController()

    const loadEnergy = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/energy/monthly?ratePerKwh=${encodeURIComponent(ratePerKwh.toString())}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('ecoeye_token') || ''}`,
          },
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error('Failed to load energy history')
        }
        const data = await res.json()
        setPayload(data)
        if (typeof data.ratePerKwh === 'number') {
          setRatePerKwh(data.ratePerKwh)
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        setLoading(false)
      }
    }

    loadEnergy()
    return () => controller.abort()
  }, [])

  const months = payload.months || []
  const currentMonth = payload.currentMonth || {
    month: new Date().toISOString().slice(0, 7),
    totalJoules: 0,
    totalKwh: 0,
    estimatedBill: 0,
    sessions: 0,
    devices: [],
    topDevice: null,
  }

  const chartData = useMemo(
    () => months.map((month) => ({
      month: formatMonthLabel(month.month),
      joules: Number(month.totalJoules || 0),
      kwh: Number(month.totalKwh || 0),
    })),
    [months]
  )

  const deviceChartData = useMemo(
    () => (currentMonth.devices || []).map((device) => ({
      name: device.deviceName,
      kwh: Number(device.totalKwh || 0),
      joules: Number(device.totalJoules || 0),
    })),
    [currentMonth.devices]
  )

  const totalTrackedMonths = months.length
  const totalSessions = months.reduce((sum, month) => sum + Number(month.sessions || 0), 0)
  const openSessions = payload.openSessions || []
  const topDevice = currentMonth.topDevice || null
  const totalKwh = Number(currentMonth.totalKwh || 0)
  const totalJoules = Number(currentMonth.totalJoules || 0)
  const estimatedBill = totalKwh * ratePerKwh

  if (loading) {
    return <div className="energy-page">Loading energy dashboard...</div>
  }

  return (
    <motion.div className="energy-page" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <motion.div className="energy-hero glass-card" variants={itemVariants}>
        <div className="energy-hero-copy">
          <div className="energy-badge">
            <Zap size={12} />
            MONTHLY ENERGY TRACKING
          </div>
          <h1 className="energy-title">
            SYSTEM ENERGY
            <br />
            <span>MONTHLY DASHBOARD</span>
          </h1>
          <p className="energy-desc">
            Each ON to OFF control cycle is captured, converted from watts and runtime into joules, and rolled up by month for bill estimation.
          </p>
        </div>

        <div className="energy-rate-panel">
          <div className="energy-rate-label">Tariff input</div>
          <label className="energy-rate-field">
            <span>Rate per kWh</span>
            <input type="number" min="0" step="0.01" value={ratePerKwh} onChange={(e) => setRatePerKwh(Number(e.target.value || 0))} />
          </label>
          <div className="energy-rate-hint">Used only for the estimate shown on this page.</div>
        </div>
      </motion.div>

      {error && <div className="energy-error">{error}</div>}

      <motion.section className="energy-grid energy-grid--metrics" variants={itemVariants}>
        <MetricCard
          icon={<Gauge size={18} />}
          label="Current month Joules"
          value={`${totalJoules.toLocaleString(undefined, { maximumFractionDigits: 0 })} J`}
          detail={`${currentMonth.sessions || 0} sessions`}
        />
        <MetricCard
          icon={<BatteryCharging size={18} />}
          label="Current month kWh"
          value={`${totalKwh.toFixed(3)} kWh`}
          detail={`${totalTrackedMonths} tracked months`}
        />
        <MetricCard
          icon={<Coins size={18} />}
          label="Estimated monthly bill"
          value={estimatedBill.toFixed(2)}
          detail="rate applied to current month"
          up={false}
        />
        <MetricCard
          icon={<TimerReset size={18} />}
          label="Open device sessions"
          value={`${openSessions.length}`}
          detail={`${totalSessions} total sessions`}
        />
      </motion.section>

      <div className="energy-layout">
        <motion.section className="energy-panel glass-card" variants={itemVariants}>
          <div className="energy-panel-head">
            <div>
              <div className="panel-kicker">MONTHLY TREND</div>
              <h2 className="panel-title">Joules and kWh over time</h2>
            </div>
            <div className="panel-chip">
              <CalendarDays size={13} />
              {totalTrackedMonths || 0} months stored
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="energyMonthlyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ffffff" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1d1d1d" />
              <XAxis dataKey="month" stroke="#666" tick={{ fill: '#8f8f8f', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#666" tick={{ fill: '#8f8f8f', fontSize: 11 }} axisLine={false} tickLine={false} unit=" kWh" />
              <Tooltip
                contentStyle={{
                  background: '#0d0d0d',
                  border: '1px solid #222',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: '0.8rem',
                }}
              />
              <Area type="monotone" dataKey="kwh" stroke="#ffffff" strokeWidth={2} fill="url(#energyMonthlyGrad)" name="kWh" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.section>

        <motion.section className="energy-panel glass-card" variants={itemVariants}>
          <div className="energy-panel-head">
            <div>
              <div className="panel-kicker">CURRENT MONTH</div>
              <h2 className="panel-title">Device contribution</h2>
            </div>
            <div className="panel-chip">
              <Leaf size={13} />
              {topDevice ? `${topDevice.deviceName}` : 'No completed sessions yet'}
            </div>
          </div>

          <div className="energy-device-chart">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={deviceChartData} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1d1d1d" />
                <XAxis type="number" stroke="#666" tick={{ fill: '#8f8f8f', fontSize: 11 }} axisLine={false} tickLine={false} unit=" kWh" />
                <YAxis type="category" dataKey="name" stroke="#666" tick={{ fill: '#8f8f8f', fontSize: 11 }} width={110} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#0d0d0d',
                    border: '1px solid #222',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: '0.8rem',
                  }}
                />
                <Bar dataKey="kwh" fill="#ffffff" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.section>
      </div>

      <div className="energy-layout energy-layout--bottom">
        <motion.section className="energy-panel glass-card" variants={itemVariants}>
          <div className="energy-panel-head">
            <div>
              <div className="panel-kicker">DEVICE MIX</div>
              <h2 className="panel-title">Current month share</h2>
            </div>
          </div>

          <div className="energy-pie-wrap">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={deviceChartData} dataKey="kwh" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={3} stroke="none">
                  {deviceChartData.map((_, index) => (
                    <Cell key={index} fill={palette[index % palette.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#0d0d0d',
                    border: '1px solid #222',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: '0.8rem',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="energy-legend">
              {(currentMonth.devices || []).map((device, index) => (
                <div className="energy-legend-row" key={device.deviceId}>
                  <span className="energy-legend-dot" style={{ background: palette[index % palette.length] }} />
                  <span className="energy-legend-name">{device.deviceName}</span>
                  <span className="energy-legend-value">{Number(device.totalKwh || 0).toFixed(3)} kWh</span>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section className="energy-panel glass-card" variants={itemVariants}>
          <div className="energy-panel-head">
            <div>
              <div className="panel-kicker">RECENT EVENTS</div>
              <h2 className="panel-title">Latest captured control cycles</h2>
            </div>
            <div className="panel-chip">
              <Clock3 size={13} />
              {payload.recentEvents?.length || 0} stored
            </div>
          </div>

          <div className="energy-timeline">
            {(payload.recentEvents || []).length === 0 && (
              <div className="energy-empty">
                No completed ON to OFF cycles have been recorded yet.
              </div>
            )}
            {(payload.recentEvents || []).map((event) => (
              <div className="energy-event" key={`${event.deviceId}-${event.timestamp}`}>
                <div className="energy-event-dot" />
                <div className="energy-event-body">
                  <div className="energy-event-top">
                    <strong>{event.deviceName}</strong>
                    <span>{formatMonthLabel(event.month)}</span>
                  </div>
                  <div className="energy-event-meta">
                    <span>{event.wattageW} W</span>
                    <span>{formatDuration(event.durationSeconds)}</span>
                    <span>{Number(event.energyJoules || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} J</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      </div>
    </motion.div>
  )
}