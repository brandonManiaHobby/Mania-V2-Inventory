import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { SourceProvider } from './data'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SourceProvider>
      <App />
    </SourceProvider>
  </React.StrictMode>,
)
