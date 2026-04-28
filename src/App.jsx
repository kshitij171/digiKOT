import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import WaiterApp from './components/WaiterApp';
import KitchenApp from './components/KitchenApp';
import LoginScreen from './components/LoginScreen';
import { AuthProvider, useAuth } from './context/AuthContext';

const ProtectedRoute = () => {
  const { currentUser, role, logoutUser } = useAuth();
  const location = useLocation();
  if (!currentUser) return <Navigate to="/login" />;

  let screenName = "Dashboard";
  if (location.pathname.includes("waiter")) screenName = "Waiter";
  if (location.pathname.includes("kitchen")) screenName = "Kitchen Display";

  return (
    <div className="app-container">
      <nav className="glass-nav">
        <h1 className="brand-logo">
          KOT System
          <span style={{ fontSize: '1rem', marginLeft: '12px', color: '#cbd5e1', fontWeight: 'normal' }}>
            | {screenName} Screen ({role ? role.charAt(0).toUpperCase() + role.slice(1) : ''})
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

  return (
    <Routes>
      <Route path="/login" element={!currentUser ? <LoginScreen /> : <Navigate to={`/${role || 'waiter'}`} />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/waiter/*" element={<WaiterApp />} />
        <Route path="/kitchen" element={<KitchenApp />} />
        <Route path="/" element={<Navigate to={`/${role || 'waiter'}`} />} />
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
