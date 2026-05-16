// src/components/WaiterApp.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { tableService } from '../services/tableService';
import { menuService } from '../services/menuService';
import { kotService } from '../services/kotService';
import { cancelService } from '../services/cancelService';
import { billingService } from '../services/billingService';
import { billModificationService } from '../services/billModificationService';
import './WaiterApp.css';
import {
  computeBillTotalsFromClearedKots,
  combinedConsumedItemsFromClearedKots,
} from '../lib/billing/billTotals';

// ── Category display order (matches seed) ─────────────────
const CATEGORY_ORDER = [
  'Starters',
  'Soups',
  'Main Course — Veg',
  'Main Course — Non Veg',
  'Breads',
  'Rice & Biryani',
  'Pasta & Pizza',
  'Desserts',
  'Beverages — Non Alcoholic',
  'Beverages — Alcoholic',
];

const CATEGORY_ICONS = {
  'Starters':                   '🥗',
  'Soups':                      '🍲',
  'Main Course — Veg':          '🌿',
  'Main Course — Non Veg':      '🍗',
  'Breads':                     '🫓',
  'Rice & Biryani':             '🍚',
  'Pasta & Pizza':              '🍝',
  'Desserts':                   '🍰',
  'Beverages — Non Alcoholic':  '🥤',
  'Beverages — Alcoholic':      '🍷',
};

