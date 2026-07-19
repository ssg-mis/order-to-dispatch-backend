/**
 * Dashboard Service — v2 schema.
 * Aggregates data for the landing dashboard (`/`, dashboardApi.getOverview)
 * and the legacy stats page (`/dashboard`, dashboardApi.getStats).
 *
 * Rewritten from the old order_dispatch/lift_receiving_confirmation raw-SQL
 * version. NOTE the old service read actual_4..13 off order_dispatch — columns
 * that DON'T exist there (it only has planned/actual_1..3) — so stage counts
 * beyond Dispatch Planning, "dispatched/invoiced/delivered today" and order
 * pipeline progress past stage 4 were all permanently degenerate in
 * production. This port implements the intended semantics from the real v2
 * gate tables (same precedent as the reports/KPI rewrite).
 *
 * Granularity: one entry per ORDER (v2 `orders` is already one row per base
 * DO — the old base-DO regex regrouping is gone). "Any sub-order" maps to
 * "any order_item / any shipment" of the order.
 *
 * Stage ids/labels MUST stay in sync with app/page.tsx's STAGES const — the
 * frontend matches stageCounts entries and order.stage by these exact ids.
 */

const { Logger } = require('../utils');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, desc } = require('drizzle-orm');

// ORDER matters (index = pipeline position). idx 0 = entry point, idx 11 =
// completion marker (not a physical gate; an order is "delivered" once any
// shipment clears Confirm Material Receipt — same rule the old service used
// via lift_receiving_confirmation.actual_8).
const STAGE_DEFS = [
  { id: 'Order Punch',       label: 'Order Punch' },
  { id: 'Pre-Approval',      label: 'Pre Approval' },
  { id: 'Approval Of Order', label: 'Approval of Order' },
  { id: 'Dispatch Planning', label: 'Dispatch Planning' },
  { id: 'Actual Dispatch',   label: 'Actual Dispatch' },
  { id: 'Security Approval', label: 'Security Guard Approval' },
  { id: 'Make Invoice',      label: 'Invoice (Proforma)' },
  { id: 'Check Invoice',     label: 'Check Invoice' },
  { id: 'Gate Out',          label: 'Gate Out' },
  { id: 'Material Receipt',  label: 'Confirm Material Receipt' },
  { id: 'Damage Adjustment', label: 'Damage Adjustment' },
  { id: 'Final Delivery',    label: 'Final Delivery' },
];
const N_STAGES = STAGE_DEFS.length;
const COMPLETION_STAGE_IDX = 9; // Material Receipt

