/**
 * Inventory Service — v2 schema.
 *
 * Per depot+product stock view: opening_qty + stock_in + production − stock_out
 * − sales. Rebuilt from the old order_dispatch/lift_receiving_confirmation
 * aggregation onto v2:
 *   - lrc                → dispatches (d) → order_items (oi) → orders (o)
 *   - lrc.actual_qty_dispatch → dispatches.actual_qty_dispatch
 *   - lrc.product_name   → skus.sku_name (via oi.sku_id)
 *   - od.customer_name   → customers.customer_name (via o.customer_id)
 *   - od.depo_name       → depots.depot_name (via o.depot_id) — the SOURCE depot
 *   - od.order_category  → orders.order_category ('Stock Transfer' | 'Sales')
 *   - lrc.actual_8 (stock-transfer RECEIVED) → material_receipts.actual_at
 *   - lrc.actual_7 (sales OUT-gate)          → gate_outs.actual_at
 * production + inventory_opening_qty are now real v2 tables (backfilled).
 *
 * stock_in is attributed to the DESTINATION depot via customers.depot_id (the FK
 * resolved once by resolve_customer_depot, replacing the old customer_name-ILIKE-
 * depot_name fuzzy match); stock_out/sales use the order's own source depot
 * (o.depot_id). Production is attributed to BANARI (the plant) only.
 */
const { dbV2, schema } = require('../config/db-v2.ts');
const { sql } = require('drizzle-orm');
const { Logger } = require('../utils');

class InventoryService {
  async getInventoryData() {
    try {
      const res = await dbV2.execute(sql`
        WITH depots_active AS (
          SELECT id, depot_name FROM depots WHERE status = 'Active'
        ),
        stock_in_data AS (
          SELECT da.depot_name, s.sku_name AS product_name,
                 SUM(COALESCE(d.actual_qty_dispatch, 0)) AS stock_in_qty
          FROM dispatches d
          JOIN order_items oi ON oi.id = d.order_item_id
          JOIN orders o ON o.id = oi.order_id
          JOIN material_receipts mr ON mr.dispatch_id = d.id
          JOIN customers c ON c.id = o.customer_id
          -- Destination depot is the FK on the customer (resolve_customer_depot),
          -- not a customer_name substring match. Kept filtered to active depots.
          JOIN depots_active da ON da.id = c.depot_id
          LEFT JOIN skus s ON s.id = oi.sku_id
          WHERE UPPER(TRIM(o.order_category::text)) = 'STOCK TRANSFER'
            AND mr.actual_at IS NOT NULL
          GROUP BY da.depot_name, s.sku_name
        ),
        stock_out_data AS (
          SELECT dep.depot_name, s.sku_name AS product_name,
                 SUM(COALESCE(d.actual_qty_dispatch, 0)) AS stock_out_qty
          FROM dispatches d
          JOIN order_items oi ON oi.id = d.order_item_id
          JOIN orders o ON o.id = oi.order_id
          JOIN material_receipts mr ON mr.dispatch_id = d.id
          JOIN depots dep ON dep.id = o.depot_id
          LEFT JOIN skus s ON s.id = oi.sku_id
          WHERE UPPER(TRIM(o.order_category::text)) = 'STOCK TRANSFER'
            AND mr.actual_at IS NOT NULL
          GROUP BY dep.depot_name, s.sku_name
        ),
        sales_data AS (
          SELECT dep.depot_name, s.sku_name AS product_name,
                 SUM(COALESCE(d.actual_qty_dispatch, 0)) AS sales_qty
          FROM dispatches d
          JOIN order_items oi ON oi.id = d.order_item_id
          JOIN orders o ON o.id = oi.order_id
          JOIN gate_outs go ON go.dispatch_id = d.id
          JOIN depots dep ON dep.id = o.depot_id
          LEFT JOIN skus s ON s.id = oi.sku_id
          WHERE UPPER(TRIM(o.order_category::text)) = 'SALES'
            AND go.actual_at IS NOT NULL
          GROUP BY dep.depot_name, s.sku_name
        ),
        production_totals AS (
          SELECT sku_name, SUM(qty) AS total_production FROM production GROUP BY sku_name
        ),
        all_keys AS (
          SELECT depot_name, product_name FROM stock_in_data
          UNION SELECT depot_name, product_name FROM stock_out_data
          UNION SELECT depot_name, product_name FROM sales_data
          UNION
          -- Production happens only at BANARI (the plant), so produced SKUs
          -- must surface as BANARI rows even without any stock movement.
          SELECT d.depot_name, pt.sku_name AS product_name
          FROM production_totals pt
          JOIN depots_active d ON UPPER(TRIM(d.depot_name)) = 'BANARI'
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
          CASE WHEN UPPER(TRIM(ak.depot_name)) = 'BANARI'
               THEN COALESCE(pt.total_production, 0)
               ELSE 0 END::integer AS production_qty
        FROM all_keys ak
        LEFT JOIN stock_in_data si ON si.depot_name = ak.depot_name AND si.product_name = ak.product_name
        LEFT JOIN stock_out_data so ON so.depot_name = ak.depot_name AND so.product_name = ak.product_name
        LEFT JOIN sales_data sa ON sa.depot_name = ak.depot_name AND sa.product_name = ak.product_name
        LEFT JOIN skus sd ON LOWER(TRIM(sd.sku_name)) = LOWER(TRIM(ak.product_name))
        LEFT JOIN inventory_opening_qty oq ON oq.depo_name = ak.depot_name AND oq.product_name = ak.product_name
        LEFT JOIN production_totals pt ON LOWER(TRIM(pt.sku_name)) = LOWER(TRIM(ak.product_name))
        ORDER BY ak.depot_name ASC, ak.product_name ASC
      `);
      return res.rows;
    } catch (error) {
      Logger.error('Error fetching inventory data', error);
      throw error;
    }
  }

