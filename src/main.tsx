import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Vite's service worker installs updates automatically. Reload as soon as a
// newly deployed worker takes control so an installed phone app cannot keep
// showing the previous JavaScript bundle until another manual restart.
if ('serviceWorker' in navigator) {
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })
  window.addEventListener('load', () => {
    void navigator.serviceWorker.ready.then(registration => registration.update())
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
