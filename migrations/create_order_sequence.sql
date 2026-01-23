/**
 * Create Order Number Sequence Table
 * This ensures atomic order number generation
 */

-- Create sequence table for order numbers
CREATE TABLE IF NOT EXISTS order_number_sequence (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_number INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize with single row
INSERT INTO order_number_sequence (id, last_number) 
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_order_no ON order_dispatch(order_no);
