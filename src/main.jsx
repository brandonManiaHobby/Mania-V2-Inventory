import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth'
import { SourceProvider } from './data'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SourceProvider>
        <App />
      </SourceProvider>
    </AuthProvider>
  </React.StrictMode>,
)
