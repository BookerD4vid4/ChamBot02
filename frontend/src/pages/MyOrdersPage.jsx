import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './MyOrdersPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const STATUS_CONFIG = {
    pending:   { label: 'รอยืนยัน',        color: '#f59e0b', bg: '#fef3c7' },
    shipping:  { label: 'กำลังจัดส่ง',     color: '#a855f7', bg: '#f3e8ff' },
    completed: { label: 'จัดส่งสำเร็จ',    color: '#10b981', bg: '#d1fae5' },
    cancelled: { label: 'ยกเลิกออร์เดอร์', color: '#ef4444', bg: '#fee2e2' },
};

const StatusBadge = ({ status }) => {
    const cfg = STATUS_CONFIG[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
    return (
        <span className="status-badge" style={{ color: cfg.color, background: cfg.bg }}>
            {cfg.label}
        </span>
    );
};

export default function MyOrdersPage() {
    const { user, token } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const LIMIT = 10;

    useEffect(() => {
        fetchOrders();
    }, [page]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API}/api/orders/my`, {
                params: { page, limit: LIMIT },
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            setOrders(res.data.data || []);
            setTotal(res.data.total || 0);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="my-orders-page">
            <div className="my-orders-container">
                <h1 className="my-orders-title">📦 คำสั่งซื้อของฉัน</h1>

                {loading ? (
                    <div className="orders-loading">
                        {[1, 2, 3].map(i => <div key={i} className="order-skeleton" />)}
                    </div>
                ) : orders.length === 0 ? (
                    <div className="orders-empty">
                        <div className="empty-icon">🛒</div>
                        <p>ยังไม่มีคำสั่งซื้อ</p>
                        <Link to="/shop" className="btn-shop">เริ่มช้อปปิ้ง</Link>
                    </div>
                ) : (
                    <>
                        <div className="orders-list">
                            {orders.map(order => (
                                <div key={order.order_id} className="order-card">
                                    <div className="order-card-header">
                                        <div>
                                            <span className="order-id">คำสั่งซื้อ #{order.order_id}</span>
                                            <span className="order-date">
                                                {new Date(order.created_at).toLocaleDateString('th-TH', {
                                                    day: '2-digit', month: 'short', year: 'numeric',
                                                    hour: '2-digit', minute: '2-digit'
                                                })}
                                            </span>
                                        </div>
                                        <StatusBadge status={order.status} />
                                    </div>

                                    <div className="order-card-body">
                                        <div className="order-meta-grid">
                                            <div className="meta-item">
                                                <span className="meta-label">ยอดรวม</span>
                                                <span className="meta-value price">
                                                    ฿{Number(order.total_amount).toLocaleString()}
                                                </span>
                                            </div>
                                            {order.tracking_number && (
                                                <div className="meta-item">
                                                    <span className="meta-label">เลขพัสดุ</span>
                                                    <span className="meta-value tracking">{order.tracking_number}</span>
                                                </div>
                                            )}
                                            {order.shipping_provider && (
                                                <div className="meta-item">
                                                    <span className="meta-label">ขนส่ง</span>
                                                    <span className="meta-value">{order.shipping_provider}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="order-card-footer">
                                        <Link to={`/orders/${order.order_id}/track`} className="btn-track">
                                            🔍 ติดตามพัสดุ
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <div className="pagination">
                                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>← ก่อนหน้า</button>
                                <span>{page} / {totalPages}</span>
                                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>ถัดไป →</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
