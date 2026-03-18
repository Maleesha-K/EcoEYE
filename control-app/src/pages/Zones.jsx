import { motion } from 'framer-motion'
import { useState } from 'react'
import {
    Users,
    Power,
    Lightbulb,
    Thermometer,
    Fan,
    Clock,
    MapPin,
    Settings2,
    Plus,
} from 'lucide-react'
import AddZoneModal from '../components/AddZoneModal'
import './Zones.css'

const pageVariants = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.06 } },
    exit: { opacity: 0, y: -16 },
}
const itemVariants = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
}

const initialZones = [
    {
        id: 1,
        name: 'Lounge Area',
        location: 'Floor 1 — West Wing',
        occupancy: 3,
        maxOccupancy: 8,
        active: true,
        schedule: '08:00 — 22:00',
        devices: [
            { name: 'Ceiling Lights', type: 'lightbulb', on: true, power: '45W' },
            { name: 'Split AC Unit', type: 'thermometer', on: true, power: '1200W' },
            { name: 'Standing Fan', type: 'fan', on: false, power: '65W' },
        ],
    },
    {
        id: 2,
        name: 'Desk Area',
        location: 'Floor 1 — East Wing',
        occupancy: 5,
        maxOccupancy: 12,
        active: true,
        schedule: '07:00 — 21:00',
        devices: [
            { name: 'Panel Lights', type: 'lightbulb', on: true, power: '60W' },
            { name: 'Central AC', type: 'thermometer', on: true, power: '2400W' },
            { name: 'Desk Fans', type: 'fan', on: true, power: '120W' },
        ],
    },
    {
        id: 3,
        name: 'Hallway',
        location: 'Floor 1 — Central',
        occupancy: 0,
        maxOccupancy: 6,
        active: false,
        schedule: '06:00 — 23:00',
        devices: [
            { name: 'Corridor Lights', type: 'lightbulb', on: false, power: '30W' },
            { name: 'Exhaust Fan', type: 'fan', on: false, power: '40W' },
        ],
    },
    {
        id: 4,
        name: 'Conference Room',
        location: 'Floor 2 — North',
        occupancy: 0,
        maxOccupancy: 10,
        active: false,
        schedule: '09:00 — 18:00',
        devices: [
            { name: 'Spot Lights', type: 'lightbulb', on: false, power: '80W' },
            { name: 'Split AC', type: 'thermometer', on: false, power: '1500W' },
            { name: 'Ceiling Fan', type: 'fan', on: false, power: '75W' },
        ],
    },
    {
        id: 5,
        name: 'Server Room',
        location: 'Floor 2 — South',
        occupancy: 0,
        maxOccupancy: 2,
        active: true,
        schedule: '24/7',
        devices: [
            { name: 'Rack Lights', type: 'lightbulb', on: true, power: '20W' },
            { name: 'Precision AC', type: 'thermometer', on: true, power: '3000W' },
        ],
    },
    {
        id: 6,
        name: 'Cafeteria',
        location: 'Floor 1 — South',
        occupancy: 2,
        maxOccupancy: 20,
        active: true,
        schedule: '07:00 — 20:00',
        devices: [
            { name: 'Pendant Lights', type: 'lightbulb', on: true, power: '90W' },
            { name: 'AC Unit', type: 'thermometer', on: false, power: '1800W' },
            { name: 'Ceiling Fans', type: 'fan', on: true, power: '150W' },
        ],
    },
]

const DeviceIcon = ({ type, size = 15 }) => {
    switch (type) {
        case 'lightbulb': return <Lightbulb size={size} />
        case 'thermometer': return <Thermometer size={size} />
        case 'fan': return <Fan size={size} />
        default: return <Power size={size} />
    }
}