class DashboardService {
  /**
   * Load the full gate snapshot and roll it up per order. Shared by all three
   * endpoints — the local v2 dataset is small (~1.3k orders / ~1.8k
   * shipments), one full read is cheaper than bespoke per-endpoint SQL.
   *
   * Returns { orders, perOrder } where perOrder maps orderId -> {
   *   open:   boolean[12]   any gate row open at stage (planned set, actual null)
   *   closed: boolean[12]   any gate row closed at stage (actual set)
   *   latestActual: Date|null   newest actual across every gate (for delay calc)
   *   rejected: boolean     any ACTED order_approvals row rejected/cancelled
   *   overallStatus: string|null  latest acted order_approvals.overall_status
   * }
   */
  async _loadSnapshot() {
    const orders = await dbV2
      .select({
        id: schema.orders.id,
        orderNo: schema.orders.orderNo,
        customerName: schema.customers.customerName,
        createdAt: schema.orders.createdAt,
      })
      .from(schema.orders)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .orderBy(desc(schema.orders.createdAt));

    const items = await dbV2
      .select({ id: schema.orderItems.id, orderId: schema.orderItems.orderId })
      .from(schema.orderItems);
    const orderIdByItem = new Map(items.map(i => [i.id, i.orderId]));

    const dispatches = await dbV2
      .select({
        id: schema.dispatches.id,
        orderItemId: schema.dispatches.orderItemId,
        plannedAt: schema.dispatches.plannedAt,
        actualAt: schema.dispatches.actualAt,
      })
      .from(schema.dispatches);
    const orderIdByDispatch = new Map(dispatches.map(d => [d.id, orderIdByItem.get(d.orderItemId)]));

    const pres = await dbV2
      .select({ orderItemId: schema.preApprovals.orderItemId, plannedAt: schema.preApprovals.plannedAt, actualAt: schema.preApprovals.actualAt })
      .from(schema.preApprovals);
    const oas = await dbV2
      .select({
        orderItemId: schema.orderApprovals.orderItemId,
        plannedAt: schema.orderApprovals.plannedAt,
        actualAt: schema.orderApprovals.actualAt,
        overallStatus: schema.orderApprovals.overallStatus,
        rateOk: schema.orderApprovals.rateIsRightlyAsPerCurrentMarketRate,
        skuOk: schema.orderApprovals.weAreDealingInOrderedSku,
        dateOk: schema.orderApprovals.dispatchDateConfirmed,
        confirmOk: schema.orderApprovals.orderConfirmationWithCustomer,
      })
      .from(schema.orderApprovals);
    const dps = await dbV2
      .select({ orderItemId: schema.dispatchPlannings.orderItemId, plannedAt: schema.dispatchPlannings.plannedAt, actualAt: schema.dispatchPlannings.actualAt })
      .from(schema.dispatchPlannings);

    const secs = await dbV2
      .select({ dispatchId: schema.securityGuardChecks.dispatchId, plannedAt: schema.securityGuardChecks.plannedAt, actualAt: schema.securityGuardChecks.actualAt })
      .from(schema.securityGuardChecks);
    const invs = await dbV2
      .select({
        dispatchId: schema.invoices.dispatchId,
        plannedMadeAt: schema.invoices.plannedMadeAt,
        madeAt: schema.invoices.madeAt,
        plannedCheckedAt: schema.invoices.plannedCheckedAt,
        checkedAt: schema.invoices.checkedAt,
        billAmount: schema.invoices.billAmount,
      })
      .from(schema.invoices);
    const gos = await dbV2
      .select({ dispatchId: schema.gateOuts.dispatchId, plannedAt: schema.gateOuts.plannedAt, actualAt: schema.gateOuts.actualAt })
      .from(schema.gateOuts);
    const mrs = await dbV2
      .select({ dispatchId: schema.materialReceipts.dispatchId, plannedAt: schema.materialReceipts.plannedAt, actualAt: schema.materialReceipts.actualAt, damageQty: schema.materialReceipts.damageQty })
      .from(schema.materialReceipts);
    const das = await dbV2
      .select({ dispatchId: schema.damageAdjustments.dispatchId, plannedAt: schema.damageAdjustments.plannedAt, actualAt: schema.damageAdjustments.actualAt })
      .from(schema.damageAdjustments);

    // ── Roll up per order ──
    const perOrder = new Map();
    const entryFor = (orderId) => {
      if (orderId == null) return null;
      if (!perOrder.has(orderId)) {
        perOrder.set(orderId, {
          open: new Array(N_STAGES).fill(false),
          closed: new Array(N_STAGES).fill(false),
          latestActual: null,
          rejected: false,
          overallStatus: null,
          _overallStatusAt: null,
        });
      }
      return perOrder.get(orderId);
    };
    const note = (orderId, stageIdx, plannedAt, actualAt) => {
      const e = entryFor(orderId);
      if (!e) return;
      if (actualAt) {
        e.closed[stageIdx] = true;
        const d = new Date(actualAt);
        if (!e.latestActual || d > e.latestActual) e.latestActual = d;
      } else if (plannedAt) {
        e.open[stageIdx] = true;
      }
    };

    for (const r of pres) note(orderIdByItem.get(r.orderItemId), 1, r.plannedAt, r.actualAt);
    for (const r of oas) {
      const orderId = orderIdByItem.get(r.orderItemId);
      note(orderId, 2, r.plannedAt, r.actualAt);
      // Rejection flags only mean anything on ACTED rows — v2 seeds the
      // checklist booleans as false by default, so an untouched pending row
      // must not read as "rejected" (the old columns were nullable instead).
      if (r.actualAt) {
        const e = entryFor(orderId);
        const s = (r.overallStatus || '').toLowerCase();
        const rejectedByStatus = s === 'false' || s.includes('reject') || s.includes('cancel');
        const rejectedByFlag = r.rateOk === false || r.skuOk === false || r.dateOk === false || r.confirmOk === false;
        if (rejectedByStatus || (rejectedByFlag && s !== 'true' && s !== 'approved')) e.rejected = true;
        // keep the LATEST acted status for recent-activity display
        if (!e._overallStatusAt || new Date(r.actualAt) > e._overallStatusAt) {
          e._overallStatusAt = new Date(r.actualAt);
          e.overallStatus = r.overallStatus || null;
        }
      }
    }
    for (const r of dps) note(orderIdByItem.get(r.orderItemId), 3, r.plannedAt, r.actualAt);
    for (const d of dispatches) note(orderIdByItem.get(d.orderItemId), 4, d.plannedAt, d.actualAt);
    for (const r of secs) note(orderIdByDispatch.get(r.dispatchId), 5, r.plannedAt, r.actualAt);
    for (const r of invs) {
      note(orderIdByDispatch.get(r.dispatchId), 6, r.plannedMadeAt, r.madeAt);
      note(orderIdByDispatch.get(r.dispatchId), 7, r.plannedCheckedAt, r.checkedAt);
    }
    for (const r of gos) note(orderIdByDispatch.get(r.dispatchId), 8, r.plannedAt, r.actualAt);
    for (const r of mrs) note(orderIdByDispatch.get(r.dispatchId), 9, r.plannedAt, r.actualAt);
    for (const r of das) note(orderIdByDispatch.get(r.dispatchId), 10, r.plannedAt, r.actualAt);

    return { orders, perOrder, dispatches, invs, mrs, orderIdByItem, orderIdByDispatch };
  }

