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
          SUM(COALESCE(lrc.actual_qty_dispatch::numeric, 0)) AS stock_in_qty
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
      all_keys AS (
        SELECT depot_name, product_name FROM stock_in_data
        UNION
        SELECT depot_name, product_name FROM stock_out_data
        UNION
        SELECT depot_name, product_name FROM sales_data
      )
      SELECT
        ak.depot_name,
        ak.product_name,
        COALESCE(sd.sku_code, '') AS sku_id,
        COALESCE(si.stock_in_qty, 0)::integer AS stock_in,
        COALESCE(so.stock_out_qty, 0)::integer AS stock_out,
        COALESCE(sa.sales_qty, 0)::integer AS sales,
        COALESCE(oq.opening_qty, 0) AS opening_qty,
        oq.updated_at AS opening_qty_updated_at
      FROM all_keys ak
      LEFT JOIN stock_in_data si ON si.depot_name = ak.depot_name AND si.product_name = ak.product_name
      LEFT JOIN stock_out_data so ON so.depot_name = ak.depot_name AND so.product_name = ak.product_name
      LEFT JOIN sales_data sa ON sa.depot_name = ak.depot_name AND sa.product_name = ak.product_name
      LEFT JOIN sku_details sd ON LOWER(TRIM(sd.sku_name)) = LOWER(TRIM(ak.product_name))
      LEFT JOIN inventory_opening_qty oq ON oq.depo_name = ak.depot_name AND oq.product_name = ak.product_name
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
          COALESCE(lrc.actual_qty_dispatch::numeric, 0)::integer AS qty
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

  async upsertOpeningQty(depo_name, product_name, opening_qty) {
    await this.ensureTable();
    const result = await db.query(`
      INSERT INTO inventory_opening_qty (depo_name, product_name, opening_qty, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (depo_name, product_name)
      DO UPDATE SET opening_qty = $3, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [depo_name, product_name, opening_qty]);
    return result.rows[0];
  }
}

module.exports = new InventoryService();
