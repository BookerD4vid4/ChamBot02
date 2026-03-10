import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, User, LogOut, Settings, Menu, X, Zap } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import CartDrawer from './CartDrawer';
import './Navbar.css';

const Navbar = () => {
    const { totalItems, setIsOpen: setCartOpen } = useCart();
    const { user, logout, isAdmin } = useAuth();
    const [search, setSearch] = useState('');
    const [menuOpen, setMenuOpen] = useState(false);
    const navigate = useNavigate();
    const inputRef = useRef();

    const handleSearch = (e) => {
        e.preventDefault();
        if (search.trim()) {
            navigate(`/shop?search=${encodeURIComponent(search.trim())}`);
            setSearch('');
            setMenuOpen(false);
        }
    };

    return (
        <>
            <nav className="navbar">
                <div className="container navbar-inner">
                    {/* Logo */}
                    <Link to="/" className="navbar-logo">
                        <div className="logo-icon">
                            <Zap size={18} fill="currentColor" />
                        </div>
                        <span className="logo-text">Chambot</span>
                    </Link>

                    {/* Desktop Search */}
                    <form className="navbar-search" onSubmit={handleSearch}>
                        <Search size={16} className="search-icon" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="ค้นหาสินค้า..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="search-input"
                        />
                    </form>

                    {/* Desktop Nav Links */}
                    <div className="navbar-links">
                        <Link to="/shop" className="nav-link">สินค้า</Link>
                        {isAdmin && (
                            <Link to="/admin/dashboard" className="nav-link nav-link-admin">
                                <Settings size={14} /> Admin
                            </Link>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="navbar-actions">
                        {/* Cart */}
                        {user && (
                            <button className="cart-btn" onClick={() => setCartOpen(true)}>
                                <ShoppingCart size={20} />
                                {totalItems > 0 && (
                                    <span className="cart-badge">{totalItems}</span>
                                )}
                            </button>
                        )}

                        {/* Auth */}
                        {user ? (
                            <div className="user-menu">
                                <Link to="/profile" className="user-name-link" title="โปรไฟล์">
                                    <div className="user-avatar">
                                        {(user.full_name || user.phone_number || user.phone || '?')[0].toUpperCase()}
                                    </div>
                                    <span>{user.full_name || user.phone || user.phone_number}</span>
                                </Link>
                                <div className="user-menu-divider" />
                                <button className="logout-btn" onClick={logout} title="ออกจากระบบ">
                                    <LogOut size={16} />
                                </button>
                            </div>
                        ) : (
                            <Link to="/login" className="btn btn-primary btn-sm">
                                <User size={14} /> เข้าสู่ระบบ
                            </Link>
                        )}

                        {/* Mobile Menu Toggle */}
                        <button className="mobile-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
                            {menuOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {menuOpen && (
                    <div className="mobile-menu">
                        <form className="mobile-search" onSubmit={handleSearch}>
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="ค้นหาสินค้า..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </form>
                        <Link to="/shop" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>สินค้า</Link>
                        {user && (
                            <Link to="/cart" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>ตะกร้า ({totalItems})</Link>
                        )}
                        {isAdmin && (
                            <Link to="/admin/dashboard" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>Admin Panel</Link>
                        )}
                        {!user && (
                            <Link to="/login" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>เข้าสู่ระบบ</Link>
                        )}
                        {user && (
                            <>
                                <Link to="/profile" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>โปรไฟล์</Link>
                                <Link to="/my-orders" className="mobile-nav-link" onClick={() => setMenuOpen(false)}>คำสั่งซื้อของฉัน</Link>
                                <button className="mobile-nav-link mobile-logout" onClick={() => { logout(); setMenuOpen(false); }}>
                                    ออกจากระบบ
                                </button>
                            </>
                        )}
                    </div>
                )}
            </nav>
            <CartDrawer />
        </>
    );
};

export default Navbar;
