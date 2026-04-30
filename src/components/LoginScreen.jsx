import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import './LoginScreen.css';

export default function LoginScreen() {
  const [selectedRole, setSelectedRole] = useState('waiter');
  const [code, setCode] = useState('W001');
  const [pin, setPin] = useState('1234');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginWithPin } = useAuth();
  const navigate = useNavigate();

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    if (role === 'waiter') {
      setCode('W001');
      setPin('');
    } else if (role === 'kitchen_supervisor') {
      setCode('K001');
      setPin('');
    } else if (role === 'manager') {
      setCode('M001');
      setPin('');
    } else if (role === 'captain') {
      setCode('C001');
      setPin('');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await loginWithPin({ code, pin, role: selectedRole });
      navigate(authService.getRouteForRole(user.role));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to log in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">KOT System</h1>

        {error && <div className="login-error">{error}</div>}

        <div className="role-selector">
          <button
            type="button"
            className={selectedRole === 'waiter' ? 'active' : ''}
            onClick={() => handleRoleSelect('waiter')}>Waiter</button>
          <button
            type="button"
            className={selectedRole === 'captain' ? 'active' : ''}
            onClick={() => handleRoleSelect('captain')}>Captain</button>
          <button
            type="button"
            className={selectedRole === 'kitchen_supervisor' ? 'active' : ''}
            onClick={() => handleRoleSelect('kitchen_supervisor')}>Kitchen Supervisor</button>
          <button
            type="button"
            className={selectedRole === 'manager' ? 'active' : ''}
            onClick={() => handleRoleSelect('manager')}>Manager</button>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>Staff Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div className="form-group">
            <label>PIN</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={loading} className="login-submit">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
