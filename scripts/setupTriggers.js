/**
 * One-time script to create / replace all planned-timestamp trigger functions.
 * Run manually after deploy when trigger logic changes:
 *   node scripts/setupTriggers.js
 *
 * Extracted from server.js — these were previously executed on every server start.
 */

const db = require('../config/db');
const { Logger } = require('../utils');

const triggers = [
  {
    name: 'set_planned_by_order_type',
    sql: `
      CREATE OR REPLACE FUNCTION set_planned_by_order_type()
      RETURNS TRIGGER AS $$
      DECLARE
          pre_approval_tat INTERVAL;
          approval_of_order_tat INTERVAL;
      BEGIN
          SELECT stage_time INTO pre_approval_tat
          FROM process_stages
          WHERE lower(replace(trim(stage_name), ' ', '')) = 'preapproval'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          SELECT stage_time INTO approval_of_order_tat
          FROM process_stages
          WHERE lower(replace(trim(stage_name), ' ', '')) = 'approvaloforder'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF lower(trim(NEW.order_type)) = 'regular' THEN
              NEW.planned_2 := (CURRENT_TIMESTAMP + COALESCE(approval_of_order_tat, INTERVAL '0'))::TEXT;
          ELSIF lower(trim(NEW.order_type)) IN ('pre approval', 'pre-approval') THEN
              NEW.planned_1 := (CURRENT_TIMESTAMP + COALESCE(pre_approval_tat, INTERVAL '0'))::TEXT;
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `,
  },
  {
    name: 'set_planned2_from_actual1',
    sql: `
      CREATE OR REPLACE FUNCTION set_planned2_from_actual1()
      RETURNS TRIGGER AS $$
      DECLARE
          approval_of_order_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO approval_of_order_tat
          FROM process_stages
          WHERE lower(replace(trim(stage_name), ' ', '')) = 'approvaloforder'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_1 IS NOT NULL
             AND NEW.approval_qty IS NOT NULL
             AND NEW.approval_qty > 0 THEN

              NEW.planned_2 := (NEW.actual_1::timestamptz + COALESCE(approval_of_order_tat, INTERVAL '0'))::TEXT;

          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `,
  },
  {
    name: 'drop_trg_set_planned_3',
    sql: `DROP TRIGGER IF EXISTS trg_set_planned_3 ON order_dispatch`,
  },
  {
    name: 'set_planned_4_from_actual_1',
    sql: `
      CREATE OR REPLACE FUNCTION set_planned_4_from_actual_1()
      RETURNS TRIGGER AS $$
      DECLARE
          security_guard_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO security_guard_tat
          FROM process_stages
          WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') IN ('securityguardapproval', 'securityapproval')
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_1 IS NOT NULL
             AND (TG_OP = 'INSERT' OR OLD.actual_1 IS DISTINCT FROM NEW.actual_1) THEN
              NEW.planned_4 := NEW.actual_1::timestamptz + COALESCE(security_guard_tat, INTERVAL '0');
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `,
  },
  {
    name: 'set_planned_5_from_actual_4',
    sql: `
      CREATE OR REPLACE FUNCTION set_planned_5_from_actual_4()
      RETURNS TRIGGER AS $$
      DECLARE
          make_invoice_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO make_invoice_tat
          FROM process_stages
          WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') IN ('makeinvoiceproforma', 'makeinvoice')
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_4 IS NOT NULL
             AND (TG_OP = 'INSERT' OR OLD.actual_4 IS DISTINCT FROM NEW.actual_4) THEN
              NEW.planned_5 := NEW.actual_4::timestamptz + COALESCE(make_invoice_tat, INTERVAL '0');
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `,
  },
  {
    name: 'set_planned_6_from_actual_5',
    sql: `
      CREATE OR REPLACE FUNCTION set_planned_6_from_actual_5()
      RETURNS TRIGGER AS $$
      DECLARE
          check_invoice_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO check_invoice_tat
          FROM process_stages
          WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') = 'checkinvoice'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_5 IS NOT NULL
             AND (TG_OP = 'INSERT' OR OLD.actual_5 IS DISTINCT FROM NEW.actual_5) THEN
              NEW.planned_6 := NEW.actual_5::timestamptz + COALESCE(check_invoice_tat, INTERVAL '0');
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `,
  },
  {
    name: 'set_planned_7_from_actual_6',
    sql: `
      CREATE OR REPLACE FUNCTION set_planned_7_from_actual_6()
      RETURNS TRIGGER AS $$
      DECLARE
          gate_out_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO gate_out_tat
          FROM process_stages
          WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') = 'gateout'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_6 IS NOT NULL
             AND (TG_OP = 'INSERT' OR OLD.actual_6 IS DISTINCT FROM NEW.actual_6) THEN
              NEW.planned_7 := NEW.actual_6::timestamptz + COALESCE(gate_out_tat, INTERVAL '0');
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `,
  },
  {
    name: 'set_planned_8_from_actual_7',
    sql: `
      CREATE OR REPLACE FUNCTION set_planned_8_from_actual_7()
      RETURNS TRIGGER AS $$
      DECLARE
          receipt_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO receipt_tat
          FROM process_stages
          WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') IN ('confirmmaterialreceipt', 'materialreceipt')
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_7 IS NOT NULL
             AND (TG_OP = 'INSERT' OR OLD.actual_7 IS DISTINCT FROM NEW.actual_7) THEN
              NEW.planned_8 := NEW.actual_7::timestamptz + COALESCE(receipt_tat, INTERVAL '0');
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `,
  },
  {
    name: 'set_planned_9_from_actual_8',
    sql: `
      CREATE OR REPLACE FUNCTION set_planned_9_from_actual_8()
      RETURNS TRIGGER AS $$
      DECLARE
          damage_adjustment_tat INTERVAL;
      BEGIN
          SELECT stage_time
          INTO damage_adjustment_tat
          FROM process_stages
          WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') = 'damageadjustment'
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1;

          IF NEW.actual_8 IS NOT NULL
             AND (TG_OP = 'INSERT' OR OLD.actual_8 IS DISTINCT FROM NEW.actual_8)
             AND lower(trim(COALESCE(NEW.damage_status, ''))) = 'damaged' THEN
              NEW.planned_9 := NEW.actual_8::timestamptz + COALESCE(damage_adjustment_tat, INTERVAL '0');
          ELSIF lower(trim(COALESCE(NEW.damage_status, ''))) <> 'damaged' THEN
              NEW.planned_9 := NULL;
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `,
  },
];

async function setupTriggers() {
  console.log('🔄 Setting up trigger functions...\n');
  let failed = 0;

  for (const t of triggers) {
    try {
      await db.query(t.sql);
      console.log(`✅ ${t.name}`);
    } catch (err) {
      console.error(`❌ ${t.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${failed === 0 ? '✅ All triggers set up successfully.' : `⚠️  ${failed} trigger(s) failed.`}`);
  await db.end?.();
  process.exit(failed > 0 ? 1 : 0);
}

setupTriggers();
