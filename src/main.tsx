import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ConfigErrorScreen, ErrorBoundary } from './components/Boot'
import { configError } from './lib/supabase'
import './index.css'

// Configuration is checked before mounting: with no Supabase credentials the
// app cannot do anything useful, and saying so beats an empty page.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {configError ? <ConfigErrorScreen detail={configError} /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
)
