import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { Camera, Download, Save, Search, RefreshCw } from 'lucide-react'
import './CameraSetup.css'

const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, staggerChildren: 0.06 } },
    exit: { opacity: 0, y: -16, transition: { duration: 0.2 } },
}

const itemVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
}

function parsePortFromRtsp(rtsp) {
    const match = String(rtsp || '').match(/:(\d+)\//)
    return match ? match[1] : '554'
}

function buildRtsp(ip, creds) {
    const username = encodeURIComponent(creds.username || 'admin')
    const password = encodeURIComponent(creds.password || 'L28DF2D2')
    const port = creds.port || '554'
    const path = (creds.path || '/cam/realmonitor?channel=1&subtype=0').startsWith('/') ? creds.path : `/${creds.path}`
    return `rtsp://${username}:${password}@${ip}:${port}${path}`
}

export default function CameraSetup() {
    const [cameras, setCameras] = useState([])
    const [loading, setLoading] = useState(true)
    const [isScanning, setIsScanning] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [creds, setCreds] = useState({
        username: 'admin',
        password: 'L28DF2D2',
        port: '554',
        path: '/cam/realmonitor?channel=1&subtype=0',
    })

    const labeledCount = useMemo(
        () => cameras.filter((cam) => String(cam.zone || '').trim().length > 0).length,
        [cameras]
    )

    const loadExisting = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/camera/setup/list')
            const data = await res.json()
            const items = Array.isArray(data.cameras) ? data.cameras : []
            const withLocalState = items.map((cam) => ({
                ...cam,
                zone: cam.zone || '',
                rtsp: cam.rtsp || buildRtsp(cam.ip, { ...creds, port: parsePortFromRtsp(cam.rtsp) }),
                saving: false,
                saved: false,
            }))
            setCameras(withLocalState)
        } catch (ex) {
            setError(ex.message || 'Failed to load camera setup data')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadExisting()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const scanNetwork = async () => {
        setIsScanning(true)
        setError('')
        setSuccess('')
        try {
            const res = await fetch('/api/camera/setup/scan', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error || 'Network scan failed')
            }

            const scanned = (data.cameras || []).map((cam) => {
                const rtsp = cam.rtsp || buildRtsp(cam.ip, creds)
                return {
                    ...cam,
                    zone: cam.zone || '',
                    rtsp,
                    saving: false,
                    saved: false,
                }
            })

            setCameras(scanned)
            setSuccess(`Scan complete: ${scanned.length} camera(s) found`)
        } catch (ex) {
            setError(ex.message || 'Network scan failed')
        } finally {
            setIsScanning(false)
        }
    }

    const updateCameraField = (ip, key, value) => {
        setCameras((prev) =>
            prev.map((cam) => (cam.ip === ip ? { ...cam, [key]: value, saved: key === 'zone' ? false : cam.saved } : cam))
        )
    }

    const updateCred = (key, value) => {
        const nextCreds = { ...creds, [key]: value }
        setCreds(nextCreds)
        setCameras((prev) =>
            prev.map((cam) => ({
                ...cam,
                rtsp: buildRtsp(cam.ip, { ...nextCreds, port: parsePortFromRtsp(cam.rtsp) || nextCreds.port }),
            }))
        )
    }

    const saveRow = async (camera) => {
        if (!camera.zone.trim()) {
            setError(`Zone is required for ${camera.ip}`)
            return
        }

        setError('')
        setSuccess('')
        setCameras((prev) => prev.map((cam) => (cam.ip === camera.ip ? { ...cam, saving: true } : cam)))

        try {
            const res = await fetch('/api/camera/setup/label', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: camera.ip, zone: camera.zone.trim(), rtsp: camera.rtsp }),
            })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error || 'Failed to save zone label')
            }

            setCameras((prev) =>
                prev.map((cam) =>
                    cam.ip === camera.ip
                        ? { ...cam, saving: false, saved: true, zone: data.camera?.zone || camera.zone.trim() }
                        : cam
                )
            )
        } catch (ex) {
            setCameras((prev) => prev.map((cam) => (cam.ip === camera.ip ? { ...cam, saving: false } : cam)))
            setError(ex.message || 'Failed to save camera label')
        }
    }

    const generateConfig = async () => {
        setIsExporting(true)
        setError('')
        setSuccess('')
        try {
            const res = await fetch('/api/camera/setup/export', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error || 'Failed to generate config')
            }

            const jsonText = JSON.stringify(data, null, 2)
            const blob = new Blob([jsonText], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'cameras.json'
            a.click()
            URL.revokeObjectURL(url)
            setSuccess('cameras.json generated and downloaded')
        } catch (ex) {
            setError(ex.message || 'Failed to export config')
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <motion.div className="camera-setup" variants={pageVariants} initial="initial" animate="animate" exit="exit">
            <motion.section className="camera-setup-header" variants={itemVariants}>
                <div>
                    <div className="camera-setup-badge">
                        <Camera size={12} />
                        <span>ONE-TIME CAMERA SETUP</span>
                    </div>
                    <h1>Camera Setup</h1>
                    <p>Discover RTSP cameras, label zones, and export a local cameras.json config file.</p>
                </div>
                <button className="camera-btn camera-btn-primary" onClick={scanNetwork} disabled={isScanning}>
                    {isScanning ? <RefreshCw size={16} className="spin" /> : <Search size={16} />}
                    {isScanning ? 'Scanning...' : 'Scan Network'}
                </button>
            </motion.section>

            {error && <div className="camera-setup-alert alert-error">{error}</div>}
            {success && <div className="camera-setup-alert alert-success">{success}</div>}

            <motion.section className="glass-card camera-stage" variants={itemVariants}>
                <h2>Stage 1 - Scan</h2>
                <p className="stage-note">Scans local subnet for RTSP cameras on ports 554 and 8554.</p>
                <div className="camera-table-wrap">
                    <table className="camera-table">
                        <thead>
                            <tr>
                                <th>IP Address</th>
                                <th>MAC Address</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && cameras.length === 0 && (
                                <tr>
                                    <td colSpan="3" className="table-empty">No cameras discovered yet. Click Scan Network.</td>
                                </tr>
                            )}
                            {cameras.map((camera) => (
                                <tr key={camera.ip}>
                                    <td>{camera.ip}</td>
                                    <td>{camera.mac || '-'}</td>
                                    <td>
                                        <span className={`status-pill ${camera.status === 'Online' ? 'online' : 'offline'}`}>
                                            {camera.status || 'Offline'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.section>

            <motion.section className="glass-card camera-stage" variants={itemVariants}>
                <h2>Stage 2 - Label</h2>
                <p className="stage-note">Preview each stream and assign a zone label (for example: living-room).</p>

                <div className="credentials-row">
                    <label>
                        Username
                        <input value={creds.username} onChange={(e) => updateCred('username', e.target.value)} />
                    </label>
                    <label>
                        Password
                        <input value={creds.password} onChange={(e) => updateCred('password', e.target.value)} />
                    </label>
                    <label>
                        Default Port
                        <input value={creds.port} onChange={(e) => updateCred('port', e.target.value)} />
                    </label>
                    <label>
                        Path
                        <input value={creds.path} onChange={(e) => updateCred('path', e.target.value)} />
                    </label>
                </div>

                <div className="label-list">
                    {cameras.map((camera) => (
                        <div key={`label-${camera.ip}`} className="label-row">
                            <div className="snapshot-wrap">
                                <img
                                    src={`/api/camera/setup/snapshot?rtsp=${encodeURIComponent(camera.rtsp)}&t=${Date.now()}`}
                                    alt={`Snapshot ${camera.ip}`}
                                    loading="lazy"
                                />
                            </div>
                            <div className="label-controls">
                                <div className="camera-ip">{camera.ip}</div>
                                <input
                                    value={camera.zone}
                                    onChange={(e) => updateCameraField(camera.ip, 'zone', e.target.value)}
                                    placeholder="Zone name (living-room)"
                                />
                                <input
                                    value={camera.rtsp}
                                    onChange={(e) => updateCameraField(camera.ip, 'rtsp', e.target.value)}
                                    placeholder="RTSP URL"
                                />
                                <button
                                    className="camera-btn camera-btn-secondary"
                                    onClick={() => saveRow(camera)}
                                    disabled={camera.saving}
                                >
                                    <Save size={15} />
                                    {camera.saving ? 'Saving...' : camera.saved ? 'Saved' : 'Save'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.section>

            <motion.section className="glass-card camera-stage stage-export" variants={itemVariants}>
                <h2>Stage 3 - Export</h2>
                <p className="stage-note">Generate cameras.json in the required Pi-friendly format.</p>
                <div className="export-row">
                    <div className="export-meta">{labeledCount} labeled camera(s) ready</div>
                    <button className="camera-btn camera-btn-primary" onClick={generateConfig} disabled={isExporting}>
                        <Download size={16} />
                        {isExporting ? 'Generating...' : 'Generate Config'}
                    </button>
                </div>
            </motion.section>
        </motion.div>
    )
}