  /**
   * Current pipeline position for one order's rollup.
   * A stage counts as passed if it has closed rows and nothing open, OR has no
   * rows at all but a later stage does (a genuinely skipped gate — regular
   * orders have no pre_approvals row, non-damaged receipts never spawn a
   * damage_adjustments row, etc.).
   */
  _stageWalk(e, isCompleted) {
    const open = e ? e.open : new Array(N_STAGES).fill(false);
    const closed = e ? e.closed : new Array(N_STAGES).fill(false);

    let lastActivity = 0; // Order Punch always happened
    for (let i = 1; i < N_STAGES; i++) if (open[i] || closed[i]) lastActivity = i;

    const doneAt = (i) => {
      if (i === 0) return true;
      if (i === N_STAGES - 1) return isCompleted; // Final Delivery
      if (open[i]) return false;
      if (closed[i]) return true;
      return lastActivity > i; // skipped gate
    };

    const stageProgress = STAGE_DEFS.map((s, idx) => ({ id: s.id, label: s.label, done: isCompleted || doneAt(idx), idx }));

    if (isCompleted) {
      return { stageIndex: N_STAGES - 1, completedStages: N_STAGES, stageProgress, currentStage: 'Final Delivery' };
    }
    let stageIndex = 0;
    let completedStages = 0;
    for (let i = 0; i < stageProgress.length; i++) {
      if (stageProgress[i].done) { completedStages = i + 1; stageIndex = i + 1; }
      else { stageIndex = i; break; }
    }
    if (stageIndex >= N_STAGES) stageIndex = N_STAGES - 1;
    return { stageIndex, completedStages, stageProgress, currentStage: STAGE_DEFS[stageIndex].id };
  }

