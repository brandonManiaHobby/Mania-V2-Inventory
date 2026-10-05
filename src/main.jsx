import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth'
import { SourceProvider } from './data'

// AuthProvider must wrap SourceProvider — the source waits on auth status.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SourceProvider>
        <App />
      </SourceProvider>
    </AuthProvider>
  </React.StrictMode>,
)
