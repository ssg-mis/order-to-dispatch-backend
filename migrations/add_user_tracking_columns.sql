-- Migration to add user tracking columns

-- Add columns to order_dispatch table
ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS order_punch_user VARCHAR(255);
ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS pre_approval_user VARCHAR(255);
ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS order_approval_user VARCHAR(255);
ALTER TABLE order_dispatch ADD COLUMN IF NOT EXISTS dispatch_planning_user VARCHAR(255);

-- Add columns to lift_receiving_confirmation table
ALTER TABLE lift_receiving_confirmation ADD COLUMN IF NOT EXISTS actual_dispatch_user VARCHAR(255);
ALTER TABLE lift_receiving_confirmation ADD COLUMN IF NOT EXISTS material_load_user VARCHAR(255);
ALTER TABLE lift_receiving_confirmation ADD COLUMN IF NOT EXISTS security_guard_user VARCHAR(255);
ALTER TABLE lift_receiving_confirmation ADD COLUMN IF NOT EXISTS make_invoice_user VARCHAR(255);
ALTER TABLE lift_receiving_confirmation ADD COLUMN IF NOT EXISTS check_invoice_user VARCHAR(255);
ALTER TABLE lift_receiving_confirmation ADD COLUMN IF NOT EXISTS gate_out_user VARCHAR(255);
ALTER TABLE lift_receiving_confirmation ADD COLUMN IF NOT EXISTS material_receipt_user VARCHAR(255);
ALTER TABLE lift_receiving_confirmation ADD COLUMN IF NOT EXISTS damage_adjustment_user VARCHAR(255);
