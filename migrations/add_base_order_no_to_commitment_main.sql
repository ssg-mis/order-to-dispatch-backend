-- Add base_order_no column to commitment_main
-- This stores the base DO number (e.g., DO-520) so that partial processes
-- of the same commitment get sequential letters: DO-520A, DO-520B, DO-520C...

ALTER TABLE commitment_main
  ADD COLUMN IF NOT EXISTS base_order_no VARCHAR(50);
