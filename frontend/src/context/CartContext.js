import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
    const [items, setItems] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('chambot_cart')) || [];
        } catch {
            return [];
        }
    });
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        localStorage.setItem('chambot_cart', JSON.stringify(items));
    }, [items]);

    const addItem = (product, variant, quantity = 1, silent = false) => {
        setItems(prev => {
            const key = `${product.product_id}-${variant.variant_id}`;
            const existing = prev.find(i => i.key === key);
            if (existing) {
                return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + quantity } : i);
            }
            return [...prev, {
                key,
                product_id: product.product_id,
                product_name: product.product_name || product.name,
                variant_id: variant.variant_id,
                sku: variant.sku,
                price: parseFloat(variant.price),
                image_url: variant.image_url || product.image_url,
                unit: variant.unit,
                quantity,
            }];
        });
        if (!silent) setIsOpen(true);
    };

    const removeItem = (key) => {
        setItems(prev => prev.filter(i => i.key !== key));
    };

    const updateQty = (key, quantity) => {
        if (quantity <= 0) return removeItem(key);
        setItems(prev => prev.map(i => i.key === key ? { ...i, quantity } : i));
    };

    const clearCart = () => setItems([]);

    const totalPrice = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

    return (
        <CartContext.Provider value={{
            items, addItem, removeItem, updateQty, clearCart,
            totalPrice, totalItems, isOpen, setIsOpen
        }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error('useCart must be used within CartProvider');
    return ctx;
};
