
ALTER TABLE clients DROP CONSTRAINT IF EXISTS uq_clients_document;
ALTER TABLE clients DROP COLUMN IF EXISTS document;

CREATE TABLE IF NOT EXISTS products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    price           NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS sales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id),
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price      NUMERIC(12,2) NOT NULL,
    sale_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_client_id  ON sales (client_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales (product_id);
