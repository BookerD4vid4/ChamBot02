import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, X, Upload, RotateCcw, Star, LayoutGrid, Table, Filter, ScanLine, CheckCircle, XCircle, Save, Edit3, AlertTriangle, ChevronRight, Cpu } from 'lucide-react';
import { getProducts, getCategories, createProduct, updateProduct, deleteProduct, uploadImage, getImageUrl, getProductById, setMainVariant, updateVariantThreshold, ocrScan, checkProductEmbedding, embedSingleProduct } from '../../api';
import API from '../../api';
import ProductImage from '../../components/ProductImage';
import toast from 'react-hot-toast';
import { useAdmin } from './AdminLayout';
import './ProductsPage.css';

const formatPrice = (p) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(p || 0);

const emptyVariant = () => ({ sku: '', price: '', stock_quantity: 0, unit: 'ชิ้น', image_url: '', low_stock_threshold: 5, is_main: false });
const emptyProduct = () => ({ name: '', description: '', category_id: '', is_active: true, variants: [emptyVariant()] });

/* ─── Threshold Adjuster ─── */
const ThresholdAdjuster = ({ variantId, initialValue, onSaved }) => {
    const [value, setValue] = useState(initialValue ?? 5);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateVariantThreshold(variantId, value);
            toast.success('บันทึกเกณฑ์สต็อกสำเร็จ');
            if (onSaved) onSaved(variantId, value);
        } catch {
            toast.error('บันทึกล้มเหลว');
        } finally { setSaving(false); }
    };

    return (
        <div className="threshold-section">
            <span className="threshold-label">เกณฑ์สต็อกต่ำ:</span>
            <div className="threshold-row">
                <button type="button" className="threshold-btn" onClick={() => setValue(v => Math.max(0, v - 1))}>−</button>
                <input type="number" className="threshold-input" value={value} min={0}
                    onChange={e => setValue(Math.max(0, parseInt(e.target.value) || 0))} />
                <button type="button" className="threshold-btn" onClick={() => setValue(v => v + 1)}>+</button>
            </div>
            <button type="button" className="btn-save-threshold" onClick={handleSave} disabled={saving}>
                {saving ? '...' : 'บันทึก'}
            </button>
        </div>
    );
};

