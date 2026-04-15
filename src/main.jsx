/**
 * Application entry point.
 * Mounts the React app into the #root div defined in index.html.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../chore-coins.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
