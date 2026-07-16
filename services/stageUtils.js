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

module.exports = { getPlannedAt, mintDsr };
