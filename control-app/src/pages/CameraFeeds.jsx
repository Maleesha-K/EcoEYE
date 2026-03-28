import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Camera, AlertCircle, Wifi, RefreshCw, Plus, X, Save } from 'lucide-react'
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
    // Stream & Status State
    const [isConnected, setIsConnected] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [streamUrl, setStreamUrl] = useState('/api/camera/video-feed')
    const [streamNonce, setStreamNonce] = useState(Date.now())
    const [zoneStatus, setZoneStatus] = useState({})
    const [cameraStatus, setCameraStatus] = useState({})

    // Settings Panel State
    const [showSettings, setShowSettings] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [saveSuccess, setSaveSuccess] = useState(false)

    // Config State (mirrors ecoeye_framed_yolo.py globals)
    const [config, setConfig] = useState({
        cameraCount: 2,
        cameraSources: [
            'http://10.10.1.8:8080/video',
            'http://10.10.1.9:8080/video',
        ],
        slotSeconds: 1.0,
        tileWidth: 480,
        tileHeight: 270,
        decisionIntervalSec: 1.0,
        confidenceThreshold: 0.4,
    })

    const [editingConfig, setEditingConfig] = useState({ ...config })
    const [newCameraUrl, setNewCameraUrl] = useState('')

    // Fetch current config from backend on load
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await fetch('/api/camera/config')
                if (response.ok) {
                    const data = await response.json()
                    setConfig(data)
                    setEditingConfig(data)
                }
            } catch (err) {
                console.error('Failed to fetch camera config:', err)
            }
        }
        fetchConfig()
    }, [])

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

    // Handle config changes
    const handleConfigChange = (field, value) => {
        setEditingConfig((prev) => ({
            ...prev,
            [field]: value === '' ? prev[field] : value,
        }))
    }

    const handleAddCamera = () => {
        if (newCameraUrl.trim()) {
            setEditingConfig((prev) => ({
                ...prev,
                cameraSources: [...prev.cameraSources, newCameraUrl.trim()],
                cameraCount: prev.cameraSources.length + 1,
            }))
            setNewCameraUrl('')
        }
    }

    const handleRemoveCamera = (index) => {
        setEditingConfig((prev) => {
            const newSources = prev.cameraSources.filter((_, i) => i !== index)
            return {
                ...prev,
                cameraSources: newSources,
                cameraCount: newSources.length,
            }
        })
    }

    const handleSaveConfig = async () => {
        setIsSaving(true)
        setSaveError('')
        setSaveSuccess(false)

        try {
            const response = await fetch('/api/camera/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editingConfig),
            })

            if (!response.ok) {
                const err = await response.text()
                throw new Error(err || 'Failed to save config')
            }

            const data = await response.json()
            setConfig(editingConfig)
            setSaveSuccess(true)
            setTimeout(() => setSaveSuccess(false), 3000)

            // Refresh stream with new config
            setStreamNonce(Date.now())
            setIsLoading(true)
        } catch (err) {
            console.error('Failed to save camera config:', err)
            setSaveError(err.message || 'Failed to save configuration')
        } finally {
            setIsSaving(false)
        }
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
                <div className="feeds-header-actions">
                    <div className="feeds-status">
                        <div className={`status-indicator ${isConnected ? 'online' : 'offline'}`} />
                        <span>{isConnected ? 'CONNECTED' : 'DISCONNECTED'}</span>
                    </div>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="btn-primary"
                        title="Camera & YOLO settings"
                    >
                        <Camera size={16} />
                        Settings
                    </button>
                </div>
            </motion.section>

            {/* Settings Panel */}
            {showSettings && (
                <motion.section
                    className="settings-panel glass-card"
                    variants={itemVariants}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                >
                    <div className="settings-header">
                        <h2>Camera & YOLO Configuration</h2>
                        <button
                            onClick={() => setShowSettings(false)}
                            className="btn-close"
                            aria-label="Close settings"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Camera Sources List */}
                    <div className="settings-section">
                        <h3 className="settings-title">CAMERA SOURCES</h3>
                        <div className="camera-sources-list">
                            {editingConfig.cameraSources.map((url, index) => (
                                <div key={index} className="camera-source-item">
                                    <input
                                        type="text"
                                        value={url}
                                        onChange={(e) => {
                                            const newSources = [...editingConfig.cameraSources]
                                            newSources[index] = e.target.value
                                            setEditingConfig((prev) => ({
                                                ...prev,
                                                cameraSources: newSources,
                                            }))
                                        }}
                                        className="source-input"
                                        placeholder="Camera URL"
                                    />
                                    <button
                                        onClick={() => handleRemoveCamera(index)}
                                        className="btn-remove"
                                        title="Remove camera"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Add New Camera */}
                        <div className="add-camera-section">
                            <input
                                type="text"
                                value={newCameraUrl}
                                onChange={(e) => setNewCameraUrl(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') handleAddCamera()
                                }}
                                className="source-input"
                                placeholder="Enter new camera URL and press Add"
                            />
                            <button
                                onClick={handleAddCamera}
                                className="btn-secondary"
                                title="Add new camera"
                            >
                                <Plus size={16} />
                                ADD CAMERA
                            </button>
                        </div>
                        <div className="camera-count-display">
                            Active Cameras: <strong>{editingConfig.cameraCount}</strong>
                        </div>
                    </div>

                    {/* YOLO Parameters */}
                    <div className="settings-section">
                        <h3 className="settings-title">YOLO DETECTION PARAMETERS</h3>
                        <div className="params-grid">
                            {/* Slot Seconds */}
                            <div className="param-group">
                                <label htmlFor="slot-seconds">Slot Duration (seconds)</label>
                                <div className="param-input-group">
                                    <input
                                        id="slot-seconds"
                                        type="number"
                                        step="0.1"
                                        value={editingConfig.slotSeconds}
                                        onChange={(e) =>
                                            handleConfigChange('slotSeconds', parseFloat(e.target.value))
                                        }
                                        className="param-input number-input"
                                    />
                                    <span className="param-unit">sec</span>
                                </div>
                                <div className="param-slider">
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="5"
                                        step="0.1"
                                        value={editingConfig.slotSeconds}
                                        onChange={(e) =>
                                            handleConfigChange('slotSeconds', parseFloat(e.target.value))
                                        }
                                    />
                                </div>
                            </div>

                            {/* Decision Interval */}
                            <div className="param-group">
                                <label htmlFor="decision-interval">Decision Interval (seconds)</label>
                                <div className="param-input-group">
                                    <input
                                        id="decision-interval"
                                        type="number"
                                        step="0.1"
                                        value={editingConfig.decisionIntervalSec}
                                        onChange={(e) =>
                                            handleConfigChange('decisionIntervalSec', parseFloat(e.target.value))
                                        }
                                        className="param-input number-input"
                                    />
                                    <span className="param-unit">sec</span>
                                </div>
                                <div className="param-slider">
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="5"
                                        step="0.1"
                                        value={editingConfig.decisionIntervalSec}
                                        onChange={(e) =>
                                            handleConfigChange('decisionIntervalSec', parseFloat(e.target.value))
                                        }
                                    />
                                </div>
                            </div>

                            {/* Confidence Threshold */}
                            <div className="param-group">
                                <label htmlFor="confidence">Confidence Threshold</label>
                                <div className="param-input-group">
                                    <input
                                        id="confidence"
                                        type="number"
                                        step="0.05"
                                        min="0"
                                        max="1"
                                        value={editingConfig.confidenceThreshold}
                                        onChange={(e) =>
                                            handleConfigChange('confidenceThreshold', parseFloat(e.target.value))
                                        }
                                        className="param-input number-input"
                                    />
                                    <span className="param-unit">
                                        {Math.round(editingConfig.confidenceThreshold * 100)}%
                                    </span>
                                </div>
                                <div className="param-slider">
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={editingConfig.confidenceThreshold}
                                        onChange={(e) =>
                                            handleConfigChange('confidenceThreshold', parseFloat(e.target.value))
                                        }
                                    />
                                </div>
                            </div>

                            {/* Tile Width */}
                            <div className="param-group">
                                <label htmlFor="tile-width">Tile Width (pixels)</label>
                                <div className="param-input-group">
                                    <input
                                        id="tile-width"
                                        type="number"
                                        step="10"
                                        value={editingConfig.tileWidth}
                                        onChange={(e) =>
                                            handleConfigChange('tileWidth', parseInt(e.target.value))
                                        }
                                        className="param-input number-input"
                                    />
                                    <span className="param-unit">px</span>
                                </div>
                                <div className="param-slider">
                                    <input
                                        type="range"
                                        min="240"
                                        max="1280"
                                        step="10"
                                        value={editingConfig.tileWidth}
                                        onChange={(e) =>
                                            handleConfigChange('tileWidth', parseInt(e.target.value))
                                        }
                                    />
                                </div>
                            </div>

                            {/* Tile Height */}
                            <div className="param-group">
                                <label htmlFor="tile-height">Tile Height (pixels)</label>
                                <div className="param-input-group">
                                    <input
                                        id="tile-height"
                                        type="number"
                                        step="10"
                                        value={editingConfig.tileHeight}
                                        onChange={(e) =>
                                            handleConfigChange('tileHeight', parseInt(e.target.value))
                                        }
                                        className="param-input number-input"
                                    />
                                    <span className="param-unit">px</span>
                                </div>
                                <div className="param-slider">
                                    <input
                                        type="range"
                                        min="135"
                                        max="720"
                                        step="10"
                                        value={editingConfig.tileHeight}
                                        onChange={(e) =>
                                            handleConfigChange('tileHeight', parseInt(e.target.value))
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Save Actions */}
                    <div className="settings-actions">
                        {saveError && (
                            <div className="alert alert-error">
                                <AlertCircle size={16} />
                                {saveError}
                            </div>
                        )}
                        {saveSuccess && (
                            <div className="alert alert-success">
                                ✓ Configuration saved successfully!
                            </div>
                        )}
                        <button
                            onClick={handleSaveConfig}
                            disabled={isSaving}
                            className="btn-primary btn-save"
                        >
                            <Save size={16} />
                            {isSaving ? 'SAVING...' : 'SAVE CONFIGURATION'}
                        </button>
                    </div>
                </motion.section>
            )}

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

                {/* Stream Refresh Control */}
                <div className="stream-controls glass-card">
                    <button
                        onClick={handleRefresh}
                        className="btn-secondary"
                        title="Refresh video stream"
                    >
                        <RefreshCw size={16} />
                        Refresh Stream
                    </button>
                </div>
            </motion.section>

            {/* Zone Occupancy Status */}
            <motion.section className="zone-status-section" variants={itemVariants}>
                <div className="section-title">ZONE OCCUPANCY STATUS</div>
                {Object.keys(zoneStatus).length === 0 ? (
                    <div className="no-data-message">
                        <AlertCircle size={20} />
                        <p>No cameras connected. Add cameras in Settings.</p>
                    </div>
                ) : (
                    <div className="zone-statusGrid">
                        {Object.entries(zoneStatus).map(([camKey, zones]) => (
                            <div key={camKey} className="camera-zone-card glass-card">
                                <div className="camera-zone-header">
                                    <h3 className="camera-title">{camKey.toUpperCase()}</h3>
                                    <div
                                        className={`camera-status-dot ${cameraStatus[camKey]?.connected ? 'online' : 'offline'}`}
                                    />
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
                )}
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
                            value: `${Math.round(config.confidenceThreshold * 100)}%`,
                            icon: <AlertCircle size={16} />,
                        },
                        {
                            label: 'Decision Interval',
                            value: `${config.decisionIntervalSec}s`,
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
