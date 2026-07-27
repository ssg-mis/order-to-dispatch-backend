/**
 * Order Approval Service (Gate 2: Approval of Order) — v2 schema.
 *
 * Per ORDER ITEM, mirroring Pre-Approval: the pending/history lists and the
 * submit all key off the `order_approvals` gate (one row per order_item,
 * seeded at Order Punch for regular orders or at Pre-Approval for pre-approval
 * orders).
 *   - Pending  : order_approvals.planned_at IS NOT NULL AND actual_at IS NULL
 *   - History  : order_approvals.planned_at IS NOT NULL AND actual_at IS NOT NULL
 *
 * Submitting records the six-point checklist on the gate, stamps actual_at, and
 * — only when APPROVED — queues the next gate (dispatch_plannings). A rejection
 * closes the gate without advancing.
 *
 * Stock Transfer approvals skip Dispatch Planning: they close a dispatch_plannings
 * row immediately and mint the shipment straight into Actual Dispatch (see the
 * isApproved branch in submitApproval).
 *
 * Reliance rejection → revert commitment: a reject for a "Reliance" customer
 * deletes the order's commitment_details row, restoring the drawn MT to the
 * commitment balance (no-op for plain punched orders). Wired with the Commitment
 * Punch migration.
 */

const { Logger } = require('../utils');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, isNull, isNotNull, sql, asc, desc, inArray } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { getPlannedAt, mintDsr, isStockTransfer } = require('./stageUtils');

const toNum = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);

class OrderApprovalService {
  async getPendingApprovals(filters = {}, pagination = {}) {
    return this._listApproval({ ...filters, ...pagination, open: true });
  }

  async getApprovalHistory(filters = {}, pagination = {}) {
    return this._listApproval({ ...filters, ...pagination, open: false });
  }

