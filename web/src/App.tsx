import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import AppLayout from './components/AppLayout'
import Deal from './pages/Deal'
import Home from './pages/Home'
import Join from './pages/Join'
import Lobby from './pages/Lobby'
import Pitch from './pages/Pitch'
import Reveal from './pages/Reveal'
import Results from './pages/Results'
import FinalRound from './pages/FinalRound'

function App() {
  const withLayout = (page: ReactElement) => {
    return <AppLayout>{page}</AppLayout>
  }

  return (
    <Routes>
      <Route path="/" element={withLayout(<Home />)} />
      <Route path="/join" element={withLayout(<Join />)} />
      <Route path="/lobby/:code" element={withLayout(<Lobby />)} />
      <Route path="/deal" element={withLayout(<Deal />)} />
      <Route path="/deal/:code" element={withLayout(<Deal />)} />
      <Route path="/pitch" element={withLayout(<Pitch />)} />
      <Route path="/pitch/:code" element={withLayout(<Pitch />)} />
      <Route path="/reveal" element={withLayout(<Reveal />)} />
      <Route path="/reveal/:code" element={withLayout(<Reveal />)} />
      <Route path="/results" element={withLayout(<Results />)} />
      <Route path="/results/:code" element={withLayout(<Results />)} />
      <Route path="/final-round" element={withLayout(<FinalRound />)} />
      <Route path="/final-round/:code" element={withLayout(<FinalRound />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
