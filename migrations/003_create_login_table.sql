-- Migration: Create login table for user management
-- Version: 003
-- Created: 2026-01-23

CREATE TABLE IF NOT EXISTS login (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone_no VARCHAR(15),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    role VARCHAR(30) NOT NULL,
    page_access TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_login_username ON login(username);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_login_email ON login(email);

-- Create index on role for filtering
CREATE INDEX IF NOT EXISTS idx_login_role ON login(role);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_login_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_login_updated_at ON login;
CREATE TRIGGER trigger_login_updated_at
    BEFORE UPDATE ON login
    FOR EACH ROW
    EXECUTE FUNCTION update_login_updated_at();

-- Insert default admin user (password: admin123 - will be hashed by application)
-- This is just for reference, actual insertion should be done via API with proper hashing
COMMENT ON TABLE login IS 'User authentication and authorization table with role-based access control';