  async _listApproval({ open, page = 1, limit = 25, order_no, customer_name, start_date, end_date }) {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 25;

    const conditions = [
      isNotNull(schema.orderApprovals.plannedAt),
      open ? isNull(schema.orderApprovals.actualAt) : isNotNull(schema.orderApprovals.actualAt),
    ];
    // DO-number box also matches customer name (mirrors Pre-Approval's search).
    if (order_no) {
      conditions.push(sql`(${schema.orders.orderNo} ILIKE ${'%' + order_no + '%'} OR ${schema.customers.customerName} ILIKE ${'%' + order_no + '%'})`);
    } else if (customer_name) {
      conditions.push(sql`${schema.customers.customerName} ILIKE ${'%' + customer_name + '%'}`);
    }
    if (start_date && end_date) {
      conditions.push(sql`${schema.orders.deliveryDate} BETWEEN ${start_date} AND ${end_date}`);
    }
    const where = and(...conditions);

    // Pending rows are paginated by DISTINCT ORDER (not by raw order_item row):
    // a page always corresponds to N whole orders, so an order's line items —
    // which the frontend groups back into one visual row per order — can never
    // be split across two pages. History keeps the original row-level count/
    // pagination (ordered by actual_at, not an order-level column, so grouping
    // pagination doesn't apply there).
    let count;
    let pageOrderIds = null;
    if (open) {
      const [{ distinctCount }] = await dbV2
        .select({ distinctCount: sql`count(distinct ${schema.orders.id})::int` })
        .from(schema.orderApprovals)
        .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.orderApprovals.orderItemId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
        .where(where);
      count = distinctCount;

      const pageOrders = await dbV2
        .selectDistinct({ id: schema.orders.id, partySoDate: schema.orders.partySoDate, orderNo: schema.orders.orderNo })
        .from(schema.orderApprovals)
        .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.orderApprovals.orderItemId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
        .where(where)
        .orderBy(sql`${schema.orders.partySoDate} DESC, ${schema.orders.orderNo} DESC`)
        .limit(limit)
        .offset((page - 1) * limit);
      pageOrderIds = pageOrders.map((o) => o.id);

      if (pageOrderIds.length === 0) {
        return {
          success: true,
          data: [],
          pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
        };
      }
    } else {
      const [{ count: rowCount }] = await dbV2
        .select({ count: sql`count(*)::int` })
        .from(schema.orderApprovals)
        .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.orderApprovals.orderItemId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
        .where(where);
      count = rowCount;
    }

    const punchUser = alias(schema.users, 'punch_user');
    const preApprovalUser = alias(schema.users, 'pre_approval_doer');
    const orderApprovalUser = alias(schema.users, 'order_approval_doer');

    let rowsQuery = dbV2
      .select({
        orderApprovalId: schema.orderApprovals.id,
        plannedAt: schema.orderApprovals.plannedAt,
        actualAt: schema.orderApprovals.actualAt,
        overallStatus: schema.orderApprovals.overallStatus,
        rateIsRightlyAsPerCurrentMarketRate: schema.orderApprovals.rateIsRightlyAsPerCurrentMarketRate,
        weAreDealingInOrderedSku: schema.orderApprovals.weAreDealingInOrderedSku,
        partyCreditStatus: schema.orderApprovals.partyCreditStatus,
        dispatchDateConfirmed: schema.orderApprovals.dispatchDateConfirmed,
        orderConfirmationWithCustomer: schema.orderApprovals.orderConfirmationWithCustomer,
        orderItem: schema.orderItems,
        order: schema.orders,
        customer: schema.customers,
        depot: schema.depots,
        sku: schema.skus,
        orderPunchUser: punchUser.username,
        preApprovalUser: preApprovalUser.username,
        orderApprovalUser: orderApprovalUser.username,
        preApprovalPlannedAt: schema.preApprovals.plannedAt,
        preApprovalActualAt: schema.preApprovals.actualAt,
      })
      .from(schema.orderApprovals)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.orderApprovals.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .leftJoin(punchUser, eq(punchUser.id, schema.orders.orderPunchUserId))
      // Pinned to the live row (planned_at set) — pre_approvals is normally
      // reused in place on revert (see dispatchPlanningService's reopen logic),
      // but this guard is cheap insurance against the same fan-out this codebase
      // hit with order_approvals/dispatch_plannings if that ever changes.
      .leftJoin(schema.preApprovals, and(eq(schema.preApprovals.orderItemId, schema.orderItems.id), isNotNull(schema.preApprovals.plannedAt)))
      .leftJoin(preApprovalUser, eq(preApprovalUser.id, schema.preApprovals.approvedByUserId))
      .leftJoin(orderApprovalUser, eq(orderApprovalUser.id, schema.orderApprovals.approvedByUserId))
      .where(open ? and(where, inArray(schema.orders.id, pageOrderIds)) : where)
      // Newest first: sort pending rows by DO Date (party_so_date), tie-broken
      // by order_no so same-day orders stay in a stable, deterministic order.
      .orderBy(open ? sql`${schema.orders.partySoDate} DESC, ${schema.orders.orderNo} DESC` : desc(schema.orderApprovals.actualAt));

    if (!open) {
      rowsQuery = rowsQuery.limit(limit).offset((page - 1) * limit);
    }

    const rows = await rowsQuery;

    return {
      success: true,
      data: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
  }

  /**
   * Fetch one pending/closed order-approval row by its order_item id.
   */
  async getApprovalById(orderItemId) {
    const [row] = await dbV2
      .select({
        orderApprovalId: schema.orderApprovals.id,
        plannedAt: schema.orderApprovals.plannedAt,
        actualAt: schema.orderApprovals.actualAt,
        overallStatus: schema.orderApprovals.overallStatus,
        orderItem: schema.orderItems,
        order: schema.orders,
        customer: schema.customers,
        depot: schema.depots,
        sku: schema.skus,
      })
      .from(schema.orderApprovals)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.orderApprovals.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      // A reverted item can have more than one order_approvals row (see
      // _listApproval above); without an order_by, an unqualified match on
      // orderItemId alone could return a stale/nulled row instead of the live
      // one. Newest id wins — that's always the current cycle's row.
      .where(eq(schema.orderApprovals.orderItemId, orderItemId))
      .orderBy(desc(schema.orderApprovals.id))
      .limit(1);

    if (!row) throw new Error('Order approval not found');
    return { success: true, data: row };
  }

  /**
   * Submit Order Approval (gate 2) for one order_item.
   *
   * @param {number} orderItemId
   * @param {Object} data
   *   - overallStatus:  boolean|string  approve/reject decision (frontend already
   *                     folds "any checklist item rejected" into this).
   *   - rateIsRightlyAsPerCurrentMarketRate, weAreDealingInOrderedSku,
   *     dispatchDateConfirmed, orderConfirmationWithCustomer: booleans
   *   - partyCreditStatus: boolean|string (stored as text)
   *   - manualSaudaNo: string|null  Manual Sauda No. -> orders.manual_sauda_no
   *   - userId: number|null      -> order_approvals.approved_by_user_id
   */
  async submitApproval(orderItemId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [current] = await tx
        .select({ item: schema.orderItems, order: schema.orders, customerName: schema.customers.customerName })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
        .where(eq(schema.orderItems.id, orderItemId));

      if (!current) throw new Error('Order item not found');

      // Same truthiness normalization as the reference: the real values seen in
      // data are 'true'/'false'/'Approved'/'Cancelled'.
      const norm = String(data.overallStatus ?? '').toLowerCase().trim();
      const isApproved =
        data.overallStatus === true || norm === 'true' || norm === 'approved' || norm === 'approve';

      const toBool = (v) => v === true || String(v).toLowerCase().trim() === 'true';

      // Stale-write guard: only close a gate still open (planned_at set,
      // actual_at null). No-op on the happy path; fires on a stale/duplicate
      // submit or one reverted to an earlier stage. Storing overallStatus as
      // 'true'/'false' matches the backfilled values.
      const closedGate = await tx
        .update(schema.orderApprovals)
        .set({
          actualAt: new Date(),
          overallStatus: data.overallStatus != null ? String(data.overallStatus) : (isApproved ? 'true' : 'false'),
          rateIsRightlyAsPerCurrentMarketRate: toBool(data.rateIsRightlyAsPerCurrentMarketRate),
          weAreDealingInOrderedSku: toBool(data.weAreDealingInOrderedSku),
          partyCreditStatus: data.partyCreditStatus != null ? String(data.partyCreditStatus) : null,
          dispatchDateConfirmed: toBool(data.dispatchDateConfirmed),
          orderConfirmationWithCustomer: toBool(data.orderConfirmationWithCustomer),
          approvedByUserId: data.userId ?? null,
        })
        .where(and(
          eq(schema.orderApprovals.orderItemId, orderItemId),
          isNotNull(schema.orderApprovals.plannedAt),
          isNull(schema.orderApprovals.actualAt),
        ))
        .returning();
      assertStageOpen({ rowCount: closedGate.length }, 'Approval of Order');

      // Manual Sauda No. is captured at this gate; it lives on the order header.
      // Accept the new key, fall back to the legacy `processId` for any cached client.
      const manualSaudaInput = data.manualSaudaNo ?? data.processId;
      if (manualSaudaInput != null && manualSaudaInput !== '') {
        await tx.update(schema.orders).set({ manualSaudaNo: String(manualSaudaInput) }).where(eq(schema.orders.id, current.item.orderId));
      }

      // Honor the schema's "approved_qty set at order-approval" intent for
      // regular orders that skipped Pre-Approval (approved_qty still null there).
      // Only-if-null keeps it a no-op for pre-approval orders, which set it earlier.
      const itemPatch = {};
      if (current.item.approvedQty == null && current.item.orderQuantity != null) {
        itemPatch.approvedQty = current.item.orderQuantity;
        if (current.item.remainingQty == null) itemPatch.remainingQty = current.item.orderQuantity;
      }
      if (Object.keys(itemPatch).length > 0) {
        await tx.update(schema.orderItems).set(itemPatch).where(eq(schema.orderItems.id, orderItemId));
      }

      // Reliance rejection → revert the commitment raise: deleting the
      // commitment_details row restores the drawn MT to the commitment balance
      // (a commitment-sourced order; a plain punched order has no such row → no-op).
      if (!isApproved && (current.customerName || '').toLowerCase().includes('reliance')) {
        const del = await tx.delete(schema.commitmentDetails).where(eq(schema.commitmentDetails.orderItemId, orderItemId)).returning();
        if (del.length) Logger.info(`[REJECTION REVERSAL] Reliance order_item ${orderItemId} rejected — reverted ${del.length} commitment raise(s)`);
      }

      // Advance only on approval. A rejection closes the gate and stops here.
      let advanced = false;
      if (isApproved) {
        const isStockTransferOrder = isStockTransfer(current.order.orderCategory);
        if (isStockTransferOrder) {
          // Stock Transfer skips Dispatch Planning: the whole approved qty ships
          // in one go. Record a CLOSED dispatch_plannings row (shows in DP history,
          // not pending), zero the remaining, and mint the shipment straight into
          // Actual Dispatch.
          const now = new Date();
          const dpPlannedAt = await getPlannedAt(tx, 'Dispatch Planning');
          await tx.insert(schema.dispatchPlannings).values({
            orderItemId, plannedAt: dpPlannedAt, actualAt: now, performedByUserId: data.userId ?? null,
          });

          const shipQty = toNum(current.item.remainingQty) ?? toNum(current.item.approvedQty) ?? toNum(current.item.orderQuantity) ?? 0;
          const dsrNumber = await mintDsr(tx);
          const shipmentPlannedAt = await getPlannedAt(tx, 'Actual Dispatch');
          // Snapshot Manual Sauda No. as of THIS submit (reflects the processId
          // update just above, if this call supplied one) - same rationale as
          // dispatchPlanningService's mint: must not be read live later.
          const manualSaudaNo = (manualSaudaInput != null && manualSaudaInput !== '')
            ? String(manualSaudaInput)
            : current.order.manualSaudaNo ?? null;
          await tx.insert(schema.dispatches).values({
            orderItemId, dsrNumber, plannedAt: shipmentPlannedAt, qtyToBeDispatched: shipQty, isTransfer: true, manualSaudaNo,
          });
          await tx.update(schema.orderItems).set({ remainingQty: 0 }).where(eq(schema.orderItems.id, orderItemId));
          Logger.info(`[STOCK TRANSFER] order_item ${orderItemId} skipped Dispatch Planning -> shipment ${dsrNumber} (qty ${shipQty})`);
        } else {
          const nextPlannedAt = await getPlannedAt(tx, 'Dispatch Planning');
          await tx.insert(schema.dispatchPlannings).values({ orderItemId, plannedAt: nextPlannedAt });
        }
        advanced = true;
      }

      const [refreshedItem] = await tx
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.id, orderItemId));

      Logger.info(
        `Order approval submitted for order_item ${orderItemId} — ${isApproved ? 'approved (queued Dispatch Planning)' : 'rejected'}`
      );
      return {
        success: true,
        message: isApproved ? 'Approval submitted successfully' : 'Order rejected',
        data: { orderItem: refreshedItem, orderApproval: closedGate[0], advanced },
      };
    });
  }

  /**
   * Distinct customer names among pending approvals (filter dropdown).
   */
  async getFilterOptions() {
    const rows = await dbV2
      .selectDistinct({ customerName: schema.customers.customerName })
      .from(schema.orderApprovals)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.orderApprovals.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .innerJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .where(and(
        isNotNull(schema.orderApprovals.plannedAt),
        isNull(schema.orderApprovals.actualAt),
      ))
      .orderBy(asc(schema.customers.customerName));

    return {
      success: true,
      data: { customerNames: rows.map((r) => r.customerName).filter(Boolean) },
    };
  }
}

module.exports = new OrderApprovalService();