/* ─── Main Component ─── */
const ProductsPage = () => {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'active' | 'inactive'
    const [viewMode, setViewMode] = useState('grid');
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editData, setEditData] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(emptyProduct());
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [embeddingInfo, setEmbeddingInfo] = useState(null);   // null | { has_embedding, updated_at, text_used }
    const [embeddingLoading, setEmbeddingLoading] = useState(false);

    // ── OCR State ──────────────────────────────────────────────────────────────
    const [ocrOpen, setOcrOpen] = useState(false);
    const [ocrStep, setOcrStep] = useState(1);
    const [ocrImageFile, setOcrImageFile] = useState(null);
    const [ocrPreview, setOcrPreview] = useState(null);
    const [ocrScanning, setOcrScanning] = useState(false);
    const [ocrItems, setOcrItems] = useState([]);
    const [ocrStatuses, setOcrStatuses] = useState({});
    const [ocrEditingIdx, setOcrEditingIdx] = useState(null);
    const [ocrSaveResults, setOcrSaveResults] = useState({ done: 0, success: 0, failed: 0 });
    const [ocrSaving, setOcrSaving] = useState(false);
    const [ocrDragOver, setOcrDragOver] = useState(false);
    const ocrFileRef = useRef();
    
    // Fetch function from AdminContext to trigger badge updates if stock changes
    const { fetchLowStock } = useAdmin();

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [pr, cr] = await Promise.all([getProducts(), getCategories()]);
            setProducts(pr.data.data || []);
            setCategories(cr.data.data || []);
        } catch { }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchAll(); }, []);

    const handleSelectProduct = async (p) => {
        setDetailLoading(true);
        setSelectedProduct(p);
        setEmbeddingInfo(null);
        try {
            const [res, embRes] = await Promise.all([
                getProductById(p.product_id),
                checkProductEmbedding(p.product_id),
            ]);
            setSelectedProduct(res.data.data);
            setEmbeddingInfo(embRes.data.data);
        } catch {
            toast.error('ไม่สามารถโหลดข้อมูลสินค้าได้');
            setSelectedProduct(null);
        } finally { setDetailLoading(false); }
    };

    const handleReEmbed = async (productId) => {
        setEmbeddingLoading(true);
        try {
            await embedSingleProduct(productId);
            toast.success('ส่งคำขอ embed แล้ว — รอสักครู่');
            // Re-check after 3s
            setTimeout(async () => {
                try {
                    const r = await checkProductEmbedding(productId);
                    setEmbeddingInfo(r.data.data);
                } catch { } finally { setEmbeddingLoading(false); }
            }, 3000);
        } catch { toast.error('เกิดข้อผิดพลาด'); setEmbeddingLoading(false); }
    };

    const handleSetMain = async (variantId) => {
        try {
            await setMainVariant(variantId);
            toast.success('ตั้งเป็นตัวเลือกหลักสำเร็จ');
            const res = await getProductById(selectedProduct.product_id);
            setSelectedProduct(res.data.data);
            getProducts().then(r => setProducts(r.data.data || []));
        } catch { toast.error('เกิดข้อผิดพลาด'); }
    };

    const handleThresholdSaved = (variantId, newValue) => {
        setSelectedProduct(prev => ({
            ...prev,
            variants: prev.variants.map(v =>
                v.variant_id === variantId ? { ...v, low_stock_threshold: newValue } : v
            )
        }));
        fetchLowStock();
    };

    const openAdd = () => {
        // Only reset form if we were previously in edit mode
        // (so draft data from a previous openAdd attempt is preserved)
        if (editData !== null) {
            setForm(emptyProduct());
        }
        setEditData(null);
        setModalOpen(true);
    };
    const openEdit = (p) => {
        setForm({ name: p.product_name || p.name, description: p.description || '', category_id: p.category_id || '', is_active: p.is_active, variants: [] });
        setEditData(p);
        getProductById(p.product_id).then(r => {
            const prod = r.data.data;
            setForm(f => ({ ...f, variants: prod.variants?.length ? prod.variants : [emptyVariant()] }));
        });
        setModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('ต้องการลบสินค้านี้?')) return;
        try {
            await deleteProduct(id);
            toast.success('ลบสินค้าสำเร็จ');
            fetchAll();
            fetchLowStock();
        } catch { toast.error('เกิดข้อผิดพลาด'); }
    };

    const handleImageUpload = async (e, varIdx) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const res = await uploadImage(file);
            const url = res.data.url || res.data.path || '';
            setForm(f => ({ ...f, variants: f.variants.map((v, i) => i === varIdx ? { ...v, image_url: url } : v) }));
            toast.success('อัปโหลดรูปสำเร็จ');
        } catch { toast.error('อัปโหลดล้มเหลว'); }
    };

    const handleVarChange = (idx, key, val) =>
        setForm(f => ({ ...f, variants: f.variants.map((v, i) => i === idx ? { ...v, [key]: val } : v) }));

    const handleSetMainInForm = (idx) => {
        setForm(f => ({ ...f, variants: f.variants.map((v, i) => ({ ...v, is_main: i === idx })) }));
    };

    const addVariant = () => setForm(f => ({ ...f, variants: [...f.variants, emptyVariant()] }));
    const removeVariant = (idx) => setForm(f => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }));

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = { ...form, category_id: form.category_id ? Number(form.category_id) : null };
            if (payload.variants.length > 0 && !payload.variants.some(v => v.is_main)) {
                payload.variants[0].is_main = true;
            }
            if (editData) {
                await updateProduct(editData.product_id, payload);
                toast.success('แก้ไขสินค้าสำเร็จ');
            } else {
                await createProduct(payload);
                toast.success('เพิ่มสินค้าสำเร็จ');
            }
            setModalOpen(false);
            // Reset form to empty draft only after successful save
            setForm(emptyProduct());
            fetchAll();
            fetchLowStock();
        } catch { toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่'); }
        finally { setSaving(false); }
    };

    const filtered = products.filter(p => {
        const matchSearch = (p.product_name || '').toLowerCase().includes(search.toLowerCase());
        const matchCategory = !filterCategory || String(p.category_id) === String(filterCategory);
        const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? p.is_active : !p.is_active);
        return matchSearch && matchCategory && matchStatus;
    });

    // ── OCR Handlers ───────────────────────────────────────────────────────────
    const ocrHandleFile = (file) => {
        if (!file || !file.type.startsWith('image/')) { toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น'); return; }
        setOcrImageFile(file); setOcrPreview(URL.createObjectURL(file));
        setOcrItems([]); setOcrStatuses({}); setOcrStep(1);
    };
    const ocrDrop = useCallback((e) => { e.preventDefault(); setOcrDragOver(false); ocrHandleFile(e.dataTransfer.files[0]); }, []);

    const ocrScanImage = async () => {
        if (!ocrImageFile) return;
        setOcrScanning(true);
        try {
            const res = await ocrScan(ocrImageFile);
            const data = res.data.data || [];
            if (data.length === 0) { toast('ไม่พบรายการสินค้าในรูปภาพ', { icon: '🔍' }); return; }
            setOcrItems(data.map((item, i) => ({ ...item, _id: i, _skip: false })));
            setOcrStatuses({}); setOcrStep(2);
            toast.success(`พบ ${data.length} รายการสินค้า`);
        } catch (err) { toast.error(err.response?.data?.message || 'วิเคราะห์รูปภาพไม่สำเร็จ'); }
        finally { setOcrScanning(false); }
    };

    const ocrUpdateItem = (idx, key, val) =>
        setOcrItems(prev => prev.map((p, i) => i === idx ? { ...p, [key]: val } : p));
    const ocrToggleSkip = (idx) =>
        setOcrItems(prev => prev.map((p, i) => i === idx ? { ...p, _skip: !p._skip } : p));
    const ocrMissingPrice = () => ocrItems.filter(i => !i._skip && i.is_new && !(parseFloat(i.price) > 0));
    const ocrActiveItems = ocrItems.filter(i => !i._skip);

    const ocrSaveAll = async () => {
        const toSave = ocrItems.filter(i => !i._skip);
        if (toSave.length === 0) { toast.error('เลือกสินค้าอย่างน้อย 1 รายการ'); return; }
        const noPrice = ocrMissingPrice();
        if (noPrice.length > 0) {
            toast.error(`กรุณาใส่ราคาขายก่อนบันทึก (${noPrice.length} รายการ)`, { duration: 4000 });
            setOcrEditingIdx(ocrItems.findIndex(i => i._id === noPrice[0]._id)); return;
        }
        setOcrSaving(true); setOcrStep(3);
        let success = 0, failed = 0;
        for (const item of toSave) {
            const idx = item._id;
            setOcrStatuses(prev => ({ ...prev, [idx]: { status: 'saving' } }));
            try {
                if (item.is_new) {
                    await createProduct({ name: item.name, description: item.description || '', category_id: null, is_active: true,
                        variants: [{ sku: item.sku || '', price: parseFloat(item.price) || 0, stock_quantity: parseInt(item.stock_quantity) || 1, unit: item.unit || '', low_stock_threshold: 5 }] });
                } else {
                    await API.patch(`/variants/${item.existing_variant_id}/stock`, { adjustment: parseInt(item.stock_quantity) || 1 });
                }
                setOcrStatuses(prev => ({ ...prev, [idx]: { status: 'success' } })); success++;
            } catch (err) {
                setOcrStatuses(prev => ({ ...prev, [idx]: { status: 'error', msg: err.response?.data?.message || 'บันทึกไม่สำเร็จ' } })); failed++;
            }
            setOcrSaveResults(prev => ({ ...prev, done: prev.done + 1, success, failed }));
        }
        setOcrSaving(false);
        if (failed === 0) { toast.success(`บันทึกสำเร็จทั้งหมด ${success} รายการ! 🎉`); fetchAll(); fetchLowStock(); }
        else { toast(`บันทึกสำเร็จ ${success} รายการ, ล้มเหลว ${failed} รายการ`, { icon: '⚠️' }); fetchAll(); fetchLowStock(); }
    };

    const ocrReset = () => {
        setOcrStep(1); setOcrImageFile(null); setOcrPreview(null);
        setOcrItems([]); setOcrStatuses({}); setOcrSaveResults({ done: 0, success: 0, failed: 0 });
        setOcrSaving(false); setOcrEditingIdx(null);
    };
    const closeOcr = () => { ocrReset(); setOcrOpen(false); };

    return (
        <div>
            {/* ── Header ── */}
            <div className="admin-page-header">
                <div>
                    <h1 className="admin-page-title">สินค้าทั้งหมด</h1>
                    <p className="admin-page-subtitle">{filtered.length} / {products.length} รายการ</p>
                </div>
                <div className="products-actions">
                    <div className="admin-search-wrap" style={{ gap: 6, padding: '6px 12px' }}>
                        <Filter size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <select className="admin-search-input" value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value)} style={{ width: 140, cursor: 'pointer' }}>
                            <option value="">ทุกหมวดหมู่</option>
                            {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="admin-search-wrap">
                        <Search size={16} />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาสินค้า..." className="admin-search-input" />
                    </div>
                    <div className="view-toggle">
                        <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                            onClick={() => setViewMode('grid')} title="Grid"><LayoutGrid size={16} /></button>
                        <button className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                            onClick={() => setViewMode('table')} title="Table"><Table size={16} /></button>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={fetchAll} title="รีเฟรช"><RotateCcw size={15} /></button>
                    <button
                        className="btn btn-secondary"
                        onClick={() => { ocrReset(); setOcrOpen(true); }}
                        title="นำเข้าสินค้าด้วยรูปภาพ + AI"
                    >
                        <ScanLine size={16} /> เพิ่มด้วยรูปภาพ
                    </button>
                    <button className="btn btn-primary" onClick={openAdd}><Plus size={18} /> เพิ่มสินค้า</button>
                </div>
            </div>

            {/* ── Status Tabs ── */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
                {[
                    { key: 'all',      label: 'ทั้งหมด',       count: products.length },
                    { key: 'active',   label: '✅ เปิดใช้งาน', count: products.filter(p => p.is_active).length },
                    { key: 'inactive', label: '⏸️ ปิดใช้งาน',  count: products.filter(p => !p.is_active).length },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setFilterStatus(tab.key)}
                        style={{
                            padding: '7px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7,
                            transition: 'all .15s',
                            background: filterStatus === tab.key ? 'rgba(170,93,198,0.18)' : 'rgba(255,255,255,0.04)',
                            color: filterStatus === tab.key ? '#c084fc' : 'rgba(255,255,255,0.45)',
                            boxShadow: filterStatus === tab.key ? '0 0 0 1px rgba(170,93,198,0.4)' : '0 0 0 1px rgba(255,255,255,0.06)',
                        }}
                    >
                        {tab.label}
                        <span style={{
                            background: filterStatus === tab.key ? 'rgba(192,132,252,0.2)' : 'rgba(255,255,255,0.07)',
                            color: filterStatus === tab.key ? '#c084fc' : 'rgba(255,255,255,0.3)',
                            borderRadius: 99, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                        }}>{tab.count}</span>
                    </button>
                ))}
            </div>

            {/* ── Content ── */}
            {loading ? (
                <div className="products-grid">
                    {[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 300, borderRadius: 18 }} />)}
                </div>
            ) : viewMode === 'grid' ? (
                <>
                    <div className="products-grid">
                        {filtered.map(p => (
                            <div key={p.product_id} className="product-card" onClick={() => handleSelectProduct(p)}>
                                {/* Hover action buttons */}
                                <div className="product-card-actions" onClick={e => e.stopPropagation()}>
                                    <button className="product-card-action-btn edit" title="แก้ไข" onClick={() => openEdit(p)}>
                                        <Pencil size={13} />
                                    </button>
                                    <button className="product-card-action-btn del" title="ลบ" onClick={() => handleDelete(p.product_id)}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                                <div className="product-card-image">
                                    <ProductImage src={p.image_url} alt={p.product_name} />
                                    {p.total_stock <= (p.low_stock_threshold || 5) && (
                                        <div className="stock-badge warning">⚠ สต็อกต่ำ</div>
                                    )}
                                </div>
                                <div className="product-card-content">
                                    {p.category_name && <div className="product-card-cat">{p.category_name}</div>}
                                    <h3 className="product-card-title">{p.product_name}</h3>
                                    <p className="product-card-price">
                                        {p.min_price ? formatPrice(p.min_price) : '—'}
                                        {p.max_price && p.max_price !== p.min_price ? ` – ${formatPrice(p.max_price)}` : ''}
                                    </p>
                                    <div className="product-card-stock">สต็อก: {p.total_stock ?? 0}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {filtered.length === 0 && (
                        <div className="empty-state"><Search size={52} /><p>ไม่พบสินค้าที่คุณค้นหา</p></div>
                    )}
                </>
            ) : (
                /* ── Table View ── */
                <div className="card" style={{ overflow: 'hidden' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>รูป</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th>
                                <th>ราคา</th><th>สต็อกรวม</th><th>สถานะ</th><th>จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => (
                                <tr key={p.product_id} style={{ cursor: 'pointer' }} onClick={() => handleSelectProduct(p)}>
                                    <td><div className="product-thumb"><ProductImage src={p.image_url} alt={p.product_name} /></div></td>
                                    <td>
                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{p.product_name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{p.variant_count || 0} variant</div>
                                    </td>
                                    <td>{p.category_name ? <span className="badge badge-purple">{p.category_name}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                                    <td><span style={{ fontWeight: 700, color: '#AA5DC6' }}>{p.min_price ? formatPrice(p.min_price) : '—'}</span></td>
                                    <td>
                                        {p.total_stock <= (p.low_stock_threshold || 5)
                                            ? <span className="badge badge-orange">⚠ {p.total_stock ?? 0}</span>
                                            : <span className="badge badge-green">{p.total_stock ?? 0}</span>}
                                    </td>
                                    <td><span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>{p.is_active ? 'เปิด' : 'ปิด'}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}><Pencil size={13} /></button>
                                            <button className="btn btn-outline btn-sm" style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
                                                onClick={() => handleDelete(p.product_id)}><Trash2 size={13} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 48 }}>ไม่พบสินค้า</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ─── Detail Modal (center popup, large readable) ─── */}
            {selectedProduct && (
                <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
                    <div className="modal-box prod-detail-modal" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="modal-header" style={{ padding: '22px 28px 18px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.95)' }}>
                                    {selectedProduct.product_name || selectedProduct.name}
                                </h2>
                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                    <span className="badge badge-purple" style={{ fontSize: 13, padding: '5px 14px' }}>
                                        {selectedProduct.category_name || 'ไม่ระบุหมวดหมู่'}
                                    </span>
                                    <span className={`badge ${selectedProduct.is_active ? 'badge-green' : 'badge-gray'}`}
                                        style={{ fontSize: 13, padding: '5px 14px' }}>
                                        {selectedProduct.is_active ? '✅ เปิดใช้งาน' : '⏸️ ปิดใช้งาน'}
                                    </span>
                                </div>
                            </div>
                            <button className="modal-close" onClick={() => setSelectedProduct(null)}>
                                <X size={24} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="modal-body" style={{ padding: '0 28px 8px' }}>
                            {detailLoading ? (
                                <div className="spinner-wrap"><div className="spinner" /></div>
                            ) : (
                                <div className="prod-detail-grid">
                                    {/* Left: Image + numbers */}
                                    <div className="prod-detail-img-col">
                                        <div className="prod-detail-img">
                                            <ProductImage src={selectedProduct.image_url} alt={selectedProduct.product_name} />
                                        </div>
                                        <div className="prod-detail-numbers">
                                            <div className="prod-num-box">
                                                <div className="prod-num-label">💰 ราคาขาย</div>
                                                <div className="prod-num-val" style={{ color: '#AA5DC6' }}>
                                                    {(() => {
                                                        const prices = selectedProduct.variants?.map(v => Number(v.price)).filter(p => p > 0) || [];
                                                        if (prices.length === 0) return formatPrice(selectedProduct.min_price || 0);
                                                        const minP = Math.min(...prices);
                                                        const maxP = Math.max(...prices);
                                                        return minP === maxP
                                                            ? formatPrice(minP)
                                                            : <>{formatPrice(minP)}<span style={{ fontSize: 16 }}> – {formatPrice(maxP)}</span></>;
                                                    })()}
                                                </div>
                                            </div>
                                            <div className="prod-num-box">
                                                <div className="prod-num-label">📦 สต็อกรวมทั้งหมด</div>
                                                <div className="prod-num-val">
                                                    {(() => {
                                                        const totalStock = selectedProduct.variants?.reduce((sum, v) => sum + (Number(v.stock_quantity) || 0), 0)
                                                            ?? selectedProduct.total_stock ?? 0;
                                                        // Find most common unit among variants
                                                        const units = selectedProduct.variants?.map(v => v.unit).filter(Boolean) || [];
                                                        const unit = units.length > 0 ? units[0] : 'ชิ้น';
                                                        return <>{totalStock}<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>{unit}</span></>;
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Description + Variants */}
                                    <div className="prod-detail-info-col">
                                        {selectedProduct.description && (
                                            <div className="prod-detail-section">
                                                <div className="prod-detail-section-title">📝 รายละเอียดสินค้า</div>
                                                <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.8, margin: 0 }}>
                                                    {selectedProduct.description}
                                                </p>
                                            </div>
                                        )}

                                        <div className="prod-detail-section">
                                            <div className="prod-detail-section-title">
                                                🏷️ ตัวเลือกสินค้า ({selectedProduct.variants?.length || 0} รายการ)
                                            </div>
                                            <div className="variant-list">
                                                {selectedProduct.variants?.map(v => (
                                                    <div key={v.variant_id}
                                                        className={`variant-item ${v.is_main ? 'main' : ''}`}
                                                        style={{ padding: '14px 16px', gap: 14 }}>
                                                        <div className="v-img" style={{ width: 52, height: 52, borderRadius: 10 }}>
                                                            <ProductImage src={v.image_url} size={14} />
                                                        </div>
                                                        <div className="v-info">
                                                            <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 4 }}>
                                                                {v.sku || 'ไม่มีรหัสสินค้า'}
                                                            </div>
                                                            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                                                                {v.unit && <span>{v.unit} · </span>}
                                                                {formatPrice(v.price)} · สต็อก: <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{v.stock_quantity}</strong>
                                                            </div>
                                                            <ThresholdAdjuster
                                                                variantId={v.variant_id}
                                                                initialValue={v.low_stock_threshold}
                                                                onSaved={handleThresholdSaved}
                                                            />
                                                        </div>
                                                        <div className="v-actions">
                                                            {v.is_main ? (
                                                                <span title="ตัวเลือกหลัก">
                                                                    <Star size={22} fill="#AA5DC6" color="#AA5DC6" />
                                                                </span>
                                                            ) : (
                                                                <button title="ตั้งเป็นตัวหลัก"
                                                                    onClick={() => handleSetMain(v.variant_id)}
                                                                    className="btn-set-main">
                                                                    <Star size={22} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Embedding Status Section ── */}
                        <div style={{ padding: '0 28px 16px' }}>
                            <div style={{
                                borderRadius: 12,
                                border: `1px solid ${embeddingInfo?.has_embedding ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
                                background: embeddingInfo?.has_embedding ? 'rgba(52,211,153,0.05)' : 'rgba(239,68,68,0.04)',
                                padding: '14px 18px',
                                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
                            }}>
                                <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
                                    <Cpu size={16} style={{ marginTop: 2, flexShrink: 0, color: embeddingInfo?.has_embedding ? '#34d399' : '#f87171' }} />
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>AI Embedding</span>
                                            {embeddingInfo === null ? (
                                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>กำลังตรวจสอบ...</span>
                                            ) : embeddingInfo.has_embedding ? (
                                                <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,0.12)', padding: '2px 8px', borderRadius: 99 }}>✓ มี Embedding</span>
                                            ) : (
                                                <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171', background: 'rgba(239,68,68,0.12)', padding: '2px 8px', borderRadius: 99 }}>✗ ไม่มี Embedding</span>
                                            )}
                                        </div>
                                        {embeddingInfo?.has_embedding && (
                                            <>
                                                <p style={{ margin: '0 0 4px', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                                                    อัปเดตล่าสุด: {new Date(embeddingInfo.updated_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}
                                                </p>
                                                {embeddingInfo.text_used && (
                                                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}
                                                        title={embeddingInfo.text_used}>
                                                        📝 {embeddingInfo.text_used.slice(0, 120)}{embeddingInfo.text_used.length > 120 ? '…' : ''}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                        {embeddingInfo && !embeddingInfo.has_embedding && (
                                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(239,68,68,0.6)' }}>
                                                สินค้านี้ยังไม่มีข้อมูล embedding — AI จะค้นหาสินค้านี้ไม่พบ
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ flexShrink: 0, fontSize: 12, gap: 6 }}
                                    disabled={embeddingLoading}
                                    onClick={() => handleReEmbed(selectedProduct.product_id)}
                                    title="Re-embed สินค้านี้ใหม่"
                                >
                                    {embeddingLoading
                                        ? <><div className="spinner" style={{ width: 12, height: 12 }} /> กำลัง...</>
                                        : <><RotateCcw size={13} /> Re-embed</>
                                    }
                                </button>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="modal-footer" style={{ padding: '16px 28px 24px', gap: 12 }}>
                            <button className="btn btn-secondary"
                                style={{ minHeight: 52, fontSize: 16, color: '#f87171', gap: 8 }}
                                onClick={() => { const p = selectedProduct; setSelectedProduct(null); handleDelete(p.product_id); }}>
                                <Trash2 size={18} /> ลบสินค้า
                            </button>
                            <button className="btn btn-primary"
                                style={{ minHeight: 52, fontSize: 16, gap: 8, flex: 1 }}
                                onClick={() => { const p = selectedProduct; setSelectedProduct(null); openEdit(p); }}>
                                <Pencil size={18} /> แก้ไขข้อมูล
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Form Modal (Add / Edit) ─── */}
            {modalOpen && (
                <div className="modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editData ? 'แก้ไขสินค้า' : 'เพิ่มสินค้าใหม่'}</h2>
                            <button className="modal-close" onClick={() => setModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSave} className="modal-body">
                            <div className="form-row">
                                <div className="input-group">
                                    <label className="input-label">ชื่อสินค้า *</label>
                                    <input className="input-field" value={form.name}
                                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                        required placeholder="ชื่อสินค้า" />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">หมวดหมู่</label>
                                    <select className="input-field" value={form.category_id}
                                        onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                                        <option value="">-- ไม่ระบุ --</option>
                                        {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="input-group">
                                <label className="input-label">คำอธิบาย</label>
                                <textarea className="input-field" rows={3} value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="รายละเอียดสินค้า" />
                            </div>
                            <div className="input-group">
                                <label className="input-label">สถานะ</label>
                                <select className="input-field" value={form.is_active}
                                    onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'true' }))}>
                                    <option value="true">เปิดใช้งาน</option>
                                    <option value="false">ปิดใช้งาน</option>
                                </select>
                            </div>

                            {/* Variants */}
                            <div className="variants-section">
                                <div className="variants-header">
                                    <h4>ตัวเลือกสินค้า</h4>
                                </div>
                                {form.variants.map((v, i) => (
                                    <div key={i} className="variant-form-card">
                                        <div className="variant-form-header">
                                            <span>ตัวเลือกที่ {i + 1}</span>
                                            <div style={{ display: 'flex', gap: 10 }}>
                                                <button type="button"
                                                    onClick={() => handleSetMainInForm(i)}
                                                    className={`btn-star ${v.is_main ? 'active' : ''}`}
                                                    title="ตั้งเป็นตัวเลือกหลัก">
                                                    <Star size={16} fill={v.is_main ? '#AA5DC6' : 'none'} color={v.is_main ? '#AA5DC6' : 'currentColor'} />
                                                </button>
                                                {form.variants.length > 1 && (
                                                    <button type="button" className="remove-btn" onClick={() => removeVariant(i)}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="variant-form-grid">
                                            <div className="input-group">
                                                <label className="input-label">คุณลักษณะสินค้า</label>
                                                <input className="input-field" value={v.sku}
                                                    onChange={e => handleVarChange(i, 'sku', e.target.value)}
                                                    placeholder="SKU-001" />
                                            </div>
                                            <div className="input-group">
                                                <label className="input-label">ราคา (บาท) *</label>
                                                <input type="number" className="input-field" value={v.price}
                                                    onChange={e => handleVarChange(i, 'price', e.target.value)}
                                                    required placeholder="0.00" />
                                            </div>
                                            <div className="input-group">
                                                <label className="input-label">จำนวนสต็อก</label>
                                                <input type="number" className="input-field" value={v.stock_quantity}
                                                    onChange={e => handleVarChange(i, 'stock_quantity', Number(e.target.value))} />
                                            </div>
                                            <div className="input-group">
                                                <label className="input-label">หน่วย</label>
                                                <input className="input-field" value={v.unit}
                                                    onChange={e => handleVarChange(i, 'unit', e.target.value)}
                                                    placeholder="ชิ้น / kg / กล่อง" />
                                            </div>
                                            <div className="input-group">
                                                <label className="input-label">เกณฑ์แจ้งสต็อกต่ำ</label>
                                                <input type="number" className="input-field" value={v.low_stock_threshold}
                                                    onChange={e => handleVarChange(i, 'low_stock_threshold', Number(e.target.value))}
                                                    min={0} />
                                            </div>
                                        </div>
                                        <div className="input-group">
                                            <label className="input-label">รูปภาพ</label>
                                            <div className="image-upload-row">
                                                <input className="input-field" value={v.image_url}
                                                    onChange={e => handleVarChange(i, 'image_url', e.target.value)}
                                                    placeholder="URL รูปภาพ" style={{ flex: 1 }} />
                                                <label className="upload-label">
                                                    <Upload size={14} /> อัปโหลด
                                                    <input type="file" accept="image/*"
                                                        style={{ display: 'none' }}
                                                        onChange={e => handleImageUpload(e, i)} />
                                                </label>
                                            </div>
                                            {v.image_url && <img src={getImageUrl(v.image_url)} alt="preview" className="image-preview" />}
                                            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.28)', lineHeight: 1.6 }}>
                                                📐 แนะนำขนาด <strong style={{ color: 'rgba(255,255,255,0.45)' }}>800×800 px</strong> ขึ้นไป, อัตราส่วน 1:1<br />
                                                🖼️ รองรับไฟล์: <strong style={{ color: 'rgba(255,255,255,0.45)' }}>JPG, PNG, WEBP</strong> · ขนาดไม่เกิน 5 MB
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {/* ── Add Variant button at bottom of list ── */}
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    onClick={addVariant}
                                    style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
                                >
                                    <Plus size={14} /> เพิ่มตัวเลือก
                                </button>
                            </div>

                            <div className="modal-footer" style={{ padding: '16px 0 0', border: 'none' }}>
                                <button type="button" className="btn btn-secondary" style={{ minHeight: 52, fontSize: 16 }}
                                    onClick={() => setModalOpen(false)}>ยกเลิก</button>
                                <button type="submit" className="btn btn-primary" style={{ minHeight: 52, fontSize: 16, flex: 1 }}
                                    disabled={saving}>
                                    {saving ? <div className="spinner" style={{ width: 18, height: 18 }} /> : (editData ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── OCR Import Modal ─── */}
            {ocrOpen && (
                <div className="modal-overlay" onClick={closeOcr}>
                    <div className="modal-box" style={{ maxWidth: 780, width: '95vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="modal-header">
                            <div>
                                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ScanLine size={20} color="#22d3ee" /> เพิ่มสินค้าด้วยรูปภาพ (AI OCR)
                                </h2>
                                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>วิเคราะห์รูปภาพด้วย AI เพื่อเพิ่มสินค้าอัตโนมัติ</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {ocrStep > 1 && <button className="btn btn-secondary btn-sm" onClick={ocrReset}><RotateCcw size={13} /> เริ่มใหม่</button>}
                                <button className="modal-close" onClick={closeOcr}><X size={20} /></button>
                            </div>
                        </div>

                        {/* Steps */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {['อัปโหลดรูปภาพ', 'ตรวจสอบรายการ', 'บันทึกข้อมูล'].map((label, i) => (
                                <React.Fragment key={i}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{
                                            width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                                            background: ocrStep > i + 1 ? '#22d3ee' : ocrStep === i + 1 ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.05)',
                                            border: ocrStep === i + 1 ? '1.5px solid #22d3ee' : '1.5px solid rgba(255,255,255,0.08)',
                                            color: ocrStep > i + 1 ? '#000' : ocrStep === i + 1 ? '#22d3ee' : 'rgba(255,255,255,0.3)'
                                        }}>
                                            {ocrStep > i + 1 ? <CheckCircle size={14} /> : i + 1}
                                        </div>
                                        <span style={{ fontSize: 13, color: ocrStep === i + 1 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)' }}>{label}</span>
                                    </div>
                                    {i < 2 && <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />}
                                </React.Fragment>
                            ))}
                        </div>

                        {/* Body */}
                        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>

                            {/* STEP 1: Upload */}
                            {ocrStep === 1 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    <div
                                        style={{
                                            border: `2px dashed ${ocrDragOver ? '#22d3ee' : 'rgba(255,255,255,0.12)'}`,
                                            borderRadius: 14, padding: ocrPreview ? 0 : 40, cursor: 'pointer',
                                            textAlign: 'center', transition: 'all .2s', overflow: 'hidden',
                                            background: ocrDragOver ? 'rgba(34,211,238,0.04)' : 'rgba(255,255,255,0.02)',
                                            minHeight: ocrPreview ? 200 : 160,
                                        }}
                                        onClick={() => ocrFileRef.current?.click()}
                                        onDrop={ocrDrop}
                                        onDragOver={e => { e.preventDefault(); setOcrDragOver(true); }}
                                        onDragLeave={() => setOcrDragOver(false)}
                                    >
                                        {ocrPreview
                                            ? <img src={ocrPreview} alt="preview" style={{ width: '100%', maxHeight: 280, objectFit: 'contain' }} />
                                            : (<>
                                                <Upload size={36} style={{ color: 'rgba(255,255,255,0.2)', marginBottom: 12 }} />
                                                <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: 15 }}>ลากรูปมาวางหรือคลิกเพื่อเลือกไฟล์</p>
                                                <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>รองรับ JPG, PNG, WEBP — สูงสุด 10MB</span>
                                            </>)
                                        }
                                        <input type="file" ref={ocrFileRef} accept="image/*" style={{ display: 'none' }} onChange={e => ocrHandleFile(e.target.files[0])} />
                                    </div>
                                    {ocrPreview && (
                                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                            <button className="btn btn-secondary btn-sm" onClick={() => ocrFileRef.current?.click()}><Upload size={13} /> เปลี่ยนรูป</button>
                                            <button className="btn btn-primary" onClick={ocrScanImage} disabled={ocrScanning}>
                                                {ocrScanning ? <><div className="spinner" style={{ width: 16, height: 16 }} /> กำลังวิเคราะห์...</> : <><ScanLine size={16} /> วิเคราะห์ด้วย AI</>}
                                            </button>
                                        </div>
                                    )}
                                    <div className="card" style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.8 }}>
                                        <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>💡 เคล็ดลับ</p>
                                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                                            <li>รูปรายการสินค้า / ใบเสร็จ / คาตาล็อก — AI จะอ่านทีละรายการ</li>
                                            <li>ภาพชัด ไม่เบลอ ได้ผลแม่นยำกว่า</li>
                                            <li>รองรับทั้งภาษาไทยและอังกฤษ</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {/* STEP 2: Review */}
                            {ocrStep === 2 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {/* Stats bar */}
                                    <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px' }}>
                                        <div style={{ display: 'flex', gap: 20 }}>
                                            {[['รายการทั้งหมด', ocrItems.length, ''], ['จะบันทึก', ocrActiveItems.length, '#22d3ee'], ['สินค้าใหม่', ocrActiveItems.filter(i => i.is_new).length, '#a78bfa'], ['เพิ่มสต็อก', ocrActiveItems.filter(i => !i.is_new).length, '#34d399']].map(([label, val, color]) => (
                                                <div key={label} style={{ textAlign: 'center' }}>
                                                    <div style={{ fontSize: 20, fontWeight: 800, color: color || 'rgba(255,255,255,0.7)' }}>{val}</div>
                                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{label}</div>
                                                </div>
                                            ))}
                                        </div>
                                        <img src={ocrPreview} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, opacity: 0.7 }} />
                                    </div>

                                    {/* Items */}
                                    {ocrItems.map((item, idx) => (
                                        <div key={idx} className="card" style={{ opacity: item._skip ? 0.4 : 1, border: !item._skip && item.is_new && !(parseFloat(item.price) > 0) ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <span className={`badge ${item.is_new ? 'badge-green' : 'badge-cyan'}`}>{item.is_new ? '✨ สินค้าใหม่' : '📦 เพิ่มสต็อก'}</span>
                                                    {!item._skip && item.is_new && !(parseFloat(item.price) > 0) && <span className="badge badge-red"><AlertTriangle size={11} /> ต้องใส่ราคา</span>}
                                                    {!item.is_new && item.existing_product_name && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>ตรงกับ: {item.existing_product_name}</span>}
                                                </div>
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => setOcrEditingIdx(ocrEditingIdx === idx ? null : idx)}>
                                                        <Edit3 size={12} /> {ocrEditingIdx === idx ? 'ปิด' : 'แก้ไข'}
                                                    </button>
                                                    <button className={`btn btn-sm ${item._skip ? 'btn-primary' : ''}`} style={!item._skip ? { color: '#f87171', borderColor: 'rgba(248,113,113,0.3)', background: 'transparent', border: '1px solid' } : {}} onClick={() => ocrToggleSkip(idx)}>
                                                        {item._skip ? '↩ ยกเลิกข้าม' : '✕ ข้าม'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Summary row */}
                                            {ocrEditingIdx !== idx && (
                                                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                                                    {item.is_new ? (
                                                        <>
                                                            <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>ชื่อสินค้า</span><div style={{ fontWeight: 600 }}>{item.name || '—'}</div></div>
                                                            <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>SKU</span><div>{item.sku || '—'}</div></div>
                                                            <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>ราคาขาย *</span><div style={{ fontWeight: 700, color: parseFloat(item.price) > 0 ? '#a5b4fc' : '#f87171' }}>{parseFloat(item.price) > 0 ? `฿${parseFloat(item.price).toLocaleString()}` : '⚠ ยังไม่ระบุ'}</div></div>
                                                            <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>สต็อก</span><div>{item.stock_quantity} {item.unit || ''}</div></div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>สินค้า</span><div style={{ fontWeight: 600 }}>{item.existing_product_name || item.name}</div></div>
                                                            <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>สต็อกปัจจุบัน</span><div>{item.existing_variant_stock ?? '—'}</div></div>
                                                            <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>จะเพิ่ม</span><div style={{ fontWeight: 700, color: '#22d3ee' }}>+{item.stock_quantity || 1}</div></div>
                                                            <div><span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>หลังเพิ่ม</span><div style={{ fontWeight: 700, color: '#a5b4fc' }}>{(item.existing_variant_stock || 0) + (parseInt(item.stock_quantity) || 0)}</div></div>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {/* Edit form */}
                                            {ocrEditingIdx === idx && (
                                                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                    {!item.is_new ? (
                                                        <div className="input-group" style={{ maxWidth: 200 }}>
                                                            <label className="input-label">จำนวนที่จะเพิ่ม *</label>
                                                            <input type="number" className="input-field" min={1} value={item.stock_quantity || 1} onChange={e => ocrUpdateItem(idx, 'stock_quantity', e.target.value)} />
                                                            <p style={{ fontSize: 12, color: '#22d3ee', marginTop: 4 }}>สต็อกหลังเพิ่ม: {(item.existing_variant_stock || 0) + (parseInt(item.stock_quantity) || 0)}</p>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <div className="form-row">
                                                                <div className="input-group"><label className="input-label">ชื่อสินค้า *</label><input className="input-field" value={item.name || ''} onChange={e => ocrUpdateItem(idx, 'name', e.target.value)} /></div>
                                                                <div className="input-group"><label className="input-label">SKU</label><input className="input-field" value={item.sku || ''} onChange={e => ocrUpdateItem(idx, 'sku', e.target.value)} /></div>
                                                            </div>
                                                            <div className="form-row">
                                                                <div className="input-group">
                                                                    <label className="input-label">ราคาขาย (บาท) <span style={{ color: '#f87171' }}>*</span></label>
                                                                    <input type="number" min={0} className={`input-field ${!(parseFloat(item.price) > 0) ? 'input-error' : ''}`} placeholder="ต้องระบุ" value={item.price || ''} onChange={e => ocrUpdateItem(idx, 'price', e.target.value)} />
                                                                </div>
                                                                <div className="input-group"><label className="input-label">สต็อกเริ่มต้น</label><input type="number" className="input-field" min={1} value={item.stock_quantity || 1} onChange={e => ocrUpdateItem(idx, 'stock_quantity', e.target.value)} /></div>
                                                                <div className="input-group"><label className="input-label">หน่วย</label><input className="input-field" value={item.unit || ''} onChange={e => ocrUpdateItem(idx, 'unit', e.target.value)} placeholder="ชิ้น / กล่อง" /></div>
                                                            </div>
                                                            <div className="input-group"><label className="input-label">รายละเอียด</label><textarea className="input-field" rows={2} value={item.description || ''} onChange={e => ocrUpdateItem(idx, 'description', e.target.value)} /></div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Review Footer */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <button className="btn btn-secondary" onClick={() => setOcrStep(1)}>← กลับ</button>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            {ocrMissingPrice().length > 0 && (
                                                <span style={{ fontSize: 13, color: '#fb923c', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <AlertTriangle size={14} /> ยังมี {ocrMissingPrice().length} รายการที่ยังไม่มีราคา
                                                </span>
                                            )}
                                            <button className="btn btn-primary" onClick={ocrSaveAll} disabled={ocrActiveItems.length === 0 || ocrMissingPrice().length > 0}>
                                                <Save size={16} /> บันทึก {ocrActiveItems.length} รายการ
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* STEP 3: Results */}
                            {ocrStep === 3 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {ocrSaving && (
                                        <div className="card" style={{ padding: '18px 20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10, color: 'rgba(255,255,255,0.6)' }}>
                                                <span>กำลังบันทึก... {ocrSaveResults.done} / {ocrActiveItems.length}</span>
                                                <span>{Math.round((ocrSaveResults.done / Math.max(ocrActiveItems.length, 1)) * 100)}%</span>
                                            </div>
                                            <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', borderRadius: 999, background: '#22d3ee', transition: 'width .3s', width: `${(ocrSaveResults.done / Math.max(ocrActiveItems.length, 1)) * 100}%` }} />
                                            </div>
                                        </div>
                                    )}
                                    {!ocrSaving && (
                                        <div className="card" style={{ textAlign: 'center', padding: '24px 20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 20 }}>
                                                <div><div style={{ fontSize: 28, fontWeight: 800, color: '#34d399' }}>{ocrSaveResults.success}</div><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>บันทึกสำเร็จ</div></div>
                                                <div><div style={{ fontSize: 28, fontWeight: 800, color: '#f87171' }}>{ocrSaveResults.failed}</div><div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>ล้มเหลว</div></div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                                <button className="btn btn-secondary" onClick={ocrReset}><RotateCcw size={14} /> นำเข้าใหม่</button>
                                                <button className="btn btn-primary" onClick={closeOcr}><CheckCircle size={14} /> ปิดและดูสินค้า</button>
                                            </div>
                                        </div>
                                    )}
                                    {ocrItems.filter(i => !i._skip).map((item, idx) => {
                                        const st = ocrStatuses[item._id];
                                        return (
                                            <div key={idx} className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${st?.status === 'error' ? 'rgba(239,68,68,0.3)' : st?.status === 'success' ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
                                                <div>
                                                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{item.name}</p>
                                                    <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{item.sku && `SKU: ${item.sku} · `}{item.unit || ''}</p>
                                                </div>
                                                {st?.status === 'saving' && <div className="spinner" style={{ width: 16, height: 16 }} />}
                                                {st?.status === 'success' && <CheckCircle size={18} color="#34d399" />}
                                                {st?.status === 'error' && <XCircle size={18} color="#f87171" title={st.msg} />}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductsPage;
