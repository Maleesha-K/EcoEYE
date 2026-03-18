import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import {
    X,
    Plus,
    Camera,
    Lightbulb,
    Thermometer,
    Fan,
    Trash2,
    MapPin,
    Clock,
    Users,
} from 'lucide-react'
import './AddZoneModal.css'

const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
}

const modalVariants = {
    hidden: { opacity: 0, y: 40, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 28 } },
    exit: { opacity: 0, y: 20, scale: 0.97, transition: { duration: 0.2 } },
}

const emptyCamera = () => ({
    id: Date.now() + Math.random(),
    name: '',
    ip: '',
    lights: [],
    fans: [],
    acs: [],
})

export default function AddZoneModal({ isOpen, onClose, onAdd }) {
    const [step, setStep] = useState(1) // 1 = zone info, 2 = device mapping
    const [form, setForm] = useState({
        name: '',
        location: '',
        maxOccupancy: '',
        scheduleStart: '08:00',
        scheduleEnd: '18:00',
        numCameras: 1,
        numLights: 1,
        numFans: 0,
        numACs: 0,
    })
    const [cameras, setCameras] = useState([{ ...emptyCamera(), id: 1 }])
    const [errors, setErrors] = useState({})

    const resetForm = () => {
        setStep(1)
        setForm({
            name: '',
            location: '',
            maxOccupancy: '',
            scheduleStart: '08:00',
            scheduleEnd: '18:00',
            numCameras: 1,
            numLights: 1,
            numFans: 0,
            numACs: 0,
        })
        setCameras([{ ...emptyCamera(), id: 1 }])
        setErrors({})
    }

    const handleClose = () => {
        resetForm()
        onClose()
    }

    const handleChange = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }))
        if (errors[key]) setErrors((prev) => ({ ...prev, [key]: null }))
    }

    const validateStep1 = () => {
        const errs = {}
        if (!form.name.trim()) errs.name = 'Zone name is required'
        if (!form.location.trim()) errs.location = 'Location is required'
        if (!form.maxOccupancy || parseInt(form.maxOccupancy) <= 0) errs.maxOccupancy = 'Enter a valid number'
        if (parseInt(form.numCameras) <= 0) errs.numCameras = 'At least 1 camera'
        setErrors(errs)
        return Object.keys(errs).length === 0
    }

    const goToStep2 = () => {
        if (!validateStep1()) return
        // Build camera array based on count
        const count = parseInt(form.numCameras) || 1
        const newCameras = Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            name: `Camera ${i + 1}`,
            ip: '',
            lights: [],
            fans: [],
            acs: [],
        }))
        setCameras(newCameras)
        setStep(2)
    }

    const updateCamera = (camId, key, value) => {
        setCameras((prev) =>
            prev.map((c) => (c.id === camId ? { ...c, [key]: value } : c))
        )
    }

    const addDeviceToCamera = (camId, deviceType) => {
        setCameras((prev) =>
            prev.map((c) => {
                if (c.id !== camId) return c
                const list = [...c[deviceType]]
                const typeLabel =
                    deviceType === 'lights' ? 'Light' : deviceType === 'fans' ? 'Fan' : 'AC'
                list.push({ name: `${typeLabel} ${list.length + 1}`, power: '' })
                return { ...c, [deviceType]: list }
            })
        )
    }

    const removeDeviceFromCamera = (camId, deviceType, idx) => {
        setCameras((prev) =>
            prev.map((c) => {
                if (c.id !== camId) return c
                const list = c[deviceType].filter((_, i) => i !== idx)
                return { ...c, [deviceType]: list }
            })
        )
    }

    const updateDeviceInCamera = (camId, deviceType, idx, field, value) => {
        setCameras((prev) =>
            prev.map((c) => {
                if (c.id !== camId) return c
                const list = c[deviceType].map((d, i) =>
                    i === idx ? { ...d, [field]: value } : d
                )
                return { ...c, [deviceType]: list }
            })
        )
    }

    const handleSubmit = () => {
        // Build the zone object
        const devices = []
        cameras.forEach((cam) => {
            cam.lights.forEach((d) =>
                devices.push({
                    name: d.name || 'Light',
                    type: 'lightbulb',
                    on: false,
                    power: d.power || '0W',
                    camera: cam.name,
                })
            )
            cam.fans.forEach((d) =>
                devices.push({
                    name: d.name || 'Fan',
                    type: 'fan',
                    on: false,
                    power: d.power || '0W',
                    camera: cam.name,
                })
            )
            cam.acs.forEach((d) =>
                devices.push({
                    name: d.name || 'AC',
                    type: 'thermometer',
                    on: false,
                    power: d.power || '0W',
                    camera: cam.name,
                })
            )
        })

        const newZone = {
            id: Date.now(),
            name: form.name,
            location: form.location,
            occupancy: 0,
            maxOccupancy: parseInt(form.maxOccupancy) || 10,
            active: false,
            schedule: `${form.scheduleStart} — ${form.scheduleEnd}`,
            devices,
            cameras: cameras.map((c) => ({ name: c.name, ip: c.ip })),
        }

        onAdd(newZone)
        handleClose()
    }

    // Summary counts for step 2
    const totalAssignedLights = cameras.reduce((s, c) => s + c.lights.length, 0)
    const totalAssignedFans = cameras.reduce((s, c) => s + c.fans.length, 0)
    const totalAssignedACs = cameras.reduce((s, c) => s + c.acs.length, 0)

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="modal-overlay"
                    variants={overlayVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    onClick={handleClose}
                >
                    <motion.div
                        className="modal-container"
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="modal-header">
                            <div>
                                <h2 className="modal-title">
                                    {step === 1 ? 'Add New Zone' : 'Device — Camera Mapping'}
                                </h2>
                                <p className="modal-subtitle">
                                    {step === 1
                                        ? 'Enter zone details and device counts'
                                        : 'Assign devices to CCTV cameras'}
                                </p>
                            </div>
                            <button className="modal-close-btn" onClick={handleClose}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Step indicator */}
                        <div className="step-indicator">
                            <div className={`step-dot ${step >= 1 ? 'step-dot--active' : ''}`}>1</div>
                            <div className={`step-line ${step >= 2 ? 'step-line--active' : ''}`} />
                            <div className={`step-dot ${step >= 2 ? 'step-dot--active' : ''}`}>2</div>
                        </div>

                        <div className="modal-body">
                            {step === 1 ? (
                                <>
                                    {/* Zone Info */}
                                    <div className="modal-section">
                                        <div className="modal-section-label">Zone Information</div>
                                        <div className="modal-form-grid">
                                            <div className={`modal-field ${errors.name ? 'modal-field--error' : ''}`}>
                                                <label><MapPin size={12} /> Zone Name</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Conference Room B"
                                                    value={form.name}
                                                    onChange={(e) => handleChange('name', e.target.value)}
                                                />
                                                {errors.name && <span className="field-error">{errors.name}</span>}
                                            </div>
                                            <div className={`modal-field ${errors.location ? 'modal-field--error' : ''}`}>
                                                <label><MapPin size={12} /> Location</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Floor 2 — North Wing"
                                                    value={form.location}
                                                    onChange={(e) => handleChange('location', e.target.value)}
                                                />
                                                {errors.location && <span className="field-error">{errors.location}</span>}
                                            </div>
                                            <div className={`modal-field ${errors.maxOccupancy ? 'modal-field--error' : ''}`}>
                                                <label><Users size={12} /> Max Occupancy</label>
                                                <input
                                                    type="number"
                                                    placeholder="e.g. 12"
                                                    value={form.maxOccupancy}
                                                    onChange={(e) => handleChange('maxOccupancy', e.target.value)}
                                                />
                                                {errors.maxOccupancy && <span className="field-error">{errors.maxOccupancy}</span>}
                                            </div>
                                        </div>
                                        <div className="modal-form-grid modal-form-grid--2col">
                                            <div className="modal-field">
                                                <label><Clock size={12} /> Schedule Start</label>
                                                <input
                                                    type="time"
                                                    value={form.scheduleStart}
                                                    onChange={(e) => handleChange('scheduleStart', e.target.value)}
                                                />
                                            </div>
                                            <div className="modal-field">
                                                <label><Clock size={12} /> Schedule End</label>
                                                <input
                                                    type="time"
                                                    value={form.scheduleEnd}
                                                    onChange={(e) => handleChange('scheduleEnd', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Device Counts Table */}
                                    <div className="modal-section">
                                        <div className="modal-section-label">Device & Camera Inventory</div>
                                        <div className="device-count-table">
                                            <div className="dct-header">
                                                <span>Equipment</span>
                                                <span>Count</span>
                                            </div>
                                            <div className="dct-row">
                                                <div className="dct-item">
                                                    <Camera size={14} />
                                                    <span>CCTV Cameras</span>
                                                </div>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={form.numCameras}
                                                    onChange={(e) => handleChange('numCameras', e.target.value)}
                                                    className={errors.numCameras ? 'input--error' : ''}
                                                />
                                            </div>
                                            <div className="dct-row">
                                                <div className="dct-item">
                                                    <Lightbulb size={14} />
                                                    <span>Lights</span>
                                                </div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={form.numLights}
                                                    onChange={(e) => handleChange('numLights', e.target.value)}
                                                />
                                            </div>
                                            <div className="dct-row">
                                                <div className="dct-item">
                                                    <Fan size={14} />
                                                    <span>Fans</span>
                                                </div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={form.numFans}
                                                    onChange={(e) => handleChange('numFans', e.target.value)}
                                                />
                                            </div>
                                            <div className="dct-row">
                                                <div className="dct-item">
                                                    <Thermometer size={14} />
                                                    <span>AC Units</span>
                                                </div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={form.numACs}
                                                    onChange={(e) => handleChange('numACs', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Step 2: Camera-Device Mapping */}
                                    <div className="mapping-summary">
                                        <div className="mapping-chip">
                                            <Lightbulb size={12} />
                                            {totalAssignedLights} / {form.numLights} Lights
                                        </div>
                                        <div className="mapping-chip">
                                            <Fan size={12} />
                                            {totalAssignedFans} / {form.numFans} Fans
                                        </div>
                                        <div className="mapping-chip">
                                            <Thermometer size={12} />
                                            {totalAssignedACs} / {form.numACs} ACs
                                        </div>
                                    </div>

                                    <div className="camera-mapping-list">
                                        {cameras.map((cam) => (
                                            <div className="camera-mapping-card" key={cam.id}>
                                                <div className="cam-card-header">
                                                    <div className="cam-card-icon">
                                                        <Camera size={16} />
                                                    </div>
                                                    <div className="cam-card-inputs">
                                                        <input
                                                            type="text"
                                                            placeholder="Camera Name"
                                                            value={cam.name}
                                                            onChange={(e) => updateCamera(cam.id, 'name', e.target.value)}
                                                            className="cam-name-input"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="IP Address (e.g. 192.168.1.10)"
                                                            value={cam.ip}
                                                            onChange={(e) => updateCamera(cam.id, 'ip', e.target.value)}
                                                            className="cam-ip-input"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Assigned devices table */}
                                                <div className="cam-devices-section">
                                                    {/* Lights */}
                                                    <div className="cam-device-group">
                                                        <div className="cam-group-header">
                                                            <Lightbulb size={12} />
                                                            <span>Lights ({cam.lights.length})</span>
                                                            <button
                                                                className="cam-add-btn"
                                                                onClick={() => addDeviceToCamera(cam.id, 'lights')}
                                                            >
                                                                <Plus size={11} /> Add
                                                            </button>
                                                        </div>
                                                        {cam.lights.map((d, di) => (
                                                            <div className="cam-device-row" key={di}>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Light name"
                                                                    value={d.name}
                                                                    onChange={(e) =>
                                                                        updateDeviceInCamera(cam.id, 'lights', di, 'name', e.target.value)
                                                                    }
                                                                />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Power (W)"
                                                                    value={d.power}
                                                                    onChange={(e) =>
                                                                        updateDeviceInCamera(cam.id, 'lights', di, 'power', e.target.value)
                                                                    }
                                                                    className="cam-power-input"
                                                                />
                                                                <button
                                                                    className="cam-remove-btn"
                                                                    onClick={() => removeDeviceFromCamera(cam.id, 'lights', di)}
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Fans */}
                                                    <div className="cam-device-group">
                                                        <div className="cam-group-header">
                                                            <Fan size={12} />
                                                            <span>Fans ({cam.fans.length})</span>
                                                            <button
                                                                className="cam-add-btn"
                                                                onClick={() => addDeviceToCamera(cam.id, 'fans')}
                                                            >
                                                                <Plus size={11} /> Add
                                                            </button>
                                                        </div>
                                                        {cam.fans.map((d, di) => (
                                                            <div className="cam-device-row" key={di}>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Fan name"
                                                                    value={d.name}
                                                                    onChange={(e) =>
                                                                        updateDeviceInCamera(cam.id, 'fans', di, 'name', e.target.value)
                                                                    }
                                                                />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Power (W)"
                                                                    value={d.power}
                                                                    onChange={(e) =>
                                                                        updateDeviceInCamera(cam.id, 'fans', di, 'power', e.target.value)
                                                                    }
                                                                    className="cam-power-input"
                                                                />
                                                                <button
                                                                    className="cam-remove-btn"
                                                                    onClick={() => removeDeviceFromCamera(cam.id, 'fans', di)}
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* ACs */}
                                                    <div className="cam-device-group">
                                                        <div className="cam-group-header">
                                                            <Thermometer size={12} />
                                                            <span>AC Units ({cam.acs.length})</span>
                                                            <button
                                                                className="cam-add-btn"
                                                                onClick={() => addDeviceToCamera(cam.id, 'acs')}
                                                            >
                                                                <Plus size={11} /> Add
                                                            </button>
                                                        </div>
                                                        {cam.acs.map((d, di) => (
                                                            <div className="cam-device-row" key={di}>
                                                                <input
                                                                    type="text"
                                                                    placeholder="AC name"
                                                                    value={d.name}
                                                                    onChange={(e) =>
                                                                        updateDeviceInCamera(cam.id, 'acs', di, 'name', e.target.value)
                                                                    }
                                                                />
                                                                <input
                                                                    type="text"
                                                                    placeholder="Power (W)"
                                                                    value={d.power}
                                                                    onChange={(e) =>
                                                                        updateDeviceInCamera(cam.id, 'acs', di, 'power', e.target.value)
                                                                    }
                                                                    className="cam-power-input"
                                                                />
                                                                <button
                                                                    className="cam-remove-btn"
                                                                    onClick={() => removeDeviceFromCamera(cam.id, 'acs', di)}
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="modal-footer">
                            {step === 2 && (
                                <button className="modal-btn modal-btn--secondary" onClick={() => setStep(1)}>
                                    Back
                                </button>
                            )}
                            <div className="modal-footer-right">
                                <button className="modal-btn modal-btn--ghost" onClick={handleClose}>
                                    Cancel
                                </button>
                                {step === 1 ? (
                                    <button className="modal-btn modal-btn--primary" onClick={goToStep2}>
                                        Next — Assign Devices
                                    </button>
                                ) : (
                                    <motion.button
                                        className="modal-btn modal-btn--primary"
                                        onClick={handleSubmit}
                                        whileTap={{ scale: 0.97 }}
                                    >
                                        <Plus size={14} />
                                        Create Zone
                                    </motion.button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
