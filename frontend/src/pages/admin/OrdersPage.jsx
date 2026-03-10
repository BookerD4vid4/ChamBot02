import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Search, RefreshCw, X, Phone, MapPin, ShoppingBag,
    ChevronRight, CheckCircle2, Truck, Clock, XCircle,
    Calendar
} from 'lucide-react';
import { getAdminOrders, getAdminOrderById, updateOrderStatus } from '../../api';
import toast from 'react-hot-toast';
import { useAdmin } from './AdminLayout';
import './OrdersPage.css';

const fmtPrice = (p) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(p || 0);

const fmtDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('th-TH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// ─── Status definitions (matches order_status ENUM in SCHEMA.sql) ───────────
const STATUS = {
    pending:   { th: 'รอยืนยัน',        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: <Clock size={13} /> },
    shipping:  { th: 'กำลังจัดส่ง',     color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  icon: <Truck size={13} /> },
    completed: { th: 'จัดส่งสำเร็จ',    color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: <CheckCircle2 size={13} /> },
    cancelled: { th: 'ยกเลิกออร์เดอร์', color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: <XCircle size={13} /> },
};

// All changeable statuses for admin dropdown
const CHANGEABLE_STATUSES = ['pending', 'shipping', 'completed', 'cancelled'];

// Quick card actions (simplified for card view only)
const QUICK_NEXT = {
    pending:   [{ to: 'shipping',  label: '🛵 จัดส่ง',       primary: true }],
    shipping:  [{ to: 'completed', label: '✅ จัดส่งสำเร็จ', primary: true }],
    completed: [],
    cancelled: [],
};

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const s = STATUS[status] || { th: status, color: '#6b7280', bg: 'rgba(107,114,128,0.1)', icon: null };
    return (
        <span className="ord-status-badge" style={{ color: s.color, background: s.bg, borderColor: s.color + '33' }}>
            {s.icon} {s.th}
        </span>
    );
}

