/**
 * Auto-Generate Order Number with Trigger
 * Creates a trigger that automatically generates order_no in format DO-001A, DO-001B, etc.
 * before inserting into order_dispatch table
 */

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS trigger_generate_order_number ON order_dispatch;
DROP FUNCTION IF EXISTS generate_order_number();

-- Create the trigger function with transaction-aware batch tracking
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
    current_order_num INTEGER;
    base_order_no VARCHAR(50);
    serial_letter CHAR(1);
    existing_count INTEGER;
    temp_exists INTEGER;
BEGIN
    -- Only generate if order_no is not already set
    IF NEW.order_no IS NULL OR NEW.order_no = '' THEN
        
        -- Create temporary table if it doesn't exist (session-specific)
        -- This table tracks the current order batch being inserted
        CREATE TEMP TABLE IF NOT EXISTS current_order_batch (
            base_number VARCHAR(50),
            sequence_num INTEGER,
            last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ON COMMIT DROP;
        
        -- Check if we have a current batch in progress
        SELECT COUNT(*) INTO temp_exists FROM current_order_batch;
        
        IF temp_exists = 0 THEN
            -- No current batch - this is a NEW order
            -- Increment the sequence
            UPDATE order_number_sequence 
            SET last_number = last_number + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
            RETURNING last_number INTO current_order_num;
            
            base_order_no := 'DO-' || LPAD(current_order_num::TEXT, 3, '0');
            
            -- Store this batch info
            INSERT INTO current_order_batch (base_number, sequence_num)
            VALUES (base_order_no, current_order_num);
            
            existing_count := 0;
        ELSE
            -- We have a current batch - reuse the same base number
            SELECT base_number, sequence_num INTO base_order_no, current_order_num
            FROM current_order_batch
            LIMIT 1;
            
            -- Count how many products already have this base number IN THE TABLE
            SELECT COUNT(*) INTO existing_count
            FROM order_dispatch
            WHERE order_no LIKE base_order_no || '%';
            
            -- Update last used timestamp
            UPDATE current_order_batch SET last_used = CURRENT_TIMESTAMP;
        END IF;
        
        -- Generate serial letter (A, B, C, ...)
        -- A=65 in ASCII, so first product gets 'A', second gets 'B', etc.
        serial_letter := CHR(65 + existing_count);
        
        -- Set the complete order number with serial letter
        NEW.order_no := base_order_no || serial_letter;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER trigger_generate_order_number
BEFORE INSERT ON order_dispatch
FOR EACH ROW
EXECUTE FUNCTION generate_order_number();

-- Grant necessary permissions (adjust user as needed)
-- GRANT EXECUTE ON FUNCTION generate_order_number() TO your_app_user;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Order number auto-generation trigger created successfully!';
    RAISE NOTICE 'Order numbers will be generated in format: DO-001A, DO-001B, etc.';
END $$;
