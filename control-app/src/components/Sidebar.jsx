import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
    LayoutDashboard,
    Grid3X3,
    BarChart3,
    Settings,
    Eye,
    Menu,
    X,
    Brain,
    LogOut,
    SlidersHorizontal,
    Camera,
} from 'lucide-react'
import { useState } from 'react'
import './Sidebar.css'

const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/setup', label: 'Initial Setup', icon: SlidersHorizontal },
    { path: '/zones', label: 'Zones', icon: Grid3X3 },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/predictions', label: 'AI Predictions', icon: Brain },
    { path: '/camera-feeds', label: 'Camera Feeds', icon: Camera },
    { path: '/camera-setup', label: 'Camera Setup', icon: Camera },
    { path: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ username, onLogout, setupLocked }) {
    const [mobileOpen, setMobileOpen] = useState(false)
    const location = useLocation()
    const visibleNavItems = setupLocked ? navItems.filter((item) => item.path === '/setup') : navItems

    return (
        <>
            {/* Mobile toggle */}
            <button
                className="mobile-menu-btn"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
            >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            {/* Overlay */}
            {mobileOpen && (
                <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
            )}

            <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
                {/* Logo */}
                <div className="sidebar-logo">
                    <div className="logo-icon">
                        <Eye size={24} strokeWidth={2.5} />
                    </div>
                    <div className="logo-text">
                        <span className="logo-name">EcoEYE</span>
                        <span className="logo-sub">Control Panel</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="sidebar-nav">
                    <div className="nav-label">NAVIGATION</div>
                    {visibleNavItems.map((item) => {
                        const Icon = item.icon
                        const isActive = location.pathname === item.path
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={`nav-item ${isActive ? 'nav-item--active' : ''}`}
                                onClick={() => setMobileOpen(false)}
                            >
                                {isActive && (
                                    <motion.div
                                        className="nav-item-bg"
                                        layoutId="activeTab"
                                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                    />
                                )}
                                <Icon size={18} />
                                <span>{item.label}</span>
                            </NavLink>
                        )
                    })}
                </nav>

                {/* System Status */}
                <div className="sidebar-footer">
                    <div className="user-block">
                        <div className="status-label">Signed in as</div>
                        <div className="status-sub">{username || 'operator'}</div>
                    </div>
                    <div className="system-status">
                        <div className="status-dot status-dot--online" />
                        <div>
                            <div className="status-label">System Online</div>
                            <div className="status-sub">Edge AI Active</div>
                        </div>
                    </div>
                    <button className="logout-btn" onClick={onLogout}>
                        <LogOut size={14} />
                        Logout
                    </button>
                </div>
            </aside>
        </>
    )
}
