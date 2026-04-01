import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { Camera, Download, Plus, Search, RefreshCw } from 'lucide-react'
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

const DEFAULT_RTSP_PORT = '554'
const DEFAULT_RTSP_PATH = '/cam/realmonitor?channel=1&subtype=0'
const DEFAULT_CAMERA_USERNAME = 'admin'

function buildRtsp(ip, creds) {
    const username = encodeURIComponent(creds.username || DEFAULT_CAMERA_USERNAME)
    const password = encodeURIComponent(creds.password || '')
    const port = DEFAULT_RTSP_PORT
    const path = DEFAULT_RTSP_PATH
    return `rtsp://${username}:${password}@${ip}:${port}${path}`
}

function parseRtspDetails(rtsp) {
    const raw = String(rtsp || '').trim()
    const match = raw.match(/^rtsp:\/\/([^:\/\s@]+):([^@\s]*)@([^:\/\s?#]+)(?::(\d+))?(\/[^\s]*)?$/i)
    if (!match) return null

    const username = decodeURIComponent(match[1] || '')
    const password = decodeURIComponent(match[2] || '')
    const ip = match[3] || ''

    if (!username || !password || !ip) return null
    return { username, password, ip }
}

export default function CameraSetup() {
    const [cameras, setCameras] = useState([])
    const [loading, setLoading] = useState(true)
    const [isScanning, setIsScanning] = useState(false)
    const [isExporting, setIsExporting] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const labeledCount = useMemo(
        () => cameras.filter((cam) => cam.added).length,
        [cameras]
    )

    const hydrateRows = (items, cameraSources = []) =>
        items.map((cam) => {
            const username = cam.username || DEFAULT_CAMERA_USERNAME
            const password = cam.password || ''
            const rtsp = cam.rtsp || buildRtsp(cam.ip, { username, password })
            return {
                ...cam,
                name: cam.name || cam.zone || '',
                username,
                password,
                rtsp,
                snapshotNonce: Date.now(),
                previewRequested: false,
                previewed: false,
                previewError: '',
                adding: false,
                added: cameraSources.includes(rtsp),
            }
        })

    const loadExisting = async () => {
        setLoading(true)
        setError('')
        try {
            const [listRes, configRes] = await Promise.all([
                fetch('/api/camera/setup/list'),
                fetch('/api/camera/config'),
            ])
            const listData = await listRes.json()
            const configData = await configRes.json().catch(() => ({}))
            const items = Array.isArray(listData.cameras) ? listData.cameras : []
            const cameraSources = Array.isArray(configData.cameraSources) ? configData.cameraSources : []
            setCameras(hydrateRows(items, cameraSources))
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
            const [scanRes, configRes] = await Promise.all([
                fetch('/api/camera/setup/scan', { method: 'POST' }),
                fetch('/api/camera/config'),
            ])
            const data = await scanRes.json()
            const configData = await configRes.json().catch(() => ({}))
            if (!scanRes.ok) {
                throw new Error(data.error || 'Network scan failed')
            }

            const cameraSources = Array.isArray(configData.cameraSources) ? configData.cameraSources : []
            const scanned = hydrateRows(data.cameras || [], cameraSources)

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
            prev.map((cam) => {
                if (cam.ip !== ip) return cam
                const nextCam = { ...cam, [key]: value }
                if (key === 'rtsp') {
                    const parsed = parseRtspDetails(value)
                    nextCam.username = parsed?.username || ''
                    nextCam.password = parsed?.password || ''
                    nextCam.previewed = false
                    nextCam.previewRequested = false
                    nextCam.previewError = ''
                    nextCam.snapshotNonce = Date.now()
                }
                return nextCam
            })
        )
    }

    const refreshSnapshot = (ip) => {
        const row = cameras.find((cam) => cam.ip === ip)
        const parsed = parseRtspDetails(row?.rtsp)
        if (!parsed) {
            setCameras((prev) =>
                prev.map((cam) =>
                    cam.ip === ip
                        ? {
                            ...cam,
                            previewRequested: false,
                            previewed: false,
                            previewError: 'Please enter the correct URL: forgot URL or wrong URL.',
                        }
                        : cam
                )
            )
            return
        }

        setCameras((prev) =>
            prev.map((cam) =>
                cam.ip === ip
                    ? {
                        ...cam,
                        username: parsed.username,
                        password: parsed.password,
                        previewRequested: true,
                        previewed: false,
                        previewError: '',
                        snapshotNonce: Date.now(),
                    }
                    : cam
            )
        )
    }

    const handleSnapshotLoad = (ip) => {
        setCameras((prev) =>
            prev.map((cam) =>
                cam.ip === ip
                    ? { ...cam, previewed: true, previewError: '' }
                    : cam
            )
        )
    }

    const handleSnapshotError = (ip) => {
        setCameras((prev) =>
            prev.map((cam) =>
                cam.ip === ip
                    ? {
                        ...cam,
                        previewed: false,
                        previewError: 'Please enter the correct URL: forgot URL or wrong URL.',
                    }
                    : cam
            )
        )
    }

    const addToCameraSources = async (camera) => {
        if (!camera.previewed) {
            setError('Please preview a valid RTSP URL before adding camera source')
            return
        }

        if (!camera.name.trim()) {
            setError('Camera name is required')
            return
        }

        const parsed = parseRtspDetails(camera.rtsp)
        if (!parsed) {
            setError('Please enter a valid RTSP URL with username and password')
            return
        }

        setError('')
        setSuccess('')
        setCameras((prev) => prev.map((cam) => (cam.ip === camera.ip ? { ...cam, adding: true } : cam)))

        try {
            const res = await fetch('/api/camera/setup/add-source', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ip: camera.ip,
                    name: camera.name.trim(),
                    rtsp: camera.rtsp,
                    username: parsed.username || DEFAULT_CAMERA_USERNAME,
                    password: parsed.password,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error || 'Failed to add camera source')
            }

            setCameras((prev) =>
                prev.map((cam) =>
                    cam.ip === camera.ip
                        ? {
                            ...cam,
                            adding: false,
                            added: true,
                            name: data.camera?.name || camera.name.trim(),
                            username: data.camera?.username || camera.username,
                            password: data.camera?.password || camera.password,
                            rtsp: data.camera?.rtsp || cam.rtsp,
                        }
                        : cam
                )
            )
            setSuccess(`${camera.name.trim()} added to Camera Sources`)
        } catch (ex) {
            setCameras((prev) => prev.map((cam) => (cam.ip === camera.ip ? { ...cam, adding: false } : cam)))
            setError(ex.message || 'Failed to add camera source')
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
                    <p>Paste RTSP, preview snapshot, then enter camera name and add to Camera Sources.</p>
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
                <p className="stage-note">Scan local subnet for cameras. Device technical details are hidden for simplicity.</p>
                <div className="camera-table-wrap">
                    <table className="camera-table">
                        <thead>
                            <tr>
                                <th>Device</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {!loading && cameras.length === 0 && (
                                <tr>
                                    <td colSpan="2" className="table-empty">No cameras discovered yet. Click Scan Network.</td>
                                </tr>
                            )}
                            {cameras.map((camera, index) => (
                                <tr key={camera.ip}>
                                    <td>{camera.name || `Camera ${index + 1}`}</td>
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
                <h2>Stage 2 - Name & Add</h2>
                <p className="stage-note">Flow: RTSP URL &gt; Preview &gt; Name &gt; Add to Camera Sources.</p>

                <div className="label-list">
                    {cameras.map((camera, index) => (
                        <div key={`label-${camera.ip}`} className="label-row">
                            <div className="snapshot-wrap">
                                {camera.previewRequested ? (
                                    <img
                                        src={`/api/camera/setup/snapshot?rtsp=${encodeURIComponent(camera.rtsp)}&t=${camera.snapshotNonce || 0}`}
                                        alt={`Snapshot Camera ${index + 1}`}
                                        loading="lazy"
                                        onLoad={() => handleSnapshotLoad(camera.ip)}
                                        onError={() => handleSnapshotError(camera.ip)}
                                    />
                                ) : (
                                    <div className="snapshot-placeholder">Preview not loaded</div>
                                )}
                            </div>
                            <div className="label-controls">
                                <div className="camera-ip">Detected Camera {index + 1}</div>
                                <input
                                    className="rtsp-input"
                                    value={camera.rtsp || ''}
                                    onChange={(e) => updateCameraField(camera.ip, 'rtsp', e.target.value)}
                                    placeholder="RTSP URL (rtsp://username:password@ip:554/cam/realmonitor?channel=1&subtype=0)"
                                />
                                <input
                                    value={camera.name}
                                    onChange={(e) => updateCameraField(camera.ip, 'name', e.target.value)}
                                    placeholder="Camera name (e.g. living-room)"
                                    disabled={!camera.previewed || camera.added}
                                />
                                <button
                                    className="camera-btn camera-btn-secondary"
                                    onClick={() => refreshSnapshot(camera.ip)}
                                >
                                    <RefreshCw size={15} />
                                    Preview
                                </button>
                                <button
                                    className="camera-btn camera-btn-secondary"
                                    onClick={() => addToCameraSources(camera)}
                                    disabled={camera.adding || camera.added || !camera.previewed || !camera.name.trim()}
                                >
                                    <Plus size={15} />
                                    {camera.adding ? 'Adding...' : camera.added ? 'Added' : 'Add to Camera Sources'}
                                </button>
                                {camera.previewError && <div className="preview-error">{camera.previewError}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.section>

            <motion.section className="glass-card camera-stage stage-export" variants={itemVariants}>
                <h2>Stage 3 - Export</h2>
                <p className="stage-note">Generate cameras.json in the required Pi-friendly format.</p>
                <div className="export-row">
                    <div className="export-meta">{labeledCount} camera(s) added to Camera Sources</div>
                    <button className="camera-btn camera-btn-primary" onClick={generateConfig} disabled={isExporting}>
                        <Download size={16} />
                        {isExporting ? 'Generating...' : 'Generate Config'}
                    </button>
                </div>
            </motion.section>
        </motion.div>
    )
}
