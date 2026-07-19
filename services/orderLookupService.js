/**
 * Order Lookup Service
 * Cross-stage lookup: given a DO number (or substring), resolves which
 * workflow stage each matching order is currently sitting at.
 *
 * Migrated to the v2 normalized schema (order-to-dispatch-db-v2). In v1 the
 * pipeline was spread across two flat tables (order_dispatch planned_1..3 +
 * lift_receiving_confirmation planned_4..9) and one row per (order_no, product).
 * v2 has one `orders` row per real DO, N `order_items` under it, per-item gates
 * (pre_approvals / order_approvals / dispatch_plannings), and per-shipment
 * `dispatches` with their own downstream gates (security_guard_checks / invoices
 * / gate_outs / material_receipts / damage_adjustments).
 *
 * "Current stage" for a whole order = the EARLIEST pipeline stage at which any
 * of its items/shipments still has an OPEN gate (planned_at set, actual_at not)
 * — i.e. the least-advanced pending work, the bottleneck the user is tracking.
 * If nothing is open anywhere, the order is Completed. The planned_at-IS-NOT-NULL
 * requirement is what makes this robust across reverts: a reverted-away gate has
 * its planned_at/actual_at nulled, so it correctly reads as "not pending here"
 * while the reopened earlier gate (which DOES have planned_at set) wins instead.
 */

const { dbV2 } = require('../config/db-v2.ts');
const { sql } = require('drizzle-orm');

// Pipeline rank -> stage label. Order Punch is never a resting state in v2
// (Order Punch always seeds pre_approvals or order_approvals immediately), so
// rank always resolves to one of these or Completed.
const STAGE_BY_RANK = {
  1: 'Pre Approval',
  2: 'Approval of Order',
  3: 'Dispatch Planning',
  4: 'Actual Dispatch',
  5: 'Security Guard Approval',
  6: 'Make Invoice',
  7: 'Check Invoice',
  8: 'Gate Out',
  9: 'Confirm Material Receipt',
  10: 'Damage Adjustment',
};

class OrderLookupService {
  /**
   * Resolve the current stage for every order matching a DO number search term
   * (substring, space-insensitive — same convention as the per-stage search bars).
   * @param {string} search
   * @returns {Promise<{success: boolean, data?: any[], message?: string}>}
   */
  async lookupByDoNumber(search) {
    if (!search || !search.trim()) {
      return { success: false, message: 'search term is required' };
    }

    const term = search.trim();
    const like = `%${term}%`;
    const strippedLike = `%${term.replace(/\s+/g, '').toLowerCase()}%`;

    const result = await dbV2.execute(sql`
      SELECT
        o.order_no,
        o.manual_sauda_no AS manual_sauda_no,
        o.created_at,
        c.customer_name,
        d.depot_name,
        CASE
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN pre_approvals pa ON pa.order_item_id = i.id
                       WHERE i.order_id = o.id AND pa.planned_at IS NOT NULL AND pa.actual_at IS NULL) THEN 1
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN order_approvals oa ON oa.order_item_id = i.id
                       WHERE i.order_id = o.id AND oa.planned_at IS NOT NULL AND oa.actual_at IS NULL) THEN 2
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN dispatch_plannings dp ON dp.order_item_id = i.id
                       WHERE i.order_id = o.id AND dp.planned_at IS NOT NULL AND dp.actual_at IS NULL) THEN 3
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN dispatches ds ON ds.order_item_id = i.id
                       WHERE i.order_id = o.id AND ds.planned_at IS NOT NULL AND ds.actual_at IS NULL) THEN 4
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN dispatches ds ON ds.order_item_id = i.id
                       JOIN security_guard_checks s ON s.dispatch_id = ds.id
                       WHERE i.order_id = o.id AND s.planned_at IS NOT NULL AND s.actual_at IS NULL) THEN 5
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN dispatches ds ON ds.order_item_id = i.id
                       JOIN invoices inv ON inv.dispatch_id = ds.id
                       WHERE i.order_id = o.id AND inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL) THEN 6
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN dispatches ds ON ds.order_item_id = i.id
                       JOIN invoices inv ON inv.dispatch_id = ds.id
                       WHERE i.order_id = o.id AND inv.made_at IS NOT NULL AND inv.checked_at IS NULL) THEN 7
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN dispatches ds ON ds.order_item_id = i.id
                       JOIN gate_outs g ON g.dispatch_id = ds.id
                       WHERE i.order_id = o.id AND g.planned_at IS NOT NULL AND g.actual_at IS NULL) THEN 8
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN dispatches ds ON ds.order_item_id = i.id
                       JOIN material_receipts mr ON mr.dispatch_id = ds.id
                       WHERE i.order_id = o.id AND mr.planned_at IS NOT NULL AND mr.actual_at IS NULL) THEN 9
          WHEN EXISTS (SELECT 1 FROM order_items i
                       JOIN dispatches ds ON ds.order_item_id = i.id
                       JOIN damage_adjustments da ON da.dispatch_id = ds.id
                       WHERE i.order_id = o.id AND da.planned_at IS NOT NULL AND da.actual_at IS NULL) THEN 10
          ELSE 11
        END AS stage_rank
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN depots d ON d.id = o.depot_id
      WHERE o.order_no ILIKE ${like}
         OR REPLACE(LOWER(o.order_no), ' ', '') LIKE ${strippedLike}
      ORDER BY o.order_no
    `);

    const data = result.rows.map((r) => {
      const rank = Number(r.stage_rank);
      const isCompleted = rank === 11;
      return {
        orderNo: r.order_no,
        customerName: r.customer_name,
        depoName: r.depot_name,
        manualSaudaNo: r.manual_sauda_no,
        createdAt: r.created_at,
        currentStage: isCompleted ? 'Completed' : (STAGE_BY_RANK[rank] || 'Order Punch'),
        isCompleted,
      };
    });

    return { success: true, data };
  }
}

module.exports = new OrderLookupService();
