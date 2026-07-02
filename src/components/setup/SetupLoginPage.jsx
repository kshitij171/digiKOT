import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setupService } from '../../services/setupService';
import './SetupApp.css';

export default function SetupLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await setupService.login(password);
      navigate('/setup/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-screen">
      <form className="setup-login-card" onSubmit={submit}>
        <h1>digiKOT Install Setup</h1>
        <p>Installer access only — not for restaurant staff</p>
        <div className="setup-field">
          <label htmlFor="setup-password">Installer password</label>
          <input
            id="setup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit" className="setup-btn" disabled={loading || !password}>
          {loading ? 'Unlocking…' : 'Unlock setup'}
        </button>
        {error && <p className="setup-error">{error}</p>}
      </form>
    </div>
  );
}
