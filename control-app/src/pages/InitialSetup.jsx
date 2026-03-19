import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, Cpu, Link2, Plus, Save, Trash2 } from 'lucide-react'
import './InitialSetup.css'

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, staggerChildren: 0.05 } },
  exit: { opacity: 0, y: -16 },
}

const itemVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
}

const sourceTypes = [
  { value: 'rtsp', label: 'RTSP URL' },
  { value: 'http-mjpeg', label: 'HTTP MJPEG URL' },
  { value: 'usb', label: 'USB Camera Index' },
  { value: 'file', label: 'Local Video File' },
]

const deviceKinds = [
  { value: 'light', label: 'Light / Smart Holder' },
  { value: 'switch', label: 'Smart Switch' },
  { value: 'ac-ir', label: 'AC IR Blaster' },
]

const protocols = [
  { value: 'mqtt', label: 'MQTT (recommended)' },
  { value: 'http', label: 'HTTP REST' },
]

function newCamera(index) {
  return {
    id: `cam-${Date.now()}-${index}`,
    name: `Camera ${index}`,
    sourceType: 'rtsp',
    source: 'rtsp://192.168.1.10:554/stream1',
    dividerRatio: 0.5,
    enabled: true,
  }
}

function newDevice(index) {
  return {
    id: `dev-${Date.now()}-${index}`,
    name: `Device ${index}`,
    kind: 'light',
    protocol: 'mqtt',
    target: 'esp32/device/topic',
    onCommand: 'ON',
    offCommand: 'OFF',
    meta: {},
  }
}

