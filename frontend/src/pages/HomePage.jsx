import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Truck, Headphones, Star, Zap, TrendingUp } from 'lucide-react';
import { getProducts, getCategories } from '../api';
import ProductCard from '../components/ProductCard';
import './HomePage.css';

const HomePage = () => {
    const [featured, setFeatured] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [prodRes, catRes] = await Promise.all([getProducts(), getCategories()]);
                setFeatured((prodRes.data.data || []).slice(0, 8));
                setCategories(catRes.data.data || []);
            } catch {
                // use empty state
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const features = [
        { icon: <Truck size={24} />, title: 'จัดส่งทั่วประเทศ', desc: 'รวดเร็ว ปลอดภัย ทุกพื้นที่' },
        { icon: <ShieldCheck size={24} />, title: 'รับประกันสินค้า', desc: 'คุณภาพมาตรฐาน คืนสินค้าได้' },
        { icon: <Headphones size={24} />, title: 'บริการ 24/7', desc: 'พร้อมช่วยเหลือตลอดเวลา' },
        { icon: <Star size={24} />, title: 'รีวิวจริง', desc: 'ลูกค้าจริง ความคิดเห็นจริง' },
    ];

    const CATEGORY_ICONS = {
        'เครื่องดื่ม':              '🥤',
        'อาหารแห้งและเครื่องปรุง':  '🌾',
        'ขนมขบเคี้ยว':              '🍿',
        'ของใช้ส่วนตัว':            '🧴',
        'ผลิตภัณฑ์ทำความสะอาด':    '🧹',
        'ยาสามัญประจำบ้าน':         '💊',
        'สินค้าเบ็ดเตล็ด':          '🛍️',
        'ของสดและอื่นๆ':            '🥬',
    };

    return (
        <div className="home-page">
            {/* Hero */}
            <section className="hero">
                <div className="hero-bg">
                    <div className="hero-orb hero-orb-1" />
                    <div className="hero-orb hero-orb-2" />
                    <div className="hero-grid" />
                </div>
                <div className="container hero-content">
                    <div className="hero-badge">
                        <Zap size={12} fill="currentColor" />
                        <span>ร้านค้าออนไลน์สมัยใหม่</span>
                    </div>
                    <h1 className="hero-title">
                        ช้อปง่าย ได้ของดี<br />
                        <span className="hero-gradient-text">กับ Chambot Store</span>
                    </h1>
                    <p className="hero-desc">
                        สินค้าคุณภาพสูง หลากหลายหมวดหมู่ ราคาพอใจ<br />
                        บริการจัดส่งรวดเร็ว ปลอดภัย ทั่วประเทศไทย
                    </p>
                    <div className="hero-actions">
                        <Link to="/shop" className="btn btn-primary btn-lg">
                            ช้อปเลย <ArrowRight size={18} />
                        </Link>
                        <Link to="/shop" className="btn btn-secondary btn-lg">
                            ดูทั้งหมด
                        </Link>
                    </div>
                    <div className="hero-stats">
                        <div className="hero-stat"><span className="stat-num">500+</span><span>สินค้า</span></div>
                        <div className="hero-stat-divider" />
                        <div className="hero-stat"><span className="stat-num">10K+</span><span>ลูกค้า</span></div>
                        <div className="hero-stat-divider" />
                        <div className="hero-stat"><span className="stat-num">4.9★</span><span>คะแนน</span></div>
                    </div>
                </div>
            </section>

            {/* Features */}
            <section className="features-section">
                <div className="container features-grid">
                    {features.map((f, i) => (
                        <div key={i} className="feature-card">
                            <div className="feature-icon">{f.icon}</div>
                            <div>
                                <h4>{f.title}</h4>
                                <p>{f.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Categories */}
            {categories.length > 0 && (
                <section className="section">
                    <div className="container">
                        <div className="section-header">
                            <h2 className="section-title">หมวดหมู่สินค้า</h2>
                            <Link to="/shop" className="section-link">ดูทั้งหมด <ArrowRight size={14} /></Link>
                        </div>
                        <div className="categories-grid">
                            {categories.slice(0, 8).map((cat) => (
                                <Link key={cat.category_id} to={`/shop?category=${cat.category_id}`} className="category-chip">
                                    <span className="category-chip-icon">{CATEGORY_ICONS[cat.name] || '🛒'}</span>
                                    <span>{cat.name}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Featured Products */}
            <section className="section">
                <div className="container">
                    <div className="section-header">
                        <div className="section-title-group">
                            <TrendingUp size={20} className="section-icon" />
                            <h2 className="section-title">สินค้าแนะนำ</h2>
                        </div>
                        <Link to="/shop" className="section-link">ดูทั้งหมด <ArrowRight size={14} /></Link>
                    </div>

                    {loading ? (
                        <div className="product-grid">
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="skeleton" style={{ height: 320 }} />
                            ))}
                        </div>
                    ) : featured.length > 0 ? (
                        <div className="product-grid">
                            {featured.map(p => <ProductCard key={p.product_id} product={p} />)}
                        </div>
                    ) : (
                        <div className="empty-state">
                            <p>ยังไม่มีสินค้าในระบบ</p>
                            <p>กรุณาเพิ่มสินค้าใน Admin Panel</p>
                        </div>
                    )}
                </div>
            </section>

            {/* CTA Banner */}
            <section className="cta-banner">
                <div className="container cta-inner">
                    <div>
                        <h2>พร้อมช้อปได้เลย!</h2>
                        <p>สมัครสมาชิกรับส่วนลดพิเศษและสิทธิพิเศษมากมาย</p>
                    </div>
                    <Link to="/login" className="btn btn-primary btn-lg">เริ่มต้นเลย</Link>
                </div>
            </section>
        </div>
    );
};

export default HomePage;