  async getInventoryDetail(depot_name, product_name, type) {
    // Stock-in = incoming to the DESTINATION depot (customers.depot_id FK, material
    // receipt done). Stock-out / sales = from the order's SOURCE depot.
    let query;
    if (type === 'stock_in') {
      query = sql`
        SELECT o.order_no, c.customer_name, o.party_so_date AS date,
               COALESCE(d.actual_qty_dispatch, 0)::integer AS qty
        FROM dispatches d
        JOIN order_items oi ON oi.id = d.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN material_receipts mr ON mr.dispatch_id = d.id
        JOIN customers c ON c.id = o.customer_id
        JOIN depots dep ON dep.id = c.depot_id
        LEFT JOIN skus s ON s.id = oi.sku_id
        WHERE UPPER(TRIM(o.order_category::text)) = 'STOCK TRANSFER'
          AND mr.actual_at IS NOT NULL
          AND dep.depot_name = ${depot_name}
          AND LOWER(TRIM(s.sku_name)) = LOWER(TRIM(${product_name}))
        ORDER BY o.order_no
      `;
    } else if (type === 'stock_out') {
      query = sql`
        SELECT o.order_no, c.customer_name, o.party_so_date AS date,
               COALESCE(d.actual_qty_dispatch, 0)::integer AS qty
        FROM dispatches d
        JOIN order_items oi ON oi.id = d.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN material_receipts mr ON mr.dispatch_id = d.id
        JOIN depots dep ON dep.id = o.depot_id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN skus s ON s.id = oi.sku_id
        WHERE UPPER(TRIM(o.order_category::text)) = 'STOCK TRANSFER'
          AND mr.actual_at IS NOT NULL
          AND dep.depot_name = ${depot_name}
          AND LOWER(TRIM(s.sku_name)) = LOWER(TRIM(${product_name}))
        ORDER BY o.order_no
      `;
    } else if (type === 'sales') {
      query = sql`
        SELECT o.order_no, c.customer_name, o.party_so_date AS date,
               COALESCE(d.actual_qty_dispatch, 0)::integer AS qty
        FROM dispatches d
        JOIN order_items oi ON oi.id = d.order_item_id
        JOIN orders o ON o.id = oi.order_id
        JOIN gate_outs go ON go.dispatch_id = d.id
        JOIN depots dep ON dep.id = o.depot_id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN skus s ON s.id = oi.sku_id
        WHERE UPPER(TRIM(o.order_category::text)) = 'SALES'
          AND go.actual_at IS NOT NULL
          AND dep.depot_name = ${depot_name}
          AND LOWER(TRIM(s.sku_name)) = LOWER(TRIM(${product_name}))
        ORDER BY o.order_no
      `;
    } else {
      return [];
    }
    const res = await dbV2.execute(query);
    return res.rows;
  }

  async upsertOpeningQty(depo_name, product_name, opening_qty) {
    const [row] = await dbV2
      .insert(schema.inventoryOpeningQty)
      .values({ depoName: depo_name, productName: product_name, openingQty: opening_qty, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.inventoryOpeningQty.depoName, schema.inventoryOpeningQty.productName],
        set: { openingQty: opening_qty, updatedAt: new Date() },
      })
      .returning();
    return row;
  }
}

module.exports = new InventoryService();
