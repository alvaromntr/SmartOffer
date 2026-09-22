
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_consents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    terms_version       VARCHAR(20) NOT NULL,
    privacy_version     VARCHAR(20) NOT NULL,
    accepted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address          VARCHAR(64),
    user_agent          TEXT
);

CREATE TABLE IF NOT EXISTS clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL,
    phone           VARCHAR(30),
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_name  ON clients (name);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (email);

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

CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id),
    user_email      VARCHAR(150),
    action          VARCHAR(50) NOT NULL,
    entity          VARCHAR(50),
    entity_id       VARCHAR(64),
    method          VARCHAR(10),
    path            VARCHAR(255),
    status_code     INTEGER,
    ip_address      VARCHAR(64),
    user_agent      TEXT,
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action  ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
