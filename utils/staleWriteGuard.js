/**
 * Stale-write (optimistic-concurrency) guard for stage-advance writes.
 *
 * Every stage in the pipeline is a paired (planned_N, actual_N) column set: a row is
 * "pending at stage N" exactly when `planned_N IS NOT NULL AND actual_N IS NULL`, and
 * submitting the stage stamps `actual_N`. The pending-list queries each filter on
 * `actual_N IS NULL`, so that is the single source of truth for "still actionable here".
 *
 * To make a submit safe against a stale/duplicate write — two users acting on the same
 * row from screens that haven't refreshed — the guarded UPDATE's WHERE clause must ALSO
 * require `actual_N IS NULL` (i.e. only advance a row that is STILL pending at this
 * stage). Because a legitimately-pending row always has `actual_N` NULL, this guard is a
 * no-op on every valid submit and fires ONLY on the stale second write. It changes no
 * happy-path behaviour.
 *
 * Call assertStageOpen() immediately after the guarded UPDATE. If 0 rows were affected,
 * the row was already advanced/moved by someone else (or does not exist) — throw a 409
 * the controllers surface to the client as "please refresh".
 *
 * @param {{rowCount: number}} result - node-postgres result of the guarded UPDATE
 * @param {string} stageLabel - human-readable stage name for the error message
 */
function assertStageOpen(result, stageLabel) {
  if (!result || result.rowCount === 0) {
    const err = new Error(
      `This record is no longer awaiting ${stageLabel} — it was already processed or moved by another user. Please refresh and try again.`
    );
    err.statusCode = 409;
    err.code = 'STALE_WRITE';
    throw err;
  }
}

module.exports = { assertStageOpen };
