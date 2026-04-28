import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './KitchenApp.css';

export default function KitchenApp() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [kots, setKots] = useState([]);
  const [pendingActions, setPendingActions] = useState({});
  const [activeTab, setActiveTab] = useState('live');
  const [menuItems, setMenuItems] = useState([]);
  const [cancellationRequests, setCancellationRequests] = useState([]);

  // Fetch Menu listener
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'menu'), snapshot => {
      const items = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      setMenuItems(items);
    });
    return () => unsubscribe();
  }, []);

  // Live Clock Interval
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch KOTs listener
  useEffect(() => {
    // Only query where kotStatus is open to avoid composite index error.
    const q = query(
      collection(db, "kots"), 
      where("kotStatus", "==", "open")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedKots = [];
      snapshot.forEach(doc => {
        fetchedKots.push({ id: doc.id, ...doc.data() });
      });
      // Sort ascending, oldest KOTs first
      fetchedKots.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeA - timeB;
      });
      
      setKots(fetchedKots);
    });

    return () => unsubscribe();
  }, []);

  // Fetch Cancellation Requests listener
  useEffect(() => {
    const q = query(
      collection(db, "cancellation_requests"), 
      where("status", "==", "pending_approval")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reqs = [];
      snapshot.forEach(doc => reqs.push({ id: doc.id, ...doc.data() }));
      setCancellationRequests(reqs);
    });
    return () => unsubscribe();
  }, []);

  const updateItemStatus = async (kotId, itemId, newStatus) => {
    const kot = kots.find(k => k.id === kotId);
    if (!kot) return;

    // Create a deep copy of items to mutate
    const updatedItems = kot.items.map(item => {
      if (item.itemId === itemId) {
        return { ...item, status: newStatus };
      }
      return item;
    });

    try {
      await updateDoc(doc(db, 'kots', kotId), { items: updatedItems });
      
      if (newStatus === 'out_of_stock') {
        try {
          await updateDoc(doc(db, 'menu', String(itemId)), { outOfStock: true });
        } catch (e) {
          console.error("Failed to sync outOfStock to menu:", e);
        }
      }
      
      const allDoneOrOos = updatedItems.every(i => ['done', 'removed', 'out_of_stock', 'cancelled'].includes(i.status));
      if (allDoneOrOos) {
         setTimeout(async () => {
           try {
             await updateDoc(doc(db, 'kots', kotId), { kotStatus: 'cleared' });
           } catch (e) {
             console.error("Error auto-clearing KOT:", e);
           }
         }, 1000);
      }
    } catch (err) {
      console.error("Error updating item status:", err);
    }
  };

  const handleActionClick = (kotId, itemId, status) => {
    const key = `${kotId}_${itemId}`;
    if (pendingActions[key]) return;
    const expiresAt = Date.now() + 3000;
    
    const timeoutId = setTimeout(() => {
      updateItemStatus(kotId, itemId, status);
      setPendingActions(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 3000);

    setPendingActions(prev => ({
      ...prev,
      [key]: { status, expiresAt, timeoutId: timeoutId }
    }));
  };

  const handleUndo = (kotId, itemId) => {
    const key = `${kotId}_${itemId}`;
    setPendingActions(prev => {
      const next = { ...prev };
      if (next[key]) {
        clearTimeout(next[key].timeoutId);
        delete next[key];
      }
      return next;
    });
  };

  const updateMenuStatus = async (itemId, isOos) => {
    try {
      await updateDoc(doc(db, 'menu', String(itemId)), { outOfStock: isOos });
    } catch (e) {
      console.error("Failed to update menu status:", e);
    }
  };

  const handleCancelResponse = async (req, isApprove) => {
    try {
      if (isApprove) {
        await updateDoc(doc(db, 'cancellation_requests', req.id), { status: 'approved' });
        
        const kot = kots.find(k => k.id === req.originalKotId);
        if (kot) {
          const updatedItems = kot.items.map(item => {
            if (item.itemId === req.itemId) {
              return { ...item, status: 'cancelled' };
            }
            return item;
          });
          
          await updateDoc(doc(db, 'kots', req.originalKotId), { items: updatedItems });
          
          const allResolved = updatedItems.every(i => ['done', 'removed', 'out_of_stock', 'cancelled'].includes(i.status));
          if (allResolved) {
             setTimeout(async () => {
               try {
                 await updateDoc(doc(db, 'kots', req.originalKotId), { kotStatus: 'cleared' });
               } catch (e) {}
             }, 1000);
          }
        }
      } else {
        await updateDoc(doc(db, 'cancellation_requests', req.id), { status: 'rejected' });
      }
    } catch (e) {
      console.error("Error handling cancellation request:", e);
    }
  };

  const getElapsedTime = (createdAt) => {
    if (!createdAt) return "Just now";
    
    const diffMs = currentTime.getTime() - createdAt.toMillis();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "< 1 min ago";
    return `${diffMins} min ago`;
  };

  return (
    <div className="kitchen-layout">
      <div className="kitchen-header">
        <div className="kitchen-header-left">
          <h2>🧑‍🍳 Kitchen Display</h2>
          <div className="k-tabs">
            <button className={`k-tab ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>Live Orders</button>
            <button className={`k-tab ${activeTab === 'oos' ? 'active' : ''}`} onClick={() => setActiveTab('oos')}>Out of Stock</button>
          </div>
        </div>
        <div className="live-clock">
          {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      {activeTab === 'live' && (
        <div className="kots-container">
          {cancellationRequests.length > 0 && (
            <div className="k-cancel-reqs-section">
              {cancellationRequests.map(req => (
                <div key={req.id} className="cancel-req-card">
                  <div className="cancel-req-header">CANCELLATION REQUEST</div>
                  <div className="cancel-req-body">
                    <div className="cancel-req-meta">
                      <span className="cr-table">Table {req.tableNumber}</span>
                      <span className="cr-ref">Original KOT: #{(req.originalKotId || '').slice(-4).toUpperCase()}</span>
                    </div>
                    <div className="cr-item-info">
                      <span className="cr-name">{req.itemName}</span>
                      <span className="cr-qty">Qty: {req.qty}</span>
                    </div>
                    <div className="cr-actions">
                      <button className="btn-cr-approve" onClick={() => handleCancelResponse(req, true)}>Approve</button>
                      <button className="btn-cr-reject" onClick={() => handleCancelResponse(req, false)}>Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        {kots.length === 0 ? (
          <div className="kitchen-empty">
            <div className="kitchen-empty-icon">✅</div>
            <p>Kitchen is clear — no open orders</p>
          </div>
        ) : (
          <div className="kots-grid">
            {kots.map(kot => {
              const elapsedMins = kot.createdAt ? Math.floor((currentTime.getTime() - kot.createdAt.toMillis()) / 60000) : 0;
              const isUrgent = elapsedMins >= 15;
              const shortId = '#' + kot.id.slice(-4).toUpperCase();
              const resolvedCount = kot.items?.filter(i => ['done','removed','out_of_stock','cancelled'].includes(i.status)).length || 0;
              const totalCount = kot.items?.length || 1;
              const progressPct = Math.round((resolvedCount / totalCount) * 100);
              const allResolved = kot.items && kot.items.every(i => ['done', 'removed', 'out_of_stock', 'cancelled'].includes(i.status));

              return (
                <div key={kot.id} className={`kot-card${isUrgent ? ' urgent' : ''}`}>
                  <div className="kot-card-header">
                    <div className="table-badge">Table {kot.tableNumber}</div>
                    <div className="kot-meta">
                      <div className="kot-id">{shortId}</div>
                      <div className={`kot-time ${isUrgent ? 'urgent' : ''}`}>
                        {getElapsedTime(kot.createdAt)}
                      </div>
                    </div>
                  </div>

                  {kot.specialInstructions && (
                    <div className="kot-special-instructions">
                      Note: {kot.specialInstructions}
                    </div>
                  )}

                  <div className="kot-progress">
                    <span>{resolvedCount}/{totalCount} done</span>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span>{progressPct}%</span>
                  </div>

                  <div className="kot-items">
                    {kot.items.map((item, idx) => {
                      const isDone = item.status === 'done';
                      const isOos = item.status === 'removed' || item.status === 'out_of_stock';
                      const isCancelled = item.status === 'cancelled';
                      const isResolved = isDone || isOos || isCancelled;

                      return (
                        <div key={`${item.itemId}-${idx}`} className={`k-item-row ${isResolved ? 'resolved' : ''} ${isCancelled ? 'cancelled-row' : ''}`}>
                          <div className="k-item-info">
                            <img src={item.imageUrl} alt={item.name} className="k-item-thumb" />
                            <div className="k-item-details">
                              <span className="k-item-name">{item.name} {isOos && <span style={{opacity: 0.5}}>(Out of Stock)</span>} {isCancelled && <span style={{opacity: 0.5}}>(Cancelled)</span>}</span>
                              <span className="k-item-qty">Qty: {item.qty}</span>
                            </div>
                          </div>
                          
                          <div className="k-item-actions">
                            {!isResolved && !pendingActions[`${kot.id}_${item.itemId}`] ? (
                              <>
                                <button className="btn-action-done" onClick={() => handleActionClick(kot.id, item.itemId, 'done')}>
                                  ✓ Mark Done
                                </button>
                                <button className="btn-action-out" onClick={() => handleActionClick(kot.id, item.itemId, 'out_of_stock')}>
                                  Out of Stock
                                </button>
                              </>
                            ) : pendingActions[`${kot.id}_${item.itemId}`] ? (
                              <button className="btn-action-undo" onClick={() => handleUndo(kot.id, item.itemId)}>
                                Undo ({Math.max(1, Math.ceil((pendingActions[`${kot.id}_${item.itemId}`].expiresAt - currentTime.getTime()) / 1000))})...
                              </button>
                            ) : (
                              <span className={`k-status-badge ${isDone ? 'badge-served' : isCancelled ? 'badge-cancelled' : 'badge-out'}`}>
                                {isDone ? 'Served' : isCancelled ? 'Cancelled' : 'Out of Stock'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      )}

      {activeTab === 'oos' && (
        <div className="oos-tab-container">
          <div className="oos-header">
            <h2>Food items marked as out of stock</h2>
            <p>These items are currently unavailable and cannot be ordered</p>
          </div>
          
          <div className="oos-grid">
            {menuItems.filter(item => item.outOfStock).length === 0 ? (
              <div className="kitchen-empty"><p>No items are out of stock</p></div>
            ) : (
              menuItems.filter(item => item.outOfStock).map(item => (
                <div key={item.id} className="oos-card">
                  <div className="oos-img-wrap">
                    <img src={item.imageUrl} alt={item.name} className="oos-img" />
                    <span className="oos-badge">OUT OF STOCK</span>
                  </div>
                  <div className="oos-info">
                    <div className="oos-info-top">
                      <span className="oos-name">{item.name}</span>
                      <span className="oos-price">₹{item.price}</span>
                    </div>
                    <button className="btn-mark-available" onClick={() => updateMenuStatus(item.id, false)}>
                      Mark Available
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="oos-mark-section">
            <h3>Mark items as out of stock</h3>
            {['Starters', 'Main Course', 'Drinks'].map(cat => {
              const catItems = menuItems.filter(item => !item.outOfStock && item.category === cat);
              if (catItems.length === 0) return null;
              return (
                <div key={cat} className="oos-category-group">
                  <h4>{cat}</h4>
                  <div className="oos-small-grid">
                    {catItems.map(item => (
                      <div key={item.id} className="oos-small-card">
                        <img src={item.imageUrl} alt={item.name} className="oos-small-img" />
                        <div className="oos-small-info">
                          <span className="oos-small-name">{item.name}</span>
                          <span className="oos-small-price">₹{item.price}</span>
                        </div>
                        <button className="btn-mark-oos" onClick={() => updateMenuStatus(item.id, true)}>
                          Mark Out of Stock
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
