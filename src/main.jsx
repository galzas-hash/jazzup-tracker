import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import UpdateBanner from './UpdateBanner.jsx'
import './style.css'
createRoot(document.getElementById('root')).render(<><App /><UpdateBanner /></>)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
