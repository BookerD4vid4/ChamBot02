import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Providers
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';

// Layout Components
import Navbar from './components/Navbar';
import Footer from './components/Footer';

// Customer Pages
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderSuccessPage from './pages/OrderSuccessPage';
import LoginPage from './pages/LoginPage';
import MyOrdersPage from './pages/MyOrdersPage';
import OrderTrackPage from './pages/OrderTrackPage';
import ProfileSetupPage from './pages/ProfileSetupPage';
import CustomerProfilePage from './pages/CustomerProfilePage';
import SuspendedPage from './pages/SuspendedPage';

// Admin Pages
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import ProductsPage from './pages/admin/ProductsPage';
import CategoriesPage from './pages/admin/CategoriesPage';
import OrdersPage from './pages/admin/OrdersPage';
import OcrImportPage from './pages/admin/OcrImportPage';
import StockPage from './pages/admin/StockPage';
import ReportPage from './pages/admin/ReportPage';
import MembersPage from './pages/admin/MembersPage';

// Chatbot
import ChatbotWidget from './components/ChatbotWidget';

// CSS
import './index.css';
import './pages/admin/ProductsPage.css';
import './pages/admin/AdminLayout.css';
import './pages/admin/StockPage.css';

const CustomerLayout = ({ children }) => (
  <>
    <Navbar />
    <main>{children}</main>
    <Footer />
    <ChatbotWidget />
  </>
);

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#1f2937',
                color: '#f9fafb',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: {
                iconTheme: { primary: '#10b981', secondary: '#fff' }
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#fff' }
              }
            }}
          />

          <Routes>
            {/* Customer Routes */}
            <Route path="/" element={<CustomerLayout><HomePage /></CustomerLayout>} />
            <Route path="/shop" element={<CustomerLayout><ShopPage /></CustomerLayout>} />
            <Route path="/product/:id" element={<CustomerLayout><ProductDetailPage /></CustomerLayout>} />
            <Route path="/cart" element={<CustomerLayout><CartPage /></CustomerLayout>} />
            <Route path="/checkout" element={<CustomerLayout><CheckoutPage /></CustomerLayout>} />
            <Route path="/order-success" element={<CustomerLayout><OrderSuccessPage /></CustomerLayout>} />
            <Route path="/my-orders" element={<CustomerLayout><MyOrdersPage /></CustomerLayout>} />
            <Route path="/orders/:id/track" element={<CustomerLayout><OrderTrackPage /></CustomerLayout>} />
            <Route path="/profile" element={<CustomerLayout><CustomerProfilePage /></CustomerLayout>} />
            <Route path="/profile-setup" element={<ProfileSetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/suspended" element={<SuspendedPage />} />

            {/* Admin Routes */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="categories" element={<CategoriesPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="ocr" element={<OcrImportPage />} />
              <Route path="stock" element={<StockPage />} />
              <Route path="reports" element={<ReportPage />} />
              <Route path="members" element={<MembersPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
