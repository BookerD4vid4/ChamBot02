import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('chambot_user')) || null; } catch { return null; }
    });

    const [token, setToken] = useState(() => localStorage.getItem('chambot_token') || null);

    const loginWithToken = (userData, jwt) => {
        setUser(userData);
        setToken(jwt);
        localStorage.setItem('chambot_user', JSON.stringify(userData));
        localStorage.setItem('chambot_token', jwt);
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('chambot_user');
        localStorage.removeItem('chambot_token');
        localStorage.removeItem('chambot_cart');
        sessionStorage.removeItem('chatbot_messages');
        window.location.href = '/login'; // Force app reload to clear memory state
    };

    const isAdmin = user?.role === 'admin';

    return (
        <AuthContext.Provider value={{ user, token, loginWithToken, logout, isAdmin }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
