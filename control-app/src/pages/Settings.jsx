import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import {
    Camera,
    Wifi,
    Bell,
    Shield,
    Monitor,
    Save,
    RefreshCw,
    KeyRound,
} from 'lucide-react'
import './Settings.css'

const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.06 } },
    exit: { opacity: 0, y: -16 },
}
const itemVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
}

export default function Settings({ token }) {
    const [saved, setSaved] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '' })
    const [passwordSaved, setPasswordSaved] = useState(false)
    const [wifiNetworks, setWifiNetworks] = useState([])
    const [wifiScanning, setWifiScanning] = useState(false)
    const [wifiConnecting, setWifiConnecting] = useState(false)
    const [selectedNetwork, setSelectedNetwork] = useState(null)
    const [wifiPassword, setWifiPassword] = useState('')
    const [wifiStatus, setWifiStatus] = useState({ connected: false, ssid: '' })
    
    // Camera Discovery
    const [cameraNetworks, setCameraNetworks] = useState([])
    const [cameraScanning, setCameraScanning] = useState(false)
    const [selectedCamera, setSelectedCamera] = useState(null)
    const [safetyCode, setSafetyCode] = useState('L28DF2D2') // Default provided by user
    const [showSafetyModal, setShowSafetyModal] = useState(false)

    const [config, setConfig] = useState({
        cameraIp: '192.168.1.100',
        cameraPort: '554',
        cameraProtocol: 'rtsp',
        mqttBroker: '192.168.1.1',
        mqttPort: '1883',
        mqttTopic: 'ecoeye/control',
        hysteresisDelay: '30',
        occupancyThreshold: '0',
        inferenceRate: '15',
        alertEmail: 'admin@ecoeye.local',
        alertOnDisconnect: true,
        alertOnHighTemp: true,
        alertOnOccupancyZero: false,
        darkMode: true,
        compactView: false,
        autoRefresh: true,
    })

    const handleChange = (key, value) => {
        setConfig((prev) => ({ ...prev, [key]: value }))
        setSaved(false)
    }

    const apiHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    }

    const loadSettings = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/settings', {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            })
            if (!res.ok) {
                throw new Error('Failed to load settings')
            }
            const data = await res.json()
            setConfig(data.settings)
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const loadWifiStatus = async () => {
        try {
            const res = await fetch('/api/wifi/status', {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (res.ok) {
                const data = await res.json()
                setWifiStatus(data)
            }
        } catch (err) {
            console.error('Failed to load wifi status', err)
        }
    }

    const scanWifi = async () => {
        setWifiScanning(true)
        setError('')
        try {
            const res = await fetch('/api/wifi/scan', {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) throw new Error('Scan failed')
            const data = await res.json()
            setWifiNetworks(data)
        } catch (err) {
            setError(err.message)
        } finally {
            setWifiScanning(false)
        }
    }

    const connectWifi = async () => {
        if (!selectedNetwork) return
        setWifiConnecting(true)
        setError('')
        try {
            const res = await fetch('/api/wifi/connect', {
                method: 'POST',
                headers: apiHeaders,
                body: JSON.stringify({ ssid: selectedNetwork.ssid, password: wifiPassword }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.message || 'Connection failed')
            setWifiPassword('')
            setSelectedNetwork(null)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
            loadWifiStatus()
        } catch (err) {
            setError(err.message)
        } finally {
            setWifiConnecting(false)
        }
    }
    
    const scanCameras = async () => {
        setCameraScanning(true)
        setError('')
        try {
            const res = await fetch('/api/camera/discovered', {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) throw new Error('Camera scan failed')
            const data = await res.json()
            setCameraNetworks(data.cameras || [])
        } catch (err) {
            setError(err.message)
        } finally {
            setCameraScanning(false)
        }
    }

    const connectDiscoveredCamera = () => {
        if (!selectedCamera) return
        
        // Construct the RTSP URL using the provided pattern:
        // rtsp://admin:<SAFETY_CODE>@<IP>:554/cam/realmonitor?channel=1&subtype=0
        const rtspUrl = `rtsp://admin:${safetyCode}@${selectedCamera.ip}:554/cam/realmonitor?channel=1&subtype=0`
        
        handleChange('cameraIp', selectedCamera.ip)
        handleChange('cameraPort', '554')
        handleChange('cameraProtocol', 'rtsp')
        
        // Let's also suggest saving these changes
        console.log("Connecting to discovered camera:", rtspUrl)
        
        setShowSafetyModal(false)
        setSelectedCamera(null)
        setSaved(false)
    }

    useEffect(() => {
        loadSettings()
        loadWifiStatus()
    }, [])

    const handleSave = async () => {
        setError('')
        const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: apiHeaders,
            body: JSON.stringify({ settings: config }),
        })

        if (!res.ok) {
            const data = await res.json().catch(() => ({ error: 'Save failed' }))
            setError(data.error || 'Save failed')
            return
        }

        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    const handlePasswordChange = async () => {
        setError('')
        setPasswordSaved(false)
        const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify(passwordForm),
        })
        if (!res.ok) {
            const data = await res.json().catch(() => ({ error: 'Password update failed' }))
            setError(data.error || 'Password update failed')
            return
        }
        setPasswordForm({ oldPassword: '', newPassword: '' })
        setPasswordSaved(true)
        setTimeout(() => setPasswordSaved(false), 2000)
    }

    if (loading) {
        return <div className="settings-page">Loading settings...</div>
    }

    return (
        <motion.div
            className="settings-page"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
        >
            <motion.div className="page-header" variants={itemVariants}>
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-desc">Configure system parameters and connections</p>
                </div>
                <motion.button
                    className={`save-btn ${saved ? 'save-btn--saved' : ''}`}
                    onClick={handleSave}
                    whileTap={{ scale: 0.96 }}
                >
                    {saved ? <RefreshCw size={14} /> : <Save size={14} />}
                    {saved ? 'Saved!' : 'Save Changes'}
                </motion.button>
            </motion.div>

            {error && <div className="settings-error">{error}</div>}

            {/* Camera Configuration */}
            <motion.div className="settings-section glass-card" variants={itemVariants}>
                <div className="settings-section-header">
                    <Camera size={16} />
                    <h3>Camera Configuration</h3>
                    <button 
                        className="save-btn" 
                        onClick={scanCameras} 
                        disabled={cameraScanning}
                        style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}
                    >
                        <RefreshCw size={12} className={cameraScanning ? 'animate-spin' : ''} />
                        {cameraScanning ? 'Searching...' : 'Auto-Detect Cameras'}
                    </button>
                </div>

                {cameraNetworks.length > 0 && (
                    <div className="discovery-list" style={{ marginBottom: '20px' }}>
                        <p className="setting-hint">Detected Cameras on Network:</p>
                        <div className="wifi-list">
                            {cameraNetworks.map((cam) => (
                                <div 
                                    key={cam.ip} 
                                    className="wifi-network"
                                    onClick={() => {
                                        setSelectedCamera(cam)
                                        setShowSafetyModal(true)
                                    }}
                                >
                                    <div className="network-info">
                                        <Camera size={14} />
                                        <span className="network-ssid">IP Camera at {cam.ip}</span>
                                    </div>
                                    <span className="network-signal">RTSP Active</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="settings-grid">
                    <div className="setting-field">
                        <label>Camera IP Address</label>
                        <input
                            type="text"
                            value={config.cameraIp}
                            onChange={(e) => handleChange('cameraIp', e.target.value)}
                        />
                    </div>
                    <div className="setting-field">
                        <label>Port</label>
                        <input
                            type="text"
                            value={config.cameraPort}
                            onChange={(e) => handleChange('cameraPort', e.target.value)}
                        />
                    </div>
                    <div className="setting-field">
                        <label>Protocol</label>
                        <select
                            value={config.cameraProtocol}
                            onChange={(e) => handleChange('cameraProtocol', e.target.value)}
                        >
                            <option value="rtsp">RTSP</option>
                            <option value="http">HTTP</option>
                            <option value="onvif">ONVIF</option>
                        </select>
                    </div>
                </div>
            </motion.div>

            {/* MQTT Configuration */}
            <motion.div className="settings-section glass-card" variants={itemVariants}>
                <div className="settings-section-header">
                    <Wifi size={16} />
                    <h3>MQTT Broker</h3>
                </div>
                <div className="settings-grid">
                    <div className="setting-field">
                        <label>Broker Address</label>
                        <input
                            type="text"
                            value={config.mqttBroker}
                            onChange={(e) => handleChange('mqttBroker', e.target.value)}
                        />
                    </div>
                    <div className="setting-field">
                        <label>Port</label>
                        <input
                            type="text"
                            value={config.mqttPort}
                            onChange={(e) => handleChange('mqttPort', e.target.value)}
                        />
                    </div>
                    <div className="setting-field">
                        <label>Control Topic</label>
                        <input
                            type="text"
                            value={config.mqttTopic}
                            onChange={(e) => handleChange('mqttTopic', e.target.value)}
                        />
                    </div>
                </div>
            </motion.div>

            {/* WiFi Configuration */}
            <motion.div className="settings-section glass-card" variants={itemVariants}>
                <div className="settings-section-header">
                    <Wifi size={16} />
                    <h3>WiFi Management</h3>
                    {wifiStatus.connected && (
                        <span className="wifi-status-badge">Connected: {wifiStatus.ssid}</span>
                    )}
                </div>
                
                <div className="wifi-controls">
                    <button 
                        className="save-btn" 
                        onClick={scanWifi} 
                        disabled={wifiScanning}
                        style={{ marginBottom: '16px' }}
                    >
                        <RefreshCw size={14} className={wifiScanning ? 'animate-spin' : ''} />
                        {wifiScanning ? 'Scanning...' : 'Scan Networks'}
                    </button>

                    <div className="wifi-list">
                        {wifiNetworks.length === 0 && !wifiScanning && (
                            <p className="setting-hint">Click scan to find networks</p>
                        )}
                        {wifiNetworks.map((net) => (
                            <div 
                                key={net.ssid} 
                                className={`wifi-network ${selectedNetwork?.ssid === net.ssid ? 'wifi-network--selected' : ''}`}
                                onClick={() => setSelectedNetwork(net)}
                            >
                                <div className="network-info">
                                    <Wifi size={14} opacity={parseInt(net.signal) / 100} />
                                    <span className="network-ssid">{net.ssid}</span>
                                </div>
                                <span className="network-signal">{net.bars} ({net.signal}%)</span>
                            </div>
                        ))}
                    </div>

                    {selectedNetwork && (
                        <div className="wifi-connect-form">
                            <div className="setting-field">
                                <label>Password for {selectedNetwork.ssid}</label>
                                <input 
                                    type="password" 
                                    placeholder="Enter WiFi Password"
                                    value={wifiPassword}
                                    onChange={(e) => setWifiPassword(e.target.value)}
                                />
                            </div>
                            <button 
                                className="save-btn" 
                                onClick={connectWifi}
                                disabled={wifiConnecting}
                            >
                                {wifiConnecting ? 'Connecting...' : 'Connect to Network'}
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>

            {/* AI & Control */}
            <motion.div className="settings-section glass-card" variants={itemVariants}>
                <div className="settings-section-header">
                    <Shield size={16} />
                    <h3>AI & Control Parameters</h3>
                </div>
                <div className="settings-grid">
                    <div className="setting-field">
                        <label>Hysteresis Delay (seconds)</label>
                        <input
                            type="number"
                            value={config.hysteresisDelay}
                            onChange={(e) => handleChange('hysteresisDelay', e.target.value)}
                        />
                        <span className="setting-hint">Delay before toggling off after zero occupancy</span>
                    </div>
                    <div className="setting-field">
                        <label>Occupancy Threshold</label>
                        <input
                            type="number"
                            value={config.occupancyThreshold}
                            onChange={(e) => handleChange('occupancyThreshold', e.target.value)}
                        />
                        <span className="setting-hint">Min occupants to activate zone devices</span>
                    </div>
                    <div className="setting-field">
                        <label>Inference Rate (FPS)</label>
                        <input
                            type="number"
                            value={config.inferenceRate}
                            onChange={(e) => handleChange('inferenceRate', e.target.value)}
                        />
                        <span className="setting-hint">Frames per second for AI detection</span>
                    </div>
                </div>
            </motion.div>

            {/* Alerts */}
            <motion.div className="settings-section glass-card" variants={itemVariants}>
                <div className="settings-section-header">
                    <Bell size={16} />
                    <h3>Alerts & Notifications</h3>
                </div>
                <div className="settings-grid">
                    <div className="setting-field setting-field--full">
                        <label>Alert Email</label>
                        <input
                            type="email"
                            value={config.alertEmail}
                            onChange={(e) => handleChange('alertEmail', e.target.value)}
                        />
                    </div>
                </div>
                <div className="toggle-list">
                    {[
                        { key: 'alertOnDisconnect', label: 'Alert on device disconnect' },
                        { key: 'alertOnHighTemp', label: 'Alert on high edge device temperature' },
                        { key: 'alertOnOccupancyZero', label: 'Alert when all zones empty' },
                    ].map((item) => (
                        <div className="toggle-row" key={item.key}>
                            <span>{item.label}</span>
                            <button
                                className={`settings-toggle ${config[item.key] ? 'settings-toggle--on' : ''}`}
                                onClick={() => handleChange(item.key, !config[item.key])}
                            >
                                <motion.div
                                    className="settings-toggle-knob"
                                    layout
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                />
                            </button>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Display */}
            <motion.div className="settings-section glass-card" variants={itemVariants}>
                <div className="settings-section-header">
                    <Monitor size={16} />
                    <h3>Display Preferences</h3>
                </div>
                <div className="toggle-list">
                    {[
                        { key: 'darkMode', label: 'Dark Mode' },
                        { key: 'compactView', label: 'Compact View' },
                        { key: 'autoRefresh', label: 'Auto-refresh data' },
                    ].map((item) => (
                        <div className="toggle-row" key={item.key}>
                            <span>{item.label}</span>
                            <button
                                className={`settings-toggle ${config[item.key] ? 'settings-toggle--on' : ''}`}
                                onClick={() => handleChange(item.key, !config[item.key])}
                            >
                                <motion.div
                                    className="settings-toggle-knob"
                                    layout
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                />
                            </button>
                        </div>
                    ))}
                </div>
            </motion.div>

            <motion.div className="settings-section glass-card" variants={itemVariants}>
                <div className="settings-section-header">
                    <KeyRound size={16} />
                    <h3>Security</h3>
                </div>
                <div className="settings-grid">
                    <div className="setting-field">
                        <label>Current Password</label>
                        <input
                            type="password"
                            value={passwordForm.oldPassword}
                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, oldPassword: e.target.value }))}
                        />
                    </div>
                    <div className="setting-field">
                        <label>New Password</label>
                        <input
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                        />
                        <span className="setting-hint">Minimum 8 characters</span>
                    </div>
                </div>
                <button className={`save-btn ${passwordSaved ? 'save-btn--saved' : ''}`} onClick={handlePasswordChange}>
                    {passwordSaved ? 'Password Updated' : 'Change Password'}
                </button>
            </motion.div>

            {/* Safety Code Modal */}
            {showSafetyModal && (
                <div className="safety-modal-overlay">
                    <motion.div 
                        className="safety-modal glass-card"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                    >
                        <h3>Camera Secure Connection</h3>
                        <p className="setting-hint">Enter the Safety Code (Password) for camera at {selectedCamera?.ip}</p>
                        
                        <div className="setting-field" style={{ margin: '20px 0' }}>
                            <label>Safety Code</label>
                            <div style={{ position: 'relative' }}>
                                <input 
                                    type="text" 
                                    value={safetyCode}
                                    onChange={(e) => setSafetyCode(e.target.value)}
                                    placeholder="Enter Camera Password"
                                    style={{ paddingLeft: '40px' }}
                                />
                                <Shield size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button className="save-btn" onClick={connectDiscoveredCamera}>
                                Connect Camera
                            </button>
                            <button className="save-btn" style={{ background: 'rgba(255,255,255,0.05)' }} onClick={() => setShowSafetyModal(false)}>
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </motion.div>
    )
}
