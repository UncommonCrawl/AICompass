import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AICompass from './AICompass.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AICompass />
  </StrictMode>,
)
