import React, { useState, useEffect, useCallback } from 'react';
import {
    Search, RotateCcw, AlertTriangle, TrendingDown, TrendingUp,
    X, Minus, Plus, Layers, Package, History, CheckSquare, Square,
    PackageX, Filter
} from 'lucide-react';
import { getAllVariants, adjustStock, getCategories, getStockHistory } from '../../api';
import ProductImage from '../../components/ProductImage';
import toast from 'react-hot-toast';
import { useAdmin } from './AdminLayout';
import './StockPage.css';

/* ─── Helpers ────────────────────────────────────────────── */
const stockLevel = (qty, threshold) => {
    if (qty === 0) return 'empty';
    if (qty <= threshold) return 'low';
    return 'ok';
};

const StockBadge = ({ qty, threshold }) => {
    const level = stockLevel(qty, threshold);
    const cfg = {
        ok: { cls: 'badge badge-green', label: qty },
        low: { cls: 'badge badge-orange', label: `${qty} ⚠` },
        empty: { cls: 'badge badge-red', label: '0 (หมด)' },
    };
    return <span className={cfg[level].cls}>{cfg[level].label}</span>;
};

const REASONS = [
    { value: 'restock', label: '📦 รับสินค้าเข้า (Restock)', sign: 'positive' },
    { value: 'adjustment', label: '🔧 ปรับปรุงสต็อก (Adjustment)', sign: 'any' },
    { value: 'lost', label: '❌ สูญหาย / ชำรุด (Loss)', sign: 'negative' },
    { value: 'return', label: '↩️ รับคืนจากลูกค้า (Return)', sign: 'positive' },
    { value: 'sale_correction', label: '🛒 แก้ไขจากการขาย (Sale Fix)', sign: 'any' },
];

