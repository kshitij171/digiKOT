import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './LoginScreen.css';

export default function LoginScreen() {
  const [selectedRole, setSelectedRole] = useState('waiter');
  const [email, setEmail] = useState('waiter@demo.com');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    if (role === 'waiter') {
      setEmail('waiter@demo.com');
      setPassword('');
    } else if (role === 'kitchen') {
      setEmail('kitchen@demo.com');
      setPassword('');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      loginUser(userCredential.user, selectedRole);
      navigate(`/${selectedRole}`);
    } catch (err) {
      console.error(err);
      setError('Failed to log in. Please check your credentials.');
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
            className={selectedRole === 'kitchen' ? 'active' : ''}
            onClick={() => handleRoleSelect('kitchen')}>Kitchen</button>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
