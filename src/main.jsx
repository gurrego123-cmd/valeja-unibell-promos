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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister())
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