// ─── Order Detail Drawer ───────────────────────────────────────────────────────
function OrderDrawer({ orderId, onClose, onUpdated, focusNote = false }) {
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState('');
    const [note, setNote] = useState('');
    const noteRef = useRef(null);

    const load = useCallback(() => {
        setLoading(true);
        getAdminOrderById(orderId)
            .then(r => setDetail(r.data.data))
            .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
            .finally(() => setLoading(false));
    }, [orderId]);

    useEffect(() => { load(); }, [load]);

    // Auto-focus note field when opened via cancel button
    useEffect(() => {
        if (focusNote && noteRef.current) {
            setTimeout(() => {
                noteRef.current?.focus();
                noteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 400);
        }
    }, [focusNote, loading]);

    const doUpdate = async (toStatus, requireNote = false) => {
        // Cancel requires a note
        if (requireNote && !note.trim()) {
            toast.error('กรุณาระบุหมายเหตุการยกเลิก');
            return;
        }
        setUpdating(toStatus);
        try {
            await updateOrderStatus(orderId, { status: toStatus, note: note.trim() || undefined });
            toast.success(`อัปเดตเป็น "${STATUS[toStatus]?.th || toStatus}" แล้ว`);
            setNote('');
            load();
            onUpdated();
        } catch (err) {
            toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
        } finally { setUpdating(''); }
    };

    const d = detail;
    const address = d?.shipment?.address_line || d?.shipment?.recipient_name || '—';
    const recipientName = d?.shipment?.recipient_name;

    return (
        <div className="ord-drawer-overlay" onClick={onClose}>
            <div className="ord-drawer" onClick={e => e.stopPropagation()}>
                {/* Drawer header */}
                <div className="ord-drawer-header">
                    <div>
                        <div className="ord-drawer-title">คำสั่งซื้อ #{orderId}</div>
                        {d && <StatusBadge status={d.status} />}
                    </div>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                {loading ? (
                    <div style={{ padding: 24 }}>
                        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 10 }} />)}
                    </div>
                ) : d ? (
                    <div className="ord-drawer-body">

                        {/* ── Customer & Address ── */}
                        <div className="ord-info-block">
                            <div className="ord-info-row">
                                <Phone size={14} className="ord-info-icon" />
                                <div>
                                    <div className="ord-info-label">ลูกค้า</div>
                                    <div className="ord-info-val">{d.customer_name || 'ไม่ระบุชื่อ'}</div>
                                </div>
                                {d.customer_phone && (
                                    <a href={`tel:${d.customer_phone}`} className="ord-call-btn">
                                        <Phone size={14} /> {d.customer_phone}
                                    </a>
                                )}
                            </div>
                            <div className="ord-info-row">
                                <MapPin size={14} className="ord-info-icon" />
                                <div>
                                    <div className="ord-info-label">ที่อยู่จัดส่ง</div>
                                    <div className="ord-info-val">
                                        {recipientName && <span style={{ fontWeight: 600 }}>{recipientName} · </span>}
                                        {address}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Items ── */}
                        <div className="ord-section">
                            <div className="ord-section-title"><ShoppingBag size={14} /> สินค้า</div>
                            <div className="ord-items-list">
                                {(d.items || []).map((item, i) => (
                                    <div key={i} className="ord-item-row">
                                        {item.image_url && <img src={item.image_url} alt="" className="ord-item-img" />}
                                        <div className="ord-item-name">{item.product_name}</div>
                                        <div className="ord-item-qty">×{item.quantity}</div>
                                        <div className="ord-item-price">{fmtPrice(item.price * item.quantity)}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="ord-total-row">
                                <span>ยอดรวม</span>
                                <span className="ord-total-val">{fmtPrice(d.total_amount)}</span>
                            </div>
                        </div>

                        {/* ── Timeline ── */}
                        {(d.timeline || []).length > 0 && (
                            <div className="ord-section">
                                <div className="ord-section-title"><Clock size={14} /> ประวัติ</div>
                                <div className="ord-timeline">
                                    {[...d.timeline].reverse().map((t, i) => (
                                        <div key={i} className="ord-tl-item">
                                            <div className="ord-tl-dot" style={{ background: STATUS[t.status]?.color || '#6b7280' }} />
                                            <div className="ord-tl-content">
                                                <StatusBadge status={t.status} />
                                                {t.note && <span className="ord-tl-note">{t.note}</span>}
                                                <span className="ord-tl-time">{fmtDate(t.created_at)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Status Update (Free Dropdown) ── */}
                        {d.status === 'delivered' ? (
                            <div className="ord-section" style={{ textAlign: 'center', padding: '16px', background: 'rgba(16,185,129,0.07)', borderRadius: 10, border: '1px solid rgba(16,185,129,0.2)' }}>
                                <CheckCircle2 size={20} style={{ color: '#10b981', marginBottom: 4 }} />
                                <div style={{ color: '#10b981', fontWeight: 600 }}>ส่งถึงปลายทางแล้ว</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>ไม่สามารถเปลี่ยนสถานะได้อีก</div>
                            </div>
                        ) : (
                            <div className="ord-section ord-actions-section">
                                <div className="ord-section-title"><ChevronRight size={14} /> เปลี่ยนสถานะ (Admin)</div>
                                <select
                                    className="input-field"
                                    style={{ marginBottom: 10, fontSize: 13 }}
                                    value={updating || d.status}
                                    disabled={!!updating}
                                    onChange={e => {
                                        const newStatus = e.target.value;
                                        if (newStatus === d.status) return;
                                        if (newStatus === 'cancelled' && !note.trim()) {
                                            toast.error('กรุณาระบุหมายเหตุการยกเลิกด้านล่างก่อน');
                                            noteRef.current?.focus();
                                            return;
                                        }
                                        doUpdate(newStatus, newStatus === 'cancelled');
                                    }}
                                >
                                    {CHANGEABLE_STATUSES.map(s => (
                                        <option key={s} value={s}>
                                            {STATUS[s]?.th || s}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    ref={noteRef}
                                    className="input-field"
                                    style={{ marginBottom: 10, fontSize: 13 }}
                                    placeholder="หมายเหตุ (บังคับสำหรับการยกเลิก)"
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                />
                                <div className="ord-action-btns">
                                    <button
                                        className="btn btn-danger ord-action-btn"
                                        onClick={() => doUpdate('cancelled', true)}
                                        disabled={!!updating}
                                    >
                                        {updating === 'cancelled'
                                            ? <div className="spinner" style={{ width: 16, height: 16 }} />
                                            : '✖ ยกเลิกคำสั่งซื้อ'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

// ─── Order Card ────────────────────────────────────────────────────────────────
function OrderCard({ order, onOpen, onQuickUpdate }) {
    const s = STATUS[order.status] || STATUS.pending;
    const nextActions = QUICK_NEXT[order.status] || [];
    const [updating, setUpdating] = useState('');

    const doQuick = async (e, toStatus, requireNote = false) => {
        e.stopPropagation();
        if (requireNote) {
            // Open drawer and signal to focus/highlight the note field
            onOpen({ id: order.order_id, focusNote: true });
            return;
        }
        setUpdating(toStatus);
        try {
            await updateOrderStatus(order.order_id, { status: toStatus });
            toast.success(`#${order.order_id} → ${STATUS[toStatus]?.th}`);
            onQuickUpdate();
        } catch (err) {
            toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
        } finally { setUpdating(''); }
    };

    return (
        <div className="ord-card" style={{ borderLeftColor: s.color }} onClick={() => onOpen({ id: order.order_id })}>
            {/* Top row */}
            <div className="ord-card-top">
                <div className="ord-card-id">#{order.order_id}</div>
                <StatusBadge status={order.status} />
                <div className="ord-card-time">{fmtDate(order.created_at)}</div>
            </div>

            {/* Customer */}
            <div className="ord-card-customer">
                <Phone size={12} style={{ opacity: 0.5 }} />
                <span>{order.customer_name || 'ไม่ระบุชื่อ'}</span>
                {order.customer_phone && (
                    <a href={`tel:${order.customer_phone}`} className="ord-card-call" onClick={e => e.stopPropagation()}>
                        โทร
                    </a>
                )}
            </div>

            {/* Amount + tracking */}
            <div className="ord-card-meta">
                <span className="ord-card-amount">{fmtPrice(order.total_amount)}</span>
                {order.tracking_number && (
                    <code className="tracking-code">{order.tracking_number}</code>
                )}
            </div>

            {/* Cancel info for cancelled orders */}
            {order.status === 'cancelled' && (order.cancel_note || order.cancelled_by) && (
                <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6,
                }}>
                    {order.cancel_note && (
                        <div><span style={{ color: 'rgba(239,68,68,0.8)', fontWeight: 600 }}>เหตุผล: </span>{order.cancel_note}</div>
                    )}
                    {order.cancelled_by && (
                        <div style={{ color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                            ยกเลิกโดย: {order.cancel_by_name || order.cancel_by_phone || order.cancelled_by}
                        </div>
                    )}
                </div>
            )}

            {/* Quick action buttons */}
            {nextActions.length > 0 && (
                <div className="ord-card-actions" onClick={e => e.stopPropagation()}>
                    {nextActions.map(act => (
                        <button
                            key={act.to}
                            className={`btn ${act.to === 'cancelled'
                                ? 'btn-danger'
                                : act.primary ? 'btn-primary' : 'btn-secondary'
                                } btn-sm ord-quick-btn`}
                            onClick={e => doQuick(e, act.to, act.requireNote)}
                            disabled={!!updating}
                        >
                            {updating === act.to
                                ? <div className="spinner" style={{ width: 13, height: 13 }} />
                                : act.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="ord-card-detail-hint">กดดูรายละเอียด →</div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
// Schema-valid statuses only
const STATUS_TABS = ['', 'pending', 'shipped', 'delivered', 'cancelled'];
const STATUS_TAB_LABELS = { '': 'ทั้งหมด', ...Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.th])) };

export default function OrdersPage() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [drawerOrderId, setDrawerOrderId] = useState(null);
    const [showDateFilter, setShowDateFilter] = useState(false);
    const LIMIT = 20;
    const searchTimer = useRef(null);
    
    // Fetch function from AdminContext to trigger badge updates if order cancel/shipment changes stock
    const { fetchLowStock } = useAdmin();

    const fetchOrders = useCallback(async (q = search) => {
        setLoading(true);
        try {
            const params = { page, limit: LIMIT };
            if (statusFilter) params.status = statusFilter;
            if (q) params.search = q;
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
            const res = await getAdminOrders(params);
            setOrders(res.data.data || []);
            setTotal(res.data.total || 0);
        } catch { }
        finally { setLoading(false); }
    }, [statusFilter, page, dateFrom, dateTo, search]);

    const handleSearch = (val) => {
        setSearch(val);
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => fetchOrders(val), 400);
    };

    useEffect(() => { fetchOrders(); }, [statusFilter, page, dateFrom, dateTo]);

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div>
            {drawerOrderId && (
                <OrderDrawer
                    orderId={drawerOrderId.id}
                    focusNote={drawerOrderId.focusNote || false}
                    onClose={() => setDrawerOrderId(null)}
                    onUpdated={() => { fetchOrders(); fetchLowStock(); }}
                />
            )}

            {/* ── Page Header ── */}
            <div className="admin-page-header">
                <div>
                    <h1 className="admin-page-title">คำสั่งซื้อ</h1>
                    <p className="admin-page-subtitle">{total} รายการ</p>
                </div>
                <div className="ord-toolbar">
                    <div className="admin-search-wrap">
                        <Search size={14} />
                        <input
                            value={search}
                            onChange={e => handleSearch(e.target.value)}
                            placeholder="ค้นหา ชื่อ / #Order..."
                            className="admin-search-input"
                        />
                    </div>
                    <button className={`btn btn-secondary btn-sm ${showDateFilter ? 'ord-filter-active' : ''}`}
                        onClick={() => setShowDateFilter(v => !v)}>
                        <Calendar size={14} /> วันที่
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => fetchOrders()}>
                        <RefreshCw size={14} />
                    </button>
                    {(search || dateFrom || dateTo) && (
                        <button className="btn btn-secondary btn-sm" onClick={() => {
                            setSearch(''); setDateFrom(''); setDateTo(''); setPage(1);
                        }}>
                            <X size={14} /> ล้าง
                        </button>
                    )}
                </div>
            </div>

            {/* Date range (collapsible) */}
            {showDateFilter && (
                <div className="ord-date-bar">
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ตั้งแต่</span>
                    <input type="date" className="orders-date-input" value={dateFrom}
                        onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>ถึง</span>
                    <input type="date" className="orders-date-input" value={dateTo}
                        onChange={e => { setDateTo(e.target.value); setPage(1); }} />
                </div>
            )}

            {/* ── Status Tabs ── */}
            <div className="ord-tabs">
                {STATUS_TABS.map(s => (
                    <button
                        key={s}
                        className={`ord-tab ${statusFilter === s ? 'ord-tab-active' : ''}`}
                        style={statusFilter === s && s ? { borderBottomColor: STATUS[s]?.color, color: STATUS[s]?.color } : {}}
                        onClick={() => { setStatusFilter(s); setPage(1); }}
                    >
                        {STATUS_TAB_LABELS[s] || s}
                    </button>
                ))}
            </div>

            {/* ── Cards Grid ── */}
            {loading ? (
                <div className="ord-grid">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="skeleton" style={{ height: 160, borderRadius: 16 }} />
                    ))}
                </div>
            ) : orders.length === 0 ? (
                <div className="ord-empty">
                    <ShoppingBag size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                    <p>ไม่พบคำสั่งซื้อ</p>
                </div>
            ) : (
                <div className="ord-grid">
                    {orders.map(o => (
                        <OrderCard
                            key={o.order_id}
                            order={o}
                            onOpen={setDrawerOrderId}
                            onQuickUpdate={() => { fetchOrders(); fetchLowStock(); }}
                        />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="ord-pagination">
                    <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← ก่อนหน้า</button>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{page} / {totalPages}</span>
                    <button className="btn btn-secondary btn-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>ถัดไป →</button>
                </div>
            )}
        </div>
    );
}
