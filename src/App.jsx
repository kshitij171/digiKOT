import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import WaiterApp from './components/WaiterApp';
import KitchenApp from './components/KitchenApp';
import ManagerApp from './components/ManagerApp';
import PagerRegisterPage from './components/PagerRegisterPage';
import NotificationCenter from './components/NotificationCenter';
import LoginScreen from './components/LoginScreen';
import SetupLoginPage from './components/setup/SetupLoginPage';
import SetupDashboardPage from './components/setup/SetupDashboardPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { authService } from './services/authService';
import { roleSatisfiesRequiredRole } from './lib/utils/auth';
import { DevLogRouteWatcher } from './lib/devLogInit.js';

// Each role maps to exactly one home route prefix.
const ROLE_HOME = {
  waiter: '/waiter',
  kitchen_supervisor: '/kitchen',
  manager: '/manager',
  owner: '/manager',
};

// Roles whose components provide their own full-page layout (no outer shell).
const SELF_CONTAINED_ROLES = ['manager', 'owner', 'waiter', 'kitchen_supervisor'];

/**
 * ProtectedRoute — guards a route group by login state AND, optionally, by role.
 * If the user is not logged in → redirect to /login.
 * If the user's role does not match `requiredRole` → redirect to their actual home.
 * Owner satisfies requiredRole="manager" (shared manager-access UI).
 */
const ProtectedRoute = ({ requiredRole } = {}) => {
  const { currentUser, role, logoutUser, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <div className="app-loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (requiredRole && !roleSatisfiesRequiredRole(role, requiredRole)) {
    const correctHome = ROLE_HOME[role] || '/login';
    return <Navigate to={correctHome} replace />;
  }

  if (SELF_CONTAINED_ROLES.includes(role)) {
    return <Outlet />;
  }

  // Minimal outer shell for other roles (e.g. /notifications).
  return (
    <div className="app-container">
      <nav className="glass-nav">
        <h1 className="brand-logo">OPULENCE</h1>
        <div className="nav-links">
          <button
            className="nav-link"
            onClick={logoutUser}
          >
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
  const { currentUser, role, authReady } = useAuth();
  const homeRoute = authService.getRouteForRole(role || 'waiter');

  return (
    <Routes>
      <Route
        path="/login"
        element={
          !authReady
            ? <div className="app-loading" style={{ padding: '2rem', textAlign: 'center' }}>Loading…</div>
            : !currentUser
              ? <LoginScreen />
              : <Navigate to={homeRoute} replace />
        }
      />

      <Route path="/setup" element={<SetupLoginPage />} />
      <Route path="/setup/dashboard" element={<SetupDashboardPage />} />

      {/* Role-isolated route groups — wrong role is redirected to their own home */}
      <Route element={<ProtectedRoute requiredRole="waiter" />}>
        <Route path="/waiter/*" element={<WaiterApp />} />
      </Route>

      <Route element={<ProtectedRoute requiredRole="kitchen_supervisor" />}>
        <Route path="/kitchen" element={<KitchenApp />} />
      </Route>

      <Route element={<ProtectedRoute requiredRole="manager" />}>
        <Route path="/manager" element={<ManagerApp />} />
        <Route path="/pager-register" element={<PagerRegisterPage />} />
      </Route>

      {/* Shared / index routes — any authenticated user */}
      <Route element={<ProtectedRoute />}>
        <Route path="/notifications" element={<NotificationCenter />} />
        <Route path="/" element={<Navigate to={homeRoute} replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <DevLogRouteWatcher />
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
