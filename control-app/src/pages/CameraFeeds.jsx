import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Camera, AlertCircle, Wifi, RefreshCw } from 'lucide-react'
import './CameraFeeds.css'

const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.08 } },
    exit: { opacity: 0, y: -16, transition: { duration: 0.2 } },
}

const itemVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
}

export default function CameraFeeds() {
    const [isConnected, setIsConnected] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [streamUrl, setStreamUrl] = useState('/api/camera/video-feed')
    const [streamNonce, setStreamNonce] = useState(Date.now())
    const [zoneStatus, setZoneStatus] = useState({
        cam1: { top_left: false, top_right: false, bottom_left: false, bottom_right: false },
        cam2: { top_left: false, top_right: false, bottom_left: false, bottom_right: false },
    })
    const [cameraStatus, setCameraStatus] = useState({
        cam1: { connected: false, fps: 0 },
        cam2: { connected: false, fps: 0 },
    })

    // Fetch zone occupancy status from backend
    useEffect(() => {
        const fetchZoneStatus = async () => {
            try {
                const response = await fetch('/api/camera/zone-status')
                if (response.ok) {
                    const data = await response.json()
                    setZoneStatus(data.zoneStatus || {})
                    setCameraStatus(data.cameraStatus || {})
                    setIsConnected(!!data.streamOnline)
                    if (data.streamOnline) {
                        setIsLoading(false)
                        setError('')
                    }
                    if (data.runtimeError) {
                        setError(`Camera runtime error: ${data.runtimeError}`)
                    }
                }
            } catch (err) {
                console.error('Failed to fetch zone status:', err)
                setIsConnected(false)
            }
        }

        fetchZoneStatus()
        const interval = setInterval(fetchZoneStatus, 500)
        return () => clearInterval(interval)
    }, [])

    const handleStreamUrlChange = (e) => {
        setStreamUrl(e.target.value)
        setIsLoading(true)
        setError('')
        setStreamNonce(Date.now())
    }

    const handleRefresh = () => {
        setIsLoading(true)
        setError('')
        setStreamNonce(Date.now())
    }

    const zoneNames = {
        top_left: 'Top Left',
        top_right: 'Top Right',
        bottom_left: 'Bottom Left',
        bottom_right: 'Bottom Right',
    }

    return (
        <motion.div
            className="camera-feeds"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
        >
            {/* Header */}
            <motion.section className="feeds-header" variants={itemVariants}>
                <div className="feeds-title-section">
                    <div className="feeds-badge">
                        <Camera size={12} />
                        <span>LIVE CAMERA FEEDS</span>
                    </div>
                    <h1 className="feeds-title">Overall Camera Footages</h1>
                    <p className="feeds-subtitle">
                        Real-time YOLO occupancy detection across all monitored zones
                    </p>
                </div>
                <div className="feeds-status">
                    <div className={`status-indicator ${isConnected ? 'online' : 'offline'}`} />
                    <span>{isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
                </div>
            </motion.section>

            {/* Video Stream Section */}
            <motion.section className="video-stream-section" variants={itemVariants}>
                <div className="stream-container glass-card">
                    {isLoading && (
                        <div className="stream-loading">
                            <RefreshCw className="spin" size={32} />
                            <p>Connecting to camera feed...</p>
                        </div>
                    )}
                    {error && (
                        <div className="stream-error">
                            <AlertCircle size={24} />
                            <p>{error}</p>
                        </div>
                    )}
                    <img
                        src={`${streamUrl}${streamUrl.includes('?') ? '&' : '?'}t=${streamNonce}`}
                        alt="Overall camera footage"
                        className="stream-video"
                        onLoad={() => {
                            setIsLoading(false)
                            setIsConnected(true)
                            setError('')
                        }}
                        onError={() => {
                            setIsConnected(false)
                            setError('Failed to connect to video stream. Make sure the EcoEYE backend is running.')
                            setIsLoading(false)
                        }}
                        style={{ display: isLoading || error ? 'none' : 'block' }}
                    />
                </div>

                {/* Stream Configuration */}
                <div className="stream-config glass-card">
                    <div className="config-group">
                        <label htmlFor="stream-url">Stream URL</label>
                        <input
                            id="stream-url"
                            type="text"
                            value={streamUrl}
                            onChange={handleStreamUrlChange}
                            placeholder="http://localhost:5000/video_feed"
                            className="config-input"
                        />
                    </div>
                    <button
                        onClick={handleRefresh}
                        className="btn-secondary"
                        title="Refresh video stream"
                    >
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>
            </motion.section>

            {/* Zone Occupancy Status */}
            <motion.section className="zone-status-section" variants={itemVariants}>
                <div className="section-title">ZONE OCCUPANCY STATUS</div>
                <div className="zone-statusGrid">
                    {Object.entries(zoneStatus).map(([camKey, zones]) => (
                        <div key={camKey} className="camera-zone-card glass-card">
                            <div className="camera-zone-header">
                                <h3 className="camera-title">
                                    {camKey.toUpperCase()}
                                </h3>
                                <div className={`camera-status-dot ${cameraStatus[camKey]?.connected ? 'online' : 'offline'}`} />
                            </div>

                            <div className="zones-grid-4">
                                {Object.entries(zones).map(([zoneKey, isOccupied]) => (
                                    <div
                                        key={zoneKey}
                                        className={`zone-status-box ${isOccupied ? 'occupied' : 'empty'}`}
                                    >
                                        <div className="zone-status-indicator" />
                                        <div className="zone-status-label">{zoneNames[zoneKey]}</div>
                                        <div className="zone-status-state">
                                            {isOccupied ? 'OCCUPIED' : 'EMPTY'}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {cameraStatus[camKey] && (
                                <div className="camera-stats">
                                    <div className="stat-item">
                                        <span className="stat-label">FPS</span>
                                        <span className="stat-value">{cameraStatus[camKey].fps}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </motion.section>

            {/* Detection Insights */}
            <motion.section className="insights-section" variants={itemVariants}>
                <div className="section-title">DETECTION INSIGHTS</div>
                <div className="insights-grid">
                    {[
                        {
                            label: 'Total Occupied Zones',
                            value: Object.values(zoneStatus)
                                .flatMap((z) => Object.values(z))
                                .filter((v) => v === true).length,
                            icon: <Camera size={16} />,
                        },
                        {
                            label: 'Active Cameras',
                            value: Object.values(cameraStatus).filter((c) => c.connected).length,
                            icon: <Wifi size={16} />,
                        },
                        {
                            label: 'Confidence Threshold',
                            value: '40%',
                            icon: <AlertCircle size={16} />,
                        },
                        {
                            label: 'Decision Interval',
                            value: '1.0s',
                            icon: <Camera size={16} />,
                        },
                    ].map((item, i) => (
                        <div key={i} className="insight-card glass-card">
                            <div className="insight-icon">{item.icon}</div>
                            <div className="insight-content">
                                <div className="insight-label">{item.label}</div>
                                <div className="insight-value">{item.value}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.section>
        </motion.div>
    )
}