// ═══════════════════════════════════════════════════════════
// PAGE 1: Table Selection Grid
// ═══════════════════════════════════════════════════════════
function TableSelection() {
  const [tables, setTables] = useState([]);
  const navigate = useNavigate();
  const { currentUser, logoutUser } = useAuth();

  useEffect(() => {
    return tableService.subscribeTables(setTables);
  }, []);

  const occupied  = tables.filter(t => t.status === 'occupied').length;
  const available = tables.filter(t => t.status !== 'occupied').length;

  return (
    <div className="w-page1-layout">
      <div className="p1-topbar">
        <div className="p1-brand">OPULENCE</div>
        <div className="p1-title">
          Select a Table
          {currentUser?.name && (
            <span style={{ fontSize: '0.8rem', fontWeight: 400, marginLeft: '0.5rem', opacity: 0.6 }}>
              — {currentUser.name}
            </span>
          )}
        </div>
        <div className="p1-stats">
          <span className="stat-chip available">{available} Available</span>
          <span className="stat-chip occupied">{occupied} Occupied</span>
        </div>
        <button className="w-logout-btn" onClick={logoutUser}>Logout</button>
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
// PAGE 2: Order Page — luxury 3-column layout
// ═══════════════════════════════════════════════════════════
function OrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, logoutUser } = useAuth();

  // ── Menu & Categories ─────────────────────────────────────
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCart, setShowCart] = useState(true);

  useEffect(() => {
    return menuService.subscribeMenu(setMenuItems);
  }, []);

  // Derive ordered categories from loaded items
  const categories = useMemo(() => {
    const inMenu = new Set(menuItems.map(i => i.category));
    return CATEGORY_ORDER.filter(c => inMenu.has(c)).concat(
      [...inMenu].filter(c => !CATEGORY_ORDER.includes(c))
    );
  }, [menuItems]);

  // Default to first category once loaded
  useEffect(() => {
    if (categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  const filteredMenu = useMemo(() => {
    if (searchQuery) {
      // When searching, always look across the entire menu regardless of selected category.
      const q = searchQuery.toLowerCase();
      return menuItems.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return menuItems.filter(item => item.category === activeCategory);
  }, [menuItems, activeCategory, searchQuery]);

  // ── KOTs & billing data ───────────────────────────────────
  const [clearedKots, setClearedKots] = useState([]);
  const [openKots, setOpenKots] = useState([]);
  const [cancellationRequests, setCancellationRequests] = useState([]);
  const [serviceChargePct, setServiceChargePct] = useState(5);
  const [taxPct, setTaxPct] = useState(18);
  const [showSummary, setShowSummary] = useState(false);
  const [approvedRemovalRequests, setApprovedRemovalRequests] = useState([]);
  const [billModRequests, setBillModRequests] = useState([]);

  useEffect(() => {
    return kotService.subscribeByTable(parseInt(id), ({ clearedKots: nc, openKots: no }) => {
      setClearedKots(nc);
      setOpenKots(no);
    });
  }, [id]);

  useEffect(() => {
    return cancelService.subscribeByTable(parseInt(id), setCancellationRequests);
  }, [id]);

  useEffect(() => {
    const uid = currentUser?.id;
    const tableNum = parseInt(id, 10);
    if (!uid || Number.isNaN(tableNum)) return undefined;
    return billModificationService.subscribeRemovalRequestsForWaiterTable(tableNum, uid, setBillModRequests);
  }, [id, currentUser?.id]);

  const pendingBillRemovalRequest = useMemo(
    () => billModRequests.some((r) => r.status === 'pending'),
    [billModRequests]
  );

  /** While View Summary is open: poll KOTs + approved removals (~4s) so totals refresh after manager approval. */
  useEffect(() => {
    if (!showSummary) return undefined;
    const tableNum = parseInt(id, 10);
    if (Number.isNaN(tableNum)) return undefined;
    let cancelled = false;

    const refresh = async () => {
      try {
        const [all, approvals] = await Promise.all([
          kotService.listByTable(tableNum),
          billModificationService.listApprovedForTable(tableNum),
        ]);
        if (cancelled) return;
        setClearedKots(all.filter((k) => k.kotStatus === 'cleared'));
        setOpenKots(all.filter((k) => k.kotStatus === 'open'));
        setApprovedRemovalRequests(approvals || []);

        setLastBillId((prev) => {
          if (!prev) return prev;
          billingService.getBillById(prev).then((b) => {
            if (cancelled) return;
            if (!b || b.bill_status === 'void') setLastBillId(null);
          });
          return prev;
        });
      } catch (e) {
        console.warn('[summary refresh]', e?.message || e);
      }
    };

    refresh();
    const t = setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [showSummary, id]);

  const {
    subtotal: consumedSubtotal,
    serviceChargeAmount: serviceChargeAmt,
    taxAmount: taxAmt,
    grandTotalBeforeDiscount: grandTotal,
  } = computeBillTotalsFromClearedKots(clearedKots, serviceChargePct, taxPct);
  const combinedConsumedItems = combinedConsumedItemsFromClearedKots(clearedKots);
  const hasConsumed = consumedSubtotal > 0;

  // ── Cart (localStorage-backed) ────────────────────────────
  const CART_KEY = `cart_table_${id}`;

  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      if (saved) return JSON.parse(saved).map(item => ({ ...item, isChecked: false }));
    } catch { /* ignore */ }
    return [];
  });
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [toast, setToast] = useState('');

  // ── Bill modification request state ──────────────────────
  const [lastBillId, setLastBillId] = useState(null);
  const [showRemovalModal, setShowRemovalModal] = useState(false);
  const [removalSelections, setRemovalSelections] = useState([]);
  const [removalReason, setRemovalReason] = useState('');
  const [removalSubmitting, setRemovalSubmitting] = useState(false);
  const [removalMessage, setRemovalMessage] = useState('');

  // ── Discount state ────────────────────────────────────────
  const [discountPct, setDiscountPct] = useState(0);

  // ── Cancel rejection/approval toast tracker ───────────────
  const prevCancelReqsRef = useRef([]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartItems.map(({ isChecked, ...r }) => r)));
    } catch { /* ignore */ }
  }, [cartItems, CART_KEY]);

  // ── Toast notifications for cancel approve / reject ───────
  useEffect(() => {
    const prev = prevCancelReqsRef.current;
    cancellationRequests.forEach(r => {
      const wasPending = prev.some(p => p.id === r.id && p.status === 'pending_approval');
      if (wasPending && r.status === 'rejected') {
        showToast(`Kitchen rejected cancellation of "${r.itemName}". It will be included in the bill.`);
      }
      if (wasPending && r.status === 'approved') {
        showToast(`Kitchen approved cancellation of "${r.itemName}". It has been removed from the bill.`);
      }
    });
    prevCancelReqsRef.current = cancellationRequests;
  }, [cancellationRequests]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cart actions ──────────────────────────────────────────
  const addToCart = item => {
    setCartItems(prev => {
      const existing = prev.find(i => i.itemId === item.id);
      if (existing) return prev.map(i => i.itemId === item.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, {
        itemId: item.id, name: item.name, price: item.price, qty: 1,
        imageUrl: item.imageUrl, status: 'pending', isChecked: false,
      }];
    });
  };

  const updateQty = (itemId, delta) =>
    setCartItems(prev => prev.map(i => i.itemId === itemId ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));

  const toggleCheck = itemId =>
    setCartItems(prev => prev.map(i => i.itemId === itemId ? { ...i, isChecked: !i.isChecked } : i));

  const allChecked   = cartItems.length > 0 && cartItems.every(i => i.isChecked);
  const toggleSelectAll = () => setCartItems(prev => prev.map(i => ({ ...i, isChecked: !allChecked })));

  const checkedItems = cartItems.filter(i => i.isChecked);
  const checkedTotal = checkedItems.reduce((acc, i) => acc + i.price * i.qty, 0);
  const hasChecked   = checkedItems.length > 0;
  const cartQty      = cartItems.reduce((sum, i) => sum + i.qty, 0);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const partialRemovalCaption = (item) => {
    if (item.status !== 'partially_removed') return null;
    const rq = Number(item.removedQty) || 0;
    const match = approvedRemovalRequests
      .filter(
        (a) =>
          Array.isArray(a.items_to_remove) &&
          a.items_to_remove.some((it) => it.itemId === item.itemId)
      )
      .sort((a, b) => new Date(b.reviewed_at || 0) - new Date(a.reviewed_at || 0))[0];
    const mgr = match?.approved_by_display_name?.trim() || 'manager';
    return `↳ ${rq} removed — approved by ${mgr}`;
  };

  // ── KOT submission ────────────────────────────────────────
  const submitKOT = async () => {
    if (checkedItems.length === 0) return;
    try {
      await kotService.createKotFromCart({
        tableNumber: parseInt(id),
        waiterUserId: currentUser?.id || null,
        waiterUsername: currentUser?.username || null,
        items: checkedItems.map(({ isChecked, ...rest }) => rest),
        specialInstructions,
      });
      showToast(`KOT sent to kitchen — Table ${id}`);
      setCartItems(prev => {
        const remaining = prev.filter(i => !i.isChecked);
        try { localStorage.setItem(CART_KEY, JSON.stringify(remaining.map(({ isChecked, ...r }) => r))); } catch { /* ignore */ }
        return remaining;
      });
      setSpecialInstructions('');
    } catch (err) {
      console.error('KOT error:', err);
      alert('Failed to submit KOT. Please try again.');
    }
  };

  // ── Print bill ────────────────────────────────────────────
  const RESOLVED_STATUSES = ['done', 'removed', 'out_of_stock', 'cancelled'];

  /** Returns null on success, or an error string if blocked. */
  const ensureBillExists = async () => {
    if (lastBillId) {
      // The bill may have been voided by a manager approval — re-check before reusing.
      try {
        const existing = await billingService.getBillById(lastBillId);
        if (!existing || existing.voided_at) {
          setLastBillId(null);
          // Fall through to create a fresh bill
        } else {
          return null; // Bill is still valid, reuse it
        }
      } catch {
        setLastBillId(null);
      }
    }

    const pendingKot = openKots.find(kot =>
      kot.items?.some(item => !RESOLVED_STATUSES.includes(item.status))
    );
    if (pendingKot) {
      const shortKotId = (pendingKot.id || '').slice(-4).toUpperCase();
      return `KOT #${shortKotId} is still being prepared. Wait for the kitchen to mark all items as done.`;
    }

    try {
      const billId = await billingService.createBillForTable({
        tableNumber: parseInt(id),
        waiterUserId: currentUser?.id || null,
        waiterUsername: currentUser?.username || null,
        clearedKots,
        serviceChargePct,
        taxPct,
        discountPercent: discountPct,
      });
      setLastBillId(billId);
      return null;
    } catch (err) {
      console.error('Bill error:', err);
      return 'Failed to generate bill. Please try again.';
    }
  };

  const handlePrint = async () => {
    if (!hasConsumed) return;
    const err = await ensureBillExists();
    if (err) { alert(err); return; }
    window.print();
  };

  // ── Removal request ───────────────────────────────────────

  /**
   * Build the expanded selection list: each consumed item is split into
   * individual unit rows (qty × 1) so the waiter can remove partial quantities.
   */
  const buildRemovalSelections = () => {
    const consumedItems = combinedConsumedItems.filter((item) => item.status === 'done');
    console.log('REMOVAL OVERLAY ITEMS:', JSON.stringify(consumedItems, null, 2));
    return consumedItems.flatMap((item, rowIndex) =>
      Array.from({ length: item.qty }, (_, u) => ({
        ...item,
        kotId: item.kotId,
        itemId: item.itemId,
        qty: 1,
        _key: `${item.kotId}_${item.itemId}_${rowIndex}_${u}`,
        selected: false,
      }))
    );
  };

  const openRemovalModal = async () => {
    if (!hasConsumed) return;
    const err = await ensureBillExists();
    if (err) { alert(err); return; }
    setRemovalSelections(buildRemovalSelections());
    setRemovalReason('');
    setRemovalMessage('');
    setShowRemovalModal(true);
  };

  const toggleRemovalItem = key =>
    setRemovalSelections(prev => prev.map(i => i._key === key ? { ...i, selected: !i.selected } : i));

  const submitRemovalRequest = async () => {
    const selected = removalSelections.filter(i => i.selected);
    if (selected.length === 0) { setRemovalMessage('Select at least one item.'); return; }
    if (!removalReason.trim()) { setRemovalMessage('A reason is required.'); return; }

    // Re-group unit rows by KOT + menu item (same name on different KOTs stay separate).
    const byLine = {};
    selected.forEach(({ kotId, itemId, name }) => {
      const lineKey = `${kotId}_${itemId}`;
      if (!byLine[lineKey]) {
        byLine[lineKey] = { kotId, itemId, itemName: name, qty: 0 };
      }
      byLine[lineKey].qty += 1;
    });
    const itemsToRemove = Object.values(byLine);

    setRemovalSubmitting(true);
    try {
      await billModificationService.requestItemRemoval({
        billId: lastBillId,
        waiterId: currentUser?.id || null,
        waiterUsername: currentUser?.username || null,
        tableNumber: id ? parseInt(id, 10) : null,
        itemsToRemove,
        reason: removalReason.trim(),
      });
      setRemovalMessage('Request sent to manager.');
      setRemovalSelections(prev => prev.map(i => ({ ...i, selected: false })));
      setRemovalReason('');
    } catch (err) {
      setRemovalMessage(err.message || 'Failed to submit request.');
    } finally {
      setRemovalSubmitting(false);
    }
  };

  // ── Cancel item ───────────────────────────────────────────
  const handleCancelItem = async (kot, item) => {
    const confirmCancel = window.confirm(`Cancel ${item.name}? This will notify the kitchen.`);
    if (!confirmCancel) return;
    const reasonInput = window.prompt('Reason for cancellation:', 'Customer changed mind');
    const reason = (reasonInput || '').trim();
    if (!reason) { alert('Reason is required.'); return; }
    try {
      await cancelService.requestCancel({
        tableNumber: parseInt(id), itemId: item.itemId, itemName: item.name,
        qty: item.qty, originalKotId: kot._docId, waiterUserId: currentUser?.id || null, reason,
      });
      showToast('Cancellation requested');
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  // ── Clear table ───────────────────────────────────────────
  const handleClearTable = async () => {
    // Block if active KOTs exist.
    if (openKots.length > 0) {
      alert('Table cannot be cleared. There is an active KOT or unpaid bill. Please wait for the kitchen to complete all orders.');
      return;
    }
    const ok = window.confirm(`Clear Table ${id}? This will end the session and cannot be undone.`);
    if (!ok) return;
    try {
      await kotService.clearTable(parseInt(id), currentUser?.id || null, {
        waiterUserId: currentUser?.id || null,
        waiterUsername: currentUser?.username || null,
        serviceChargePct,
        taxPct,
        discountPercent: discountPct,
      });
      localStorage.removeItem(CART_KEY);
    } catch (err) {
      console.error('Clear table error:', err);
      alert('Something went wrong.');
      return;
    }
    navigate('/waiter');
  };

  // ── Cart qty badge on menu card ───────────────────────────
  const cartQtyForItem = itemId => {
    const row = cartItems.find(i => i.itemId === itemId);
    return row ? row.qty : 0;
  };

  return (
    <>
      {toast && <div className="toast">{toast}</div>}

      {/* ══ 3-Column Luxury Layout ══ */}
      <div className="order-layout">

        {/* LEFT: Category Sidebar */}
        <aside className="cat-sidebar">
          <div className="cat-sidebar-brand">
            <div className="brand-logo-text">OPULENCE</div>
            <div className="brand-tagline-text">Restaurant</div>
          </div>

          <div className="cat-sidebar-table">
            <div className="cat-sidebar-table-label">Table</div>
            <div className="cat-sidebar-table-num">{id}</div>
          </div>

          <nav className="cat-list">
            {categories.map(cat => (
              <div
                key={cat}
                className={`cat-item ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => { setActiveCategory(cat); setSearchQuery(''); }}
              >
                <span className="cat-icon">{CATEGORY_ICONS[cat] || '🍽️'}</span>
                <span>{cat}</span>
              </div>
            ))}
          </nav>

          <div className="cat-sidebar-footer">
            <button className="w-logout-btn" style={{ width: '100%' }} onClick={logoutUser}>
              Logout
            </button>
          </div>
        </aside>

        {/* CENTRE: Menu Content */}
        <main className="order-main">

          {/* Top Bar */}
          <div className="order-topbar">
            <button className="order-topbar-back" onClick={() => navigate('/waiter')}>
              ← Tables
            </button>

            <div className="order-topbar-cat">{searchQuery ? `Search results` : activeCategory}</div>

            <div className="order-topbar-spacer" />

            {/* KOT counter */}
            <button
              className="kot-counter-btn"
              onClick={() => setShowCart(s => !s)}
              title={showCart ? 'Hide cart' : 'Show cart'}
            >
              KOT
              <span className="kot-badge">{cartQty}</span>
            </button>

            {hasConsumed && !pendingBillRemovalRequest && (
              <button className="topbar-action-btn warn" onClick={openRemovalModal}>
                Request Removal
              </button>
            )}
            {hasConsumed && pendingBillRemovalRequest && (
              <span className="topbar-pending-removal" title="Wait for manager decision">
                Removal pending…
              </span>
            )}

            <button
              className="topbar-action-btn"
              onClick={() => setShowSummary(true)}
            >
              {hasConsumed ? `Summary ₹${grandTotal.toFixed(0)}` : 'Summary'}
            </button>

            <button
              className="topbar-action-btn danger"
              disabled={clearedKots.length === 0}
              onClick={handleClearTable}
            >
              Clear Table
            </button>

            <button
              className="topbar-action-btn primary"
              disabled={!hasConsumed}
              onClick={handlePrint}
            >
              🖨 Print Bill
            </button>
          </div>

          {/* Full-width search bar — sits between topbar and menu grid */}
          <div className="menu-search-bar">
            <span className="menu-search-icon">🔍</span>
            <input
              type="text"
              className="menu-search-input"
              placeholder="Search menu…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Menu Grid */}
          <div className="menu-content">
            <div className="menu-grid">
              {filteredMenu.length === 0 ? (
                <div className="menu-no-items">
                  {searchQuery ? `No results for "${searchQuery}"` : 'No items in this category.'}
                </div>
              ) : (
                filteredMenu.map(item => {
                  const isOOS = item.outOfStock;
                  const inCart = cartQtyForItem(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`menu-card-lux ${isOOS ? 'oos' : ''}`}
                    >
                      <div className="menu-img-wrap">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="menu-img"
                          loading="lazy"
                          onError={e => { e.target.src = '/placeholder.svg'; }}
                        />
                        {isOOS && <span className="menu-oos-badge">Out of Stock</span>}
                        {inCart > 0 && !isOOS && (
                          <span className="menu-cart-qty-badge">In cart: {inCart}</span>
                        )}
                      </div>
                      <div className="menu-card-body">
                        <div className="menu-card-name-row">
                          <span className={`veg-dot ${item.isVegetarian ? 'veg' : 'nonveg'}`} title={item.isVegetarian ? 'Vegetarian' : 'Non-Vegetarian'} />
                          <span className="menu-card-name">{item.name}</span>
                        </div>
                        {searchQuery && (
                          <div className="menu-card-category-tag">{item.category}</div>
                        )}
                        {item.description && (
                          <div className="menu-card-desc">{item.description}</div>
                        )}
                        <div className="menu-card-footer">
                          <span className="menu-card-price">₹{item.price}</span>
                          <button
                            className="add-btn-gold"
                            disabled={isOOS}
                            onClick={() => addToCart(item)}
                            title={isOOS ? 'Out of stock' : 'Add to cart'}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>

        {/* RIGHT: Cart Panel */}
        <aside className={`cart-panel ${showCart ? '' : 'collapsed'}`}>
          <div className="cart-panel-header">
            <span className="cart-title">Cart {cartItems.length > 0 ? `(${cartItems.length})` : ''}</span>
            {cartItems.length > 0 && (
              <label className="cart-select-all">
                <input type="checkbox" checked={allChecked} onChange={toggleSelectAll} />
                All
              </label>
            )}
          </div>

          <div className="cart-rows-scroll">
            {cartItems.length === 0 ? (
              <div className="cart-empty">
                <div className="cart-empty-icon">🛒</div>
                <p>Add items from the menu</p>
              </div>
            ) : (
              cartItems.map(item => (
                <div key={item.itemId} className={`p2-cart-row ${item.isChecked ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    className="cart-checkbox"
                    checked={item.isChecked}
                    onChange={() => toggleCheck(item.itemId)}
                  />
                  <img src={item.imageUrl} alt="" className="cart-thumb"
                    onError={e => { e.target.style.display = 'none'; }} />
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

          <div className="cart-panel-footer">
            <textarea
              className="sp-instructions"
              placeholder="Special instructions (optional)"
              rows={2}
              value={specialInstructions}
              onChange={e => setSpecialInstructions(e.target.value)}
            />
            <div className="cart-subtotal-row">
              {hasChecked
                ? `${checkedItems.length} item${checkedItems.length > 1 ? 's' : ''} · ₹${checkedTotal}`
                : 'Select items to send to kitchen'}
            </div>
            <button
              className={`submit-kot-btn ${hasChecked ? 'active-green' : ''}`}
              disabled={!hasChecked}
              onClick={submitKOT}
            >
              Send to Kitchen
            </button>
          </div>
        </aside>

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
                          const isResolved  = ['done', 'removed', 'out_of_stock'].includes(item.status);
                          const isPending   = item.status === 'pending';
                          const hasCancelReq = cancellationRequests.some(r =>
                            r.originalKotId === kot._docId && r.itemId === item.itemId && r.status === 'pending_approval'
                          );
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
                      const displayItems = kot.items?.filter(i =>
                        ['done', 'partially_removed', 'removed_entirely'].includes(i.status)
                      ) || [];
                      if (displayItems.length === 0) return null;
                      return (
                        <div key={idx} className="log-kot-card">
                          <div className="log-kot-label">KOT #{(kot._docId || '').slice(-4).toUpperCase()}</div>
                          {displayItems.map((item, i) => {
                            const isPartial  = item.status === 'partially_removed';
                            const isRemoved  = item.status === 'removed_entirely';
                            const effQty     = isPartial ? (item.finalQty ?? 0) : item.qty;
                            const displayQty = isRemoved ? item.qty : isPartial ? effQty : item.qty;
                            const note       = partialRemovalCaption(item);
                            return (
                              <div key={i} className={`log-item-row${isRemoved ? ' removed-entirely-row' : ''}`}>
                                <div className="log-item-info log-item-info--stack">
                                  <div>
                                    <span className={isRemoved ? 'log-item-struck' : ''}>
                                      {item.name}{' '}
                                      <span className="log-qty">
                                        ×{displayQty}
                                      </span>
                                    </span>
                                    {isPartial && note && (
                                      <div className="log-approval-note">{note}</div>
                                    )}
                                  </div>
                                </div>
                                {isRemoved ? (
                                  <>
                                    <span className="log-removed-badge">Removed</span>
                                    <span className="log-price log-price-zero">₹0.00</span>
                                  </>
                                ) : (
                                  <span className="log-price">₹{item.price * effQty}</span>
                                )}
                              </div>
                            );
                          })}
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
                  <span>Subtotal</span><span>₹{consumedSubtotal.toFixed(2)}</span>
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
                <div className="billing-row">
                  <span>Discount</span>
                  <div className="billing-input-group">
                    <input
                      type="number"
                      value={discountPct}
                      min="0"
                      max="100"
                      onChange={e => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                    />
                    <span>% → −₹{(grandTotal * discountPct / 100).toFixed(2)}</span>
                  </div>
                </div>
                {discountPct > 50 && (
                  <div className="billing-discount-warning">
                    Discount above 50% — this will be flagged in the manager's audit feed.
                  </div>
                )}
                <div className="billing-row grand-total-row">
                  <span>Grand Total</span>
                  <span>₹{(grandTotal * (1 - discountPct / 100)).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Item Removal Request Modal ══ */}
      {showRemovalModal && (
        <div className="summary-overlay" onClick={() => setShowRemovalModal(false)}>
          <div className="summary-modal" onClick={e => e.stopPropagation()}>
            <div className="summary-modal-header">
              <h3>Request Item Removal from Bill</h3>
              <button className="summary-close" onClick={() => setShowRemovalModal(false)}>✕</button>
            </div>
            <div className="summary-modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>
                Select items to remove. Bill is <strong>not</strong> changed until the manager approves.
              </p>
              {removalSelections.map((item, index) => (
                <label
                  key={`${item.kotId}_${item.itemId}_${index}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleRemovalItem(item._key)}
                    style={{ width: 18, height: 18, accentColor: 'var(--gold)', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, fontSize: '0.85rem' }}>
                    {item.name} ×1
                    {item.kotId && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                        (KOT #{(String(item.kotId)).slice(-4).toUpperCase()})
                      </span>
                    )}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>₹{item.price}</span>
                </label>
              ))}
              <div style={{ marginTop: '1rem' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                  Reason for removal *
                </label>
                <textarea
                  value={removalReason}
                  onChange={e => setRemovalReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Customer complained about quality"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-off)', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', fontSize: '0.85rem' }}
                />
              </div>
              {removalMessage && (
                <div style={{ marginTop: '0.5rem', padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', background: removalMessage.includes('sent') ? 'rgba(45,122,79,0.12)' : 'rgba(192,57,43,0.1)', color: removalMessage.includes('sent') ? 'var(--success)' : 'var(--danger)', fontSize: '0.82rem' }}>
                  {removalMessage}
                </div>
              )}
            </div>
            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', background: 'var(--bg-off)' }}>
              <button
                onClick={() => setShowRemovalModal(false)}
                style={{ padding: '0.45rem 1rem', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancel
              </button>
              <button
                onClick={submitRemovalRequest}
                disabled={removalSubmitting}
                style={{ padding: '0.45rem 1.25rem', background: 'var(--gold)', color: 'var(--brand-dark)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
              >
                {removalSubmitting ? 'Sending…' : 'Send to Manager'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Print Receipt ══ */}
      {/* Customer-facing print: billable items only (see AuditBillDetailPanel for manager audit view). */}
      <div className="print-receipt-container">
        <div className="rcpt-header">
          <h2>OPULENCE Restaurant</h2>
          <p>Fine Dining Experience</p>
        </div>
        <div className="rcpt-meta">
          <div><strong>Table:</strong> {id}</div>
          <div><strong>Waiter:</strong> {currentUser?.name || '—'}</div>
          <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
          <div><strong>Time:</strong> {new Date().toLocaleTimeString()}</div>
        </div>
        <div style={{ borderBottom: '1px dashed black', margin: '10px 0' }} />
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
          {discountPct > 0 && (
            <div className="rcpt-totals-row"><span>Discount ({discountPct}%):</span><span>−₹{(grandTotal * discountPct / 100).toFixed(2)}</span></div>
          )}
          <div className="rcpt-totals-row bold"><span>Grand Total:</span><span>₹{(grandTotal * (1 - discountPct / 100)).toFixed(2)}</span></div>
        </div>
        <div className="rcpt-footer">Thank you for dining with us!</div>
      </div>
    </>
  );
}

// ── Main Router ───────────────────────────────────────────
export default function WaiterApp() {
  return (
    <Routes>
      <Route path="/" element={<TableSelection />} />
      <Route path="/table/:id" element={<OrderPage />} />
    </Routes>
  );
}
