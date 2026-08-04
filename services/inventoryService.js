const db = require('../config/db');
const { Logger } = require('../utils');

class InventoryService {
  async ensureTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS inventory_opening_qty (
        id SERIAL PRIMARY KEY,
        depo_name TEXT NOT NULL,
        product_name TEXT NOT NULL,
        opening_qty INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(depo_name, product_name)
      )
    `);
    await db.query(`ALTER TABLE inventory_opening_qty ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'`);
    await db.query(`ALTER TABLE inventory_opening_qty ADD COLUMN IF NOT EXISTS pending_opening_qty INTEGER`);
    await db.query(`ALTER TABLE inventory_opening_qty ADD COLUMN IF NOT EXISTS pending_by INTEGER`);
    await db.query(`ALTER TABLE inventory_opening_qty ADD COLUMN IF NOT EXISTS pending_at TIMESTAMP WITH TIME ZONE`);
    await db.query(`ALTER TABLE inventory_opening_qty ADD COLUMN IF NOT EXISTS reviewed_by INTEGER`);
    await db.query(`ALTER TABLE inventory_opening_qty ADD COLUMN IF NOT EXISTS rejection_reason TEXT`);
  }

  async getInventoryData() {
    await this.ensureTable();
    const result = await db.query(`
      WITH depots AS (
        SELECT depot_name
        FROM depot_details
        WHERE status = 'Active'
      ),
      stock_in_data AS (
        SELECT
          dd.depot_name,
          lrc.product_name,
          SUM(
            COALESCE(lrc.actual_qty_dispatch::numeric, 0)
            - CASE WHEN lrc.actual_9 IS NOT NULL THEN COALESCE(lrc.credit_note_qty::numeric, 0) ELSE 0 END
          ) AS stock_in_qty
        FROM lift_receiving_confirmation lrc
        JOIN order_dispatch od ON lrc.so_no = od.order_no
        JOIN depots dd ON od.customer_name ILIKE '%' || dd.depot_name || '%'
        WHERE UPPER(TRIM(od.order_category)) = 'STOCK TRANSFER'
          AND lrc.actual_8 IS NOT NULL
        GROUP BY dd.depot_name, lrc.product_name
      ),
      stock_out_data AS (
        SELECT
          od.depo_name AS depot_name,
          lrc.product_name,
          SUM(COALESCE(lrc.actual_qty_dispatch::numeric, 0)) AS stock_out_qty
        FROM lift_receiving_confirmation lrc
        JOIN order_dispatch od ON lrc.so_no = od.order_no
        WHERE UPPER(TRIM(od.order_category)) = 'STOCK TRANSFER'
          AND lrc.actual_8 IS NOT NULL
          AND od.depo_name IS NOT NULL
        GROUP BY od.depo_name, lrc.product_name
      ),
      sales_data AS (
        SELECT
          od.depo_name AS depot_name,
          lrc.product_name,
          SUM(COALESCE(lrc.actual_qty_dispatch::numeric, 0)) AS sales_qty
        FROM lift_receiving_confirmation lrc
        JOIN order_dispatch od ON lrc.so_no = od.order_no
        WHERE UPPER(TRIM(od.order_category)) = 'SALES'
          AND lrc.actual_7 IS NOT NULL
          AND od.depo_name IS NOT NULL
        GROUP BY od.depo_name, lrc.product_name
      ),
      production_totals AS (
        SELECT sku_name, SUM(qty) AS total_production
        FROM production
        GROUP BY sku_name
      ),
      all_keys AS (
        SELECT depot_name, product_name FROM stock_in_data
        UNION
        SELECT depot_name, product_name FROM stock_out_data
        UNION
        SELECT depot_name, product_name FROM sales_data
        UNION
        -- Production happens only at BANARI (the plant), so produced SKUs
        -- must surface as BANARI rows even without any stock movement.
        SELECT d.depot_name, pt.sku_name AS product_name
        FROM production_totals pt
        JOIN depots d ON UPPER(TRIM(d.depot_name)) = 'BANARI'
        WHERE COALESCE(pt.total_production, 0) <> 0
      )
      SELECT
        ak.depot_name,
        ak.product_name,
        COALESCE(sd.sku_code, '') AS sku_id,
        COALESCE(sd.status, 'Active') AS sku_status,
        COALESCE(si.stock_in_qty, 0)::integer AS stock_in,
        COALESCE(so.stock_out_qty, 0)::integer AS stock_out,
        COALESCE(sa.sales_qty, 0)::integer AS sales,
        COALESCE(oq.opening_qty, 0) AS opening_qty,
        oq.updated_at AS opening_qty_updated_at,
        -- Attribute production to BANARI only; every other depot shows 0.
        CASE WHEN UPPER(TRIM(ak.depot_name)) = 'BANARI'
             THEN COALESCE(pt.total_production, 0)
             ELSE 0 END::integer AS production_qty
      FROM all_keys ak
      LEFT JOIN stock_in_data si ON si.depot_name = ak.depot_name AND si.product_name = ak.product_name
      LEFT JOIN stock_out_data so ON so.depot_name = ak.depot_name AND so.product_name = ak.product_name
      LEFT JOIN sales_data sa ON sa.depot_name = ak.depot_name AND sa.product_name = ak.product_name
      LEFT JOIN sku_details sd ON LOWER(TRIM(sd.sku_name)) = LOWER(TRIM(ak.product_name))
      LEFT JOIN inventory_opening_qty oq ON oq.depo_name = ak.depot_name AND oq.product_name = ak.product_name
      LEFT JOIN production_totals pt ON LOWER(TRIM(pt.sku_name)) = LOWER(TRIM(ak.product_name))
      ORDER BY ak.depot_name ASC, ak.product_name ASC
    `);
    return result.rows;
  }

  async getInventoryDetail(depot_name, product_name, type) {
    let query;
    const values = [depot_name, product_name];

    if (type === 'stock_in') {
      query = `
        SELECT
          lrc.so_no AS order_no,
          od.customer_name,
          od.party_so_date AS date,
          CASE WHEN lrc.actual_9 IS NOT NULL THEN COALESCE(lrc.credit_note_qty::numeric, 0) ELSE 0 END::integer AS deducted_qty,
          lrc.credit_note_no,
          (
            COALESCE(lrc.actual_qty_dispatch::numeric, 0)
            - CASE WHEN lrc.actual_9 IS NOT NULL THEN COALESCE(lrc.credit_note_qty::numeric, 0) ELSE 0 END
          )::integer AS qty
        FROM lift_receiving_confirmation lrc
        JOIN order_dispatch od ON lrc.so_no = od.order_no
        JOIN depot_details dd ON od.customer_name ILIKE '%' || dd.depot_name || '%'
        WHERE UPPER(TRIM(od.order_category)) = 'STOCK TRANSFER'
          AND lrc.actual_8 IS NOT NULL
          AND dd.depot_name = $1
          AND LOWER(TRIM(lrc.product_name)) = LOWER(TRIM($2))
        ORDER BY lrc.so_no
      `;
    } else if (type === 'stock_out') {
      query = `
        SELECT
          lrc.so_no AS order_no,
          od.customer_name,
          od.party_so_date AS date,
          COALESCE(lrc.actual_qty_dispatch::numeric, 0)::integer AS qty
        FROM lift_receiving_confirmation lrc
        JOIN order_dispatch od ON lrc.so_no = od.order_no
        WHERE UPPER(TRIM(od.order_category)) = 'STOCK TRANSFER'
          AND lrc.actual_8 IS NOT NULL
          AND od.depo_name = $1
          AND LOWER(TRIM(lrc.product_name)) = LOWER(TRIM($2))
        ORDER BY lrc.so_no
      `;
    } else if (type === 'sales') {
      query = `
        SELECT
          lrc.so_no AS order_no,
          od.customer_name,
          od.party_so_date AS date,
          COALESCE(lrc.actual_qty_dispatch::numeric, 0)::integer AS qty
        FROM lift_receiving_confirmation lrc
        JOIN order_dispatch od ON lrc.so_no = od.order_no
        WHERE UPPER(TRIM(od.order_category)) = 'SALES'
          AND lrc.actual_7 IS NOT NULL
          AND od.depo_name = $1
          AND LOWER(TRIM(lrc.product_name)) = LOWER(TRIM($2))
        ORDER BY lrc.so_no
      `;
    } else {
      return [];
    }

    const result = await db.query(query, values);
    return result.rows;
  }

  async upsertOpeningQty(depo_name, product_name, opening_qty, user) {
    await this.ensureTable();
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    if (isAdmin) {
      const result = await db.query(`
        INSERT INTO inventory_opening_qty (depo_name, product_name, opening_qty, approval_status, reviewed_by, pending_opening_qty, pending_by, pending_at, rejection_reason, updated_at)
        VALUES ($1, $2, $3, 'approved', $4, NULL, NULL, NULL, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT (depo_name, product_name)
        DO UPDATE SET opening_qty = $3, approval_status = 'approved', reviewed_by = $4,
          pending_opening_qty = NULL, pending_by = NULL, pending_at = NULL, rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [depo_name, product_name, opening_qty, user?.id || null]);
      return result.rows[0];
    }

    // Non-admin submissions are staged for approval; the live opening_qty is untouched.
    const result = await db.query(`
      INSERT INTO inventory_opening_qty (depo_name, product_name, opening_qty, pending_opening_qty, pending_by, pending_at, updated_at)
      VALUES ($1, $2, 0, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (depo_name, product_name)
      DO UPDATE SET pending_opening_qty = $3, pending_by = $4, pending_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [depo_name, product_name, opening_qty, user?.id || null]);
    return result.rows[0];
  }

  async getPendingOpeningQty() {
    await this.ensureTable();
    const result = await db.query(`
      SELECT oq.*, l.username AS pending_by_name
      FROM inventory_opening_qty oq
      LEFT JOIN login l ON l.id = oq.pending_by
      WHERE oq.pending_opening_qty IS NOT NULL
      ORDER BY oq.pending_at ASC
    `);
    return result.rows;
  }

  async reviewOpeningQty(id, action, reviewerId, reason) {
    await this.ensureTable();
    if (action === 'approve') {
      const result = await db.query(`
        UPDATE inventory_opening_qty
        SET opening_qty = pending_opening_qty, approval_status = 'approved',
          pending_opening_qty = NULL, pending_by = NULL, pending_at = NULL,
          reviewed_by = $1, rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND pending_opening_qty IS NOT NULL
        RETURNING *
      `, [reviewerId, id]);
      return result.rows[0] || null;
    }

    const result = await db.query(`
      UPDATE inventory_opening_qty
      SET pending_opening_qty = NULL, pending_by = NULL, pending_at = NULL,
        reviewed_by = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [reviewerId, reason || null, id]);
    return result.rows[0] || null;
  }
}

module.exports = new InventoryService();
