import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Truck, MapPin, Phone, User, CheckCircle } from 'lucide-react';
import { createOrder, createPayment, getImageUrl, getMyAddresses, addMyAddress } from '../api';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import './CheckoutPage.css';

const formatPrice = (p) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(p);

const PAYMENT_METHODS = [
    { value: 'qr', label: 'PromptPay', icon: '📱', desc: 'สแกน QR จ่ายผ่าน PromptPay' },
    { value: 'cod', label: 'เก็บเงินปลายทาง', icon: '💵', desc: 'จ่ายตอนรับสินค้า' },
];

const CheckoutPage = () => {
    const { items, totalPrice, clearCart } = useCart();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [form, setForm] = useState({
        name: user?.name || user?.full_name || '', phone: user?.phone || user?.phone_number || '',
        payment_method: 'qr'
    });
    
    // Address management
    const [addresses, setAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState(null);
    const [isAddingAddr, setIsAddingAddr] = useState(false);
    const [newAddr, setNewAddr] = useState({ recipient_name: '', address_line: '', province: '', postal_code: '' });
    const [loading, setLoading] = useState(false);
    const checkoutSuccessRef = useRef(false);

    const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    // Load addresses
    useEffect(() => {
        if (user) {
            getMyAddresses().then(res => {
                const addrs = res.data.addresses || [];
                setAddresses(addrs);
                if (addrs.length > 0) setSelectedAddressId(addrs[0].address_id);
            }).catch(() => {});
        }
    }, [user]);

    const handleAddAddress = async () => {
        if (!newAddr.recipient_name.trim() || !newAddr.address_line.trim())
            return toast.error('กรุณากรอกชื่อผู้รับและที่อยู่');
        try {
            const res = await addMyAddress(newAddr);
            const added = res.data.address;
            setAddresses(prev => [added, ...prev]);
            setSelectedAddressId(added.address_id);
            setIsAddingAddr(false);
            setNewAddr({ recipient_name: '', address_line: '', province: '', postal_code: '' });
            toast.success('เพิ่มที่อยู่แล้ว');
        } catch {
            toast.error('ไม่สามารถเพิ่มที่อยู่ได้');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // 1. Validate Delivery Info (Phone/Name)
        if (!form.name || !form.phone) return toast.error('กรุณากรอกชื่อและเบอร์โทรศัพท์');

        // 2. Resolve final address string
        let addressString = '';
        if (selectedAddressId) {
            // Existing DB address
            const selected = addresses.find(a => a.address_id === selectedAddressId);
            if (!selected) return toast.error('กรุณาเลือกที่อยู่จัดส่ง');
            addressString = `${selected.recipient_name} | ${form.phone} | ${selected.address_line} ${selected.province} ${selected.postal_code}`.trim();
        } else {
            // Guest or manual fallback (if UI allows)
            if (!newAddr.address_line) {
                // if they are trying to add a new one right now
                if (isAddingAddr) return toast.error('กรุณาบันทึกที่อยู่จัดส่งใหม่ก่อน');
                return toast.error('กรุณาเลือกหรือเพิ่มที่อยู่จัดส่ง');
            }
            addressString = `${newAddr.recipient_name} | ${form.phone} | ${newAddr.address_line} ${newAddr.province} ${newAddr.postal_code}`.trim();
        }

        setLoading(true);
        try {
            const orderRes = await createOrder({
                user_id: user?.id || null,
                total_amount: totalPrice,
                payment_method: form.payment_method,
                address_id: selectedAddressId,
                address: addressString,
                items: items.map(i => ({ variant_id: i.variant_id, price: i.price, quantity: i.quantity })),
            });
            const newOrderId = orderRes.data?.data?.order_id || orderRes.data?.order?.order_id || orderRes.data?.orderId;
            
            if (!newOrderId) {
                throw new Error("Cannot retrieve order ID from response");
            }

            // DEMO MODE: call createPayment (backend auto-confirms), then go straight to track page
            await createPayment(newOrderId, form.payment_method);
            checkoutSuccessRef.current = true;
            clearCart();
            navigate(`/orders/${newOrderId}/track`);
        } catch (err) {
            console.error("Checkout error:", err);
            toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (items.length === 0 && !loading && !checkoutSuccessRef.current) {
            navigate('/cart');
        }
    }, [items.length, navigate, loading]);

    if (items.length === 0) {
        return null;
    }

    return (
        <div className="page-wrapper">
            <div className="container checkout-layout">
                {/* Form */}
                <form className="checkout-form" onSubmit={handleSubmit}>
                    <h1 className="checkout-title">ชำระเงิน</h1>

                    {/* Delivery Info */}
                    <div className="checkout-section">
                        <h3 className="checkout-section-title"><Truck size={18} /> ข้อมูลการจัดส่ง</h3>
                        <div className="form-grid">
                            <div className="input-group">
                                <label className="input-label"><User size={13} /> ชื่อ-นามสกุล</label>
                                <input name="name" value={form.name} onChange={handleChange} className="input-field" placeholder="กรอกชื่อ-นามสกุล" required />
                            </div>
                            <div className="input-group">
                                <label className="input-label"><Phone size={13} /> เบอร์โทรศัพท์</label>
                                <input name="phone" value={form.phone} onChange={handleChange} className="input-field" placeholder="08X-XXX-XXXX" required />
                            </div>
                        </div>
                        <div className="input-group" style={{ marginTop: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label className="input-label" style={{ margin: 0 }}><MapPin size={13} /> ที่อยู่จัดส่ง</label>
                                {!isAddingAddr && (
                                    <button type="button" className="profile-add-addr-btn" onClick={() => setIsAddingAddr(true)} style={{ padding: '4px 8px' }}>
                                        + เพิ่มที่อยู่ใหม่
                                    </button>
                                )}
                            </div>

                            {/* Saved Addresses List */}
                            {addresses.length > 0 && !isAddingAddr && (
                                <div className="checkout-address-list">
                                    {addresses.map(addr => (
                                        <div key={addr.address_id} className={`checkout-addr-card ${selectedAddressId === addr.address_id ? 'selected' : ''}`} onClick={() => setSelectedAddressId(addr.address_id)} style={{ cursor: 'pointer' }}>
                                            <div className="checkout-addr-info">
                                                <strong>{addr.recipient_name}</strong>
                                                <p>{addr.address_line}</p>
                                                <p>{[addr.province, addr.postal_code].filter(Boolean).join(' ')}</p>
                                            </div>
                                            {selectedAddressId === addr.address_id && <CheckCircle size={18} className="payment-check" />}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add New Address Form (Inline) */}
                            {(isAddingAddr || addresses.length === 0) && (
                                <div className="checkout-new-addr">
                                    <div className="form-grid">
                                        <input className="input-field" placeholder="ชื่อผู้รับ *" value={newAddr.recipient_name} onChange={e => setNewAddr(p => ({ ...p, recipient_name: e.target.value }))} />
                                        <input className="input-field" placeholder="รหัสไปรษณีย์" value={newAddr.postal_code} onChange={e => setNewAddr(p => ({ ...p, postal_code: e.target.value }))} />
                                    </div>
                                    <textarea className="input-field checkout-textarea" placeholder="บ้านเลขที่ ซอย ถนน *" rows={2} value={newAddr.address_line} onChange={e => setNewAddr(p => ({ ...p, address_line: e.target.value }))} style={{ marginTop: 10 }} />
                                    <input className="input-field" placeholder="จังหวัด / อำเภอ" value={newAddr.province} onChange={e => setNewAddr(p => ({ ...p, province: e.target.value }))} style={{ marginTop: 10 }} />
                                    
                                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                        {user && (
                                            <button type="button" className="btn btn-primary" onClick={handleAddAddress} style={{ flex: 1, padding: '8px' }}>บันทึกที่อยู่</button>
                                        )}
                                        {addresses.length > 0 && isAddingAddr && (
                                            <button type="button" className="btn btn-secondary" onClick={() => setIsAddingAddr(false)} style={{ flex: 1, padding: '8px' }}>ยกเลิก</button>
                                        )}
                                    </div>
                                    {!user && <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: 8 }}>สมัครสมาชิกเพื่อบันทึกที่อยู่สำหรับการสั่งซื้อครั้งต่อไป</p>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Payment */}
                    <div className="checkout-section">
                        <h3 className="checkout-section-title"><CreditCard size={18} /> วิธีชำระเงิน</h3>
                        <div className="payment-grid">
                            {PAYMENT_METHODS.map(m => (
                                <label key={m.value} className={`payment-option ${form.payment_method === m.value ? 'selected' : ''}`}>
                                    <input type="radio" name="payment_method" value={m.value} checked={form.payment_method === m.value} onChange={handleChange} />
                                    <span className="payment-icon">{m.icon}</span>
                                    <div>
                                        <div className="payment-label">{m.label}</div>
                                        <div className="payment-desc">{m.desc}</div>
                                    </div>
                                    {form.payment_method === m.value && <CheckCircle size={16} className="payment-check" />}
                                </label>
                            ))}
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
                        {loading ? <><div className="spinner" style={{ width: 18, height: 18 }} /> กำลังดำเนินการ...</> : `ยืนยันคำสั่งซื้อ • ${formatPrice(totalPrice)}`}
                    </button>
                </form>

                {/* Order Summary */}
                <div className="checkout-summary card">
                    <h3>รายการสินค้า</h3>
                    <div className="divider" />
                    {items.map(item => (
                        <div key={item.key} className="checkout-item">
                            <div className="checkout-item-image">
                                {item.image_url ? <img src={getImageUrl(item.image_url)} alt={item.product_name} /> : <span>🛍️</span>}
                            </div>
                            <div className="checkout-item-info">
                                <p>{item.product_name}</p>
                                <p className="checkout-item-meta">{item.sku} × {item.quantity}</p>
                            </div>
                            <p className="checkout-item-price">{formatPrice(item.price * item.quantity)}</p>
                        </div>
                    ))}
                    <div className="divider" />
                    <div className="checkout-total">
                        <span>ยอดรวม</span>
                        <span className="checkout-total-price">{formatPrice(totalPrice)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPage;
