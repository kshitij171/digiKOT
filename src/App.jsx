import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import WaiterApp from './components/WaiterApp';
import KitchenApp from './components/KitchenApp';
import ManagerApp from './components/ManagerApp';
import NotificationCenter from './components/NotificationCenter';
import LoginScreen from './components/LoginScreen';
import { AuthProvider, useAuth } from './context/AuthContext';
import { authService } from './services/authService';

class ManagerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[ManagerApp crashed]', error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0f172a', color: '#f1f5f9',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171', marginBottom: '1rem' }}>
            Manager Dashboard Error
          </div>
          <div style={{
            background: '#1e293b', borderRadius: 8, padding: '1.5rem', maxWidth: 680,
            width: '100%', textAlign: 'left', wordBreak: 'break-word', fontSize: '0.85rem',
            border: '1px solid #334155', lineHeight: 1.6,
          }}>
            <strong style={{ color: '#fbbf24' }}>{this.state.error.name}:</strong>{' '}
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '1.5rem', padding: '0.6rem 1.5rem', background: '#c9a84c',
              color: '#0f172a', border: 'none', borderRadius: 6, cursor: 'pointer',
              fontWeight: 700, fontSize: '0.9rem',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Manager has its own full-page layout, topbar, and logout button — no outer shell needed.
// Waiter and kitchen keep the outer shell because kitchen has no built-in logout button.
const SELF_CONTAINED_ROLES = ['manager'];

const ProtectedRoute = () => {
  const { currentUser, role, logoutUser } = useAuth();
  const location = useLocation();

  if (!currentUser) return <Navigate to="/login" />;

  // Manager has its own full-page shell with topbar + logout — render without outer wrapper.
  if (SELF_CONTAINED_ROLES.includes(role)) {
    return <Outlet />;
  }

  // Fallback shell for any other protected routes (e.g. /notifications)
  let screenName = "Dashboard";
  if (location.pathname.includes("notifications")) screenName = "Notifications";

  return (
    <div className="app-container">
      <nav className="glass-nav">
        <h1 className="brand-logo">
          KOT System
          <span style={{ fontSize: '1rem', marginLeft: '12px', color: '#cbd5e1', fontWeight: 'normal' }}>
            | {screenName}
          </span>
        </h1>
        <div className="nav-links">
          <button
            className="nav-link"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '1rem', fontWeight: 500, color: '#ef4444' }}
            onClick={logoutUser}>
            Logout
          </button>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

function AppRoutes() {
  const { currentUser, role } = useAuth();
  const homeRoute = authService.getRouteForRole(role || 'waiter');

  return (
    <Routes>
      <Route path="/login" element={!currentUser ? <LoginScreen /> : <Navigate to={homeRoute} />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/waiter/*" element={<WaiterApp />} />
        <Route path="/kitchen" element={<KitchenApp />} />
        <Route path="/manager" element={<ManagerErrorBoundary><ManagerApp /></ManagerErrorBoundary>} />
        <Route path="/notifications" element={<NotificationCenter />} />
        <Route path="/" element={<Navigate to={homeRoute} />} />
      </Route>
    </Routes>
  );
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error('[App crashed]', error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#0d1117', color: '#f87171',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'monospace', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '1rem' }}>Application Error</div>
          <div style={{
            background: '#1e293b', borderRadius: 8, padding: '1.5rem', maxWidth: 680,
            width: '100%', textAlign: 'left', wordBreak: 'break-word', fontSize: '0.85rem',
            border: '1px solid #334155', color: '#f1f5f9', lineHeight: 1.6,
          }}>
            <strong style={{ color: '#fbbf24' }}>{this.state.error.name}:</strong>{' '}
            {this.state.error.message}
          </div>
          <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ marginTop: '1.5rem', padding: '0.6rem 1.5rem', background: '#6366f1',
              color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700 }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

export default App;
