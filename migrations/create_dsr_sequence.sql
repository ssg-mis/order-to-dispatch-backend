-- Create sequence for DSR numbers starting from the current count + 1
-- Current count is 153, so starting from 154
CREATE SEQUENCE IF NOT EXISTS dsr_number_seq START 154;

-- Add unique constraint to d_sr_number column in lift_receiving_confirmation table
-- First, identify any existing duplicates if any (unlikely but safe)
-- If there are duplicates, the unique constraint creation might fail.
-- But since the user wants to FIX it, we should ensure it's unique.

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'uq_d_sr_number'
    ) THEN
        ALTER TABLE lift_receiving_confirmation 
        ADD CONSTRAINT uq_d_sr_number UNIQUE (d_sr_number);
    END IF;
END $$;
