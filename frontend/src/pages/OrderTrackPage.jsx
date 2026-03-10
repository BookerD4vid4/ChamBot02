import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './OrderTrackPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const STEPS = ['pending', 'shipping', 'completed'];

const STATUS_CONFIG = {
    pending:   { label: 'รอยืนยัน',        icon: '🕐', color: '#f59e0b' },
    shipping:  { label: 'กำลังจัดส่ง',     icon: '🚚', color: '#a855f7' },
    completed: { label: 'จัดส่งสำเร็จ',    icon: '✅', color: '#10b981' },
    cancelled: { label: 'ยกเลิกออร์เดอร์', icon: '❌', color: '#ef4444' },
};

const isCancelled = (status) => status === 'cancelled';

function ProgressBar({ currentStatus }) {
    const cancelledOrRefunded = isCancelled(currentStatus);
    const currentIdx = STEPS.indexOf(currentStatus);

    return (
        <div className="progress-bar-wrap">
            {STEPS.map((step, idx) => {
                const cfg = STATUS_CONFIG[step];
                const done = !cancelledOrRefunded && idx <= currentIdx;
                const active = step === currentStatus && !cancelledOrRefunded;
                return (
                    <React.Fragment key={step}>
                        <div className={`step-node ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                            <div className="step-circle">
                                {done ? (active ? cfg.icon : '✓') : <span className="step-num">{idx + 1}</span>}
                            </div>
                            <span className="step-label">{cfg.label}</span>
                        </div>
                        {idx < STEPS.length - 1 && (
                            <div className={`step-line ${!cancelledOrRefunded && idx < currentIdx ? 'done' : ''}`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

function TimelineItem({ entry, isLast }) {
    const cfg = STATUS_CONFIG[entry.status] || { label: entry.status, icon: '●', color: '#6b7280' };
    return (
        <div className="timeline-item">
            <div className="tl-left">
                <div className="tl-dot" style={{ background: cfg.color, boxShadow: `0 0 10px ${cfg.color}60` }}>
                    {cfg.icon}
                </div>
                {!isLast && <div className="tl-line" />}
            </div>
            <div className="tl-content">
                <div className="tl-status" style={{ color: cfg.color }}>{cfg.label}</div>
                {entry.note && <div className="tl-note">{entry.note}</div>}
                <div className="tl-meta">
                    {entry.changed_by && <span className="tl-by">โดย {entry.changed_by}</span>}
                    <span className="tl-time">
                        {new Date(entry.created_at).toLocaleDateString('th-TH', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                        })}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function OrderTrackPage() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        axios.get(`${API}/api/orders/${id}/track`)
            .then(res => setData(res.data.data))
            .catch(() => setError('ไม่พบข้อมูลคำสั่งซื้อนี้'))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) return (
        <div className="track-page">
            <div className="track-container">
                <div className="track-skeleton-title" />
                <div className="track-skeleton-bar" />
                <div className="track-skeleton-card" />
            </div>
        </div>
    );

    if (error) return (
        <div className="track-page">
            <div className="track-container track-error">
                <div className="error-icon">📭</div>
                <p>{error}</p>
                <Link to="/my-orders" className="btn-back">← กลับไปหน้าคำสั่งซื้อ</Link>
            </div>
        </div>
    );

    const cfg = STATUS_CONFIG[data.status] || STATUS_CONFIG.pending;
    const cancelled = isCancelled(data.status);

    return (
        <div className="track-page">
            <div className="track-container">
                {/* Header */}
                <div className="track-header">
                    <Link to="/my-orders" className="track-back-link">← คำสั่งซื้อของฉัน</Link>
                    <h1 className="track-title">ติดตามพัสดุ</h1>
                    <div className="track-order-id">คำสั่งซื้อ #{data.order_id}</div>
                </div>

                {/* Status Hero */}
                <div className={`status-hero ${cancelled ? 'cancelled' : ''}`}>
                    <div className="status-hero-icon">{cfg.icon}</div>
                    <div className="status-hero-label" style={{ color: cfg.color }}>{cfg.label}</div>
                    {cancelled && (
                        <div className="cancelled-badge">คำสั่งซื้อนี้ถูก{cfg.label}</div>
                    )}
                </div>

                {/* Progress Bar */}
                {!cancelled && <ProgressBar currentStatus={data.status} />}

                {/* Tracking Info */}
                {(data.tracking_number || data.shipping_provider) && (
                    <div className="tracking-card">
                        <div className="tracking-card-title">📍 ข้อมูลการจัดส่ง</div>
                        <div className="tracking-info-grid">
                            {data.shipping_provider && (
                                <div className="tracking-info-item">
                                    <span className="ti-label">ขนส่ง</span>
                                    <span className="ti-value">{data.shipping_provider}</span>
                                </div>
                            )}
                            {data.tracking_number && (
                                <div className="tracking-info-item">
                                    <span className="ti-label">เลขพัสดุ</span>
                                    <span className="ti-value tracking-num">{data.tracking_number}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Timeline */}
                <div className="timeline-section">
                    <h2 className="timeline-title">📋 ประวัติสถานะ</h2>
                    {data.timeline && data.timeline.length > 0 ? (
                        <div className="timeline">
                            {[...data.timeline].reverse().map((entry, idx) => (
                                <TimelineItem key={idx} entry={entry} isLast={idx === data.timeline.length - 1} />
                            ))}
                        </div>
                    ) : (
                        <p className="no-timeline">ยังไม่มีประวัติสถานะ</p>
                    )}
                </div>
            </div>
        </div>
    );
}
