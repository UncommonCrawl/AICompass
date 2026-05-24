import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../brand.css'
import './index.css'
import AICompass from './AICompass.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AICompass />
  </StrictMode>,
)
