import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import './LoginScreen.css';

const PIN_LENGTH = 4;
const POST_LOGIN_REDIRECT_KEY = 'postLoginRedirect';

const NUMPAD_KEYS = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  null, '0', 'del',
];

export default function LoginScreen() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginWithPin } = useAuth();
  const navigate = useNavigate();

  const handleKey = (key) => {
    if (loading) return;
    setError('');

    if (key === 'del') {
      setPin((prev) => prev.slice(0, -1));
      return;
    }

    setPin((prev) => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + key;
      if (next.length === PIN_LENGTH) {
        submitPin(next);
      }
      return next;
    });
  };

  const submitPin = async (pinValue) => {
    setLoading(true);
    setError('');
    try {
      const user = await loginWithPin(pinValue);
      const redirect = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
      if (redirect === '/pager-register' && user.role === 'manager') {
        sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        navigate('/pager-register');
        return;
      }
      sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
      navigate(authService.getRouteForRole(user.role));
    } catch (err) {
      setError(err.message || 'Incorrect PIN.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="numpad-screen">
      <div className="numpad-card">
        <div className="numpad-logo">
          <span className="numpad-logo-letter">O</span>
        </div>
        <div className="numpad-brand">Opulence</div>
        <div className="numpad-subtitle">Enter your PIN to continue</div>

        <div className="numpad-dots">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`pin-dot ${i < pin.length ? 'filled' : ''} ${loading ? 'loading' : ''}`}
            />
          ))}
        </div>

        {error && <div className="numpad-error">{error}</div>}

        <div className="numpad-grid">
          {NUMPAD_KEYS.map((key, idx) => {
            if (key === null) {
              return <div key={idx} className="numpad-key empty" />;
            }
            if (key === 'del') {
              return (
                <button
                  key={idx}
                  className="numpad-key del-key"
                  onClick={() => handleKey('del')}
                  disabled={loading || pin.length === 0}
                  aria-label="Delete"
                >
                  ⌫
                </button>
              );
            }
            return (
              <button
                key={idx}
                className="numpad-key digit-key"
                onClick={() => handleKey(key)}
                disabled={loading || pin.length >= PIN_LENGTH}
              >
                {key}
              </button>
            );
          })}
        </div>

        {loading && <div className="numpad-spinner">Verifying…</div>}

        <div className="numpad-footer">
          <button
            type="button"
            className="numpad-footer-link"
            onClick={() => {
              sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, '/pager-register');
            }}
          >
            Pager Add
          </button>
          <span className="numpad-footer-hint"> — register ESP (manager PIN)</span>
        </div>
      </div>
    </div>
  );
}
