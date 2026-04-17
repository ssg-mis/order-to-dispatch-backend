/**
 * Update order_number_sequence table and order number generation trigger
 * to support financial year based formatting (DO/26-27/0001)
 */

require('dotenv').config();
const db = require('./config/db');
const { Logger } = require('./utils');

async function updateOrderNumberSystem() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    console.log('Synchronizing order_number_sequence with current MAX values from table...');
    
    // Sync Legacy
    await client.query(`
      INSERT INTO order_number_sequence (financial_year, last_number, updated_at)
      VALUES (
        'LEGACY', 
        (SELECT COALESCE(MAX((substring(order_no from '(?i)^DO\\s*-\\s*(\\d+)')::integer)), 0) FROM order_dispatch WHERE order_no ~* '^DO\\s*-\\s*\\d+'),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (financial_year) 
      DO UPDATE SET 
        last_number = GREATEST(order_number_sequence.last_number, (SELECT COALESCE(MAX((substring(order_no from '(?i)^DO\\s*-\\s*(\\d+)')::integer)), 0) FROM order_dispatch WHERE order_no ~* '^DO\\s*-\\s*\\d+')),
        updated_at = CURRENT_TIMESTAMP;
    `);

    // Sync current FY (26-27)
    await client.query(`
      INSERT INTO order_number_sequence (financial_year, last_number, updated_at)
      VALUES (
        '26-27', 
        (SELECT COALESCE(MAX((substring(order_no from '/26-27/(\\d+)')::integer)), 0) FROM order_dispatch WHERE order_no ~ '/26-27/\\d+'),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (financial_year) 
      DO UPDATE SET 
        last_number = GREATEST(order_number_sequence.last_number, (SELECT COALESCE(MAX((substring(order_no from '/26-27/(\\d+)')::integer)), 0) FROM order_dispatch WHERE order_no ~ '/26-27/\\d+')),
        updated_at = CURRENT_TIMESTAMP;
    `);

    console.log('Updating trigger function generate_order_number()...');

    // 4. Update the trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION generate_order_number()
      RETURNS TRIGGER AS $$
      DECLARE
          current_order_num INTEGER;
          base_order_no VARCHAR(50);
          serial_letter CHAR(1);
          existing_count INTEGER;
          temp_exists INTEGER;
          target_fy VARCHAR(10);
          curr_date DATE;
          curr_month INTEGER;
          curr_year INTEGER;
          fy_start_year INTEGER;
          fy_end_year INTEGER;
          db_fy VARCHAR(10);
          is_legacy BOOLEAN;
      BEGIN
          -- Only generate if order_no is not already set
          IF NEW.order_no IS NULL OR NEW.order_no = '' THEN
              
              -- Get the DO Date from incoming record, default to current date if missing
              curr_date := COALESCE(NEW.party_so_date, CURRENT_DATE);
              
              -- Check if legacy format (before April 1, 2026)
              IF curr_date < '2026-04-01' THEN
                  is_legacy := TRUE;
                  target_fy := 'LEGACY';
              ELSE
                  is_legacy := FALSE;
                  -- Calculate Financial Year (April to March)
                  curr_month := EXTRACT(MONTH FROM curr_date);
                  curr_year := EXTRACT(YEAR FROM curr_date);
                  
                  IF curr_month >= 4 THEN
                      fy_start_year := curr_year % 100;
                      fy_end_year := (curr_year + 1) % 100;
                  ELSE
                      fy_start_year := (curr_year - 1) % 100;
                      fy_end_year := curr_year % 100;
                  END IF;
                  
                  target_fy := LPAD(fy_start_year::TEXT, 2, '0') || '-' || LPAD(fy_end_year::TEXT, 2, '0');
              END IF;
              
              -- Create temporary table if it doesn't exist (session-specific)
              CREATE TEMP TABLE IF NOT EXISTS current_order_batch (
                  base_number VARCHAR(50),
                  sequence_num INTEGER,
                  fy_str VARCHAR(10),
                  last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              ) ON COMMIT DROP;
              
              -- Check if we have a current batch in progress for this target format/FY
              SELECT COUNT(*) INTO temp_exists FROM current_order_batch WHERE fy_str = target_fy;
              
              IF temp_exists = 0 THEN
                  -- No current batch for this format - this is a NEW order batch
                  
                  -- Sync logic: ALWAYS find the real maximum in the table to avoid gapping
                  IF is_legacy THEN
                      SELECT COALESCE(MAX((substring(order_no from '(?i)^DO\\s*-\\s*(\\d+)')::integer)), 0)
                      INTO current_order_num
                      FROM order_dispatch
                      WHERE order_no ~* '^DO\\s*-\\s*\\d+';
                  ELSE
                      SELECT COALESCE(MAX((substring(order_no from '/' || target_fy || '/(\\d+)')::integer)), 0)
                      INTO current_order_num
                      FROM order_dispatch
                      WHERE order_no ~ ('/' || target_fy || '/\\d+');
                  END IF;

                  -- Update sequence table ensuring we use GREATEST to never go backward
                  INSERT INTO order_number_sequence (financial_year, last_number, updated_at)
                  VALUES (target_fy, current_order_num + 1, CURRENT_TIMESTAMP)
                  ON CONFLICT (financial_year) 
                  DO UPDATE SET 
                      last_number = GREATEST(order_number_sequence.last_number + 1, current_order_num + 1),
                      updated_at = CURRENT_TIMESTAMP
                  RETURNING last_number INTO current_order_num;
                  
                  -- Format based on logic
                  IF is_legacy THEN
                      base_order_no := 'DO-' || LPAD(current_order_num::TEXT, 3, '0');
                  ELSE
                      base_order_no := 'DO/' || target_fy || '/' || LPAD(current_order_num::TEXT, 4, '0');
                  END IF;
                  
                  -- Store this batch info
                  DELETE FROM current_order_batch WHERE fy_str = target_fy;
                  INSERT INTO current_order_batch (base_number, sequence_num, fy_str)
                  VALUES (base_order_no, current_order_num, target_fy);
                  
                  existing_count := 0;
              ELSE
                  -- We have a current batch - reuse the same base number
                  SELECT base_number, sequence_num INTO base_order_no, current_order_num
                  FROM current_order_batch
                  WHERE fy_str = target_fy
                  LIMIT 1;
                  
                  -- Count current session/transaction items already in order_dispatch
                  -- Count unique letter suffixes used for this base order number (handles A, A-1, B etc.)
                  SELECT COUNT(DISTINCT substring(order_no from length(base_order_no) + 1 for 1)) 
                  INTO existing_count
                  FROM order_dispatch
                  WHERE order_no LIKE base_order_no || '%'
                  AND substring(order_no from length(base_order_no) + 1 for 1) ~ '[A-Za-z]';
                  
                  UPDATE current_order_batch SET last_used = CURRENT_TIMESTAMP WHERE fy_str = target_fy;
              END IF;
              
              -- Generate serial letter (A, B, C, ...)
              serial_letter := CHR(65 + existing_count);
              
              -- Set the complete order number with serial letter
              NEW.order_no := base_order_no || serial_letter;
          END IF;
          
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('COMMIT');
    console.log('✅ Database updated successfully!');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating database:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

updateOrderNumberSystem();
