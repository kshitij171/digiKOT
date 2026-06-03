import React, { useEffect, useState } from 'react';
import { notificationService } from '../services/notificationService';
import { useAuth } from '../context/AuthContext';

export default function NotificationCenter() {
  const { currentUser } = useAuth();
  const [targetUserId, setTargetUserId] = useState(currentUser?.id || '');
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!targetUserId) return undefined;
    return notificationService.subscribeForUser(targetUserId, setItems);
  }, [targetUserId]);

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Notification Center</h2>
      <p style={{ opacity: 0.8 }}>Use this panel to debug waiter notifications before Bluetooth integration.</p>
      <div style={{ marginBottom: '1rem' }}>
        <label>View waiter/user id: </label>
        <input value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} />
      </div>
      {items.length === 0 ? (
        <p>No notifications.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {items.map((n) => (
            <div key={n.id} style={{ border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
              <div><strong>{n.event_type}</strong></div>
              <div>Table: {n.table_number || '-'}</div>
              <div style={{ opacity: 0.75 }}>{new Date(n.created_at).toLocaleString()}</div>
              {n.payload_json ? <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(n.payload_json, null, 2)}</pre> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
