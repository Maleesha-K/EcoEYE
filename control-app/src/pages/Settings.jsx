import { motion } from 'framer-motion'
import { useState } from 'react'
import {
    Camera,
    Wifi,
    Bell,
    Shield,
    Monitor,
    Save,
    RefreshCw,
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

export default function Settings() {
    const [saved, setSaved] = useState(false)

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

    const handleSave = () => {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
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

            {/* Camera Configuration */}
            <motion.div className="settings-section glass-card" variants={itemVariants}>
                <div className="settings-section-header">
                    <Camera size={16} />
                    <h3>Camera Configuration</h3>
                </div>
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
        </motion.div>
    )
}
