import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, ShoppingBag, MapPin, CreditCard, Banknote, RotateCcw } from 'lucide-react';
import { sendChatMessage } from '../api';
import { useCart } from '../context/CartContext';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import './ChatbotWidget.css';

const INITIAL_MESSAGE = {
    role: 'assistant',
    content: 'สวัสดีครับ! 👋 ผมคือ AI ผู้ช่วยของร้าน\nพิมพ์สิ่งที่ต้องการได้เลย เช่น:\n• "มีเสื้อสีขาวไหม"\n• "เพิ่ม [ชื่อสินค้า] ลงตะกร้า"\n• "ดูออเดอร์ของฉัน"',
    products: [],
    actions: [],
};

const ChatbotWidget = () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState(() => {
        try {
            const saved = sessionStorage.getItem('chatbot_messages');
            return saved ? JSON.parse(saved) : [INITIAL_MESSAGE];
        } catch { return [INITIAL_MESSAGE]; }
    });
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef(null);
    const { items, addItem, removeItem, updateQty, clearCart, isOpen: isCartOpen } = useCart();
    const [checkoutAddressId, setCheckoutAddressId] = useState(null);
    const navigate = useNavigate();

    // Persist messages to sessionStorage on every change
    useEffect(() => {
        try { sessionStorage.setItem('chatbot_messages', JSON.stringify(messages)); }
        catch {}
    }, [messages]);

    useEffect(() => {
        if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, open]);

    const MAX_HISTORY = 6;    // 3 turns
    const MAX_MSG_LEN = 400;  // cap each message to avoid bloat

    const getHistory = () =>
        messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-MAX_HISTORY)
            .map(m => ({
                role: m.role,
                content: m.content.length > MAX_MSG_LEN
                    ? m.content.slice(0, MAX_MSG_LEN) + '…'
                    : m.content
            }));

    const handleClearHistory = () => {
        setMessages([INITIAL_MESSAGE]);
        sessionStorage.removeItem('chatbot_messages');
    };

    const handleSend = async (e, overrideText = null) => {
        e?.preventDefault();
        const text = overrideText || input.trim();
        if (!text || loading) return;

        setMessages(prev => [...prev, { role: 'user', content: text, products: [], actions: [] }]);
        if (!overrideText) setInput('');
        setLoading(true);

        try {
            const res = await sendChatMessage(text, getHistory(), items, checkoutAddressId);
            const { reply, actions = [] } = res.data;

            // Execute cart mutations immediately
            actions.forEach(a => {
                if (a.type === 'remove_item_from_cart') {
                    const target = items.find(i => i.product_name.toLowerCase().includes(a.product_name.toLowerCase()));
                    if (target) removeItem(target.key);
                } else if (a.type === 'update_item_quantity') {
                    const target = items.find(i => i.product_name.toLowerCase().includes(a.product_name.toLowerCase()));
                    if (target) updateQty(target.key, a.quantity);
                } else if (a.type === 'clear_cart') {
                    clearCart();
                } else if (a.type === 'add_to_cart') {
                    // addItem(product, variant, quantity, silent)
                    addItem(a.product, a.variant, a.quantity ?? 1, true);
                    toast.success(`เพิ่ม "${a.product.name}" ลงตะกร้าแล้ว! 🛒`);
                } else if (a.type === 'set_checkout_address') {
                    setCheckoutAddressId(a.address_id);
                } else if (a.type === 'show_promptpay_qr' || (a.type === 'clear_cart' && checkoutAddressId)) {
                    // Reset checkout flow state once ordered
                    setCheckoutAddressId(null);
                }
            });

            setMessages(prev => [
                ...prev,
                { role: 'assistant', content: reply, products: [], actions }
            ]);
            // ไม่ auto-execute — รอ user กดปุ่มยืนยันเองเท่านั้น
        } catch {
            setMessages(prev => [
                ...prev,
                { role: 'assistant', content: 'ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้งครับ', products: [], actions: [] }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) handleSend(e);
    };

    return (
        <>
            {/* FAB Button */}
            <button
                className={`chatbot-fab ${open ? 'chatbot-fab--open' : ''} ${isCartOpen ? 'chatbot-shifted' : ''}`}
                onClick={() => setOpen(o => !o)}
                aria-label="เปิด/ปิด AI Chatbot"
            >
                {open ? <X size={22} /> : <MessageCircle size={22} />}
            </button>

            {/* Chat Window */}
            {open && (
                <div className={`chatbot-window ${isCartOpen ? 'chatbot-shifted' : ''}`}>
                    {/* Header */}
                    <div className="chatbot-header">
                        <div className="chatbot-header-info">
                            <div className="chatbot-avatar"><Bot size={18} /></div>
                            <div>
                                <div className="chatbot-title">AI ผู้ช่วยร้านค้า</div>
                                <div className="chatbot-subtitle">ออนไลน์ตลอด 24 ชม.</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="chatbot-clear-btn" onClick={handleClearHistory} title="ล้างประวัติแชท"><RotateCcw size={14} /></button>
                            <button className="chatbot-close-btn" onClick={() => setOpen(false)}><X size={18} /></button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="chatbot-messages">
                        {messages.map((msg, i) => (
                            <div key={i} className={`chatbot-msg chatbot-msg--${msg.role}`}>
                                <div className="chatbot-msg-icon">
                                    {msg.role === 'assistant' ? <Bot size={14} /> : <User size={14} />}
                                </div>
                                <div className="chatbot-msg-body">
                                    <div className="chatbot-bubble">{msg.content}</div>

                                    {/* Action completed markers (optional, removed manual add button) */}

                                    {/* Address Selection display */}
                                    {msg.actions?.filter(a => a.type === 'show_address_selection').map((a, j) => (
                                        <div key={`addr-${j}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>เลือกที่อยู่สำหรับจัดส่ง:</div>
                                            {a.addresses.map(addr => (
                                                <button
                                                    key={addr.address_id}
                                                    className="chatbot-action-btn"
                                                    style={{ display: 'block', height: 'auto', whiteSpace: 'normal', padding: '10px' }}
                                                    onClick={() => handleSend({ preventDefault: () => {} }, `เลือกที่อยู่จัดส่งนี้: ${addr.recipient_name} ${addr.address_line} ${addr.province} ${addr.postal_code} (ID:${addr.address_id})`)}
                                                >
                                                    <MapPin size={14} style={{ display: 'inline', marginRight: '6px', color: '#ef4444' }} />
                                                    <span style={{ color: '#f9fafb', fontWeight: 'bold' }}>{addr.recipient_name}</span><br />
                                                    <span style={{ color: '#d1d5db', fontSize: '11px' }}>{addr.address_line} {addr.province} {addr.postal_code}</span>
                                                </button>
                                            ))}
                                            <button
                                                className="chatbot-action-btn chatbot-action-btn--checkout"
                                                onClick={() => { setOpen(false); navigate('/checkout'); }}
                                            >
                                                ➕ เพิ่มที่อยู่ใหม่ (ไปหน้าชำระเงิน)
                                            </button>
                                        </div>
                                    ))}

                                    {/* Inline Cart Summary (shown when user types ตะกร้า) */}
                                    {msg.actions?.some(a => a.type === 'show_inline_cart_checkout') && items.length > 0 && (
                                        <div style={{ marginTop: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '4px' }}>🛒 รายการในตะกร้า:</div>
                                            {items.map((item, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e5e7eb' }}>
                                                    <span>{item.product_name} × {item.quantity}</span>
                                                    <span style={{ color: '#a78bfa' }}>{(item.price * item.quantity).toLocaleString()} บาท</span>
                                                </div>
                                            ))}
                                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px', color: '#f9fafb' }}>
                                                <span>ยอดรวม</span>
                                                <span style={{ color: '#a78bfa' }}>{items.reduce((s, i) => s + i.price * i.quantity, 0).toLocaleString()} บาท</span>
                                            </div>
                                            <button
                                                className="chatbot-action-btn chatbot-action-btn--checkout"
                                                style={{ marginTop: '4px' }}
                                                onClick={() => handleSend({ preventDefault: () => {} }, 'ชำระเงิน')}
                                            >
                                                💳 ชำระเงินเลย
                                            </button>
                                        </div>
                                    )}

                                    {/* Payment Selection display (triggered by text pattern match internally or LLM) */}
                                    {msg.actions?.filter(a => a.type === 'show_payment_selection').map((a, j) => (
                                        <div key={`pay-${j}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>เลือกวิธีชำระเงินสำหรับออเดอร์นี้:</div>
                                            <button
                                                className="chatbot-action-btn"
                                                style={{ display: 'flex', justifyContent: 'center', background: 'rgba(52, 211, 153, 0.15)', borderColor: '#34d399', color: '#34d399' }}
                                                onClick={() => handleSend({ preventDefault: () => {} }, `ยืนยันสั่งซื้อด้วยการจ่ายผ่าน PromptPay`)}
                                            >
                                                <CreditCard size={14} /> โอนเงินผ่าน PromptPay
                                            </button>
                                            <button
                                                className="chatbot-action-btn"
                                                style={{ display: 'flex', justifyContent: 'center', background: 'rgba(251, 191, 36, 0.15)', borderColor: '#fbbf24', color: '#fbbf24' }}
                                                onClick={() => handleSend({ preventDefault: () => {} }, `ยืนยันสั่งซื้อด้วยรูปแบบเก็บเงินปลายทาง (COD)`)}
                                            >
                                                <Banknote size={14} /> เก็บเงินปลายทาง (COD)
                                            </button>
                                        </div>
                                    ))}

                                    {/* PromptPay QR display */}
                                    {msg.actions?.filter(a => a.type === 'show_promptpay_qr').map((a, j) => (
                                        <div key={`qr-${j}`} style={{ background: '#fff', padding: '12px', borderRadius: '8px', marginTop: '8px', textAlign: 'center' }}>
                                            <div style={{ color: '#000', fontWeight: 'bold', marginBottom: '8px' }}>ยอดชำระ {a.totalAmount} บาท</div>
                                            <img src={a.qrCodeUrl} alt="PromptPay QR Code" style={{ width: '100%', maxWidth: '200px', borderRadius: '4px' }} />
                                            <button 
                                                className="chatbot-action-btn chatbot-action-btn--checkout"
                                                style={{ marginTop: '8px', width: '100%' }}
                                                onClick={() => { setOpen(false); navigate(`/profile`); }}
                                            >
                                                📦 ติดตามสถานะออเดอร์ #{a.orderId}
                                            </button>
                                        </div>
                                    ))}

                                    {/* Reorder buttons (one per order from get_my_orders) */}
                                    {msg.actions?.filter(a => a.type === 'reorder').map((a, j) => (
                                        <button
                                            key={`reorder-${j}`}
                                            className="chatbot-action-btn"
                                            style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'rgba(16, 185, 129, 0.15)', borderColor: '#34d399', color: '#34d399' }}
                                            onClick={() => {
                                                a.items.forEach(item => addItem(item.product, item.variant, item.quantity, true));
                                                toast.success(`เพิ่มสินค้าจากออเดอร์ #${a.order_id} ลงตะกร้าแล้ว! 🛒`);
                                            }}
                                        >
                                            <ShoppingBag size={14} /> สั่งซื้ออีกครั้ง (ออเดอร์ #{a.order_id})
                                        </button>
                                    ))}

                                    {/* Product cards (search results) */}
                                    {msg.products?.length > 0 && (
                                        <div className="chatbot-products">
                                            {msg.products.map(p => (
                                                <Link
                                                    key={p.id}
                                                    to={`/product/${p.id}`}
                                                    className="chatbot-product-card"
                                                    onClick={() => setOpen(false)}
                                                >
                                                    <ShoppingBag size={14} />
                                                    <div className="chatbot-product-info">
                                                        <span className="chatbot-product-name">{p.name}</span>
                                                        {p.price && (
                                                            <span className="chatbot-product-price">
                                                                ฿{Number(p.price).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="chatbot-msg chatbot-msg--assistant">
                                <div className="chatbot-msg-icon"><Bot size={14} /></div>
                                <div className="chatbot-msg-body">
                                    <div className="chatbot-bubble chatbot-typing">
                                        <span /><span /><span />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <form className="chatbot-input-row" onSubmit={handleSend}>
                        <input
                            className="chatbot-input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="เช่น: เพิ่มสินค้า X ลงตะกร้า..."
                            disabled={loading}
                            autoFocus
                        />
                        <button type="submit" className="chatbot-send-btn" disabled={loading || !input.trim()}>
                            <Send size={16} />
                        </button>
                    </form>
                </div>
            )}
        </>
    );
};

export default ChatbotWidget;
