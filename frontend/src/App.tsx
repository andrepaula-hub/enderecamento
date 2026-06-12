import React from 'react'
import { useUIStore } from './store/ui'
import ConfigPage from './pages/ConfigPage'
import MapPage from './pages/MapPage'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: 'red' }}>
          <strong>Erro inesperado:</strong> {this.state.error?.message ?? 'Erro desconhecido'}
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const view = useUIStore((s) => s.view)
  return (
    <ErrorBoundary>
      {view === 'config' ? <ConfigPage /> : <MapPage />}
    </ErrorBoundary>
  )
}
