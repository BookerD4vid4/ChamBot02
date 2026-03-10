import axios from 'axios';

export const BACKEND_URL = 'http://localhost:5000';

// Convert relative path to full URL for images stored on the backend
export const getImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return `${BACKEND_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

const API = axios.create({
    baseURL: `${BACKEND_URL}/api`,
    timeout: 10000,
});

// Automatically attach JWT token to every request
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('chambot_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Automatically handle stale tokens (e.g., after DB reset)
API.interceptors.response.use(
    (response) => response,
    (error) => {
        const isAuthError = error.response?.status === 401;
        const isUserNotFound = error.response?.status === 404 && error.config?.url?.includes('/auth/me');
        if (isAuthError || isUserNotFound) {
            localStorage.removeItem('chambot_token');
            localStorage.removeItem('chambot_user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// ─── Products ───────────────────────────────────────────
export const getProducts = (params = {}) => API.get('/products', { params });
export const getProductById = (id) => API.get(`/products/${id}`);
export const createProduct = (data) => API.post('/products', data);
export const updateProduct = (id, data) => API.put(`/products/${id}`, data);
export const deleteProduct = (id) => API.delete(`/products/${id}`);
export const getLowStockProducts = () => API.get('/products/alerts/low-stock');
export const getAllVariants = (params = {}) => API.get('/products/variants', { params });
export const adjustStock = (variantId, delta, reason) => API.patch(`/products/variants/${variantId}/stock`, { delta, reason });
export const updateVariantThreshold = (variantId, low_stock_threshold) =>
    API.patch(`/products/variants/${variantId}/stock`, { delta: 0, low_stock_threshold });
export const setMainVariant = (variantId) => API.patch(`/products/variants/${variantId}/set-main`);
export const getStockHistory = (variantId) => API.get(`/products/variants/${variantId}/history`);
export const getAllStockHistory = (limit = 50) => API.get('/products/variants/history', { params: { limit } });

// ─── Categories ─────────────────────────────────────────
export const getCategories = () => API.get('/categories');
export const createCategory = (data) => API.post('/categories', data);
export const updateCategory = (id, data) => API.put(`/categories/${id}`, data);
export const deleteCategory = (id) => API.delete(`/categories/${id}`);

// ─── Orders (User) ──────────────────────────────────────
export const getOrders = (params = {}) => API.get('/orders', { params });
export const getOrderById = (id) => API.get(`/orders/${id}`);
export const createOrder = (data) => API.post('/orders', data);
export const getMyOrders = (params = {}) => API.get('/orders/my', { params });
export const trackOrder = (id) => API.get(`/orders/${id}/track`);

// ─── Orders (Admin) ─────────────────────────────────────
export const getAdminOrders = (params = {}) => API.get('/admin/orders', { params });
export const getAdminOrderById = (id) => API.get(`/admin/orders/${id}`);
export const updateOrderStatus = (id, data) => API.patch(`/admin/orders/${id}/status`, data);
// Keep for backward compat
export const updateOrder = (id, data) => API.patch(`/admin/orders/${id}/status`, data);

// ─── Upload ─────────────────────────────────────────────
export const uploadImage = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await API.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    // Backend returns { success, imageUrl } — normalise to { url }
    if (res.data?.imageUrl) res.data.url = getImageUrl(res.data.imageUrl);
    return res;
};

// ─── OCR ─────────────────────────────────────────────────
export const ocrScan = (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return API.post('/ocr/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000, // OCR can take longer
    });
};

// ─── Auth ─────────────────────────────────────────────────
export const requestOtp = (phone) => API.post('/auth/request-otp', { phone });
export const verifyOtp = (phone, otp) => API.post('/auth/verify-otp', { phone, otp });
export const getMe = () => API.get('/auth/me');
export const updateProfile = (data) => API.patch('/auth/profile', data);
export const getMyAddresses = () => API.get('/auth/addresses');
export const addMyAddress = (data) => API.post('/auth/addresses', data);
export const updateMyAddress = (id, data) => API.put(`/auth/addresses/${id}`, data);
export const deleteMyAddress = (id) => API.delete(`/auth/addresses/${id}`);

// ─── Reports (Admin) ──────────────────────────────────────
export const getSalesReport = (p = {}) => API.get('/admin/reports/sales', { params: p });
export const getProductReport = (p = {}) => API.get('/admin/reports/products', { params: p });
export const getInventoryReport = () => API.get('/admin/reports/inventory');
export const getCustomerReport = (p = {}) => API.get('/admin/reports/customers', { params: p });
export const getFinancialReport = (p = {}) => API.get('/admin/reports/financial', { params: p });

// ─── Admin Members ──────────────────────────────────────
export const getAdminMembers = () => API.get('/admin/users');
export const suspendMember = (id) => API.patch(`/admin/users/${id}/suspend`);
export const unsuspendMember = (id) => API.patch(`/admin/users/${id}/unsuspend`);
export const initiateAddAdmin = (newAdminPhone) => API.post('/admin/users/add-admin/initiate', { newAdminPhone });
export const confirmAddAdmin = (newAdminPhone, requesterOtp, newAdminOtp) =>
    API.post('/admin/users/add-admin/confirm', { newAdminPhone, requesterOtp, newAdminOtp });

// ─── Embeddings (Admin) ──────────────────────────────────────
export const getEmbeddingStatus = () => API.get('/admin/embeddings/status');
export const checkProductEmbedding = (productId) => API.get(`/admin/embeddings/check/${productId}`);
export const embedSingleProduct = (productId) => API.post(`/admin/embeddings/embed/${productId}`);
export const reindexEmbeddings = () => API.post('/admin/embeddings/reindex');

// ─── Chatbot ─────────────────────────────────────────────────────────────────
export const sendChatMessage = (message, conversationHistory = [], cartItems = [], checkoutAddressId = null) =>
    API.post('/chatbot/message', { message, conversationHistory, cartItems, checkoutAddressId }, { timeout: 60000 });

// ─── Payment ─────────────────────────────────────────────────────────────────
export const createPayment = (orderId, method) =>
    API.post('/payment/create', { orderId, method });
export const getPaymentStatus = (orderId) =>
    API.get(`/payment/${orderId}/status`);

export default API;

