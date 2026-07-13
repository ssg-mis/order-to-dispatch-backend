/**
 * Order Lookup Service
 * Cross-stage lookup: given a DO number (or substring), resolves which
 * workflow stage each matching order is currently sitting at.
 *
 * The pipeline spans two tables:
 *  - order_dispatch: Stage 1 (Order Punch, no gate) -> Stage 2 (Pre Approval,
 *    planned_1/actual_1) -> Stage 3 (Approval of Order, planned_2/actual_2)
 *    -> Stage 4 (Dispatch Planning, planned_3/actual_3)
 *  - lift_receiving_confirmation: created once Dispatch Planning hands off.
 *    Only planned_1/actual_1, planned_4..9/actual_4..9 exist on this table —
 *    planned_2/actual_2 and planned_3/actual_3 (Vehicle Details, Material
 *    Load) were dropped from the live pipeline and aren't present columns.
 *
 * "Current stage" = the gate right after the LAST completed gate (highest-
 * index gate with actual_N set), not simply the first gate with a null
 * actual_N — some gates (e.g. Pre Approval) can be skipped entirely (both
 * planned_N and actual_N stay null) while later gates still complete
 * normally, so scanning for the first incomplete gate would misreport an
 * already-advanced order as stuck at the skipped one.
 */

const db = require('../config/db');
const { buildSearchCondition } = require('../utils/searchUtils');

const ORDER_DISPATCH_GATES = [
  { planned: 'planned_1', actual: 'actual_1', stage: 'Pre Approval' },
  { planned: 'planned_2', actual: 'actual_2', stage: 'Approval of Order' },
  { planned: 'planned_3', actual: 'actual_3', stage: 'Dispatch Planning' },
];

const LRC_GATES = [
  { planned: 'planned_1', actual: 'actual_1', stage: 'Actual Dispatch' },
  { planned: 'planned_4', actual: 'actual_4', stage: 'Security Guard Approval' },
  { planned: 'planned_5', actual: 'actual_5', stage: 'Make Invoice' },
  { planned: 'planned_6', actual: 'actual_6', stage: 'Check Invoice' },
  { planned: 'planned_7', actual: 'actual_7', stage: 'Gate Out' },
  { planned: 'planned_8', actual: 'actual_8', stage: 'Confirm Material Receipt' },
  { planned: 'planned_9', actual: 'actual_9', stage: 'Damage Adjustment' },
];

class OrderLookupService {
  /**
   * Resolve the current stage for every order_dispatch row matching a DO
   * number search term (substring, space-insensitive — same convention as
   * the per-stage search bars).
   * @param {string} search
   * @returns {Promise<{success: boolean, data?: any[], message?: string}>}
   */
  async lookupByDoNumber(search) {
    if (!search || !search.trim()) {
      return { success: false, message: 'search term is required' };
    }

    const { clause, params } = buildSearchCondition(['order_no'], search.trim(), 1);
    const odResult = await db.query(
      `SELECT order_no, customer_name, product_name, depo_name, processid, created_at,
              planned_1, actual_1, planned_2, actual_2, planned_3, actual_3
       FROM order_dispatch
       WHERE ${clause}
       ORDER BY order_no, id`,
      params
    );

    if (odResult.rowCount === 0) {
      return { success: true, data: [] };
    }

    // One order_no can have multiple product rows; gates are consistent
    // across products of the same order_no, so keep the first row per order_no.
    const byOrderNo = new Map();
    for (const row of odResult.rows) {
      if (!byOrderNo.has(row.order_no)) byOrderNo.set(row.order_no, row);
    }

    const results = [];
    for (const od of byOrderNo.values()) {
      const odNext = this._nextGate(ORDER_DISPATCH_GATES, od);

      if (odNext) {
        // lastCompletedIndex === -1 means nothing has completed yet. If the
        // first gate's planned_N is set, it's genuinely queued for that
        // review (e.g. Pre Approval); otherwise nothing has been initiated
        // at all beyond order creation, so it reads as plain Order Punch.
        const stage = odNext.lastCompletedIndex === -1 && !od[ORDER_DISPATCH_GATES[0].planned]
          ? 'Order Punch'
          : odNext.stage;
        results.push(this._buildResult(od, stage, false));
        continue;
      }

      const lrcResult = await db.query(
        `SELECT planned_1, actual_1, planned_4, actual_4, planned_5, actual_5,
                planned_6, actual_6, planned_7, actual_7, planned_8, actual_8,
                planned_9, actual_9
         FROM lift_receiving_confirmation
         WHERE so_no = $1
         LIMIT 1`,
        [od.order_no]
      );
      const lrc = lrcResult.rows[0];

      if (!lrc) {
        // All order_dispatch gates cleared, but the handoff row hasn't been
        // created yet — sitting between Dispatch Planning and Actual Dispatch.
        results.push(this._buildResult(od, 'Awaiting Actual Dispatch', false));
        continue;
      }

      const lrcNext = this._nextGate(LRC_GATES, lrc);
      if (lrcNext) {
        results.push(this._buildResult(od, lrcNext.stage, false));
      } else {
        results.push(this._buildResult(od, 'Completed', true));
      }
    }

    return { success: true, data: results };
  }

  /**
   * Finds the gate right after the last completed one in an ordered gate
   * list. Returns null if every gate in the list is completed.
   */
  _nextGate(gates, row) {
    let lastCompletedIndex = -1;
    for (let i = 0; i < gates.length; i++) {
      if (row[gates[i].actual]) lastCompletedIndex = i;
    }
    if (lastCompletedIndex === gates.length - 1) return null;
    return { stage: gates[lastCompletedIndex + 1].stage, lastCompletedIndex };
  }

  _buildResult(od, stage, isCompleted) {
    return {
      orderNo: od.order_no,
      customerName: od.customer_name,
      depoName: od.depo_name,
      manualSaudaNo: od.processid,
      createdAt: od.created_at,
      currentStage: stage,
      isCompleted,
    };
  }
}

module.exports = new OrderLookupService();
