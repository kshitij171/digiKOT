import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import WaiterApp from './components/WaiterApp';
import KitchenApp from './components/KitchenApp';
import ManagerApp from './components/ManagerApp';
import NotificationCenter from './components/NotificationCenter';
import LoginScreen from './components/LoginScreen';
import PagerRegisterPage from './components/PagerRegisterPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { authService } from './services/authService';

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
  if (location.pathname.includes("pager-register")) screenName = "Pager setup";

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
        <Route path="/manager" element={<ManagerApp />} />
        <Route path="/pager-register" element={<PagerRegisterPage />} />
        <Route path="/notifications" element={<NotificationCenter />} />
        <Route path="/" element={<Navigate to={homeRoute} />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
