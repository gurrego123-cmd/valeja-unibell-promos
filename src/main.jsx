import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const splash = document.getElementById('app-splash')
const rootElement = document.getElementById('root')

const removeSplash = () => {
  if (splash) {
    splash.remove()
  }
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed', error)
    })
  })
}

window.setTimeout(removeSplash, 800)

if (!rootElement) {
  throw new Error('No se encontró el contenedor #root para renderizar la aplicación.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
