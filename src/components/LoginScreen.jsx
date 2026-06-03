import React, { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { hashPin } from '../lib/utils/auth';
import './LoginScreen.css';

const PIN_LENGTH = 4;

const NUMPAD_KEYS = [
  '1', '2', '3',
  '4', '5', '6',
  '7', '8', '9',
  null, '0', 'del',
];

export default function LoginScreen() {
  const pinRef = useRef('');
  const [pinLength, setPinLength] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginWithPinHash } = useAuth();
  const navigate = useNavigate();

  const handleKey = (key) => {
    if (loading) return;
    setError('');

    if (key === 'del') {
      pinRef.current = pinRef.current.slice(0, -1);
      setPinLength(pinRef.current.length);
      return;
    }

    if (pinRef.current.length >= PIN_LENGTH) return;
    pinRef.current = pinRef.current + key;
    const nextLen = pinRef.current.length;
    setPinLength(nextLen);
    if (nextLen === PIN_LENGTH) {
      submitPinHash();
    }
  };

  const clearPin = () => {
    pinRef.current = '';
    setPinLength(0);
  };

  const submitPinHash = async () => {
    setLoading(true);
    setError('');
    try {
      const pinHash = await hashPin(pinRef.current);
      const user = await loginWithPinHash(pinHash);
      navigate(authService.getRouteForRole(user.role));
    } catch (err) {
      setError(err.message || 'Incorrect PIN.');
      clearPin();
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
              className={`pin-dot ${i < pinLength ? 'filled' : ''} ${loading ? 'loading' : ''}`}
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
                  disabled={loading || pinLength === 0}
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
                disabled={loading || pinLength >= PIN_LENGTH}
              >
                {key}
              </button>
            );
          })}
        </div>

        {loading && <div className="numpad-spinner">Verifying…</div>}
      </div>
    </div>
  );
}
