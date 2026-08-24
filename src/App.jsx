import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './styles/theme'
import LoginPage from './pages/LoginPage'
import AppShell from './pages/AppShell'
import { Spinner } from './components/UI'

function Router() {
  const { session, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner label="Verificando acesso..." />
    </div>
  )
  return session ? <AppShell /> : <LoginPage />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </ThemeProvider>
  )
}
