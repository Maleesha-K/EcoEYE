import { motion } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import { Camera, AlertCircle, Wifi, RefreshCw, Plus, X, Save, Trash2 } from 'lucide-react'
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

const inferSourceType = (source) => {
    const value = String(source || '').trim().toLowerCase()
    return value.startsWith('rtsp://') ? 'rtsp' : 'url'
}

const normalizeSourceByType = (source, type) => {
    const value = String(source || '').trim()
    if (!value) return ''

    if (type === 'rtsp') {
        return value.toLowerCase().startsWith('rtsp://') ? value : `rtsp://${value}`
    }

    if (/^https?:\/\//i.test(value)) {
        return value
    }
    return `http://${value}`
}

const normalizeZoneCounts = (cameraSources, zoneCounts) => {
    const safeZoneCounts = Array.isArray(zoneCounts) ? zoneCounts : []
    return cameraSources.map((_, index) => (safeZoneCounts[index] === 1 ? 1 : 4))
}

const cameraKeyToIndex = (camKey) => {
    const match = String(camKey || '').match(/^cam(\d+)$/i)
    if (!match) return -1
    return Math.max(0, parseInt(match[1], 10) - 1)
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
        zoneCounts: [4, 4],
        slotSeconds: 1.0,
        tileWidth: 480,
        tileHeight: 270,
        decisionIntervalSec: 1.0,
        confidenceThreshold: 0.4,
    })

    const [editingConfig, setEditingConfig] = useState({ ...config })
    const [newCameraUrl, setNewCameraUrl] = useState('')
    const [sourceTypes, setSourceTypes] = useState(config.cameraSources.map(inferSourceType))
    const [newCameraType, setNewCameraType] = useState('url')

    // Zone Device Management
    const [showZoneDeviceModal, setShowZoneDeviceModal] = useState(false)
    const [selectedZoneInfo, setSelectedZoneInfo] = useState(null) // { camKey, zoneKey }
    const [deviceIpInput, setDeviceIpInput] = useState('')
    const [zoneDevices, setZoneDevices] = useState({}) // { "cam1:top_left": ["ip1", "ip2"] }

    // Ref to track previous zone status for occupancy change detection
    const previousZoneStatusRef = useRef(null)

    // Fetch current config from backend on load
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await fetch('/api/camera/config')
                if (response.ok) {
                    const data = await response.json()
                    const normalizedData = {
                        ...data,
                        zoneCounts: normalizeZoneCounts(data.cameraSources || [], data.zoneCounts),
                    }
                    setConfig(normalizedData)
                    setEditingConfig(normalizedData)
                    setSourceTypes((data.cameraSources || []).map(inferSourceType))
                }
            } catch (err) {
                console.error('Failed to fetch camera config:', err)
            }
        }
        fetchConfig()
    }, [])

    // Fetch zone devices from backend on load
    useEffect(() => {
        const fetchZoneDevices = async () => {
            try {
                const response = await fetch('/api/zones/devices')
                if (response.ok) {
                    const data = await response.json()
                    setZoneDevices(data.zoneDevices || {})
                }
            } catch (err) {
                console.error('Failed to fetch zone devices:', err)
            }
        }
        fetchZoneDevices()
    }, [])

    // Fetch zone occupancy status from backend
    useEffect(() => {
        const fetchZoneStatus = async () => {
            try {
                const response = await fetch('/api/camera/zone-status')
                if (response.ok) {
                    const data = await response.json()
                    const nextZoneStatus = data.zoneStatus || {}
                    const nextCameraStatus = data.cameraStatus || {}
                    const anyCameraConnected = Object.values(nextCameraStatus).some(
                        (cam) => cam && cam.connected
                    )

                    setZoneStatus(nextZoneStatus)
                    setCameraStatus(nextCameraStatus)
                    setIsConnected(anyCameraConnected)

                    if (data.streamOnline) {
                        setIsLoading(false)
                        if (!anyCameraConnected && Object.keys(nextCameraStatus).length > 0) {
                            setError('Camera stream is running but the configured source is offline or unreachable.')
                        } else {
                            setError('')
                        }
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
            const normalizedSource = normalizeSourceByType(newCameraUrl, newCameraType)
            setEditingConfig((prev) => ({
                ...prev,
                cameraSources: [...prev.cameraSources, normalizedSource],
                zoneCounts: [...(prev.zoneCounts || []), 4],
                cameraCount: prev.cameraSources.length + 1,
            }))
            setSourceTypes((prev) => [...prev, newCameraType])
            setNewCameraUrl('')
            setNewCameraType('url')
        }
    }

    const handleRemoveCamera = (index) => {
        setEditingConfig((prev) => {
            const newSources = prev.cameraSources.filter((_, i) => i !== index)
            setSourceTypes((prevTypes) => prevTypes.filter((_, i) => i !== index))
            return {
                ...prev,
                cameraSources: newSources,
                zoneCounts: (prev.zoneCounts || []).filter((_, i) => i !== index),
                cameraCount: newSources.length,
            }
        })
    }

    const handleZoneCountChange = (index, nextValue) => {
        setEditingConfig((prev) => {
            const nextZoneCounts = normalizeZoneCounts(prev.cameraSources || [], prev.zoneCounts)
            nextZoneCounts[index] = nextValue === 1 ? 1 : 4
            return {
                ...prev,
                zoneCounts: nextZoneCounts,
            }
        })
    }

    const handleSaveConfig = async () => {
        setIsSaving(true)
        setSaveError('')
        setSaveSuccess(false)

        try {
            const normalizedSources = editingConfig.cameraSources.map((source, index) =>
                normalizeSourceByType(source, sourceTypes[index] || inferSourceType(source))
            )

            if (normalizedSources.some((source) => !source)) {
                throw new Error('All camera sources must be filled before saving')
            }

            const payload = {
                ...editingConfig,
                cameraSources: normalizedSources,
                zoneCounts: normalizeZoneCounts(normalizedSources, editingConfig.zoneCounts),
                cameraCount: normalizedSources.length,
            }

            const response = await fetch('/api/camera/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            if (!response.ok) {
                const errBody = await response.json().catch(() => null)
                const err = errBody?.error || 'Failed to save config'
                throw new Error(err)
            }

            await response.json()
            setConfig(payload)
            setEditingConfig(payload)
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

    const handleZoneClick = (camKey, zoneKey) => {
        setSelectedZoneInfo({ camKey, zoneKey })
        setShowZoneDeviceModal(true)
        setDeviceIpInput('')
    }

    const handleAddDeviceToZone = () => {
        if (!deviceIpInput.trim() || !selectedZoneInfo) return

        const zoneId = `${selectedZoneInfo.camKey}:${selectedZoneInfo.zoneKey}`
        const updatedZoneDevices = {
            ...zoneDevices,
            [zoneId]: [...(zoneDevices[zoneId] || []), deviceIpInput.trim()],
        }
        setZoneDevices(updatedZoneDevices)
        setDeviceIpInput('')

        // Sync to backend
        syncZoneDevicesToBackend(updatedZoneDevices)
    }

    const handleRemoveDeviceFromZone = (zoneId, index) => {
        const updatedZoneDevices = {
            ...zoneDevices,
            [zoneId]: zoneDevices[zoneId].filter((_, i) => i !== index),
        }
        setZoneDevices(updatedZoneDevices)

        // Sync to backend
        syncZoneDevicesToBackend(updatedZoneDevices)
    }

    // Sync zone devices to backend API
    const syncZoneDevicesToBackend = async (deviceMap) => {
        try {
            const response = await fetch('/api/zones/devices', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deviceMap),
            })
            if (!response.ok) {
                const errData = await response.json().catch(() => null)
                console.error('Failed to sync zone devices:', errData?.error || 'Unknown error')
            }
        } catch (err) {
            console.error('Failed to sync zone devices to backend:', err)
        }
    }

    // Send device control signal when zone occupancy changes
    const sendDeviceControlSignal = async (zoneId, occupied) => {
        try {
            const [camKey, zoneKey] = zoneId.split(':')
            const response = await fetch('/api/device/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    camKey,
                    zoneKey,
                    occupied,
                }),
            })
            if (response.ok) {
                const data = await response.json()
                console.log(`[${zoneId}] Occupancy: ${occupied ? 'OCCUPIED' : 'EMPTY'} → Sent ${data.signalsSent}/${zoneDevices[zoneId]?.length || 0} control signals`)
            } else {
                const errData = await response.json().catch(() => null)
                console.error(`Failed to send device control for ${zoneId}:`, errData?.error || 'Unknown error')
            }
        } catch (err) {
            console.error(`Failed to send device control signal for ${zoneId}:`, err)
        }
    }

    // Detect zone occupancy changes and send device control signals
    useEffect(() => {
        const previousDisplayStatus = previousZoneStatusRef.current || {}
        const nextDisplayStatus = {}

        Object.entries(zoneStatus).forEach(([camKey, zones]) => {
            if (typeof zones !== 'object' || zones === null) return

            const displayZones = getDisplayZonesForCamera(camKey, zones)
            nextDisplayStatus[camKey] = displayZones

            Object.entries(displayZones).forEach(([zoneKey, isOccupied]) => {
                const fullZoneId = `${camKey}:${zoneKey}`
                const wasOccupied = previousDisplayStatus?.[camKey]?.[zoneKey]

                // Only send signal if occupancy state changed
                if (wasOccupied !== undefined && wasOccupied !== isOccupied) {
                    sendDeviceControlSignal(fullZoneId, isOccupied)
                }
            })
        })

        previousZoneStatusRef.current = nextDisplayStatus
    }, [zoneStatus, editingConfig.zoneCounts])

    const handleCloseZoneModal = () => {
        setShowZoneDeviceModal(false)
        setSelectedZoneInfo(null)
        setDeviceIpInput('')
    }

    const zoneNames = {
        full: 'Full Zone',
        top_left: 'Top Left',
        top_right: 'Top Right',
        bottom_left: 'Bottom Left',
        bottom_right: 'Bottom Right',
    }

    const getZoneCountForCamera = (camKey) => {
        const index = cameraKeyToIndex(camKey)
        const zoneCounts = editingConfig.zoneCounts || config.zoneCounts || []
        if (index < 0) return 4
        return zoneCounts[index] === 1 ? 1 : 4
    }

    const getDisplayZonesForCamera = (camKey, zones) => {
        if (getZoneCountForCamera(camKey) === 1) {
            const isOccupied = Object.values(zones || {}).some((value) => value === true)
            return { full: isOccupied }
        }
        return zones || {}
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
                                    <select
                                        value={sourceTypes[index] || 'url'}
                                        onChange={(e) => {
                                            const nextType = e.target.value
                                            setSourceTypes((prev) => {
                                                const next = [...prev]
                                                next[index] = nextType
                                                return next
                                            })
                                            setEditingConfig((prev) => {
                                                const newSources = [...prev.cameraSources]
                                                newSources[index] = normalizeSourceByType(
                                                    newSources[index],
                                                    nextType
                                                )
                                                return {
                                                    ...prev,
                                                    cameraSources: newSources,
                                                }
                                            })
                                        }}
                                        className="source-type-select"
                                        aria-label={`Camera source type ${index + 1}`}
                                    >
                                        <option value="url">URL</option>
                                        <option value="rtsp">RTSP</option>
                                    </select>
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
                                    <select
                                        value={(editingConfig.zoneCounts || [])[index] === 1 ? 1 : 4}
                                        onChange={(e) => handleZoneCountChange(index, parseInt(e.target.value, 10))}
                                        className="source-type-select"
                                        aria-label={`Zoning mode for camera ${index + 1}`}
                                        title="Select zones for this camera"
                                    >
                                        <option value={1}>1 ZONE</option>
                                        <option value={4}>4 ZONES</option>
                                    </select>
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
                            <select
                                value={newCameraType}
                                onChange={(e) => setNewCameraType(e.target.value)}
                                className="source-type-select"
                                aria-label="New camera source type"
                            >
                                <option value="url">URL</option>
                                <option value="rtsp">RTSP</option>
                            </select>
                            <input
                                type="text"
                                value={newCameraUrl}
                                onChange={(e) => setNewCameraUrl(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') handleAddCamera()
                                }}
                                className="source-input"
                                placeholder={
                                    newCameraType === 'rtsp'
                                        ? 'Enter RTSP source (e.g. rtsp://ip:554/stream1)'
                                        : 'Enter camera URL (e.g. http://ip:8080/video)'
                                }
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
                                        max="10"
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

                                <div className={`zones-grid-${getZoneCountForCamera(camKey) === 1 ? '1' : '4'}`}>
                                    {Object.entries(getDisplayZonesForCamera(camKey, zones)).map(([zoneKey, isOccupied]) => {
                                        const zoneId = `${camKey}:${zoneKey}`
                                        const devicesInZone = zoneDevices[zoneId] || []
                                        return (
                                            <div
                                                key={zoneKey}
                                                className={`zone-status-box ${isOccupied ? 'occupied' : 'empty'}`}
                                                onClick={() => handleZoneClick(camKey, zoneKey)}
                                                title="Click to add device IP addresses"
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <div className="zone-status-indicator" />
                                                <div className="zone-status-label">{zoneNames[zoneKey]}</div>
                                                <div className="zone-status-state">
                                                    {isOccupied ? 'OCCUPIED' : 'EMPTY'}
                                                </div>
                                                {devicesInZone.length > 0 && (
                                                    <div className="zone-device-badge">
                                                        <span>{devicesInZone.length} device{devicesInZone.length !== 1 ? 's' : ''}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
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
                            value: Object.entries(zoneStatus)
                                .flatMap(([camKey, zones]) => {
                                    return Object.values(getDisplayZonesForCamera(camKey, zones))
                                })
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

            {/* Zone Device Management Modal */}
            {showZoneDeviceModal && selectedZoneInfo && (
                <motion.div
                    className="modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleCloseZoneModal}
                >
                    <motion.div
                        className="modal-content glass-card"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                    >
                        <div className="modal-header">
                            <h2>
                                Add WiFi Devices - {selectedZoneInfo.camKey.toUpperCase()} /{' '}
                                {zoneNames[selectedZoneInfo.zoneKey]}
                            </h2>
                            <button onClick={handleCloseZoneModal} className="btn-close">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Device List */}
                            <div className="device-list-container">
                                <h3>Assigned Devices</h3>
                                {(zoneDevices[`${selectedZoneInfo.camKey}:${selectedZoneInfo.zoneKey}`] || [])
                                    .length === 0 ? (
                                    <p className="no-devices-text">No devices assigned yet. Add one below.</p>
                                ) : (
                                    <div className="device-list">
                                        {(zoneDevices[`${selectedZoneInfo.camKey}:${selectedZoneInfo.zoneKey}`] || []).map(
                                            (ip, idx) => (
                                                <div key={idx} className="device-item">
                                                    <span className="device-ip">{ip}</span>
                                                    <button
                                                        onClick={() =>
                                                            handleRemoveDeviceFromZone(
                                                                `${selectedZoneInfo.camKey}:${selectedZoneInfo.zoneKey}`,
                                                                idx
                                                            )
                                                        }
                                                        className="btn-remove-device"
                                                        title="Remove device"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Add New Device */}
                            <div className="add-device-container">
                                <h3>Add New Device</h3>
                                <div className="add-device-form">
                                    <input
                                        type="text"
                                        value={deviceIpInput}
                                        onChange={(e) => setDeviceIpInput(e.target.value)}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter') handleAddDeviceToZone()
                                        }}
                                        placeholder="Enter device IP address (e.g., 192.168.1.50)"
                                        className="device-input"
                                    />
                                    <button
                                        onClick={handleAddDeviceToZone}
                                        disabled={!deviceIpInput.trim()}
                                        className="btn-add-device"
                                    >
                                        <Plus size={16} />
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button onClick={handleCloseZoneModal} className="btn-primary">
                                Done
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </motion.div>
    )
}
