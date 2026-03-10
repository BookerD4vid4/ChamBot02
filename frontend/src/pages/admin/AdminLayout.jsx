import React, { useState, useEffect, createContext, useContext } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Package, Tag, ShoppingBag, Home, LogOut,
    Store, Layers, BarChart2, Bell, ChevronRight, Users
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getLowStockProducts } from '../../api';
import './AdminLayout.css';

export const AdminContext = createContext();
export const useAdmin = () => useContext(AdminContext);

const AdminLayout = () => {
    const { user, isAdmin, logout } = useAuth();
    const [lowStockCount, setLowStockCount] = useState(0);
    const location = useLocation();

    const fetchLowStock = async () => {
        try {
            const res = await getLowStockProducts();
            setLowStockCount(res.data.data?.length || 0);
        } catch (err) {
            console.error("Failed to fetch low stock count:", err);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            fetchLowStock();
            // Removed setInterval to comply with strictly cost-optimized and no-polling rules
        }
    }, [isAdmin, location.pathname]);

    if (!isAdmin) return <Navigate to="/login" replace />;

    const navGroups = [
        {
            label: 'ภาพรวม',
            items: [
                { to: '/admin/dashboard', icon: <LayoutDashboard size={17} />, label: 'Dashboard' },
            ]
        },
        {
            label: 'จัดการสินค้า',
            items: [
                { to: '/admin/products', icon: <Package size={17} />, label: 'สินค้า' },
                { to: '/admin/stock', icon: <Layers size={17} />, label: 'จัดการสต็อก', badge: lowStockCount > 0 ? lowStockCount : null },
                { to: '/admin/categories', icon: <Tag size={17} />, label: 'หมวดหมู่' },
            ]
        },
        {
            label: 'ธุรกิจ',
            items: [
                { to: '/admin/orders', icon: <ShoppingBag size={17} />, label: 'คำสั่งซื้อ' },
                { to: '/admin/reports', icon: <BarChart2 size={17} />, label: 'รายงาน & Analytics' },
            ]
        },
        {
            label: 'ระบบ',
            items: [
                { to: '/admin/members', icon: <Users size={17} />, label: 'สมาชิก' },
            ]
        }
    ];

    // Get current page title
    const getCurrentTitle = () => {
        const path = location.pathname;
        if (path.includes('dashboard')) return 'Dashboard';
        if (path.includes('products')) return 'สินค้า';
        if (path.includes('stock')) return 'จัดการสต็อก';
        if (path.includes('categories')) return 'หมวดหมู่';
        if (path.includes('orders')) return 'คำสั่งซื้อ';
        if (path.includes('reports')) return 'รายงาน';
        if (path.includes('ocr')) return 'OCR นำเข้า';
        if (path.includes('members')) return 'จัดการสมาชิก';
        return 'Admin';
    };

    return (
        <AdminContext.Provider value={{ fetchLowStock, lowStockCount }}>
            <div className="admin-layout">
                {/* Sidebar */}
                <aside className="admin-sidebar">
                <div className="admin-sidebar-logo">
                    <div className="logo-icon">
                        <Store size={18} />
                    </div>
                    <span className="logo-text">Chambot</span>
                    <span className="admin-badge">Admin</span>
                </div>

                <nav className="admin-nav">
                    {navGroups.map(group => (
                        <div key={group.label}>
                            <div className="admin-nav-section">{group.label}</div>
                            {group.items.map(item => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
                                >
                                    <div className="admin-nav-icon-wrap">
                                        {item.icon}
                                        {item.badge && <span className="nav-badge-dot">{item.badge}</span>}
                                    </div>
                                    <span>{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="admin-sidebar-footer">
                    <div className="admin-user">
                        <div className="admin-user-avatar">{user?.phone?.slice(-2) || 'AD'}</div>
                        <div className="admin-user-info">
                            <p className="admin-user-name">{user?.phone || 'Admin'}</p>
                            <p className="admin-user-role">ผู้ดูแลระบบ</p>
                        </div>
                    </div>
                    <div className="admin-sidebar-actions">
                        <NavLink to="/" className="sidebar-action-btn" title="กลับหน้าร้าน">
                            <Home size={15} />
                            <span>ร้านค้า</span>
                        </NavLink>
                        <button className="sidebar-action-btn danger" onClick={logout} title="ออกจากระบบ">
                            <LogOut size={15} />
                            <span>ออก</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                {/* Top Bar */}
                <div className="admin-topbar">
                    <div className="admin-topbar-left">
                        <span style={{ color: 'rgba(255,255,255,0.25)' }}>Chambot</span>
                        <ChevronRight size={13} style={{ color: 'rgba(255,255,255,0.15)' }} />
                        <span className="admin-topbar-breadcrumb">{getCurrentTitle()}</span>
                    </div>
                    <div className="admin-topbar-right">
                        {lowStockCount > 0 && (
                            <button className="topbar-btn" title={`${lowStockCount} สินค้าสต็อกต่ำ`} style={{ position: 'relative' }}>
                                <Bell size={16} />
                                <span style={{
                                    position: 'absolute', top: 6, right: 6,
                                    width: 7, height: 7, borderRadius: '50%',
                                    background: '#ef4444', border: '1.5px solid #0f1117'
                                }} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="admin-content">
                    <Outlet />
                </div>
            </main>
        </div>
        </AdminContext.Provider>
    );
};

export default AdminLayout;