const formatDate = (d) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/* ─── History Drawer ─────────────────────────────────────── */
const HistoryDrawer = ({ variant, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getStockHistory(variant.variant_id)
            .then(r => setHistory(r.data.data || []))
            .catch(() => toast.error('โหลดประวัติไม่สำเร็จ'))
            .finally(() => setLoading(false));
    }, [variant.variant_id]);

    return (
        <div className="history-drawer-overlay" onClick={onClose}>
            <div className="history-drawer" onClick={e => e.stopPropagation()}>
                <div className="history-drawer-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <History size={18} style={{ color: 'var(--accent)' }} />
                        <div>
                            <div className="history-drawer-title">ประวัติสต็อก</div>
                            <div className="history-drawer-sub">{variant.product_name} · {variant.sku}</div>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="history-drawer-body">
                    {loading ? (
                        [...Array(5)].map((_, i) => (
                            <div key={i} className="skeleton" style={{ height: 58, borderRadius: 10, marginBottom: 8 }} />
                        ))
                    ) : history.length === 0 ? (
                        <div className="history-empty">
                            <History size={36} />
                            <p>ยังไม่มีประวัติการปรับสต็อก</p>
                        </div>
                    ) : (
                        history.map(h => (
                            <div key={h.id} className={`history-item ${h.quantity_change >= 0 ? 'pos' : 'neg'}`}>
                                <div className={`history-delta ${h.quantity_change >= 0 ? 'pos' : 'neg'}`}>
                                    {h.quantity_change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    {h.quantity_change >= 0 ? '+' : ''}{h.quantity_change}
                                </div>
                                <div className="history-info">
                                    <div className="history-notes">{h.notes || h.transaction_type}</div>
                                    <div className="history-meta">
                                        {h.quantity_before} → {h.quantity_after} · {formatDate(h.created_at)}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

/* ─── Adjust Modal (single item) ────────────────────── */
const AdjustModal = ({ variant, onClose, onSuccess }) => {
    const [delta, setDelta] = useState(0);
    const [reason, setReason] = useState('restock');
    const [saving, setSaving] = useState(false);
    const [summaryResult, setSummaryResult] = useState(null);
    const [deltaError, setDeltaError] = useState(''); // validation error

    const handleSave = async () => {
        // ★ UAT: Delta = 0 must be blocked with validation error — no API call
        if (delta === 0) {
            setDeltaError('กรุณาระบุจำนวนที่ต้องการปรับ (ต้องไม่ใช่ 0)');
            return; // ★ no API call made
        }
        setDeltaError('');
        setSaving(true);
        const reasonLabel = REASONS.find(r => r.value === reason)?.label || reason;
        try {
            await adjustStock(variant.variant_id, delta, reasonLabel);
            setSummaryResult([{
                product_name: variant.product_name,
                sku: variant.sku,
                before: variant.stock_quantity ?? 0,
                delta,
                after: Math.max(0, (variant.stock_quantity ?? 0) + delta),
                ok: true,
            }]);
            onSuccess();
        } catch {
            setSummaryResult([{
                product_name: variant.product_name,
                sku: variant.sku,
                before: variant.stock_quantity ?? 0,
                delta,
                after: null,
                ok: false,
            }]);
        } finally {
            setSaving(false);
        }
    };

    if (summaryResult) {
        return <SummaryModal results={summaryResult} onClose={onClose} />;
    }

    const newQty = Math.max(0, (variant.stock_quantity ?? 0) + delta);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box stock-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="stock-modal-title">
                        <Layers size={18} style={{ color: 'var(--accent)' }} />
                        <h2>ปรับสต็อก</h2>
                    </div>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>

                <div className="modal-body">
                    {/* Product Info */}
                    <div className="stock-modal-info">
                        <div className="stock-modal-img">
                            <ProductImage src={variant.image_url} alt={variant.product_name} size={22} />
                        </div>
                        <div>
                            <p className="stock-modal-name">{variant.product_name}</p>
                            <p className="stock-modal-sku">{variant.sku}{variant.unit ? ` · ${variant.unit}` : ''}</p>
                        </div>
                    </div>

                    {/* Before → After */}
                    <div className="stock-qty-summary">
                        <div className="stock-qty-item">
                            <span className="stock-qty-label">สต็อกปัจจุบัน</span>
                            <span className="stock-qty-value">{variant.stock_quantity ?? 0}</span>
                        </div>
                        <div className="stock-qty-arrow">→</div>
                        <div className="stock-qty-item">
                            <span className="stock-qty-label">หลังปรับ</span>
                            <span className={`stock-qty-value ${newQty !== variant.stock_quantity ? 'changed' : ''}`}>{newQty}</span>
                        </div>
                    </div>

                    {/* Reason */}
                    <div className="input-group">
                        <label className="input-label" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>เหตุผล (Reason)</label>
                        <select className="input-field" value={reason} onChange={e => setReason(e.target.value)}>
                            {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>

                    {/* Delta Input */}
                    <div className="stock-delta-row">
                        <button type="button" className="btn btn-secondary stock-delta-btn"
                            onClick={() => { setDelta(d => d - 1); setDeltaError(''); }}><Minus size={16} /></button>
                        <input type="number" className="input-field stock-delta-input"
                            style={deltaError ? { borderColor: 'rgba(239,68,68,0.7)', boxShadow: '0 0 0 2px rgba(239,68,68,0.15)' } : {}}
                            value={delta}
                            onChange={e => { setDelta(Number(e.target.value)); setDeltaError(''); }} />
                        <button type="button" className="btn btn-secondary stock-delta-btn"
                            onClick={() => { setDelta(d => d + 1); setDeltaError(''); }}><Plus size={16} /></button>
                    </div>
                    {deltaError && (
                        <div style={{
                            marginTop: -6, marginBottom: 8, fontSize: 12, color: '#f87171',
                            display: 'flex', alignItems: 'center', gap: 5,
                        }}>
                            <AlertTriangle size={12} /> {deltaError}
                        </div>
                    )}

                    {/* Quick Presets */}
                    <div className="stock-preset-section">
                        <div className="stock-preset-label">Quick + Add</div>
                        <div className="stock-preset-row">
                            {[1, 5, 10, 20, 50, 100].map(n => (
                                <button key={n} type="button" className="btn btn-outline btn-sm" onClick={() => setDelta(n)}>+{n}</button>
                            ))}
                        </div>
                        <div className="stock-preset-label" style={{ marginTop: 8 }}>Quick Remove</div>
                        <div className="stock-preset-row">
                            {[-1, -5, -10].map(n => (
                                <button key={n} type="button" className="btn btn-outline btn-sm stock-preset-minus"
                                    onClick={() => setDelta(n)}>{n}</button>
                            ))}
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
                        <button type="button"
                            className={`btn ${delta > 0 ? 'btn-primary' : delta < 0 ? 'btn-danger' : 'btn-secondary'}`}
                            onClick={handleSave} disabled={saving}>
                            {saving
                                ? <div className="spinner" style={{ width: 16, height: 16 }} />
                                : delta >= 0
                                    ? <><TrendingUp size={15} /> บันทึก (+{delta})</>
                                    : <><TrendingDown size={15} /> บันทึก ({delta})</>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

/* ─── Summary Modal (shown after save) ──────────────────── */
const SummaryModal = ({ results, onClose }) => {
    const succeeded = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box summary-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header" style={{ padding: '22px 28px 18px' }}>
                    <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                        {failed.length === 0 ? '✅ บันทึกสำเร็จทั้งหมด' : `⚠️ บันทึกแล้ว ${succeeded.length}/${results.length} รายการ`}
                    </h2>
                    <button className="modal-close" onClick={onClose}><X size={22} /></button>
                </div>
                <div className="modal-body" style={{ padding: '0 28px 8px', maxHeight: '60vh', overflowY: 'auto' }}>
                    <table className="data-table" style={{ fontSize: 14 }}>
                        <thead>
                            <tr>
                                <th>สินค้า</th>
                                <th style={{ textAlign: 'center' }}>ก่อน</th>
                                <th style={{ textAlign: 'center' }}>ปรับ</th>
                                <th style={{ textAlign: 'center' }}>หลัง</th>
                                <th style={{ textAlign: 'center' }}>ผลลัพธ์</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((r, i) => (
                                <tr key={i}>
                                    <td>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{r.product_name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{r.sku}</div>
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.before}</td>
                                    <td style={{
                                        textAlign: 'center', fontWeight: 800,
                                        color: r.delta > 0 ? '#4ade80' : r.delta < 0 ? '#f87171' : 'var(--text-muted)'
                                    }}>
                                        {r.delta > 0 ? `+${r.delta}` : r.delta}
                                    </td>
                                    <td style={{
                                        textAlign: 'center', fontWeight: 800,
                                        color: r.ok ? 'rgba(255,255,255,0.9)' : '#f87171'
                                    }}>
                                        {r.ok ? r.after : '—'}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {r.ok
                                            ? <span className="badge badge-green">สำเร็จ</span>
                                            : <span className="badge badge-red">ผิดพลาด</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="modal-footer" style={{ padding: '16px 28px 22px' }}>
                    <button className="btn btn-primary" style={{ minHeight: 48, fontSize: 16, flex: 1 }}
                        onClick={onClose}>ปิด</button>
                </div>
            </div>
        </div>
    );
};

/* ─── Bulk Adjust Modal (per-item editing) ────────────── */
const BulkModal = ({ selected, onClose, onSuccess }) => {
    // deltas[variant_id] = number
    const [deltas, setDeltas] = useState(() => {
        const init = {};
        selected.forEach(v => { init[v.variant_id] = 0; });
        return init;
    });
    const [reason, setReason] = useState('restock');
    const [saving, setSaving] = useState(false);
    const [summaryResults, setSummaryResults] = useState(null);

    const affectedCount = Object.values(deltas).filter(d => d !== 0).length;

    // Quick-set all items the same delta
    const applyAll = (d) => {
        const next = {};
        selected.forEach(v => { next[v.variant_id] = d; });
        setDeltas(next);
    };

    const handleSave = async () => {
        // ★ UAT: all deltas = 0 must be blocked — no API call
        if (affectedCount === 0) {
            toast.error('กรุณาระบุจำนวนที่ต้องการปรับอย่างน้อย 1 รายการ');
            return; // no API call
        }
        setSaving(true);
        const reasonLabel = REASONS.find(r => r.value === reason)?.label || reason;
        const results = [];
        await Promise.all(
            selected.map(async v => {
                const d = deltas[v.variant_id] ?? 0;
                if (d === 0) {
                    results.push({ product_name: v.product_name, sku: v.sku, before: v.stock_quantity, delta: 0, after: v.stock_quantity, ok: true });
                    return;
                }
                try {
                    await adjustStock(v.variant_id, d, reasonLabel);
                    results.push({ product_name: v.product_name, sku: v.sku, before: v.stock_quantity, delta: d, after: Math.max(0, (v.stock_quantity ?? 0) + d), ok: true });
                } catch {
                    results.push({ product_name: v.product_name, sku: v.sku, before: v.stock_quantity, delta: d, after: null, ok: false });
                }
            })
        );
        setSaving(false);
        setSummaryResults(results.filter(r => r.delta !== 0));
        onSuccess();
    };

    if (summaryResults) {
        return <SummaryModal results={summaryResults} onClose={onClose} />;
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box bulk-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header" style={{ padding: '20px 24px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <CheckSquare size={20} style={{ color: 'var(--accent)' }} />
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                            ปรับสต็อก {selected.length} รายการ
                        </h2>
                    </div>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="modal-body" style={{ padding: '0 24px 8px' }}>
                    {/* Reason */}
                    <div className="input-group" style={{ marginBottom: 14 }}>
                        <label className="input-label">เหตุผลการปรับสต็อก</label>
                        <select className="input-field" value={reason} onChange={e => setReason(e.target.value)}>
                            {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>

                    {/* Quick Apply All */}
                    <div style={{ marginBottom: 14 }}>
                        <div className="stock-preset-label" style={{ marginBottom: 6 }}>ปรับทุกรายการพร้อมกัน</div>
                        <div className="stock-preset-row" style={{ flexWrap: 'wrap' }}>
                            {[1, 5, 10, 20, 50, 100].map(n => (
                                <button key={n} type="button" className="btn btn-outline btn-sm" onClick={() => applyAll(n)}>+{n}</button>
                            ))}
                            {[-1, -5, -10].map(n => (
                                <button key={n} type="button" className="btn btn-outline btn-sm stock-preset-minus" onClick={() => applyAll(n)}>{n}</button>
                            ))}
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyAll(0)}>รีเซ็ตทั้งหมด</button>
                        </div>
                    </div>

                    {/* Per-item table */}
                    <div style={{ maxHeight: '50vh', overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(170,93,198,0.12)' }}>
                        <table className="data-table" style={{ fontSize: 14 }}>
                            <thead>
                                <tr>
                                    <th>สินค้า</th>
                                    <th style={{ textAlign: 'center', width: 90 }}>สต็อกปัจจุบัน</th>
                                    <th style={{ textAlign: 'center', width: 160 }}>ปรับจำนวน</th>
                                    <th style={{ textAlign: 'center', width: 100 }}>หลังปรับ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selected.map(v => {
                                    const d = deltas[v.variant_id] ?? 0;
                                    const after = Math.max(0, (v.stock_quantity ?? 0) + d);
                                    return (
                                        <tr key={v.variant_id} style={{ background: d !== 0 ? 'rgba(170,93,198,0.06)' : undefined }}>
                                            <td>
                                                <div style={{ fontWeight: 700, fontSize: 14 }}>{v.product_name}</div>
                                                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{v.sku}</div>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 16 }}>
                                                {v.stock_quantity ?? 0}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                                    <button type="button" className="threshold-btn"
                                                        onClick={() => setDeltas(prev => ({ ...prev, [v.variant_id]: (prev[v.variant_id] ?? 0) - 1 }))}>−</button>
                                                    <input
                                                        type="number"
                                                        value={d}
                                                        onChange={e => setDeltas(prev => ({ ...prev, [v.variant_id]: Number(e.target.value) }))}
                                                        style={{ width: 64, textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(170,93,198,0.2)', borderRadius: 8, color: d > 0 ? '#4ade80' : d < 0 ? '#f87171' : 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: 700, padding: '4px 0', fontFamily: 'inherit' }}
                                                    />
                                                    <button type="button" className="threshold-btn"
                                                        onClick={() => setDeltas(prev => ({ ...prev, [v.variant_id]: (prev[v.variant_id] ?? 0) + 1 }))}>+</button>
                                                </div>
                                            </td>
                                            <td style={{
                                                textAlign: 'center', fontWeight: 800, fontSize: 16,
                                                color: d > 0 ? '#4ade80' : d < 0 ? '#f87171' : 'rgba(255,255,255,0.5)'
                                            }}>
                                                {after}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="modal-footer" style={{ padding: '16px 24px 22px', gap: 12 }}>
                    <button className="btn btn-secondary" style={{ minHeight: 48, fontSize: 15 }}
                        onClick={onClose}>ยกเลิก</button>
                    <button
                        className={`btn ${affectedCount > 0 ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ minHeight: 48, fontSize: 15, flex: 1, gap: 8 }}
                        onClick={handleSave}
                        disabled={saving || affectedCount === 0}>
                        {saving
                            ? <><div className="spinner" style={{ width: 18, height: 18 }} /> กำลังบันทึก...</>
                            : <>{affectedCount > 0 ? `💾 บันทึก ${affectedCount} รายการ` : 'กรุณาระบุจำนวน'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ─── Main Page ─────────────────────────────────────────── */
const StockPage = () => {
    const [variants, setVariants] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterLow, setFilterLow] = useState(false);
    const [filterCategory, setFilterCategory] = useState('');
    const [adjustTarget, setAdjustTarget] = useState(null);
    const [historyTarget, setHistoryTarget] = useState(null);
    const [selected, setSelected] = useState(new Set());
    const [bulkOpen, setBulkOpen] = useState(false);
    
    // Fetch function from AdminContext to trigger badge updates
    const { fetchLowStock } = useAdmin();

    const fetchVariants = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filterCategory) params.category = filterCategory;
            const res = await getAllVariants(params);
            setVariants(res.data.data || []);
        } catch {
            toast.error('โหลดข้อมูลไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    }, [filterCategory]);

    useEffect(() => {
        getCategories().then(r => setCategories(r.data.data || [])).catch(() => { });
    }, []);

    useEffect(() => {
        fetchVariants();
        setSelected(new Set());
    }, [fetchVariants]);

    const filtered = variants.filter(v => {
        const q = search.toLowerCase();
        const matchSearch =
            (v.product_name || '').toLowerCase().includes(q) ||
            (v.sku || '').toLowerCase().includes(q);
        const matchLow = !filterLow || stockLevel(v.stock_quantity, v.low_stock_threshold) !== 'ok';
        return matchSearch && matchLow;
    });

    // Stats
    const totalSku = variants.length;
    const outOfStock = variants.filter(v => v.stock_quantity === 0).length;
    const lowStock = variants.filter(v => stockLevel(v.stock_quantity, v.low_stock_threshold) === 'low').length;

    // Selection
    const toggleSelect = (v) => setSelected(prev => {
        const s = new Set(prev);
        s.has(v.variant_id) ? s.delete(v.variant_id) : s.add(v.variant_id);
        return s;
    });
    const toggleAll = () => {
        if (selected.size === filtered.length) setSelected(new Set());
        else setSelected(new Set(filtered.map(v => v.variant_id)));
    };

    const selectedVariants = variants.filter(v => selected.has(v.variant_id));

    return (
        <div>
            {/* ── Header ── */}
            <div className="admin-page-header">
                <div>
                    <h1 className="admin-page-title">จัดการสต็อก</h1>
                    <p className="admin-page-subtitle">
                        {totalSku} SKU
                        {lowStock > 0 && (
                            <span className="stock-low-badge">
                                <AlertTriangle size={12} /> {lowStock} สต็อกต่ำ
                            </span>
                        )}
                        {outOfStock > 0 && (
                            <span className="stock-empty-badge">
                                <PackageX size={12} /> {outOfStock} หมด
                            </span>
                        )}
                    </p>
                </div>
                <div className="products-actions">
                    {/* Category Filter */}
                    <div className="admin-search-wrap" style={{ gap: 6, padding: '6px 12px' }}>
                        <Filter size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <select
                            className="admin-search-input"
                            value={filterCategory}
                            onChange={e => { setFilterCategory(e.target.value); setSelected(new Set()); }}
                            style={{ width: 140, cursor: 'pointer' }}
                        >
                            <option value="">ทุกหมวดหมู่</option>
                            {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
                        </select>
                    </div>
                    {/* Search */}
                    <div className="admin-search-wrap">
                        <Search size={14} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาสินค้า / SKU..."
                            className="admin-search-input"
                        />
                    </div>
                    <button
                        className={`btn btn-sm ${filterLow ? 'btn-warning' : 'btn-secondary'}`}
                        onClick={() => setFilterLow(f => !f)}
                        title="แสดงเฉพาะสต็อกต่ำ"
                    >
                        <AlertTriangle size={14} />
                        {filterLow ? 'สต็อกต่ำ' : 'ทั้งหมด'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={fetchVariants} title="รีเฟรช">
                        <RotateCcw size={14} />
                    </button>
                </div>
            </div>

            {/* ── Stats Bar ── */}
            <div className="stock-stats-bar">
                <div className="stock-stat-card">
                    <Package size={20} className="stat-icon stat-icon-blue" />
                    <div>
                        <div className="stat-val">{totalSku}</div>
                        <div className="stat-lbl">Total SKUs</div>
                    </div>
                </div>
                <div className="stock-stat-card">
                    <AlertTriangle size={20} className="stat-icon stat-icon-orange" />
                    <div>
                        <div className="stat-val" style={{ color: lowStock > 0 ? '#fb923c' : 'inherit' }}>{lowStock}</div>
                        <div className="stat-lbl">Low Stock</div>
                    </div>
                </div>
                <div className="stock-stat-card">
                    <PackageX size={20} className="stat-icon stat-icon-red" />
                    <div>
                        <div className="stat-val" style={{ color: outOfStock > 0 ? '#f87171' : 'inherit' }}>{outOfStock}</div>
                        <div className="stat-lbl">Out of Stock</div>
                    </div>
                </div>
                <div className="stock-stat-card">
                    <TrendingUp size={20} className="stat-icon stat-icon-green" />
                    <div>
                        <div className="stat-val">{variants.reduce((s, v) => s + (v.stock_quantity || 0), 0).toLocaleString()}</div>
                        <div className="stat-lbl">Total Units</div>
                    </div>
                </div>
            </div>

            {/* ── Bulk Toolbar ── */}
            {selected.size > 0 && (
                <div className="bulk-toolbar">
                    <span className="bulk-count">{selected.size} รายการที่เลือก</span>
                    <button className="btn btn-primary btn-sm" onClick={() => setBulkOpen(true)}>
                        <Layers size={14} /> Bulk Adjust
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>
                        <X size={14} /> ยกเลิก
                    </button>
                </div>
            )}

            {/* ── Table ── */}
            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: 24 }}>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8, marginBottom: 8 }} />
                        ))}
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}>
                                    <button onClick={toggleAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                        {selected.size === filtered.length && filtered.length > 0
                                            ? <CheckSquare size={16} style={{ color: 'var(--accent)' }} />
                                            : <Square size={16} />}
                                    </button>
                                </th>
                                <th>รูป</th>
                                <th>ชื่อสินค้า / SKU</th>
                                <th>หน่วย</th>
                                <th>หมวดหมู่</th>
                                <th>สต็อก</th>
                                <th>เกณฑ์ต่ำสุด</th>
                                <th>จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(v => {
                                const level = stockLevel(v.stock_quantity, v.low_stock_threshold);
                                const isSelected = selected.has(v.variant_id);
                                return (
                                    <tr key={v.variant_id}
                                        className={`stock-row stock-row-${level} ${isSelected ? 'stock-row-selected' : ''}`}
                                        onClick={() => toggleSelect(v)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td onClick={e => e.stopPropagation()}>
                                            <button onClick={() => toggleSelect(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                                {isSelected
                                                    ? <CheckSquare size={16} style={{ color: 'var(--accent)' }} />
                                                    : <Square size={16} />}
                                            </button>
                                        </td>
                                        <td>
                                            <div className="product-thumb">
                                                <ProductImage src={v.image_url} alt={v.product_name} />
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{v.product_name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{v.sku}</div>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{v.unit || '—'}</td>
                                        <td>
                                            {v.category_name
                                                ? <span className="badge badge-cyan">{v.category_name}</span>
                                                : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                        </td>
                                        <td>
                                            <StockBadge qty={v.stock_quantity} threshold={v.low_stock_threshold} />
                                        </td>
                                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{v.low_stock_threshold}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                                                <button className="btn btn-secondary btn-sm"
                                                    onClick={() => setAdjustTarget(v)}
                                                    title="ปรับสต็อก">
                                                    <Layers size={13} /> ปรับ
                                                </button>
                                                <button className="btn btn-secondary btn-sm"
                                                    onClick={() => setHistoryTarget(v)}
                                                    title="ประวัติ">
                                                    <History size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 48 }}>
                                        <Package size={36} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
                                        ไม่พบข้อมูลสต็อก
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Modals ── */}
            {adjustTarget && (
                <AdjustModal
                    variant={adjustTarget}
                    onClose={() => setAdjustTarget(null)}
                    onSuccess={() => { fetchVariants(); fetchLowStock(); }}
                />
            )}
            {historyTarget && (
                <HistoryDrawer
                    variant={historyTarget}
                    onClose={() => setHistoryTarget(null)}
                />
            )}
            {bulkOpen && (
                <BulkModal
                    selected={selectedVariants}
                    onClose={() => setBulkOpen(false)}
                    onSuccess={() => { fetchVariants(); fetchLowStock(); setSelected(new Set()); }}
                />
            )}
        </div>
    );
};

export default StockPage;
