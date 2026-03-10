-- ══════════════════════════════════════════════════════════════════════════════
-- CHAMBOT — SUPABASE COMPLETE SETUP
-- รัน SQL นี้ใน Supabase Dashboard → SQL Editor → New Query
-- คัดลอกทั้งหมดแล้วกด Run เพียงครั้งเดียว
-- ══════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════
-- SECTION 1: EXTENSIONS
-- ════════════════════════════════════════

-- pgvector — สำหรับ semantic search (AI embedding)
CREATE EXTENSION IF NOT EXISTS vector;


-- ════════════════════════════════════════
-- SECTION 2: ENUM TYPES
-- ════════════════════════════════════════

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin','customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    -- 4 สถานะ: pending → shipping → completed (หรือ cancelled)
    CREATE TYPE order_status AS ENUM ('pending','shipping','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending','paid','failed','refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('qr','cod');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE shipment_status AS ENUM ('preparing','shipped','delivered','returned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE inventory_transaction_type AS ENUM ('purchase','restock','adjustment','cancel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ════════════════════════════════════════
-- SECTION 3: CORE TABLES
-- ════════════════════════════════════════

-- 3.1 USERS
CREATE TABLE IF NOT EXISTS public.users (
    id              INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    phone_number    VARCHAR(20) NOT NULL UNIQUE,
    full_name       VARCHAR(255),
    email           VARCHAR(255),
    address         TEXT,
    role            user_role NOT NULL DEFAULT 'customer',
    is_active       BOOLEAN DEFAULT true,
    suspended_by    INT REFERENCES public.users(id) ON DELETE SET NULL,
    suspended_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 3.2 USER ADDRESSES
CREATE TABLE IF NOT EXISTS public.user_addresses (
    address_id      INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id         INT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    recipient_name  VARCHAR(255) NOT NULL,
    address_line    TEXT NOT NULL,
    province        VARCHAR(150),
    postal_code     VARCHAR(20),
    is_default      BOOLEAN DEFAULT false,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3.3 CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    category_id     INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name            VARCHAR(255) NOT NULL UNIQUE,
    parent_id       INT REFERENCES public.categories(category_id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 3.4 PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
    product_id      INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name            VARCHAR(255) NOT NULL CHECK (name <> ''),
    description     TEXT,
    slug            VARCHAR(255) UNIQUE,
    category_id     INT REFERENCES public.categories(category_id) ON DELETE SET NULL,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 3.5 PRODUCT VARIANTS
CREATE TABLE IF NOT EXISTS public.product_variants (
    variant_id          INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    product_id          INT NOT NULL REFERENCES public.products(product_id) ON DELETE CASCADE,
    sku                 VARCHAR(100) UNIQUE NOT NULL,
    price               NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    stock_quantity      INT DEFAULT 0 CHECK (stock_quantity >= 0),
    reserved_quantity   INT DEFAULT 0 CHECK (reserved_quantity >= 0),
    image_url           TEXT,
    unit                VARCHAR(50),
    low_stock_threshold INT DEFAULT 5 CHECK (low_stock_threshold >= 0),
    is_main             BOOLEAN DEFAULT false,
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- 3.6 CARTS
CREATE TABLE IF NOT EXISTS public.carts (
    cart_id     INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id     INT UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cart_items (
    cart_item_id    INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    cart_id         INT NOT NULL REFERENCES public.carts(cart_id) ON DELETE CASCADE,
    variant_id      INT NOT NULL REFERENCES public.product_variants(variant_id) ON DELETE CASCADE,
    quantity        INT NOT NULL CHECK (quantity > 0),
    UNIQUE(cart_id, variant_id)
);

-- 3.7 ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    order_id            INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id             INT REFERENCES public.users(id) ON DELETE SET NULL,
    total_amount        NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    status              order_status DEFAULT 'pending',
    payment_status      payment_status DEFAULT 'pending',
    tracking_number     VARCHAR(150),
    shipping_provider   VARCHAR(100),
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    order_item_id   INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id        INT NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
    variant_id      INT REFERENCES public.product_variants(variant_id) ON DELETE SET NULL,
    price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    quantity        INT NOT NULL CHECK (quantity > 0),
    UNIQUE(order_id, variant_id)
);

-- 3.8 ORDER STATUS LOGS
CREATE TABLE IF NOT EXISTS public.order_status_logs (
    log_id      INT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    order_id    INT NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
    status      VARCHAR(50) NOT NULL,
    changed_by  VARCHAR(100) DEFAULT 'system',
    note        TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 3.9 PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
    payment_id      INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id        INT NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
    method          payment_method,
    transaction_ref TEXT,
    paid_at         TIMESTAMPTZ,
    status          payment_status DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3.10 SHIPMENTS
CREATE TABLE IF NOT EXISTS public.shipments (
    shipment_id     INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    order_id        INT NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
    address_id      INT REFERENCES public.user_addresses(address_id) ON DELETE SET NULL,
    address         TEXT,
    tracking_number VARCHAR(150),
    status          shipment_status DEFAULT 'preparing',
    shipped_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3.11 INVENTORY TRANSACTIONS (Stock Ledger)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    transaction_id      INT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    variant_id          INT NOT NULL REFERENCES public.product_variants(variant_id) ON DELETE CASCADE,
    quantity_changed    INT NOT NULL CHECK (quantity_changed <> 0),
    transaction_type    inventory_transaction_type NOT NULL,
    reference_order_id  INT REFERENCES public.orders(order_id) ON DELETE SET NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- 3.12 PRODUCT EMBEDDINGS (Vector Search)
CREATE TABLE IF NOT EXISTS public.product_embeddings (
    product_id  INT PRIMARY KEY REFERENCES public.products(product_id) ON DELETE CASCADE,
    embedding   vector(384) NOT NULL,
    text_used   TEXT,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 3.13 CUSTOMER OTPs (สำหรับ OTP login ของลูกค้า)
CREATE TABLE IF NOT EXISTS public.customer_otps (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       VARCHAR(20) NOT NULL,
    otp_code    VARCHAR(6) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used        BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- 3.14 PAYMENT WEBHOOKS (สำหรับ log webhook จาก Omise)
CREATE TABLE IF NOT EXISTS public.payment_webhooks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type  VARCHAR(100),
    payload     JSONB,
    processed   BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT now()
);


-- ════════════════════════════════════════
-- SECTION 4: INDEXES
-- ════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_users_role            ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active       ON public.users(is_active);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id        ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at     ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status_logs_order_id ON public.order_status_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id  ON public.order_items(order_id);

-- HNSW index for fast cosine similarity (pgvector)
CREATE INDEX IF NOT EXISTS idx_product_embeddings_hnsw
    ON public.product_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);


-- ════════════════════════════════════════
-- SECTION 5: VIEWS
-- ════════════════════════════════════════

-- 5.1 Product list view (used by GET /api/products)
CREATE OR REPLACE VIEW public.product_list_view AS
SELECT
    p.product_id,
    p.name AS product_name,
    p.description,
    p.slug,
    p.is_active,
    p.category_id,
    p.created_at,
    p.updated_at,
    c.name AS category_name,
    COUNT(pv.variant_id)::int AS variant_count,
    COALESCE(SUM(pv.stock_quantity), 0)::int AS total_stock,
    MIN(pv.price) AS min_price,
    MAX(pv.price) AS max_price,
    MIN(pv.low_stock_threshold) AS low_stock_threshold,
    (
        SELECT pv2.image_url
        FROM product_variants pv2
        WHERE pv2.product_id = p.product_id AND pv2.is_main = true AND pv2.is_active = true
        LIMIT 1
    ) AS image_url
FROM public.products p
LEFT JOIN public.categories c ON p.category_id = c.category_id
LEFT JOIN public.product_variants pv
    ON pv.product_id = p.product_id AND pv.is_active = true
GROUP BY p.product_id, c.name, c.category_id;

-- 5.2 Order list view (used by admin orders API)
CREATE OR REPLACE VIEW public.order_list_view AS
SELECT
    o.order_id,
    o.user_id,
    o.total_amount,
    o.status,
    o.payment_status,
    o.tracking_number,
    o.shipping_provider,
    o.created_at,
    o.updated_at,
    s.status          AS shipment_status,
    s.tracking_number AS shipment_tracking,
    s.address,
    u.full_name       AS customer_name,
    u.phone_number
FROM public.orders o
LEFT JOIN public.shipments s ON o.order_id = s.order_id
LEFT JOIN public.users u ON o.user_id = u.id;


-- ════════════════════════════════════════
-- SECTION 6: FUNCTIONS
-- ════════════════════════════════════════

-- Semantic search helper: returns product_id ranked by cosine similarity
-- Usage: SELECT * FROM search_products_by_embedding('[0.1,0.2,...]'::vector, 10);
CREATE OR REPLACE FUNCTION search_products_by_embedding(
    query_embedding vector(384),
    match_count     INT DEFAULT 10
)
RETURNS TABLE (
    product_id  INT,
    similarity  FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        pe.product_id,
        1 - (pe.embedding <=> query_embedding) AS similarity
    FROM public.product_embeddings pe
    JOIN public.products p ON p.product_id = pe.product_id
    WHERE p.is_active = true
    ORDER BY pe.embedding <=> query_embedding
    LIMIT match_count;
$$;
