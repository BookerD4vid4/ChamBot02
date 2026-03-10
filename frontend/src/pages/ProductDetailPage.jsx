import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Package, Tag, CheckCircle, AlertTriangle } from 'lucide-react';
import { getProductById, getImageUrl } from '../api';
import ProductImage from '../components/ProductImage';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import './ProductDetailPage.css';

const formatPrice = (p) =>
    new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(p);

const ProductDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { addItem } = useCart();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedVariant, setSelectedVariant] = useState(null);
    const [qty, setQty] = useState(1);

    useEffect(() => {
        getProductById(id)
            .then(r => {
                const p = r.data.data;
                setProduct(p);
                if (p.variants?.length) setSelectedVariant(p.variants[0]);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [id]);

    const handleAddToCart = () => {
        if (!user) {
            toast.error('กรุณาเข้าสู่ระบบก่อนเพิ่มสินค้าลงตะกร้า', {
                style: { background: '#1f2937', color: '#f9fafb', border: '1px solid #ef4444' }
            });
            navigate('/login');
            return;
        }
        if (!selectedVariant) return;
        addItem(product, selectedVariant, qty);
        toast.success(`เพิ่ม ${product.name} ลงตะกร้าแล้ว!`, {
            style: { background: '#1f2937', color: '#f9fafb', border: '1px solid #10b981' }
        });
    };

    if (loading) return (
        <div className="page-wrapper">
            <div className="container">
                <div className="product-detail-skeleton">
                    <div className="skeleton" style={{ height: 480, borderRadius: 16 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="skeleton" style={{ height: 24, borderRadius: 8, width: `${80 - i * 10}%` }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    if (!product) return (
        <div className="page-wrapper">
            <div className="container" style={{ textAlign: 'center', paddingTop: 80 }}>
                <h2>ไม่พบสินค้า</h2>
                <Link to="/shop" className="btn btn-primary" style={{ marginTop: 16 }}>กลับสู่ร้านค้า</Link>
            </div>
        </div>
    );

    const inStock = selectedVariant?.stock_quantity > 0;

    return (
        <div className="page-wrapper">
            <div className="container">
                {/* Back */}
                <Link to="/shop" className="back-link">
                    <ArrowLeft size={16} /> กลับสู่ร้านค้า
                </Link>

                <div className="product-detail-grid">
                    {/* Image */}
                    <div className="product-detail-image-wrap">
                        <ProductImage
                            src={selectedVariant?.image_url || product.image_url}
                            alt={product.name}
                            className="product-detail-image"
                            size={48}
                        />
                        <div className="product-detail-image-glow" />
                    </div>

                    {/* Info */}
                    <div className="product-detail-info">
                        {product.category_name && (
                            <span className="badge badge-green">{product.category_name}</span>
                        )}
                        <h1 className="product-detail-name">{product.name}</h1>
                        {product.description && (
                            <p className="product-detail-desc">{product.description}</p>
                        )}

                        {/* Price */}
                        {selectedVariant && (
                            <div className="product-detail-price">
                                {formatPrice(selectedVariant.price)}
                                {selectedVariant.unit && <span className="price-unit">/ {selectedVariant.unit}</span>}
                            </div>
                        )}

                        {/* Stock */}
                        <div className={`stock-status ${inStock ? 'in-stock' : 'out-of-stock'}`}>
                            {inStock ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                            <span>{inStock ? `มีสินค้า ${selectedVariant?.stock_quantity} ชิ้น` : 'สินค้าหมด'}</span>
                        </div>

                        {/* Variants */}
                        {product.variants?.length > 1 && (
                            <div className="variant-section">
                                <label className="variant-label">
                                    <Package size={14} /> เลือกรูปแบบสินค้า
                                </label>
                                <div className="variant-grid">
                                    {product.variants.map(v => (
                                        <button
                                            key={v.variant_id}
                                            className={`variant-chip ${selectedVariant?.variant_id === v.variant_id ? 'selected' : ''}`}
                                            onClick={() => { setSelectedVariant(v); setQty(1); }}
                                        >
                                            <span className="variant-sku">{v.sku}</span>
                                            <span className="variant-price">{formatPrice(v.price)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* SKU */}
                        {selectedVariant?.sku && (
                            <div className="product-meta">
                                <Tag size={13} />
                                <span>SKU: <strong>{selectedVariant.sku}</strong></span>
                            </div>
                        )}

                        {/* Qty + Add to Cart */}
                        <div className="add-to-cart-section">
                            <div className="qty-selector">
                                <button onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
                                <span>{qty}</span>
                                <button onClick={() => setQty(q => q + 1)}>+</button>
                            </div>
                            <button
                                className="btn btn-primary btn-lg"
                                style={{ flex: 1 }}
                                onClick={handleAddToCart}
                                disabled={!inStock || !selectedVariant}
                            >
                                <ShoppingCart size={18} />
                                {inStock ? 'เพิ่มในตะกร้า' : 'สินค้าหมด'}
                            </button>
                        </div>

                        {/* All Variants Table */}
                        {product.variants?.length > 0 && (
                            <div className="variants-table-wrap">
                                <h3 className="variants-table-title">รายละเอียด Variants</h3>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>SKU</th>
                                            <th>ราคา</th>
                                            <th>สต็อก</th>
                                            <th>หน่วย</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {product.variants.map(v => (
                                            <tr key={v.variant_id} onClick={() => setSelectedVariant(v)} style={{ cursor: 'pointer' }}>
                                                <td>{v.sku}</td>
                                                <td style={{ color: 'var(--accent)' }}>{formatPrice(v.price)}</td>
                                                <td>
                                                    {v.stock_quantity <= v.low_stock_threshold && v.stock_quantity > 0
                                                        ? <span style={{ color: 'var(--warning)' }}>{v.stock_quantity} ⚠</span>
                                                        : v.stock_quantity === 0
                                                            ? <span style={{ color: 'var(--danger)' }}>หมด</span>
                                                            : v.stock_quantity}
                                                </td>
                                                <td style={{ color: 'var(--text-muted)' }}>{v.unit || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductDetailPage;
