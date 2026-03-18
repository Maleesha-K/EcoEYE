import { motion } from 'framer-motion'
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    Leaf,
    Zap,
    Calendar,
} from 'lucide-react'
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts'
import './Analytics.css'

const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.06 } },
    exit: { opacity: 0, y: -16 },
}
const itemVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
}

const weeklyData = [
    { day: 'Mon', usage: 42, saved: 18 },
    { day: 'Tue', usage: 38, saved: 22 },
    { day: 'Wed', usage: 45, saved: 15 },
    { day: 'Thu', usage: 36, saved: 24 },
    { day: 'Fri', usage: 40, saved: 20 },
    { day: 'Sat', usage: 22, saved: 8 },
    { day: 'Sun', usage: 18, saved: 5 },
]

const monthlyTrend = [
    { month: 'Jan', energy: 320, cost: 48 },
    { month: 'Feb', energy: 290, cost: 43 },
    { month: 'Mar', energy: 310, cost: 46 },
    { month: 'Apr', energy: 275, cost: 41 },
    { month: 'May', energy: 250, cost: 37 },
    { month: 'Jun', energy: 230, cost: 34 },
    { month: 'Jul', energy: 210, cost: 31 },
    { month: 'Aug', energy: 195, cost: 29 },
]

const zoneDistribution = [
    { name: 'Lounge', value: 28 },
    { name: 'Desk Area', value: 35 },
    { name: 'Conference', value: 18 },
    { name: 'Cafeteria', value: 12 },
    { name: 'Others', value: 7 },
]

const pieColors = ['#ffffff', '#cccccc', '#999999', '#666666', '#444444']

const occupancyHeatmap = [
    { hour: '06', mon: 0, tue: 0, wed: 1, thu: 0, fri: 1, sat: 0, sun: 0 },
    { hour: '08', mon: 3, tue: 4, wed: 3, thu: 5, fri: 3, sat: 1, sun: 0 },
    { hour: '10', mon: 8, tue: 7, wed: 9, thu: 8, fri: 7, sat: 2, sun: 1 },
    { hour: '12', mon: 10, tue: 9, wed: 10, thu: 9, fri: 8, sat: 3, sun: 1 },
    { hour: '14', mon: 9, tue: 8, wed: 8, thu: 7, fri: 6, sat: 2, sun: 0 },
    { hour: '16', mon: 7, tue: 6, wed: 7, thu: 6, fri: 5, sat: 1, sun: 0 },
    { hour: '18', mon: 4, tue: 3, wed: 4, thu: 3, fri: 2, sat: 0, sun: 0 },
    { hour: '20', mon: 1, tue: 1, wed: 2, thu: 1, fri: 1, sat: 0, sun: 0 },
]

const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function HeatmapCell({ value, maxVal }) {
    const intensity = value / maxVal
    const bg = `rgba(255, 255, 255, ${intensity * 0.7})`
    return (
        <div
            className="heatmap-cell"
            style={{ background: bg }}
            title={`${value} occupants`}
        >
            {value > 0 ? value : ''}
        </div>
    )
}

export default function Analytics() {
    const maxOccupancy = Math.max(
        ...occupancyHeatmap.flatMap((row) => days.map((d) => row[d]))
    )

    return (
        <motion.div
            className="analytics-page"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
        >
            <motion.div className="page-header" variants={itemVariants}>
                <div>
                    <h1 className="page-title">Analytics</h1>
                    <p className="page-desc">Energy consumption insights and occupancy trends</p>
                </div>
                <div className="period-selector">
                    <button className="period-btn period-btn--active">Week</button>
                    <button className="period-btn">Month</button>
                    <button className="period-btn">Year</button>
                </div>
            </motion.div>

            {/* Summary Cards */}
            <motion.div className="analytics-summary" variants={itemVariants}>
                {[
                    { label: 'Total Consumption', value: '241 kWh', icon: <Zap size={16} />, change: '-12%', up: false },
                    { label: 'Energy Saved', value: '112 kWh', icon: <Leaf size={16} />, change: '+18%', up: true },
                    { label: 'Cost Savings', value: '$34.20', icon: <TrendingUp size={16} />, change: '+22%', up: true },
                    { label: 'CO₂ Avoided', value: '2.8 tonnes', icon: <Leaf size={16} />, change: '+15%', up: true },
                ].map((card, i) => (
                    <div className="analytics-card glass-card" key={i}>
                        <div className="analytics-card-top">
                            <div className="analytics-card-icon">{card.icon}</div>
                            <div className={`analytics-card-change ${card.up ? 'trend-up' : 'trend-down'}`}>
                                {card.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                {card.change}
                            </div>
                        </div>
                        <div className="analytics-card-value">{card.value}</div>
                        <div className="analytics-card-label">{card.label}</div>
                    </div>
                ))}
            </motion.div>

            {/* Charts Row */}
            <div className="charts-row">
                <motion.div className="chart-block glass-card" variants={itemVariants}>
                    <div className="chart-block-title">Weekly Energy Usage vs Saved</div>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={weeklyData} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                            <XAxis dataKey="day" stroke="#444" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis stroke="#444" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} unit=" kWh" />
                            <Tooltip contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: '0.8rem' }} />
                            <Bar dataKey="usage" name="Used" fill="#ffffff" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="saved" name="Saved" fill="#444444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </motion.div>

                <motion.div className="chart-block glass-card" variants={itemVariants}>
                    <div className="chart-block-title">Energy Distribution by Zone</div>
                    <div className="pie-wrapper">
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie
                                    data={zoneDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={85}
                                    paddingAngle={3}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {zoneDistribution.map((_, i) => (
                                        <Cell key={i} fill={pieColors[i]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: '0.8rem' }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="pie-legend">
                            {zoneDistribution.map((item, i) => (
                                <div className="pie-legend-item" key={i}>
                                    <div className="pie-legend-dot" style={{ background: pieColors[i] }} />
                                    <span>{item.name}</span>
                                    <span className="pie-legend-val">{item.value}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Monthly Trend */}
            <motion.div className="chart-block glass-card" variants={itemVariants}>
                <div className="chart-block-title">Monthly Energy Trend</div>
                <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ffffff" stopOpacity={0.12} />
                                <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                        <XAxis dataKey="month" stroke="#444" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis stroke="#444" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} unit=" kWh" />
                        <Tooltip contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 8, color: '#fff', fontSize: '0.8rem' }} />
                        <Area type="monotone" dataKey="energy" stroke="#fff" strokeWidth={2} fill="url(#energyGrad)" name="Energy" />
                    </AreaChart>
                </ResponsiveContainer>
            </motion.div>

            {/* Occupancy Heatmap */}
            <motion.div className="chart-block glass-card" variants={itemVariants}>
                <div className="chart-block-title">
                    <Calendar size={14} />
                    Occupancy Heatmap — Weekly Average
                </div>
                <div className="heatmap">
                    <div className="heatmap-row heatmap-header">
                        <div className="heatmap-label" />
                        {dayLabels.map((d) => (
                            <div className="heatmap-day" key={d}>{d}</div>
                        ))}
                    </div>
                    {occupancyHeatmap.map((row) => (
                        <div className="heatmap-row" key={row.hour}>
                            <div className="heatmap-label">{row.hour}:00</div>
                            {days.map((d) => (
                                <HeatmapCell key={d} value={row[d]} maxVal={maxOccupancy} />
                            ))}
                        </div>
                    ))}
                </div>
            </motion.div>
        </motion.div>
    )
}