  /**
   * Get comprehensive dashboard statistics (landing page overview)
   */
  async getComprehensiveStats() {
    try {
      const { orders, perOrder, dispatches, invs, mrs, orderIdByDispatch } = await this._loadSnapshot();

      // Completed = any shipment cleared Confirm Material Receipt (old rule:
      // lift_receiving_confirmation.actual_8 IS NOT NULL, per base DO).
      const completedSet = new Set();
      for (const [orderId, e] of perOrder) if (e.closed[COMPLETION_STAGE_IDX]) completedSet.add(orderId);

      const totalOrders = orders.length;
      const completedOrders = completedSet.size;
      const activeOrders = totalOrders - completedOrders;

      // Delayed: not completed and no gate movement in > 48h (falls back to
      // order creation when nothing has been acted on yet).
      const now = new Date();
      let delayedOrders = 0;
      for (const o of orders) {
        if (completedSet.has(o.id)) continue;
        const e = perOrder.get(o.id);
        const latest = (e && e.latestActual) || new Date(o.createdAt);
        if ((now - latest) / (1000 * 60 * 60) > 48) delayedOrders++;
      }

      // Rejected/cancelled (not completed)
      const rejectedSet = new Set();
      for (const [orderId, e] of perOrder) {
        if (e.rejected && !completedSet.has(orderId)) rejectedSet.add(orderId);
      }

      // Money / damages (across all shipments, like the old full-table SUMs)
      const totalPaymentAmount = invs.reduce((s, r) => s + (parseFloat(r.billAmount) || 0), 0);
      const totalDamageQty = mrs.reduce((s, r) => s + (parseFloat(r.damageQty) || 0), 0);

      // Stage-wise counts: distinct ORDERS pending / completed per stage
      const stageCounts = STAGE_DEFS.map((stage, idx) => {
        if (idx === 0) return { id: stage.id, label: stage.label, pending: 0, completed: totalOrders, count: 0 };
        if (idx === N_STAGES - 1) return { id: stage.id, label: stage.label, pending: 0, completed: completedOrders, count: 0 };
        let pending = 0, completed = 0;
        for (const [, e] of perOrder) {
          if (e.open[idx]) pending++;
          if (e.closed[idx]) completed++;
        }
        return { id: stage.id, label: stage.label, pending, completed, count: pending };
      });

      // Pipeline tracker: one entry per order
      const enrichedOrders = orders.map(o => {
        const e = perOrder.get(o.id);
        const isCompleted = completedSet.has(o.id);
        const walk = this._stageWalk(e, isCompleted);
        const status = isCompleted ? 'completed' : (rejectedSet.has(o.id) ? 'cancelled' : 'pending');
        return {
          id: o.id,
          orderNo: o.orderNo,
          doNumber: o.orderNo,
          soNumber: o.orderNo,
          customerName: o.customerName,
          timestamp: o.createdAt,
          date: o.createdAt,
          stage: walk.currentStage,
          stageIndex: walk.stageIndex,
          completedStages: walk.completedStages,
          totalStages: N_STAGES,
          stageProgress: walk.stageProgress,
          status,
        };
      });

      // Today's activity — distinct orders
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const createdToday = orders.filter(o => new Date(o.createdAt) >= today).length;
      const dispatchedTodaySet = new Set();
      for (const d of dispatches) {
        if (d.actualAt && new Date(d.actualAt) >= today) dispatchedTodaySet.add(orderIdByDispatch.get(d.id));
      }
      const invoicedTodaySet = new Set();
      for (const r of invs) {
        if (r.madeAt && new Date(r.madeAt) >= today) invoicedTodaySet.add(orderIdByDispatch.get(r.dispatchId));
      }
      const deliveredTodaySet = new Set();
      for (const r of mrs) {
        if (r.actualAt && new Date(r.actualAt) >= today) deliveredTodaySet.add(orderIdByDispatch.get(r.dispatchId));
      }

      return {
        total: totalOrders,
        active: activeOrders,
        completed: completedOrders,
        delayed: delayedOrders,
        cancelled: rejectedSet.size,
        totalPaymentAmount,
        totalDamageQty,
        stageCounts,
        recentOrders: enrichedOrders,
        pendingOrdersList: enrichedOrders,
        completedOrdersList: enrichedOrders.filter(o => o.status === 'completed'),
        createdToday,
        dispatchedToday: dispatchedTodaySet.size,
        invoicedToday: invoicedTodaySet.size,
        deliveredToday: deliveredTodaySet.size,
        attentionItems: [],
      };
    } catch (error) {
      Logger.error('Error fetching comprehensive dashboard stats', error);
      throw error;
    }
  }

  /**
   * Get dashboard statistics (legacy endpoint, /dashboard page)
   */
  async getStats() {
    try {
      const { orders, perOrder } = await this._loadSnapshot();
      const completedSet = new Set();
      for (const [orderId, e] of perOrder) if (e.closed[COMPLETION_STAGE_IDX]) completedSet.add(orderId);

      let pendingPreApproval = 0;
      let pendingApproval = 0;
      for (const [orderId, e] of perOrder) {
        if (completedSet.has(orderId)) continue;
        if (e.open[1]) pendingPreApproval++;
        if (e.open[2]) pendingApproval++;
      }

      return {
        totalOrders: orders.length,
        pendingPreApproval,
        pendingApproval,
        completedOrders: completedSet.size,
      };
    } catch (error) {
      Logger.error('Error fetching dashboard stats', error);
      throw error;
    }
  }

  /**
   * Get recent activity (last 5 orders). Field names kept identical to the
   * old raw rows the /dashboard page renders (order_no / customer_name /
   * created_at / overall_status_of_order).
   */
  async getRecentActivity() {
    try {
      const { orders, perOrder } = await this._loadSnapshot();
      return orders.slice(0, 5).map(o => ({
        id: o.id,
        order_no: o.orderNo,
        customer_name: o.customerName,
        created_at: o.createdAt,
        overall_status_of_order: perOrder.get(o.id)?.overallStatus ?? null,
      }));
    } catch (error) {
      Logger.error('Error fetching recent activity', error);
      throw error;
    }
  }
}

module.exports = new DashboardService();
