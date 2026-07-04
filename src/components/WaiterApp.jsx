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
import { buildBillWhatsAppClickToChatUrl } from '../lib/whatsapp/buildWhatsAppClickToChatUrl';
import './WaiterApp.css';
import {
  computeBillTotalsFromClearedKots,
  combinedConsumedItemsFromClearedKots,
} from '../lib/billing/billTotals';
import { CATEGORY_ORDER } from '../data/categoryOrder';

/** URL-safe id for category sections and nav data-category attributes. */
function categoryToSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/\s*[—–]\s*/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Phone digits only; display masked as asterisks (not stored). */
function MaskedPhoneInput({ value, onChange, disabled, id }) {
  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      onChange(value.slice(0, -1));
      return;
    }
    if (/^\d$/.test(e.key) && value.length < 15) {
      e.preventDefault();
      onChange(value + e.key);
    }
  };
  const handlePaste = (e) => {
    if (disabled) return;
    e.preventDefault();
    const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '');
    onChange((value + digits).slice(0, 15));
  };
  return (
    <input
      id={id}
      type="text"
      className="wa-modal-input wa-modal-input--masked"
      readOnly
      value={value.length ? '*'.repeat(value.length) : ''}
      placeholder="10-digit mobile number"
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      disabled={disabled}
      autoComplete="off"
      inputMode="numeric"
      aria-label="Customer phone number"
    />
  );
}

/** Lucide-style 16px nav icons (inline SVG, no emoji). */
function NavSvg({ className, children }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function CategoryIcon({ className = 'cat-icon' }) {
  return (
    <NavSvg className={className}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </NavSvg>
  );
}

function LogOutIcon({ className = 'cat-logout-icon' }) {
  return (
    <NavSvg className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </NavSvg>
  );
}

function TrashIcon({ className = 'topbar-btn-icon' }) {
  return (
    <NavSvg className={className}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </NavSvg>
  );
}

function UtensilsIcon({ className = 'menu-placeholder-icon' }) {
  return (
    <svg
      className={className}
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </svg>
  );
}

function hasDisplayableMenuImage(url) {
  if (!url || typeof url !== 'string') return false;
  const normalized = url.trim().toLowerCase();
  return normalized.length > 0 && !normalized.includes('placeholder');
}

function formatMenuPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) return '₹0';
  if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.001) {
    return `₹${Math.round(n)}`;
  }
  return `₹${n.toFixed(2)}`;
}

function MenuItemImage({ imageUrl, name, isVegetarian }) {
  const [imageFailed, setImageFailed] = useState(!hasDisplayableMenuImage(imageUrl));
  const showPlaceholder = imageFailed || !hasDisplayableMenuImage(imageUrl);
  const dietLabel = isVegetarian ? 'Vegetarian' : 'Non-Vegetarian';

  return (
    <div className="menu-img-wrap">
      <span
        className={`menu-veg-badge ${isVegetarian ? 'veg' : 'nonveg'}`}
        title={dietLabel}
      >
        <span className="sr-only">{dietLabel}</span>
      </span>
      {showPlaceholder ? (
        <div className="menu-img-placeholder" role="img" aria-label={`${name}, no photo available`}>
          <UtensilsIcon />
          <span className="menu-img-placeholder-text" aria-hidden="true">No photo yet</span>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={name}
          className="menu-img"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      )}
    </div>
  );
}

function formatCartAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${n.toFixed(2)}`;
}

function MenuItemCard({ item, inCart, onAdd, onUpdateQty, showCategoryTag = false }) {
  const isOOS = item.outOfStock;
  return (
    <article className={`menu-card-lux ${isOOS ? 'oos' : ''}`}>
      <div className="menu-card-media">
        <MenuItemImage
          imageUrl={item.imageUrl}
          name={item.name}
          isVegetarian={item.isVegetarian}
        />
        {isOOS && <span className="menu-oos-badge">Out of Stock</span>}
      </div>
      <div className="menu-card-body">
        <h3 className="menu-card-name">{item.name}</h3>
        {showCategoryTag && (
          <div className="menu-card-category-tag">{item.category}</div>
        )}
        {item.description && (
          <p className="menu-card-desc">{item.description}</p>
        )}
        <div className="menu-card-footer">
          <span className="menu-card-price">{formatMenuPrice(item.price)}</span>
          <div className="menu-card-action">
            {isOOS ? (
              <span className="menu-oos-action">Unavailable</span>
            ) : (
              <>
                <button
                  type="button"
                  className={`menu-add-btn ${inCart > 0 ? 'menu-add-btn--hidden' : ''}`}
                  onClick={() => onAdd(item)}
                  aria-label={`Add ${item.name} to cart`}
                >
                  +
                </button>
                <div
                  className={`menu-qty-stepper ${inCart > 0 ? 'menu-qty-stepper--visible' : ''}`}
                  aria-label={`Quantity: ${inCart}`}
                >
                  <button
                    type="button"
                    className="menu-qty-stepper-btn"
                    onClick={() => onUpdateQty(item.id, -1)}
                    aria-label={`Decrease ${item.name} quantity`}
                  >
                    −
                  </button>
                  <span className="menu-qty-stepper-value">{inCart}</span>
                  <button
                    type="button"
                    className="menu-qty-stepper-btn"
                    onClick={() => onUpdateQty(item.id, 1)}
                    aria-label={`Increase ${item.name} quantity`}
                  >
                    +
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function TrayIcon({ className = 'cart-empty-icon' }) {
  return (
    <svg
      className={className}
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7h18" />
      <path d="M4 7l1.5 12h13L20 7" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M9 11h6" />
    </svg>
  );
}

function SendArrowIcon({ className = 'send-kot-arrow' }) {
  return (
    <NavSvg className={className}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </NavSvg>
  );
}

function SpinnerIcon({ className = 'send-kot-spinner' }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function useDebouncedWindowWidth(delayMs = 150) {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024));
  useEffect(() => {
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setWidth(window.innerWidth), delayMs);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [delayMs]);
  return width;
}

function SearchIcon({ className = 'menu-search-icon' }) {
  return (
    <NavSvg className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </NavSvg>
  );
}

function CheckCircleIcon({ className = 'toast-icon' }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

function MenuSkeletonGrid() {
  return (
    <div className="menu-grid menu-grid--skeleton" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="menu-skeleton-card">
          <div className="menu-skeleton-media" />
          <div className="menu-skeleton-body">
            <div className="menu-skeleton-line menu-skeleton-line--title" />
            <div className="menu-skeleton-line menu-skeleton-line--desc" />
            <div className="menu-skeleton-line menu-skeleton-line--price" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ToastBanner({ toast }) {
  if (!toast) return null;
  const isSuccess = toast.variant === 'success';
  return (
    <div
      className={`toast ${isSuccess ? 'toast--success' : ''}`}
      role="status"
      aria-live="polite"
    >
      {isSuccess && <CheckCircleIcon />}
      <span>{toast.message}</span>
    </div>
  );
}

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
      <header id="tables-page-header">
        <div className="tables-header-meta">
          <div className="waiter-info">
            <span className="waiter-label">Waiter</span>
            <span className="waiter-name">{currentUser?.name || 'Staff'}</span>
          </div>
          <button type="button" className="logout-btn-tables logout-mobile-only" onClick={logoutUser}>
            Log out
          </button>
        </div>

        <div className="tables-header-brand">
          <span className="brand-name">OPULENCE</span>
          <span className="brand-sub">Restaurant</span>
        </div>

        <div className="tables-header-title-row">
          <span className="tables-page-title">Select a table</span>
          <div className="tables-header-badges">
            <span className="badge badge-available">{available} Available</span>
            <span className="badge badge-occupied">{occupied} Occupied</span>
          </div>
          <button type="button" className="logout-btn-tables logout-desktop-only" onClick={logoutUser}>
            Log out
          </button>
        </div>
      </header>

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
  const [menuLoaded, setMenuLoaded] = useState(false);
  const [activeCategory, setActiveCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchInput, 200);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const menuScrollAreaRef = useRef(null);
  const activeCategoryRef = useRef('');
  const categoryBeforeSearchRef = useRef('');
  const wasSearchingRef = useRef(false);
  const prevCartQtyRef = useRef(null);
  const prevCartTotalRef = useRef(null);
  const prevCheckedTotalRef = useRef(null);
  const [cartBadgePop, setCartBadgePop] = useState(false);
  const [cartTotalPulse, setCartTotalPulse] = useState(false);
  const [checkedTotalPulse, setCheckedTotalPulse] = useState(false);
  const windowWidth = useDebouncedWindowWidth(150);

  useEffect(() => {
    return menuService.subscribeMenu((items) => {
      setMenuItems(items);
      setMenuLoaded(true);
    });
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

  activeCategoryRef.current = activeCategory;

  const menuSections = useMemo(() => {
    const byCategory = new Map();
    categories.forEach(cat => byCategory.set(cat, []));
    menuItems.forEach(item => {
      const cat = item.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat).push(item);
    });
    return categories.map(category => ({
      category,
      slug: categoryToSlug(category),
      items: byCategory.get(category) || [],
    }));
  }, [menuItems, categories]);

  const isSearchActive = Boolean(searchInput.trim());
  const searchFilterQuery = (debouncedSearchQuery || searchInput).trim();

  const itemMatchesSearch = (item, q) => {
    if (!q) return false;
    const needle = q.toLowerCase();
    return (
      item.name.toLowerCase().includes(needle) ||
      (item.description && item.description.toLowerCase().includes(needle)) ||
      (item.category && item.category.toLowerCase().includes(needle))
    );
  };

  const searchResultSections = useMemo(() => {
    if (!searchFilterQuery) return [];
    const q = searchFilterQuery;
    const matched = menuItems.filter(item => itemMatchesSearch(item, q));
    const byCategory = new Map();
    matched.forEach(item => {
      if (!byCategory.has(item.category)) byCategory.set(item.category, []);
      byCategory.get(item.category).push(item);
    });
    const matchedCategoryNames = [...byCategory.keys()];
    const orderedCategories = [
      ...categories.filter(cat => byCategory.has(cat)),
      ...matchedCategoryNames.filter(cat => !categories.includes(cat)),
    ];
    return orderedCategories.map(category => ({
      category,
      slug: categoryToSlug(category),
      items: byCategory.get(category) || [],
    }));
  }, [menuItems, categories, searchFilterQuery]);

  const searchResultCount = useMemo(
    () => searchResultSections.reduce((sum, s) => sum + s.items.length, 0),
    [searchResultSections]
  );

  const scrollActivePillIntoView = () => {
    const slug = categoryToSlug(activeCategoryRef.current);
    const activePill = document.querySelector(
      `#category-strip .category-pill[data-category="${slug}"]`
    ) || document.querySelector('#category-strip .pill-active');
    activePill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const applyActiveCategory = (categoryName, { scrollNav = true, scrollMenu = false } = {}) => {
    if (!categoryName) return;
    setActiveCategory(categoryName);
    activeCategoryRef.current = categoryName;

    if (scrollNav) {
      requestAnimationFrame(() => scrollActivePillIntoView());
    }

    if (scrollMenu) {
      const section = document.getElementById(`section-${categoryToSlug(categoryName)}`);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Scroll spy: highlight nav for the section in the upper viewport band
  useEffect(() => {
    if (isSearchActive || !menuLoaded) return undefined;

    const root = menuScrollAreaRef.current;
    if (!root) return undefined;

    const sectionObserver = new IntersectionObserver((entries) => {
      const intersecting = entries.filter(e => e.isIntersecting);
      if (!intersecting.length) return;

      const topmost = intersecting.reduce((best, entry) =>
        (entry.boundingClientRect.top < best.boundingClientRect.top ? entry : best)
      );

      const categoryName = topmost.target.getAttribute('data-category-name');
      if (categoryName && categoryName !== activeCategoryRef.current) {
        setActiveCategory(categoryName);
        activeCategoryRef.current = categoryName;
        requestAnimationFrame(() => scrollActivePillIntoView());
      }
    }, {
      root,
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0,
    });

    root.querySelectorAll('.menu-category-section').forEach(section => {
      sectionObserver.observe(section);
    });

    const sentinel = root.querySelector('.menu-scroll-sentinel');
    const sentinelObserver = sentinel
      ? new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting || categories.length === 0) return;
          const lastCategory = categories[categories.length - 1];
          if (lastCategory !== activeCategoryRef.current) {
            setActiveCategory(lastCategory);
            activeCategoryRef.current = lastCategory;
            requestAnimationFrame(() => scrollActivePillIntoView());
          }
        }, { root, threshold: 0 })
      : null;
    if (sentinel && sentinelObserver) sentinelObserver.observe(sentinel);

    return () => {
      sectionObserver.disconnect();
      sentinelObserver?.disconnect();
    };
  }, [isSearchActive, menuLoaded, menuSections.length, categories]);

  // Restore continuous scroll position when search is cleared
  useEffect(() => {
    if (searchInput.trim() || debouncedSearchQuery.trim()) {
      wasSearchingRef.current = true;
      if (activeCategoryRef.current) {
        categoryBeforeSearchRef.current = activeCategoryRef.current;
      }
      return undefined;
    }

    if (!wasSearchingRef.current) return undefined;
    wasSearchingRef.current = false;

    const restoreCategory = categoryBeforeSearchRef.current || categories[0];
    if (!restoreCategory) return undefined;

    const timer = window.setTimeout(() => {
      applyActiveCategory(restoreCategory, { scrollNav: true, scrollMenu: true });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [searchInput, debouncedSearchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (windowWidth >= 1024) setCartDrawerOpen(false);
  }, [windowWidth]);

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

  useEffect(() => {
    if (!showSummary) {
      setWaCustomerPhone('');
      setWaMessage('');
    }
  }, [showSummary]);

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
  const [toast, setToast] = useState(null);
  const [kotSubmitting, setKotSubmitting] = useState(false);

  // ── Bill modification request state ──────────────────────
  const [lastBillId, setLastBillId] = useState(null);
  const [showRemovalModal, setShowRemovalModal] = useState(false);
  const [removalSelections, setRemovalSelections] = useState([]);
  const [removalReason, setRemovalReason] = useState('');
  const [removalSubmitting, setRemovalSubmitting] = useState(false);
  const [removalMessage, setRemovalMessage] = useState('');

  // ── Discount state ────────────────────────────────────────
  const [discountPct, setDiscountPct] = useState(0);

  // ── WhatsApp Click to Chat (phone not persisted) ──────────
  const [waCustomerPhone, setWaCustomerPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');

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

  const toggleCheck = (itemId) =>
    setCartItems(prev => prev.map(i => i.itemId === itemId ? { ...i, isChecked: !i.isChecked } : i));

  const removeCartItem = (itemId) =>
    setCartItems(prev => prev.filter(i => i.itemId !== itemId));

  const allChecked = cartItems.length > 0 && cartItems.every(i => i.isChecked);
  const toggleSelectAll = () => setCartItems(prev => prev.map(i => ({ ...i, isChecked: !allChecked })));

  const checkedItems = cartItems.filter(i => i.isChecked);
  const checkedTotal = checkedItems.reduce((acc, i) => acc + i.price * i.qty, 0);
  const hasChecked = checkedItems.length > 0;

  const cartQty      = cartItems.reduce((sum, i) => sum + i.qty, 0);
  const cartTotal    = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const hasCartItems = cartItems.length > 0;

  const selectCategory = (cat) => {
    if (searchInput.trim()) {
      categoryBeforeSearchRef.current = cat;
      setSearchInput('');
      window.setTimeout(() => {
        applyActiveCategory(cat, { scrollNav: true, scrollMenu: true });
      }, 220);
      return;
    }
    applyActiveCategory(cat, { scrollNav: true, scrollMenu: true });
  };

  const handleCategoryStripKeyDown = (e) => {
    const pills = Array.from(document.querySelectorAll('#category-strip [role="tab"]'));
    if (!pills.length) return;

    const focusedIndex = pills.indexOf(document.activeElement);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = pills[focusedIndex >= 0 ? Math.min(focusedIndex + 1, pills.length - 1) : 0];
      next?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = pills[focusedIndex > 0 ? focusedIndex - 1 : pills.length - 1];
      prev?.focus();
    }
  };

  const closeCartDrawer = () => setCartDrawerOpen(false);
  const openCartDrawer = () => setCartDrawerOpen(true);

  useEffect(() => {
    if (!cartDrawerOpen && !showSummary && !showRemovalModal) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setCartDrawerOpen(false);
        setShowSummary(false);
        setShowRemovalModal(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cartDrawerOpen, showSummary, showRemovalModal]);

  useEffect(() => {
    if (prevCartQtyRef.current === null) {
      prevCartQtyRef.current = cartQty;
      return undefined;
    }
    if (cartQty > prevCartQtyRef.current) {
      setCartBadgePop(true);
      const t = setTimeout(() => setCartBadgePop(false), 320);
      prevCartQtyRef.current = cartQty;
      return () => clearTimeout(t);
    }
    prevCartQtyRef.current = cartQty;
    return undefined;
  }, [cartQty]);

  useEffect(() => {
    if (prevCartTotalRef.current === null) {
      prevCartTotalRef.current = cartTotal;
      return undefined;
    }
    if (cartTotal !== prevCartTotalRef.current) {
      setCartTotalPulse(true);
      const t = setTimeout(() => setCartTotalPulse(false), 600);
      prevCartTotalRef.current = cartTotal;
      return () => clearTimeout(t);
    }
    return undefined;
  }, [cartTotal]);

  useEffect(() => {
    if (prevCheckedTotalRef.current === null) {
      prevCheckedTotalRef.current = checkedTotal;
      return undefined;
    }
    if (checkedTotal !== prevCheckedTotalRef.current) {
      setCheckedTotalPulse(true);
      const t = setTimeout(() => setCheckedTotalPulse(false), 600);
      prevCheckedTotalRef.current = checkedTotal;
      return () => clearTimeout(t);
    }
    return undefined;
  }, [checkedTotal]);

  const showToast = (message, variant = 'default') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 3000);
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
    if (checkedItems.length === 0 || kotSubmitting) return;
    setKotSubmitting(true);
    const startedAt = Date.now();
    try {
      await kotService.createKotFromCart({
        tableNumber: parseInt(id),
        waiterUserId: currentUser?.id || null,
        waiterUsername: currentUser?.username || null,
        items: checkedItems.map(({ isChecked, ...rest }) => rest),
        specialInstructions,
      });
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1000) {
        await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
      }
      showToast('Order sent to kitchen!', 'success');
      setCartItems(prev => {
        const remaining = prev.filter(i => !i.isChecked);
        try { localStorage.setItem(CART_KEY, JSON.stringify(remaining.map(({ isChecked, ...r }) => r))); } catch { /* ignore */ }
        return remaining;
      });
    } catch (err) {
      console.error('KOT error:', err);
      alert('Failed to submit KOT. Please try again.');
    } finally {
      setKotSubmitting(false);
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

  const handlePrintPhysical = async () => {
    if (!hasConsumed) return;
    const err = await ensureBillExists();
    if (err) { alert(err); return; }
    window.print();
  };

  const handleSendBillOnWhatsApp = async () => {
    const phoneDigits = waCustomerPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setWaMessage('Please enter a valid 10-digit mobile number.');
      return;
    }

    setWaMessage('');
    const err = await ensureBillExists();
    if (err) {
      alert(err);
      return;
    }

    const finalTotal = grandTotal * (1 - discountPct / 100);
    const billItems = combinedConsumedItems.map((item) => ({
      name: item.name,
      qty: item.qty,
      lineTotal: item.qty * item.price,
    }));

    try {
      const url = buildBillWhatsAppClickToChatUrl({
        customerNumber: phoneDigits,
        items: billItems,
        subtotal: consumedSubtotal,
        serviceCharge: serviceChargeAmt,
        tax: taxAmt,
        total: finalTotal,
        dateTime: new Date(),
      });
      window.open(url, '_blank', 'noopener,noreferrer');
      setWaCustomerPhone('');
      showToast('WhatsApp opened — tap send in the chat.');
    } catch (e) {
      console.error('WhatsApp Click to Chat error:', e);
      setWaMessage(e.message || 'Could not open WhatsApp.');
    }
  };

  const waPhoneReady = waCustomerPhone.replace(/\D/g, '').length >= 10;

  // ── Removal request ───────────────────────────────────────

  /**
   * Build the expanded selection list: each consumed item is split into
   * individual unit rows (qty × 1) so the waiter can remove partial quantities.
   */
  const buildRemovalSelections = () => {
    // Show all billable consumed lines (done + partially_removed with qty > 0).
    const consumedItems = combinedConsumedItems.filter((item) => (Number(item.qty) || 0) > 0);
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
    if (pendingBillRemovalRequest) {
      alert('You cannot clear this table while a removal request is pending manager approval.');
      return;
    }
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

  const handleKotClick = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      openCartDrawer();
    }
  };

  const renderMenuCard = (item, showCategoryTag = false) => (
    <MenuItemCard
      key={item.id}
      item={item}
      inCart={cartQtyForItem(item.id)}
      onAdd={addToCart}
      onUpdateQty={updateQty}
      showCategoryTag={showCategoryTag}
    />
  );

  return (
    <>
      <ToastBanner toast={toast} />

      {/* ══ Responsive 3-region layout (nav · main · cart) ══ */}
      <div className="order-layout">

        {/* LEFT: Category navigation */}
        <nav id="sidebar" className="cat-sidebar" role="navigation" aria-label="Menu categories">
          <header className="cat-sidebar-brand">
            <div className="brand-logo-text">OPULENCE</div>
            <div className="brand-tagline-text">RESTAURANT</div>
          </header>

          <div className="cat-sidebar-context">
            <div className="cat-sidebar-table">
              <div className="cat-sidebar-table-label">TABLE</div>
              <div className="cat-sidebar-table-num">{id}</div>
            </div>
          </div>

          <ul className="cat-list cat-list--sidebar">
            {categories.map(cat => (
              <li key={cat} className="cat-list-item">
                <button
                  type="button"
                  className={`cat-item nav-item ${activeCategory === cat ? 'active' : ''}`}
                  data-category={categoryToSlug(cat)}
                  onClick={() => selectCategory(cat)}
                >
                  <CategoryIcon category={cat} />
                  <span className="cat-label">{cat}</span>
                </button>
              </li>
            ))}
          </ul>

          <footer className="cat-sidebar-footer">
            <button className="cat-logout-btn" type="button" onClick={logoutUser}>
              <LogOutIcon />
              Log out
            </button>
          </footer>
        </nav>

        {/* CENTRE: Menu Content */}
        <main className="order-main">

          {/* Sticky top bar — order actions only (logout is in sidebar / mobile footer) */}
          <header id="menu-top-bar" className="menu-top-bar">
            <div className="menu-top-left">
              <button
                type="button"
                className="menu-breadcrumb"
                onClick={() => navigate('/waiter')}
              >
                ← Tables
              </button>
              <span className="menu-active-category">
                {isSearchActive ? 'Search results' : (activeCategory || 'Menu')}
              </span>
            </div>

            <div className="menu-top-actions">
              <button
                type="button"
                className={`topbar-btn topbar-kot-btn action-btn ${cartQty > 0 ? 'topbar-kot-btn--filled' : 'topbar-kot-btn--ghost'}`}
                onClick={handleKotClick}
                aria-label={cartQty > 0 ? `KOT, ${cartQty} items in cart` : 'KOT, cart empty'}
              >
                <span className="topbar-kot-label">KOT</span>
                {cartQty > 0 && (
                  <span className="topbar-kot-count" aria-hidden="true">{cartQty}</span>
                )}
              </button>

              <button
                type="button"
                className="topbar-btn topbar-btn--ghost action-btn"
                onClick={() => setShowSummary(true)}
                aria-label={hasConsumed ? `View bill summary, total ₹${grandTotal.toFixed(0)}` : 'View bill summary'}
              >
                {hasConsumed ? `Summary ₹${grandTotal.toFixed(0)}` : 'Summary'}
              </button>

              <button
                type="button"
                className="topbar-btn topbar-btn--danger clear-table-btn action-btn"
                disabled={clearedKots.length === 0 || pendingBillRemovalRequest}
                onClick={handleClearTable}
                aria-label="Clear table"
              >
                <TrashIcon className="topbar-btn-icon clear-table-icon" />
                <span className="label-full">Clear Table</span>
                <span className="label-short">Clear</span>
              </button>
            </div>
          </header>

          <div className="category-strip-wrap">
            <nav
              id="category-strip"
              className="category-strip"
              role="tablist"
              aria-label="Menu categories"
              onKeyDown={handleCategoryStripKeyDown}
            >
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  data-category={categoryToSlug(cat)}
                  aria-selected={activeCategory === cat ? 'true' : 'false'}
                  className={`category-pill ${activeCategory === cat ? 'pill-active' : ''}`}
                  onClick={() => selectCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </nav>
          </div>

          <div className="order-main-scroll">
          {hasConsumed && (
            <div className="order-bill-bar">
              <button
                type="button"
                className="order-bill-bar-btn"
                onClick={handlePrintPhysical}
              >
                Print physical copy of the bill
              </button>
            </div>
          )}

          {/* Full-width search bar — sits between topbar and menu grid */}
          <div className="menu-search-wrap">
            <div className="menu-search-bar">
              <SearchIcon />
              <input
                type="search"
                className="menu-search-input"
                placeholder="Search entire menu…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                aria-label="Search menu"
              />
              {searchInput && (
                <button
                  type="button"
                  className="menu-search-clear"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            {isSearchActive && searchFilterQuery && searchResultCount > 0 && (
              <p className="menu-search-meta">
                Showing {searchResultCount} {searchResultCount === 1 ? 'result' : 'results'} across all categories for &apos;{searchFilterQuery}&apos;
              </p>
            )}
          </div>

          <div
            id="menu-scroll-area"
            ref={menuScrollAreaRef}
            className={`menu-scroll-area ${isSearchActive ? 'menu-scroll-area--search' : ''}`}
          >
            {!menuLoaded ? (
              <MenuSkeletonGrid />
            ) : isSearchActive && searchFilterQuery ? (
              searchResultCount === 0 ? (
                <div className="menu-search-empty">
                  <p className="menu-search-empty-title">No items match your search</p>
                  <p className="menu-search-empty-hint">Try checking your spelling or search for something else.</p>
                </div>
              ) : (
                <div className="menu-search-results">
                  {searchResultSections.map(({ category, slug, items }, index) => (
                    <section
                      key={slug}
                      className={`menu-category-section ${index > 0 ? 'menu-category-section--divided' : ''}`}
                      data-category={slug}
                      data-category-name={category}
                    >
                      <div className="category-section-header">
                        <h2>{category}</h2>
                        <span className="item-count">
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <div className="menu-grid">
                        {items.map(item => renderMenuCard(item, true))}
                      </div>
                    </section>
                  ))}
                </div>
              )
            ) : (
              <>
                {menuSections.map(({ category, slug, items }, index) => (
                  <section
                    key={slug}
                    id={`section-${slug}`}
                    className={`menu-category-section ${index > 0 ? 'menu-category-section--divided' : ''}`}
                    data-category={slug}
                    data-category-name={category}
                  >
                    <div className="category-section-header">
                      <h2>{category}</h2>
                      <span className="item-count">
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <div className="menu-grid">
                      {items.length === 0 ? (
                        <p className="menu-section-empty">No items in this category.</p>
                      ) : (
                        items.map(item => renderMenuCard(item))
                      )}
                    </div>
                  </section>
                ))}
                <div className="menu-scroll-sentinel" aria-hidden="true" />
              </>
            )}
          </div>
          </div>

          <div id="mobile-logout-bar">
            <button type="button" className="logout-btn-fullwidth" onClick={logoutUser}>
              Log out
            </button>
          </div>
        </main>

        {/* RIGHT: Cart panel (grid column on desktop; drawer on tablet/mobile) */}
        <aside
          className={`cart-panel ${cartDrawerOpen ? 'cart-panel--open' : ''}`}
          role="region"
          aria-label="Shopping cart"
        >
          <div className="cart-panel-header">
            <div className="cart-panel-header-main">
              <h2 className="cart-panel-title">Order — Table {id}</h2>
              {hasCartItems && (
                <div className="cart-panel-header-meta">
                  <span className="cart-panel-count-badge">
                    {cartQty} {cartQty === 1 ? 'item' : 'items'}
                  </span>
                  <label className="cart-select-all">
                    <input
                      type="checkbox"
                      className="cart-order-checkbox"
                      checked={allChecked}
                      onChange={toggleSelectAll}
                    />
                    Select all
                  </label>
                </div>
              )}
            </div>
            <button
              type="button"
              className="cart-panel-close"
              onClick={closeCartDrawer}
              aria-label="Close cart"
            >
              ✕
            </button>
          </div>

          <div className={`cart-rows-scroll ${cartItems.length === 0 ? 'cart-rows-scroll--empty' : ''}`}>
            {cartItems.length === 0 ? (
              <div className="cart-empty">
                <TrayIcon />
                <p className="cart-empty-heading">Cart is empty</p>
                <p className="cart-empty-subtext">Tap + on any item to add it to the order</p>
              </div>
            ) : (
              <ul className="cart-order-list">
                {cartItems.map(item => {
                  const itemNote = item.notes || item.note || item.specialInstructions;
                  return (
                    <li key={item.itemId} className={`cart-order-row ${item.isChecked ? 'cart-order-row--checked' : ''}`}>
                      <div className="cart-order-row-body">
                        <input
                          type="checkbox"
                          className="cart-order-checkbox"
                          checked={item.isChecked}
                          onChange={() => toggleCheck(item.itemId)}
                          aria-label={`Select ${item.name} for kitchen`}
                        />
                        <div className="cart-order-row-info">
                          <span className="cart-order-row-name">{item.name}</span>
                          {itemNote && (
                            <span className="cart-order-row-note">{itemNote}</span>
                          )}
                        </div>
                        <div className="cart-order-row-stepper" aria-label={`Quantity: ${item.qty}`}>
                          <button
                            type="button"
                            className="cart-order-stepper-btn"
                            onClick={() => updateQty(item.itemId, -1)}
                            aria-label={`Decrease ${item.name} quantity`}
                          >
                            −
                          </button>
                          <span className="cart-order-stepper-value">{item.qty}</span>
                          <button
                            type="button"
                            className="cart-order-stepper-btn"
                            onClick={() => updateQty(item.itemId, 1)}
                            aria-label={`Increase ${item.name} quantity`}
                          >
                            +
                          </button>
                        </div>
                        <span className="cart-order-row-total">
                          {formatCartAmount(item.price * item.qty)}
                        </span>
                        <button
                          type="button"
                          className="cart-order-row-remove"
                          onClick={() => removeCartItem(item.itemId)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <TrashIcon className="cart-order-remove-icon" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="cart-panel-footer">
            {hasCartItems && (
              <div className="cart-order-summary">
                {!hasChecked && (
                  <p className="cart-select-hint">Select items to send to kitchen</p>
                )}
                <div className="cart-summary-row">
                  <span className="cart-summary-label">
                    Subtotal{hasChecked ? ` (${checkedItems.length} ${checkedItems.length === 1 ? 'item' : 'items'})` : ''}
                  </span>
                  <span className="cart-summary-value">{formatCartAmount(checkedTotal)}</span>
                </div>
                <div className="cart-summary-row cart-summary-row--total">
                  <span className="cart-summary-label">Total</span>
                  <span className={`cart-summary-value ${checkedTotalPulse ? 'cart-summary-value--pulse' : ''}`}>
                    {formatCartAmount(checkedTotal)}
                  </span>
                </div>
              </div>
            )}

            <textarea
              className="cart-instructions"
              placeholder="Add special instructions…"
              rows={3}
              value={specialInstructions}
              onChange={e => setSpecialInstructions(e.target.value)}
            />

            <button
              type="button"
              className={`send-kot-btn ${hasChecked ? 'send-kot-btn--active' : 'send-kot-btn--inactive'}`}
              disabled={!hasChecked || kotSubmitting}
              onClick={submitKOT}
            >
              {kotSubmitting ? (
                <SpinnerIcon />
              ) : (
                <>
                  <span>Send to Kitchen</span>
                  <SendArrowIcon />
                </>
              )}
            </button>
          </div>
        </aside>

      </div>

      {cartDrawerOpen && (
        <div
          className="cart-drawer-backdrop"
          onClick={closeCartDrawer}
          aria-hidden="true"
        />
      )}

      {/* Tablet: floating cart opener */}
      <button
        type="button"
        className="floating-cart-btn"
        onClick={openCartDrawer}
        aria-label={`Open cart, ${cartQty} items`}
      >
        <span className="floating-cart-btn-icon" aria-hidden="true">🛒</span>
        {cartQty > 0 && (
          <span className={`floating-cart-badge ${cartBadgePop ? 'floating-cart-badge--pop' : ''}`}>
            {cartQty}
          </span>
        )}
      </button>

      {/* Mobile: sticky cart bar */}
      <button
        type="button"
        className="mobile-cart-bar"
        onClick={openCartDrawer}
        aria-label={`View cart, ${cartQty} items, total ₹${cartTotal.toFixed(0)}`}
      >
        <span className="mobile-cart-bar-count">
          {cartQty} {cartQty === 1 ? 'item' : 'items'}
        </span>
        <span className={`mobile-cart-bar-total ${cartTotalPulse ? 'mobile-cart-bar-total--pulse' : ''}`}>
          ₹{cartTotal.toFixed(0)}
        </span>
        <span className="mobile-cart-bar-cta">View cart</span>
      </button>

      {/* ══ Summary Modal ══ */}
      {showSummary && (
        <div className="summary-overlay" onClick={() => setShowSummary(false)}>
          <div className="summary-modal summary-modal--billing" onClick={e => e.stopPropagation()}>
            <div className="summary-modal-header">
              <h3>Order Summary — Table {id}</h3>
              <button type="button" className="summary-close" onClick={() => setShowSummary(false)} aria-label="Close summary">✕</button>
            </div>
            <div className="summary-modal-body summary-modal-body--billing">

              <div className="summary-section">
                <h4 className="summary-section-title">
                  Pending at Kitchen
                  {openKots.length > 0 && <span className="summary-section-count">{openKots.length}</span>}
                </h4>
                {openKots.length === 0 ? (
                  <div className="summary-empty">No pending items</div>
                ) : (
                  <div className="kot-log">
                    {openKots.map((kot, idx) => (
                      <div key={kot?._docId || kot?.id || `open-kot-${idx}`} className="log-kot-card">
                        <div className="log-kot-label">KOT #{(kot._docId || '').slice(-4).toUpperCase()}</div>
                        {kot.items?.map((item, i) => {
                          const isResolved  = ['done', 'removed', 'out_of_stock'].includes(item.status);
                          const isPending   = item.status === 'pending';
                          const hasCancelReq = cancellationRequests.some(r =>
                            r.originalKotId === kot._docId && r.itemId === item.itemId && r.status === 'pending_approval'
                          );
                          const itemKey =
                            (kot?._docId && item?.itemId != null) ? `${kot._docId}:${item.itemId}` : `${kot?._docId || kot?.id || 'kot'}:${i}`;
                          return (
                            <div key={itemKey} className={`log-item-row ${isResolved ? 'resolved-row' : ''}`}>
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

              <div className="summary-section summary-section--consumed">
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
                        <div key={kot?._docId || kot?.id || `cleared-kot-${idx}`} className="log-kot-card">
                          <div className="log-kot-label">KOT #{(kot._docId || '').slice(-4).toUpperCase()}</div>
                          {displayItems.map((item, i) => {
                            const isPartial  = item.status === 'partially_removed';
                            const isRemoved  = item.status === 'removed_entirely';
                            const effQty     = isPartial ? (item.finalQty ?? 0) : item.qty;
                            const displayQty = isRemoved ? item.qty : isPartial ? effQty : item.qty;
                            const note       = partialRemovalCaption(item);
                            const itemKey =
                              (kot?._docId && item?.itemId != null) ? `${kot._docId}:${item.itemId}` : `${kot?._docId || kot?.id || 'kot'}:${i}`;
                            return (
                              <div key={itemKey} className={`log-item-row${isRemoved ? ' removed-entirely-row' : ''}`}>
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
                {!pendingBillRemovalRequest ? (
                  <button
                    type="button"
                    className="topbar-btn topbar-btn--warn summary-removal-btn"
                    onClick={() => {
                      setShowSummary(false);
                      openRemovalModal();
                    }}
                  >
                    Request Removal
                  </button>
                ) : (
                  <p className="summary-removal-pending">Removal request pending manager approval…</p>
                )}
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

                <div className="summary-wa-block">
                  <label className="wa-field-label" htmlFor="summary-wa-phone">
                    Customer WhatsApp number <span className="wa-required">*</span>
                  </label>
                  <MaskedPhoneInput
                    id="summary-wa-phone"
                    value={waCustomerPhone}
                    onChange={setWaCustomerPhone}
                  />
                  <p className="wa-field-hint">10-digit mobile (91 added automatically). Shown as asterisks only.</p>
                  {waMessage && (
                    <div className="wa-modal-feedback err">{waMessage}</div>
                  )}
                  <button
                    type="button"
                    className="summary-wa-send-btn"
                    disabled={!waPhoneReady}
                    onClick={handleSendBillOnWhatsApp}
                  >
                    Send Bill on WhatsApp
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Item Removal Request Modal ══ */}
      {showRemovalModal && (
        <div className="summary-overlay" onClick={() => setShowRemovalModal(false)}>
          <div className="summary-modal summary-modal--removal" onClick={e => e.stopPropagation()}>
            <div className="summary-modal-header">
              <h3>Request Item Removal from Bill</h3>
              <button type="button" className="summary-close" onClick={() => setShowRemovalModal(false)} aria-label="Close removal request">✕</button>
            </div>
            <div className="summary-modal-body summary-modal-body--removal">
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>
                Select items to remove. Bill is <strong>not</strong> changed until the manager approves.
              </p>
              {removalSelections.length === 0 ? (
                <div className="summary-empty">No billable consumed items available for removal.</div>
              ) : (
                <div className="removal-items-list">
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
                </div>
              )}
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
                <div style={{ marginTop: '0.5rem', padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-sm)', background: removalMessage.includes('sent') ? 'var(--color-success-bg)' : 'var(--color-danger-bg)', color: removalMessage.includes('sent') ? 'var(--color-success)' : 'var(--color-danger)', fontSize: '0.82rem' }}>
                  {removalMessage}
                </div>
              )}
            </div>
            <div className="removal-modal-footer">
              <button
                onClick={() => setShowRemovalModal(false)}
                className="removal-modal-btn removal-modal-btn--secondary"
              >
                Cancel
              </button>
              <button
                onClick={submitRemovalRequest}
                disabled={removalSubmitting}
                className="removal-modal-btn removal-modal-btn--primary"
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
        <div className="rcpt-divider" />
        <div className="rcpt-items">
          <div className="rcpt-items-header">
            <span className="rcpt-col-name">Item</span>
            <span className="rcpt-col-qty">Qty</span>
            <span className="rcpt-col-amt">Amount</span>
          </div>
          {combinedConsumedItems.map((item, idx) => (
            <div key={`${item?.kotId ?? ''}:${item?.itemId ?? item?.name ?? 'item'}:${idx}`} className="rcpt-item-row">
              <span className="rcpt-col-name">{item.name}</span>
              <span className="rcpt-col-qty">{item.qty}</span>
              <span className="rcpt-col-amt">₹{(item.qty * item.price).toFixed(2)}</span>
            </div>
          ))}
        </div>
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
