-- Add approval workflow columns to depot_details, broker_details, salesperson_details
-- Uses IF NOT EXISTS so it's safe to run multiple times.

ALTER TABLE depot_details
  ADD COLUMN IF NOT EXISTS approval_status   VARCHAR(50)  DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT,
  ADD COLUMN IF NOT EXISTS created_by        INTEGER      REFERENCES login(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by       INTEGER      REFERENCES login(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ  DEFAULT NOW();

ALTER TABLE broker_details
  ADD COLUMN IF NOT EXISTS approval_status   VARCHAR(50)  DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT,
  ADD COLUMN IF NOT EXISTS created_by        INTEGER      REFERENCES login(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by       INTEGER      REFERENCES login(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ  DEFAULT NOW();

ALTER TABLE salesperson_details
  ADD COLUMN IF NOT EXISTS approval_status   VARCHAR(50)  DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT,
  ADD COLUMN IF NOT EXISTS created_by        INTEGER      REFERENCES login(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by       INTEGER      REFERENCES login(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ  DEFAULT NOW();
