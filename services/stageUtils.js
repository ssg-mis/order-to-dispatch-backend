/**
 * Shared helpers for workflow-stage services on the v2 schema.
 * Every stage needs the same "planned_at for the NEXT gate" computation -
 * centralized here instead of copy-pasted per stage.
 */
const { sql } = require('drizzle-orm');

// Case/space-insensitive stage_name match against process_stages; falls back to
// interval 0 if no TAT row exists. Mirrors the reference getPlannedTimestamp.
async function getPlannedAt(tx, stageName) {
  const result = await tx.execute(sql`
    SELECT (
      CURRENT_TIMESTAMP + COALESCE(
        (
          SELECT stage_time FROM process_stages
          WHERE lower(replace(trim(stage_name), ' ', '')) = lower(replace(trim(${stageName}), ' ', ''))
          ORDER BY submitted_at DESC, id DESC
          LIMIT 1
        ),
        INTERVAL '0'
      )
    ) AS planned_at
  `);
  const plannedAt = result.rows[0]?.planned_at;
  // Raw sql`` results are strings, not Date instances - drizzle's timestamp
  // column mapper needs a real Date before an .insert().values() call.
  return plannedAt ? new Date(plannedAt) : null;
}

// Mint the next DSR (dispatch serial) number, e.g. DSR-2115. Shipments are born
// at Dispatch Planning (and at the Order-Approval Stock-Transfer skip), so both
// call this. Replaces the old global `dsr_number_seq`: a transaction-scoped
// advisory lock serializes concurrent minters, then we take MAX(numeric suffix)+1
// over existing dispatches. The lock auto-releases at COMMIT/ROLLBACK, and the
// dsr_number UNIQUE constraint is the final backstop. Must be called inside a tx.
async function mintDsr(tx) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(48213570)`);
  const res = await tx.execute(sql`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(dsr_number, '[^0-9]', '', 'g'), '')::int), 0) AS mx
    FROM dispatches
    WHERE dsr_number ~ '^DSR-[0-9]+$'
  `);
  const next = (parseInt(res.rows[0]?.mx, 10) || 0) + 1;
  return `DSR-${String(next).padStart(3, '0')}`;
}

// THE single Sales-vs-Stock-Transfer discriminator. order_category is a DB enum
// (only 'Sales' | 'Stock Transfer' | NULL) AND Stock Transfer is routed by this
// field (it skips Dispatch Planning), so a genuine transfer always carries the
// exact label. NULL / anything else => NOT a transfer, i.e. treated as Sales, the
// enforced default. Normalizes case/space defensively even though the enum makes
// drift impossible - so every stage, guard, and report asks the question the same
// way. Pass the category value (e.g. order.orderCategory / row.orderCategory).
function isStockTransfer(orderCategory) {
  return String(orderCategory ?? '').toLowerCase().trim() === 'stock transfer';
}

// A line created by "revert to Dispatch Planning" (one stage back — see
// dispatchPlanningService/actualDispatchService's revert-split code) skips
// Pre-Approval/Order-Approval entirely, so it has no pre_approvals/
// order_approvals row of its own — its audit trail lives on whichever ancestor
// (via split_from_item_id) it split from. Walk that chain up to the nearest
// ancestor with a REAL approval record, so slips/vouchers can still show a
// name instead of blank. Returns null if this item (or none of its ancestors)
// has ever been actually approved.
async function resolveInheritedApproval(db, orderItemId) {
  const res = await db.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT id, split_from_item_id, 0 AS depth FROM order_items WHERE id = ${orderItemId}
      UNION ALL
      SELECT oi.id, oi.split_from_item_id, chain.depth + 1
      FROM order_items oi
      JOIN chain ON oi.id = chain.split_from_item_id
      WHERE chain.depth < 20
    )
    SELECT
      pa.actual_at AS pre_approval_actual_at, u1.username AS pre_approval_user,
      oa.actual_at AS order_approval_actual_at, u2.username AS order_approval_user,
      chain.id AS resolved_from_item_id
    FROM chain
    LEFT JOIN pre_approvals pa ON pa.order_item_id = chain.id AND pa.actual_at IS NOT NULL
    LEFT JOIN order_approvals oa ON oa.order_item_id = chain.id AND oa.actual_at IS NOT NULL
    LEFT JOIN users u1 ON u1.id = pa.approved_by_user_id
    LEFT JOIN users u2 ON u2.id = oa.approved_by_user_id
    WHERE pa.actual_at IS NOT NULL OR oa.actual_at IS NOT NULL
    ORDER BY chain.depth ASC
    LIMIT 1
  `);
  return res.rows[0] || null;
}

module.exports = { getPlannedAt, mintDsr, isStockTransfer, resolveInheritedApproval };
