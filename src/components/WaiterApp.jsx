// src/components/WaiterApp.jsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { collection, onSnapshot, query, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import './WaiterApp.css';

// ═══════════════════════════════════════════════════════════
// PAGE 1: Table Selection Grid
// ═══════════════════════════════════════════════════════════
function TableSelection() {
  const [tables, setTables] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'tables')), snapshot => {
      const rows = [];
      snapshot.forEach(d => rows.push(d.data()));
      rows.sort((a, b) => parseInt(a.tableId.replace('T', '')) - parseInt(b.tableId.replace('T', '')));
      setTables(rows);
    });
    return () => unsubscribe();
  }, []);

  const occupied = tables.filter(t => t.status === 'occupied').length;
  const available = tables.filter(t => t.status !== 'occupied').length;

  return (
    <div className="w-page1-layout">
      <div className="p1-topbar">
        <div className="p1-title">Select a Table</div>
        <div className="p1-stats">
          <span className="stat-chip available">{available} Available</span>
          <span className="stat-chip occupied">{occupied} Occupied</span>
        </div>
      </div>
      <div className="table-grid-50">
        {tables.map(t => {
          const num = t.tableId.replace('T', '');
          const isOccupied = t.status === 'occupied';
          return (
            <div
              key={t.tableId}
              className={`w-table-card ${isOccupied ? 'occupied' : 'available'}`}
              onClick={() => navigate(`/waiter/table/${num}`)}
            >
              <div className="w-table-num">{num}</div>
              <div className="w-table-status">{isOccupied ? 'Occupied' : 'Free'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAGE 2: Order Page
// ═══════════════════════════════════════════════════════════
function OrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // ── Menu ──────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState('Starters');
  const categories = ['Starters', 'Main Course', 'Drinks'];
  const [menuItems, setMenuItems] = useState([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'menu'), snapshot => {
      const fetchedMenu = [];
      snapshot.forEach(docSnap => {
        fetchedMenu.push({ id: docSnap.id, ...docSnap.data() });
      });
      setMenuItems(fetchedMenu);
    });
    return () => unsubscribe();
  }, []);

  const filteredMenu = menuItems.filter(item => item.category === activeCategory);

  // ── Cleared and Open KOTs (data stays intact, shown in Summary modal) ──
  const [clearedKots, setClearedKots] = useState([]);
  const [openKots, setOpenKots] = useState([]);
  const [cancellationRequests, setCancellationRequests] = useState([]);
  const [serviceChargePct, setServiceChargePct] = useState(5);
  const [taxPct, setTaxPct] = useState(18);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'kots')), snapshot => {
      const fetchedCleared = [];
      const fetchedOpen = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.tableNumber === parseInt(id)) {
          if (data.kotStatus === 'cleared') {
            fetchedCleared.push({ _docId: docSnap.id, ...data });
          } else if (data.kotStatus === 'open') {
            fetchedOpen.push({ _docId: docSnap.id, ...data });
          }
        }
      });
      setClearedKots(fetchedCleared);
      setOpenKots(fetchedOpen);
    });
    return () => unsubscribe();
  }, [id]);

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'cancellation_requests')), snapshot => {
      const fetchedReqs = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.tableNumber === parseInt(id)) {
          fetchedReqs.push({ id: docSnap.id, ...data });
        }
      });
      setCancellationRequests(fetchedReqs);
    });
    return () => unsubscribe();
  }, [id]);

  // Only "done" items count toward billing
  let consumedSubtotal = 0;
  const combinedConsumedItems = [];
  clearedKots.forEach(kot => {
    kot.items?.forEach(item => {
      if (item.status === 'done') {
        consumedSubtotal += item.price * item.qty;
        combinedConsumedItems.push(item);
      }
    });
  });
  const serviceChargeAmt = (consumedSubtotal * serviceChargePct) / 100;
  const taxAmt = (consumedSubtotal * taxPct) / 100;
  const grandTotal = consumedSubtotal + serviceChargeAmt + taxAmt;
  const hasConsumed = combinedConsumedItems.length > 0;

  // ── Cart (localStorage-backed, keyed by table) ─────────────
  const CART_KEY = `cart_table_${id}`;

  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      if (saved) return JSON.parse(saved).map(item => ({ ...item, isChecked: false }));
    } catch (e) { /* ignore */ }
    return [];
  });
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartItems.map(({ isChecked, ...r }) => r)));
    } catch (e) { /* ignore */ }
  }, [cartItems, CART_KEY]);

  const addToCart = item => {
    setCartItems(prev => {
      const existing = prev.find(i => i.itemId === item.id);
      if (existing) return prev.map(i => i.itemId === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { itemId: item.id, name: item.name, price: item.price, qty: 1, imageUrl: item.imageUrl, status: 'pending', isChecked: false }];
    });
  };

  const updateQty = (itemId, delta) =>
    setCartItems(prev => prev.map(i => i.itemId === itemId ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));

  const toggleCheck = itemId =>
    setCartItems(prev => prev.map(i => i.itemId === itemId ? { ...i, isChecked: !i.isChecked } : i));

  const allChecked = cartItems.length > 0 && cartItems.every(i => i.isChecked);
  const toggleSelectAll = () => setCartItems(prev => prev.map(i => ({ ...i, isChecked: !allChecked })));

  const checkedItems = cartItems.filter(i => i.isChecked);
  const checkedTotal = checkedItems.reduce((acc, i) => acc + i.price * i.qty, 0);

  const submitKOT = async () => {
    if (checkedItems.length === 0) return;
    try {
      await addDoc(collection(db, 'kots'), {
        tableNumber: parseInt(id),
        items: checkedItems.map(({ isChecked, ...rest }) => rest),
        specialInstructions,
        createdAt: serverTimestamp(),
        kotStatus: 'open',
      });
      await updateDoc(doc(db, 'tables', `T${id}`), { status: 'occupied' });
      setToast(`KOT sent to kitchen for Table ${id}`);
      setTimeout(() => setToast(''), 3000);
      setCartItems(prev => {
        const remaining = prev.filter(i => !i.isChecked);
        try { localStorage.setItem(CART_KEY, JSON.stringify(remaining.map(({ isChecked, ...r }) => r))); } catch (e) { /* ignore */ }
        return remaining;
      });
      setSpecialInstructions('');
    } catch (err) {
      console.error('Error submitting KOT:', err);
      alert('Failed to submit KOT.');
    }
  };

  // Print Bill: save to Firestore + print
  const handlePrint = async () => {
    if (!hasConsumed) return;
    try {
      await addDoc(collection(db, 'bills'), {
        tableNumber: parseInt(id),
        kotIds: clearedKots.map(k => k._docId),
        subtotal: consumedSubtotal,
        serviceCharge: serviceChargeAmt,
        tax: taxAmt,
        total: grandTotal,
        createdAt: serverTimestamp(),
        printed: true,
      });
    } catch (err) {
      console.error('Failed saving bill:', err);
    }
    window.print();
  };

  const handleCancelItem = async (kot, item) => {
    const confirmCancel = window.confirm(`Cancel ${item.name} from KOT #${(kot._docId || '').slice(-4).toUpperCase()}? This will notify the kitchen.`);
    if (!confirmCancel) return;

    try {
      await addDoc(collection(db, 'cancellation_requests'), {
        tableNumber: parseInt(id),
        itemId: item.itemId,
        itemName: item.name,
        qty: item.qty,
        originalKotId: kot._docId,
        status: 'pending_approval',
        requestedAt: serverTimestamp()
      });
      setToast('Cancellation requested');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      console.error('Failed to request cancellation:', err);
    }
  };


  // Clear Table: confirm → delete cleared KOTs → reset table → navigate back
  const handleClearTable = async () => {
    const ok = window.confirm(
      `Are you sure you want to clear Table ${id}?\n\nThis will delete all consumed records and cannot be undone.`
    );
    if (!ok) return;
    try {
      await Promise.all(clearedKots.map(kot => deleteDoc(doc(db, 'kots', kot._docId))));
      await updateDoc(doc(db, 'tables', `T${id}`), { status: 'available', currentSessionId: null });
      localStorage.removeItem(CART_KEY);
    } catch (err) {
      console.error('Failed clearing table:', err);
      alert('Something went wrong. Please try again.');
      return;
    }
    navigate('/waiter');
  };

  const hasChecked = checkedItems.length > 0;

  return (
    <>
      {/* ══ Main UI ══ */}
      <div className="w-page2-layout">
        {toast && <div className="toast">{toast}</div>}

        {/* ── Header ── */}
        <div className="page2-header">
          <button className="back-btn" onClick={() => navigate('/waiter')}>← Back</button>
          <h2>Table {id}</h2>
          <div className="header-actions">
            <button
              className="hdr-btn hdr-btn-outline"
              onClick={() => setShowSummary(true)}
            >
              {hasConsumed
                ? `View Summary (₹${grandTotal.toFixed(0)})`
                : 'View Summary'}
            </button>
            <button
              className={`hdr-btn hdr-btn-danger${clearedKots.length > 0 ? ' active' : ''}`}
              disabled={clearedKots.length === 0}
              onClick={handleClearTable}
            >
              Clear Table
            </button>
            <button
              className={`hdr-btn hdr-btn-primary${hasConsumed ? '' : ' disabled'}`}
              disabled={!hasConsumed}
              onClick={handlePrint}
            >
              🖨 Print Bill
            </button>
          </div>
        </div>

        {/* ── Two columns ── */}
        <div className="page2-content">

          {/* LEFT: Menu — scrolls independently */}
          <div className="p2-left-panel">
            <div className="category-tabs">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`tab-btn${activeCategory === cat ? ' active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >{cat}</button>
              ))}
            </div>
            <div className="menu-grid-wrap">
              <div className="menu-grid-2col">
                {filteredMenu.map(item => {
                  const isOutOfStock = item.outOfStock === true;
                  return (
                    <div key={item.id} className={`menu-card ${isOutOfStock ? 'out-of-stock' : ''}`}>
                      <div className="menu-img-wrap">
                        <img src={item.imageUrl} alt={item.name} className="menu-img" />
                        {isOutOfStock && <span className="oos-badge">OUT OF STOCK</span>}
                      </div>
                      <div className="menu-details">
                        <div className="menu-info">
                          <h3>{item.name}</h3>
                          <p>₹{item.price}</p>
                        </div>
                        <button 
                          className="add-btn" 
                          onClick={() => !isOutOfStock && addToCart(item)}
                          disabled={isOutOfStock}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Cart — pinned layout with internal scroll */}
          <div className="p2-right-panel">
            {/* Cart header */}
            <div className="cart-panel-header">
              <h3>Cart {cartItems.length > 0 ? `(${cartItems.length} items)` : ''}</h3>
              {cartItems.length > 0 && (
                <label className="select-all-label">
                  <input type="checkbox" checked={allChecked} onChange={toggleSelectAll} />
                  Select All
                </label>
              )}
            </div>

            {/* Cart rows — scrollable */}
            <div className="cart-rows-scroll">
              {cartItems.length === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-icon">🛒</div>
                  <p>Add items from the menu</p>
                </div>
              ) : (
                cartItems.map(item => (
                  <div key={item.itemId} className={`p2-cart-row${item.isChecked ? ' checked' : ''}`}>
                    <input
                      type="checkbox"
                      className="cart-checkbox"
                      checked={item.isChecked}
                      onChange={() => toggleCheck(item.itemId)}
                    />
                    <img src={item.imageUrl} alt="" className="cart-thumb" />
                    <div className="cart-item-name">{item.name}</div>
                    <div className="cart-qty-ctrls">
                      <button className="qty-btn" onClick={() => updateQty(item.itemId, -1)}>−</button>
                      <span>{item.qty}</span>
                      <button className="qty-btn" onClick={() => updateQty(item.itemId, 1)}>+</button>
                    </div>
                    <div className="cart-line-total">₹{item.price * item.qty}</div>
                  </div>
                ))
              )}
            </div>

            {/* Cart footer — pinned at bottom */}
            <div className="cart-panel-footer">
              <textarea
                className="sp-instructions"
                placeholder="Special instructions (optional)"
                rows={2}
                value={specialInstructions}
                onChange={e => setSpecialInstructions(e.target.value)}
              />
              <div className="cart-subtotal-row">
                <span className="checked-total">
                  {hasChecked ? `${checkedItems.length} item${checkedItems.length > 1 ? 's' : ''} · ₹${checkedTotal}` : 'Select items to send'}
                </span>
              </div>
              <button
                className={`submit-kot-btn${hasChecked ? ' active-green' : ''}`}
                disabled={!hasChecked}
                onClick={submitKOT}
              >
                Send to Kitchen
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ══ Summary Modal ══ */}
      {showSummary && (
        <div className="summary-overlay" onClick={() => setShowSummary(false)}>
          <div className="summary-modal" onClick={e => e.stopPropagation()}>
            <div className="summary-modal-header">
              <h3>Consumed — Table {id}</h3>
              <button className="summary-close" onClick={() => setShowSummary(false)}>✕</button>
            </div>
            <div className="summary-modal-body">
              <div className="summary-section">
                <h4 className="summary-section-title">Pending at Kitchen</h4>
                {openKots.length === 0 ? (
                  <div className="summary-empty">No pending items</div>
                ) : (
                  <div className="kot-log">
                    {openKots.map((kot, idx) => (
                      <div key={idx} className="log-kot-card">
                        <div className="log-kot-label">KOT #{(kot._docId || '').slice(-4).toUpperCase()}</div>
                        {kot.items?.map((item, i) => {
                          const isResolved = ['done', 'removed', 'out_of_stock'].includes(item.status);
                          const isPending = item.status === 'pending';
                          const hasCancelReq = cancellationRequests.some(r => r.originalKotId === kot._docId && r.itemId === item.itemId);
                          
                          return (
                            <div key={i} className={`log-item-row ${isResolved ? 'resolved-row' : ''}`}>
                              <div className="log-item-info">
                                <span>{item.name} <span className="log-qty">×{item.qty}</span></span>
                                <span className="log-price">₹{item.price * item.qty}</span>
                              </div>
                              {isPending && (
                                <div className="log-item-actions">
                                  {hasCancelReq ? (
                                    <span className="cancel-badge">Cancellation Requested</span>
                                  ) : (
                                    <button className="btn-cancel-item" onClick={() => handleCancelItem(kot, item)}>Cancel</button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {kot.specialInstructions && (
                          <div className="log-note">📝 {kot.specialInstructions}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="summary-section">
                <h4 className="summary-section-title">Consumed</h4>
                {clearedKots.length === 0 ? (
                  <div className="summary-empty">No items consumed yet</div>
                ) : (
                  <div className="kot-log">
                    {clearedKots.map((kot, idx) => {
                      const doneItems = kot.items?.filter(i => i.status === 'done') || [];
                      if (doneItems.length === 0) return null;
                      return (
                        <div key={idx} className="log-kot-card">
                          <div className="log-kot-label">KOT #{(kot._docId || '').slice(-4).toUpperCase()}</div>
                          {doneItems.map((item, i) => (
                            <div key={i} className="log-item-row">
                              <div className="log-item-info">
                                <span>{item.name} <span className="log-qty">×{item.qty}</span></span>
                                <span className="log-price">₹{item.price * item.qty}</span>
                              </div>
                            </div>
                          ))}
                          {kot.specialInstructions && (
                            <div className="log-note">📝 {kot.specialInstructions}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {hasConsumed && (
              <div className="summary-modal-footer">
                <div className="billing-row">
                  <span>Subtotal</span>
                  <span>₹{consumedSubtotal.toFixed(2)}</span>
                </div>
                <div className="billing-row">
                  <span>Service Charge</span>
                  <div className="billing-input-group">
                    <input type="number" value={serviceChargePct} min="0" max="100"
                      onChange={e => setServiceChargePct(Number(e.target.value))} />
                    <span>% → ₹{serviceChargeAmt.toFixed(2)}</span>
                  </div>
                </div>
                <div className="billing-row">
                  <span>GST</span>
                  <div className="billing-input-group">
                    <input type="number" value={taxPct} min="0" max="100"
                      onChange={e => setTaxPct(Number(e.target.value))} />
                    <span>% → ₹{taxAmt.toFixed(2)}</span>
                  </div>
                </div>
                <div className="billing-row grand-total-row">
                  <span>Grand Total</span>
                  <span>₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Print Receipt — sibling to w-page2-layout so @media print can show it ══ */}
      <div className="print-receipt-container">
        <div className="rcpt-header">
          <h2>Demo Restaurant</h2>
          <p>123 Tech Lane, Food City</p>
        </div>
        <div className="rcpt-meta">
          <div><strong>Table:</strong> {id}</div>
          <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
          <div><strong>Time:</strong> {new Date().toLocaleTimeString()}</div>
        </div>
        <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }}></div>
        {combinedConsumedItems.map((item, idx) => (
          <div key={idx} className="rcpt-item-row">
            <div className="rcpt-item-name">{item.name}</div>
            <div className="rcpt-item-calc">{item.qty} × ₹{item.price}</div>
            <div>₹{item.qty * item.price}</div>
          </div>
        ))}
        <div className="rcpt-totals">
          <div className="rcpt-totals-row"><span>Subtotal:</span><span>₹{consumedSubtotal.toFixed(2)}</span></div>
          <div className="rcpt-totals-row"><span>Service ({serviceChargePct}%):</span><span>₹{serviceChargeAmt.toFixed(2)}</span></div>
          <div className="rcpt-totals-row"><span>GST ({taxPct}%):</span><span>₹{taxAmt.toFixed(2)}</span></div>
          <div className="rcpt-totals-row bold"><span>Grand Total:</span><span>₹{grandTotal.toFixed(2)}</span></div>
        </div>
        <div className="rcpt-footer">Thank you, visit again!</div>
      </div>
    </>
  );
}

// Main Router
export default function WaiterApp() {
  return (
    <Routes>
      <Route path="/" element={<TableSelection />} />
      <Route path="/table/:id" element={<OrderPage />} />
    </Routes>
  );
}
