import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// Global unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason)
  // Prevent the default browser behavior (logging to console + showing error)
  event.preventDefault()
})

// Global error handler
window.addEventListener('error', (event) => {
  console.error('[Global Error]', event.error || event.message)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