export default function Zones() {
    const [zones, setZones] = useState(initialZones)
    const [showModal, setShowModal] = useState(false)

    const addZone = (newZone) => {
        setZones((prev) => [...prev, newZone])
    }

    const toggleZone = (id) => {
        setZones((prev) =>
            prev.map((z) =>
                z.id === id
                    ? {
                        ...z,
                        active: !z.active,
                        devices: z.devices.map((d) => ({ ...d, on: !z.active })),
                    }
                    : z
            )
        )
    }

    const toggleDevice = (zoneId, devIdx) => {
        setZones((prev) =>
            prev.map((z) =>
                z.id === zoneId
                    ? {
                        ...z,
                        devices: z.devices.map((d, i) =>
                            i === devIdx ? { ...d, on: !d.on } : d
                        ),
                    }
                    : z
            )
        )
    }

    return (
        <motion.div
            className="zones-page"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
        >
            <motion.div className="page-header" variants={itemVariants}>
                <div>
                    <h1 className="page-title">Zone Management</h1>
                    <p className="page-desc">Configure and control individual building zones</p>
                </div>
                <div className="page-header-actions">
                    <motion.button
                        className="add-zone-btn"
                        onClick={() => setShowModal(true)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                    >
                        <Plus size={16} />
                        Add Zone
                    </motion.button>
                    <div className="zone-summary">
                        <div className="summary-item">
                            <span className="summary-value">{zones.filter(z => z.active).length}</span>
                            <span className="summary-label">Active</span>
                        </div>
                        <div className="summary-divider" />
                        <div className="summary-item">
                            <span className="summary-value">{zones.length}</span>
                            <span className="summary-label">Total</span>
                        </div>
                    </div>
                </div>
            </motion.div>

            <div className="zones-detail-grid">
                {zones.map((zone) => (
                    <motion.div
                        className={`zone-detail-card glass-card ${zone.active ? 'zone-detail--active' : ''}`}
                        key={zone.id}
                        variants={itemVariants}
                        whileHover={{ y: -3 }}
                    >
                        <div className="zone-detail-top">
                            <div>
                                <h3 className="zone-detail-name">{zone.name}</h3>
                                <div className="zone-detail-loc">
                                    <MapPin size={11} />
                                    {zone.location}
                                </div>
                            </div>
                            <button
                                className={`zone-toggle ${zone.active ? 'zone-toggle--on' : ''}`}
                                onClick={() => toggleZone(zone.id)}
                            >
                                <motion.div
                                    className="zone-toggle-knob"
                                    layout
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                />
                            </button>
                        </div>

                        <div className="zone-detail-meta">
                            <div className="meta-item">
                                <Users size={13} />
                                <span>{zone.occupancy} / {zone.maxOccupancy}</span>
                            </div>
                            <div className="meta-item">
                                <Clock size={13} />
                                <span>{zone.schedule}</span>
                            </div>
                        </div>

                        <div className="zone-detail-devices">
                            <div className="devices-header">
                                <Settings2 size={12} />
                                <span>Devices</span>
                            </div>
                            {zone.devices.map((device, di) => (
                                <div className={`device-row ${device.on ? 'device-row--on' : ''}`} key={di}>
                                    <div className="device-row-info">
                                        <DeviceIcon type={device.type} />
                                        <span className="device-row-name">{device.name}</span>
                                    </div>
                                    <span className="device-row-power">{device.power}</span>
                                    <button
                                        className={`mini-toggle ${device.on ? 'mini-toggle--on' : ''}`}
                                        onClick={() => toggleDevice(zone.id, di)}
                                    >
                                        <motion.div
                                            className="mini-toggle-knob"
                                            layout
                                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                        />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="zone-bar-container">
                            <motion.div
                                className="zone-bar"
                                initial={{ width: 0 }}
                                animate={{ width: `${(zone.occupancy / zone.maxOccupancy) * 100}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                        </div>
                    </motion.div>
                ))}
            </div>

            <AddZoneModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onAdd={addZone}
            />
        </motion.div>
    )
}
