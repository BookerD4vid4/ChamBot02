import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Phone, MapPin, Save, Package, ChevronRight, ArrowLeft, Plus, Edit2, Trash2, Check, X, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getMe, updateProfile, getMyOrders, getMyAddresses, addMyAddress, updateMyAddress, deleteMyAddress } from '../api';
import toast from 'react-hot-toast';
import './CustomerProfilePage.css';

const STATUS_CONFIG = {
    pending:   { label: 'รอยืนยัน',        color: '#f59e0b', bg: 'rgba(245,158,11,0.15)'  },
    shipping:  { label: 'กำลังจัดส่ง',     color: '#a855f7', bg: 'rgba(168,85,247,0.15)'  },
    completed: { label: 'จัดส่งสำเร็จ',    color: '#10b981', bg: 'rgba(16,185,129,0.15)'  },
    cancelled: { label: 'ยกเลิกออร์เดอร์', color: '#ef4444', bg: 'rgba(239,68,68,0.15)'   },
};

const EMPTY_ADDR = { recipient_name: '', address_line: '', province: '', postal_code: '' };

export default function CustomerProfilePage() {
    const { user, token, loginWithToken, isAdmin } = useAuth();
    const navigate = useNavigate();

    const [profile, setProfile] = useState({ full_name: '' });
    const [saving, setSaving] = useState(false);

    // Addresses
    const [addresses, setAddresses] = useState([]);
    const [editingId, setEditingId] = useState(null);   // address_id being edited
    const [editForm, setEditForm]   = useState(EMPTY_ADDR);
    const [showAdd, setShowAdd]     = useState(false);
    const [newAddr, setNewAddr]     = useState(EMPTY_ADDR);
    const [addrLoading, setAddrLoading] = useState(false);

    // Orders
    const [orders, setOrders]             = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(true);

    // Redirect if not logged in
    useEffect(() => {
        if (!token) navigate('/login', { replace: true });
    }, [token, navigate]);

    // Load profile & addresses & orders
    useEffect(() => {
        if (!token) return;
        getMe().then(res => {
            const u = res.data.user;
            setProfile({ full_name: u.full_name || '' });
        }).catch(() => {});

        getMyAddresses().then(res => {
            setAddresses(res.data.addresses || []);
        }).catch(() => {});

        setLoadingOrders(true);
        getMyOrders({ limit: 5 }).then(res => {
            setOrders(res.data.data || []);
        }).catch(() => setOrders([])).finally(() => setLoadingOrders(false));
    }, [token]);

    // ── Save profile name ──────────────────────────────────────────────────────
    const handleSave = async (e) => {
        e.preventDefault();
        if (!profile.full_name.trim()) return toast.error('กรุณากรอกชื่อ');
        setSaving(true);
        try {
            const res = await updateProfile({ full_name: profile.full_name });
            loginWithToken({ ...user, full_name: res.data.user.full_name }, token);
            toast.success('บันทึกชื่อสำเร็จ!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
        } finally { setSaving(false); }
    };

    // ── Add address ────────────────────────────────────────────────────────────
    const handleAddAddr = async () => {
        if (!newAddr.recipient_name.trim() || !newAddr.address_line.trim())
            return toast.error('กรุณากรอกชื่อผู้รับและที่อยู่');
        setAddrLoading(true);
        try {
            const res = await addMyAddress(newAddr);
            setAddresses(prev => [res.data.address, ...prev]);
            setNewAddr(EMPTY_ADDR);
            setShowAdd(false);
            toast.success('เพิ่มที่อยู่สำเร็จ!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
        } finally { setAddrLoading(false); }
    };

    // ── Edit address ───────────────────────────────────────────────────────────
    const startEdit = (addr) => {
        setEditingId(addr.address_id);
        setEditForm({ recipient_name: addr.recipient_name, address_line: addr.address_line, province: addr.province || '', postal_code: addr.postal_code || '' });
    };
    const cancelEdit = () => { setEditingId(null); setEditForm(EMPTY_ADDR); };

    const handleSaveAddr = async (id) => {
        setAddrLoading(true);
        try {
            const res = await updateMyAddress(id, editForm);
            setAddresses(prev => prev.map(a => a.address_id === id ? res.data.address : a));
            cancelEdit();
            toast.success('บันทึกที่อยู่สำเร็จ!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'เกิดข้อผิดพลาด');
        } finally { setAddrLoading(false); }
    };

    // ── Delete address ─────────────────────────────────────────────────────────
    const handleDeleteAddr = async (id) => {
        if (!window.confirm('ต้องการลบที่อยู่นี้หรือไม่?')) return;
        try {
            await deleteMyAddress(id);
            setAddresses(prev => prev.filter(a => a.address_id !== id));
            toast.success('ลบที่อยู่แล้ว');
        } catch { toast.error('เกิดข้อผิดพลาด'); }
    };

    if (!token) return null;

    return (
        <div className="profile-page">
            <div className="profile-container">
                <button className="profile-back" onClick={() => navigate(-1)}>
                    <ArrowLeft size={16} /> ย้อนกลับ
                </button>

                <h1 className="profile-heading">โปรไฟล์ของฉัน</h1>

                {/* ─── Profile Card ─────────────────────────────────── */}
                <div className="profile-card">
                    <div className="profile-avatar"><User size={28} /></div>
                    <div className="profile-phone-display">
                        <Phone size={14} />
                        <span>{user?.phone || user?.phone_number || '-'}</span>
                    </div>

                    <form onSubmit={handleSave} className="profile-form">
                        <div className="profile-field">
                            <label><User size={14} /> ชื่อ-นามสกุล</label>
                            <input
                                type="text"
                                value={profile.full_name}
                                onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                                placeholder="กรอกชื่อ-นามสกุล"
                            />
                        </div>
                        <button type="submit" className="profile-save-btn" disabled={saving}>
                            {saving ? <div className="spinner" style={{ width: 18, height: 18 }} /> : <><Save size={16} /> บันทึกชื่อ</>}
                        </button>
                    </form>
                </div>

                {/* ─── Admin Dashboard Quick Link ─── */}
                {isAdmin && (
                    <div style={{ marginTop: '16px', marginBottom: '8px' }}>
                        <Link to="/admin/dashboard" className="btn btn-primary" style={{ width: '100%', gap: '8px', padding: '14px', borderRadius: '14px', background: 'linear-gradient(135deg, #aa5dc6, #6366f1)', fontSize: '15px', fontWeight: 'bold' }}>
                            <Settings size={18} /> จัดการหลังร้าน (Admin Dashboard)
                        </Link>
                    </div>
                )}

                {/* ─── Addresses ────────────────────────────────────── */}
                <div className="profile-section">
                    <div className="profile-section-header">
                        <h2><MapPin size={18} /> ที่อยู่จัดส่ง</h2>
                        <button className="profile-add-addr-btn" onClick={() => { setShowAdd(v => !v); setEditingId(null); }}>
                            <Plus size={14} /> เพิ่มที่อยู่
                        </button>
                    </div>

                    {/* Add new address form */}
                    {showAdd && (
                        <div className="profile-addr-form">
                            <div className="profile-addr-form-grid">
                                <input placeholder="ชื่อผู้รับ *" value={newAddr.recipient_name} onChange={e => setNewAddr(p => ({ ...p, recipient_name: e.target.value }))} />
                                <input placeholder="รหัสไปรษณีย์" value={newAddr.postal_code} onChange={e => setNewAddr(p => ({ ...p, postal_code: e.target.value }))} />
                                <textarea rows={2} placeholder="ที่อยู่ บ้านเลขที่ ซอย ถนน *" value={newAddr.address_line} onChange={e => setNewAddr(p => ({ ...p, address_line: e.target.value }))} style={{ gridColumn: '1/-1' }} />
                                <input placeholder="จังหวัด" value={newAddr.province} onChange={e => setNewAddr(p => ({ ...p, province: e.target.value }))} style={{ gridColumn: '1/-1' }} />
                            </div>
                            <div className="profile-addr-actions">
                                <button className="profile-addr-save-btn" onClick={handleAddAddr} disabled={addrLoading}><Check size={14} /> บันทึก</button>
                                <button className="profile-addr-cancel-btn" onClick={() => { setShowAdd(false); setNewAddr(EMPTY_ADDR); }}><X size={14} /> ยกเลิก</button>
                            </div>
                        </div>
                    )}

                    {/* Address list */}
                    {addresses.length === 0 && !showAdd ? (
                        <p className="profile-no-addr">ยังไม่มีที่อยู่จัดส่ง กด "เพิ่มที่อยู่" เพื่อเริ่มต้น</p>
                    ) : addresses.map(addr => (
                        <div key={addr.address_id} className="profile-addr-card">
                            {editingId === addr.address_id ? (
                                <>
                                    <div className="profile-addr-form-grid">
                                        <input placeholder="ชื่อผู้รับ *" value={editForm.recipient_name} onChange={e => setEditForm(p => ({ ...p, recipient_name: e.target.value }))} />
                                        <input placeholder="รหัสไปรษณีย์" value={editForm.postal_code} onChange={e => setEditForm(p => ({ ...p, postal_code: e.target.value }))} />
                                        <textarea rows={2} placeholder="ที่อยู่ *" value={editForm.address_line} onChange={e => setEditForm(p => ({ ...p, address_line: e.target.value }))} style={{ gridColumn: '1/-1' }} />
                                        <input placeholder="จังหวัด" value={editForm.province} onChange={e => setEditForm(p => ({ ...p, province: e.target.value }))} style={{ gridColumn: '1/-1' }} />
                                    </div>
                                    <div className="profile-addr-actions">
                                        <button className="profile-addr-save-btn" onClick={() => handleSaveAddr(addr.address_id)} disabled={addrLoading}><Check size={14} /> บันทึก</button>
                                        <button className="profile-addr-cancel-btn" onClick={cancelEdit}><X size={14} /> ยกเลิก</button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="profile-addr-info">
                                        <span className="profile-addr-name"><strong>{addr.recipient_name}</strong></span>
                                        <span className="profile-addr-line">{addr.address_line}</span>
                                        {(addr.province || addr.postal_code) && (
                                            <span className="profile-addr-sub">{[addr.province, addr.postal_code].filter(Boolean).join(' ')}</span>
                                        )}
                                    </div>
                                    <div className="profile-addr-btns">
                                        <button onClick={() => startEdit(addr)} title="แก้ไข"><Edit2 size={14} /></button>
                                        <button onClick={() => handleDeleteAddr(addr.address_id)} title="ลบ" className="del"><Trash2 size={14} /></button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {/* ─── Recent Orders ───────────────────────────────── */}
                <div className="profile-section">
                    <div className="profile-section-header">
                        <h2><Package size={18} /> คำสั่งซื้อล่าสุด</h2>
                        <Link to="/my-orders" className="profile-view-all">
                            ดูทั้งหมด <ChevronRight size={14} />
                        </Link>
                    </div>

                    {loadingOrders ? (
                        <div className="profile-orders-loading">
                            {[1, 2, 3].map(i => <div key={i} className="profile-order-skeleton" />)}
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="profile-orders-empty">
                            <Package size={32} />
                            <p>ยังไม่มีคำสั่งซื้อ</p>
                            <Link to="/shop" className="profile-shop-link">เริ่มช้อปปิ้ง</Link>
                        </div>
                    ) : (
                        <div className="profile-orders-list">
                            {orders.map(order => {
                                const cfg = STATUS_CONFIG[order.status] || { label: order.status, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' };
                                return (
                                    <Link key={order.order_id} to={`/orders/${order.order_id}/track`} className="profile-order-card">
                                        <div className="profile-order-left">
                                            <span className="profile-order-id">#{order.order_id}</span>
                                            <span className="profile-order-date">
                                                {new Date(order.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                        <div className="profile-order-right">
                                            <span className="profile-order-amount">฿{Number(order.total_amount).toLocaleString()}</span>
                                            <span className="profile-order-status" style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                                        </div>
                                        <ChevronRight size={16} className="profile-order-arrow" />
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
