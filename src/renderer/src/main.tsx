import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { QuickCapture } from './QuickCapture'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).has('quick') ? <QuickCapture /> : <App />}
  </React.StrictMode>
)