function newMapping(cameraId, deviceId, zone = 'left') {
  return {
    id: `map-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cameraId,
    zone,
    deviceId,
    priority: 1,
    mode: 'occupancy',
  }
}

export default function InitialSetup({ token }) {
  const [setup, setSetup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [selectedCameraId, setSelectedCameraId] = useState('')

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const selectedCamera = useMemo(() => {
    if (!setup) return null
    return setup.cameras.find((cam) => cam.id === selectedCameraId) || setup.cameras[0] || null
  }, [setup, selectedCameraId])

  const loadSetup = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/setup', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        throw new Error('Failed to load setup')
      }
      const data = await res.json()
      setSetup(data.setup)
      if (data.setup.cameras.length > 0) {
        setSelectedCameraId(data.setup.cameras[0].id)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSetup()
  }, [token])

  const updateSetupField = (key, value) => {
    setSetup((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const updateCameraField = (cameraId, key, value) => {
    setSetup((prev) => ({
      ...prev,
      cameras: prev.cameras.map((cam) => (cam.id === cameraId ? { ...cam, [key]: value } : cam)),
    }))
    setSaved(false)
  }

  const updateDeviceField = (deviceId, key, value) => {
    setSetup((prev) => ({
      ...prev,
      devices: prev.devices.map((dev) => (dev.id === deviceId ? { ...dev, [key]: value } : dev)),
    }))
    setSaved(false)
  }

  const updateMappingField = (mappingId, key, value) => {
    setSetup((prev) => ({
      ...prev,
      zoneMappings: prev.zoneMappings.map((m) => (m.id === mappingId ? { ...m, [key]: value } : m)),
    }))
    setSaved(false)
  }

  const addCamera = () => {
    setSetup((prev) => {
      const item = newCamera(prev.cameras.length + 1)
      setSelectedCameraId(item.id)
      return {
        ...prev,
        cameras: [...prev.cameras, item],
      }
    })
  }

  const removeCamera = (cameraId) => {
    setSetup((prev) => {
      const nextCameras = prev.cameras.filter((cam) => cam.id !== cameraId)
      const nextMappings = prev.zoneMappings.filter((m) => m.cameraId !== cameraId)
      const nextSelected = nextCameras[0]?.id || ''
      setSelectedCameraId(nextSelected)
      return {
        ...prev,
        cameras: nextCameras,
        zoneMappings: nextMappings,
      }
    })
  }

  const addDevice = () => {
    setSetup((prev) => ({
      ...prev,
      devices: [...prev.devices, newDevice(prev.devices.length + 1)],
    }))
  }

  const removeDevice = (deviceId) => {
    setSetup((prev) => ({
      ...prev,
      devices: prev.devices.filter((dev) => dev.id !== deviceId),
      zoneMappings: prev.zoneMappings.filter((m) => m.deviceId !== deviceId),
    }))
  }

  const addMapping = () => {
    if (!setup.cameras.length || !setup.devices.length) return
    setSetup((prev) => ({
      ...prev,
      zoneMappings: [...prev.zoneMappings, newMapping(prev.cameras[0].id, prev.devices[0].id, 'left')],
    }))
  }

  const removeMapping = (mappingId) => {
    setSetup((prev) => ({
      ...prev,
      zoneMappings: prev.zoneMappings.filter((m) => m.id !== mappingId),
    }))
  }

  const updateDividerFromPreview = (event) => {
    if (!selectedCamera) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    const clamped = Math.max(0.05, Math.min(0.95, ratio))
    updateCameraField(selectedCamera.id, 'dividerRatio', Number(clamped.toFixed(3)))
  }

  const saveSetup = async () => {
    setSaving(true)
    setSaved(false)
    setError('')

    try {
      const res = await fetch('/api/setup', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ setup }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Save failed')
      }

      setSetup(data.setup)
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="setup-page">Loading initial setup...</div>
  }

  if (!setup) {
    return <div className="setup-page">Unable to load setup.</div>
  }

  return (
    <motion.div className="setup-page" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <motion.div className="page-header" variants={itemVariants}>
        <div>
          <h1 className="page-title">Initial Setup Wizard</h1>
          <p className="page-desc">Configure camera feeds, 2-zone divider, and ESP32 device mappings</p>
        </div>
        <button className={`save-btn ${saved ? 'save-btn--saved' : ''}`} onClick={saveSetup} disabled={saving}>
          <Save size={14} />
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Setup'}
        </button>
      </motion.div>

      {error && <div className="setup-error">{error}</div>}

      <motion.section className="setup-section glass-card" variants={itemVariants}>
        <div className="setup-section-title">
          <Camera size={15} />
          Camera Sources
        </div>

        <div className="camera-tabs">
          {setup.cameras.map((cam) => (
            <button
              key={cam.id}
              className={`camera-tab ${selectedCamera?.id === cam.id ? 'camera-tab--active' : ''}`}
              onClick={() => setSelectedCameraId(cam.id)}
            >
              {cam.name}
            </button>
          ))}
          <button className="add-chip" onClick={addCamera}>
            <Plus size={13} /> Add Camera
          </button>
        </div>

        {selectedCamera && (
          <div className="camera-editor">
            <div className="setup-grid setup-grid--3">
              <label className="setting-field">
                <span>Camera Name</span>
                <input value={selectedCamera.name} onChange={(e) => updateCameraField(selectedCamera.id, 'name', e.target.value)} />
              </label>

              <label className="setting-field">
                <span>Source Type</span>
                <select value={selectedCamera.sourceType} onChange={(e) => updateCameraField(selectedCamera.id, 'sourceType', e.target.value)}>
                  {sourceTypes.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label className="setting-field setting-field--switch">
                <span>Enabled</span>
                <input
                  type="checkbox"
                  checked={!!selectedCamera.enabled}
                  onChange={(e) => updateCameraField(selectedCamera.id, 'enabled', e.target.checked)}
                />
              </label>
            </div>

            <label className="setting-field setting-field--full">
              <span>Source</span>
              <input value={selectedCamera.source} onChange={(e) => updateCameraField(selectedCamera.id, 'source', e.target.value)} />
            </label>

            <div className="divider-area">
              <div className="divider-head">Zone Split for {selectedCamera.name}</div>
              <div className="preview-box" onMouseDown={updateDividerFromPreview}>
                <div className="preview-left" style={{ width: `${selectedCamera.dividerRatio * 100}%` }}>
                  <span>Zone Left</span>
                </div>
                <div className="preview-right">
                  <span>Zone Right</span>
                </div>
                <div className="divider-line" style={{ left: `${selectedCamera.dividerRatio * 100}%` }} />
              </div>

              <label className="setting-field setting-field--full">
                <span>Divider Position ({Math.round(selectedCamera.dividerRatio * 100)}%)</span>
                <input
                  type="range"
                  min="0.05"
                  max="0.95"
                  step="0.01"
                  value={selectedCamera.dividerRatio}
                  onChange={(e) => updateCameraField(selectedCamera.id, 'dividerRatio', Number(e.target.value))}
                />
              </label>
            </div>

            <button className="danger-btn" onClick={() => removeCamera(selectedCamera.id)} disabled={setup.cameras.length <= 1}>
              <Trash2 size={13} /> Remove Selected Camera
            </button>
          </div>
        )}
      </motion.section>

      <motion.section className="setup-section glass-card" variants={itemVariants}>
        <div className="setup-section-title">
          <Cpu size={15} />
          ESP32 Device Registry
        </div>

        <div className="row-head">
          <button className="add-chip" onClick={addDevice}><Plus size={13} /> Add Device</button>
        </div>

        <div className="list-stack">
          {setup.devices.map((dev) => (
            <div className="item-card" key={dev.id}>
              <div className="setup-grid setup-grid--4">
                <label className="setting-field">
                  <span>Name</span>
                  <input value={dev.name} onChange={(e) => updateDeviceField(dev.id, 'name', e.target.value)} />
                </label>
                <label className="setting-field">
                  <span>Type</span>
                  <select value={dev.kind} onChange={(e) => updateDeviceField(dev.id, 'kind', e.target.value)}>
                    {deviceKinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </label>
                <label className="setting-field">
                  <span>Protocol</span>
                  <select value={dev.protocol} onChange={(e) => updateDeviceField(dev.id, 'protocol', e.target.value)}>
                    {protocols.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className="setting-field">
                  <span>Target</span>
                  <input value={dev.target} onChange={(e) => updateDeviceField(dev.id, 'target', e.target.value)} placeholder="MQTT topic or http://esp32/api/device" />
                </label>
              </div>

              <div className="setup-grid setup-grid--2">
                <label className="setting-field">
                  <span>ON Command (supports AC mode/temp payload)</span>
                  <input value={dev.onCommand} onChange={(e) => updateDeviceField(dev.id, 'onCommand', e.target.value)} placeholder='ON or {"power":"on","mode":"cool","temp":24}' />
                </label>
                <label className="setting-field">
                  <span>OFF Command</span>
                  <input value={dev.offCommand} onChange={(e) => updateDeviceField(dev.id, 'offCommand', e.target.value)} placeholder='OFF or {"power":"off"}' />
                </label>
              </div>

              <button className="danger-btn" onClick={() => removeDevice(dev.id)}>
                <Trash2 size={13} /> Remove Device
              </button>
            </div>
          ))}
        </div>
      </motion.section>

      <motion.section className="setup-section glass-card" variants={itemVariants}>
        <div className="setup-section-title">
          <Link2 size={15} />
          Zone-to-Device Mapping
        </div>

        <div className="setup-grid setup-grid--3 setup-grid--inline">
          <label className="setting-field setting-field--switchline">
            <span>Auto turn OFF on empty zone</span>
            <input
              type="checkbox"
              checked={!!setup.autoTurnOffWhenEmpty}
              onChange={(e) => updateSetupField('autoTurnOffWhenEmpty', e.target.checked)}
            />
          </label>
          <label className="setting-field">
            <span>Decision Interval (seconds)</span>
            <input
              type="number"
              min="0.2"
              max="10"
              step="0.1"
              value={setup.occupancyDecisionIntervalSec}
              onChange={(e) => updateSetupField('occupancyDecisionIntervalSec', Number(e.target.value))}
            />
          </label>
          <div className="row-head">
            <button className="add-chip" onClick={addMapping}><Plus size={13} /> Add Mapping</button>
          </div>
        </div>

        <div className="list-stack">
          {setup.zoneMappings.map((map) => (
            <div className="item-card" key={map.id}>
              <div className="setup-grid setup-grid--4">
                <label className="setting-field">
                  <span>Camera</span>
                  <select value={map.cameraId} onChange={(e) => updateMappingField(map.id, 'cameraId', e.target.value)}>
                    {setup.cameras.map((cam) => <option key={cam.id} value={cam.id}>{cam.name}</option>)}
                  </select>
                </label>
                <label className="setting-field">
                  <span>Zone</span>
                  <select value={map.zone} onChange={(e) => updateMappingField(map.id, 'zone', e.target.value)}>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label className="setting-field">
                  <span>Device</span>
                  <select value={map.deviceId} onChange={(e) => updateMappingField(map.id, 'deviceId', e.target.value)}>
                    {setup.devices.map((dev) => <option key={dev.id} value={dev.id}>{dev.name}</option>)}
                  </select>
                </label>
                <label className="setting-field">
                  <span>Priority</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={map.priority || 1}
                    onChange={(e) => updateMappingField(map.id, 'priority', Number(e.target.value))}
                  />
                </label>
              </div>
              <button className="danger-btn" onClick={() => removeMapping(map.id)}>
                <Trash2 size={13} /> Remove Mapping
              </button>
            </div>
          ))}
        </div>
      </motion.section>
    </motion.div>
  )
}
