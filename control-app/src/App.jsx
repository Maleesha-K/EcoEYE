import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Zones from './pages/Zones'
import Analytics from './pages/Analytics'
import AIPredictions from './pages/AIPredictions'
import Settings from './pages/Settings'
import './App.css'

function App() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/zones" element={<Zones />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/predictions" element={<AIPredictions />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default App
