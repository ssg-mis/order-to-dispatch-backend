/**
 * Dispatch Planning Service (Gate 3: Dispatch Planning) — v2 schema.
 *
 * Per ORDER ITEM, keyed off the `dispatch_plannings` gate (seeded when the item
 * is approved at Order Approval).
 *   - Pending : dispatch_plannings.planned_at IS NOT NULL AND actual_at IS NULL
 *   - History : dispatch_plannings.planned_at IS NOT NULL AND actual_at IS NOT NULL
 *
 * Planning a dispatch mints a DSR and creates a `dispatches` row (the physical
 * shipment, born pending at Actual Dispatch) and draws the qty down from
 * order_items.remaining_qty. An item can be planned across MANY shipments; the
 * gate stays open until remaining_qty hits 0, then it closes (actual_at set).
 *
 * Every mutating op locks the order_item row FOR UPDATE first, so concurrent
 * submit / revert / cancel / preclose on the same item serialize (no double
 * draw-down, no shipment-created-after-cancel races).
 */

const { Logger } = require('../utils');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, isNull, isNotNull, sql, asc, desc, inArray } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { getPlannedAt, mintDsr } = require('./stageUtils');
const { deriveConsolidatedRatesForGroup, deriveRatesForRegularOrder, detectOilType } = require('../utils/rateDerivation');

const toNum = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);

function staleWrite() {
  const err = new Error('This item is no longer in Dispatch Planning — it was already processed or moved by another user. Please refresh and try again.');
  err.statusCode = 409;
  err.code = 'STALE_WRITE';
  return err;
}

class DispatchPlanningService {
  async getPendingDispatches(filters = {}, pagination = {}) {
    return this._listDispatchPlanning({ ...filters, ...pagination, open: true });
  }

  async getDispatchHistory(filters = {}, pagination = {}) {
    return this._listDispatchPlanning({ ...filters, ...pagination, open: false });
  }

  async _listDispatchPlanning({ open, page = 1, limit = 25, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no }) {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 25;

    const conditions = [
      isNotNull(schema.dispatchPlannings.plannedAt),
      open ? isNull(schema.dispatchPlannings.actualAt) : isNotNull(schema.dispatchPlannings.actualAt),
    ];
    if (order_no) {
      conditions.push(sql`(${schema.orders.orderNo} ILIKE ${'%' + order_no + '%'} OR ${schema.customers.customerName} ILIKE ${'%' + order_no + '%'})`);
    } else if (customer_name) {
      conditions.push(sql`${schema.customers.customerName} ILIKE ${'%' + customer_name + '%'}`);
    }
    if (start_date && end_date) {
      conditions.push(sql`${schema.orders.deliveryDate} BETWEEN ${start_date} AND ${end_date}`);
    }
    if (Array.isArray(depo_names)) {
      conditions.push(depo_names.length ? inArray(schema.depots.depotName, depo_names) : sql`1=0`);
    }
    if (manual_sauda_no) {
      conditions.push(sql`${schema.orders.manualSaudaNo} ILIKE ${'%' + manual_sauda_no + '%'}`);
    }
    const where = and(...conditions);

    const [{ count }] = await dbV2
      .select({ count: sql`count(*)::int` })
      .from(schema.dispatchPlannings)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatchPlannings.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .where(where);

    const punchUser = alias(schema.users, 'punch_user');
    const preApprovalUser = alias(schema.users, 'pre_approval_doer');
    const orderApprovalUser = alias(schema.users, 'order_approval_doer');
    const dispatchPlanningUser = alias(schema.users, 'dispatch_planning_doer');

    const rows = await dbV2
      .select({
        dispatchPlanningId: schema.dispatchPlannings.id,
        plannedAt: schema.dispatchPlannings.plannedAt,
        actualAt: schema.dispatchPlannings.actualAt,
        revertRemarks: schema.dispatchPlannings.revertRemarks,
        orderItem: schema.orderItems,
        order: schema.orders,
        customer: schema.customers,
        depot: schema.depots,
        sku: schema.skus,
        // "Slip status": has any OTHER line item under this order already spawned
        // a shipment? (drives the frontend's already-planned indicator).
        hasPriorDispatch: sql`EXISTS (
          SELECT 1 FROM dispatches d
          JOIN order_items oi2 ON oi2.id = d.order_item_id
          WHERE oi2.order_id = ${schema.orders.id} AND oi2.id <> ${schema.orderItems.id}
        )`,
        // Roll up the earlier gates so downstream history shows the full trail.
        preApprovalPlannedAt: schema.preApprovals.plannedAt,
        preApprovalActualAt: schema.preApprovals.actualAt,
        overallStatus: schema.orderApprovals.overallStatus,
        rateIsRightlyAsPerCurrentMarketRate: schema.orderApprovals.rateIsRightlyAsPerCurrentMarketRate,
        weAreDealingInOrderedSku: schema.orderApprovals.weAreDealingInOrderedSku,
        partyCreditStatus: schema.orderApprovals.partyCreditStatus,
        dispatchDateConfirmed: schema.orderApprovals.dispatchDateConfirmed,
        orderConfirmationWithCustomer: schema.orderApprovals.orderConfirmationWithCustomer,
        orderApprovalPlannedAt: schema.orderApprovals.plannedAt,
        orderApprovalActualAt: schema.orderApprovals.actualAt,
        orderPunchUser: punchUser.username,
        preApprovalUser: preApprovalUser.username,
        orderApprovalUser: orderApprovalUser.username,
        dispatchPlanningUser: dispatchPlanningUser.username,
      })
      .from(schema.dispatchPlannings)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatchPlannings.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .leftJoin(schema.preApprovals, eq(schema.preApprovals.orderItemId, schema.orderItems.id))
      .leftJoin(schema.orderApprovals, eq(schema.orderApprovals.orderItemId, schema.orderItems.id))
      .leftJoin(punchUser, eq(punchUser.id, schema.orders.orderPunchUserId))
      .leftJoin(preApprovalUser, eq(preApprovalUser.id, schema.preApprovals.approvedByUserId))
      .leftJoin(orderApprovalUser, eq(orderApprovalUser.id, schema.orderApprovals.approvedByUserId))
      .leftJoin(dispatchPlanningUser, eq(dispatchPlanningUser.id, schema.dispatchPlannings.performedByUserId))
      .where(where)
      .orderBy(open ? asc(schema.orders.orderNo) : desc(schema.dispatchPlannings.actualAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      success: true,
      data: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
  }

  /**
   * Submit a dispatch plan for one order_item: mint a DSR, create the shipment
   * (dispatches row, pending Actual Dispatch), draw the qty down from
   * remaining_qty, and close the gate once nothing remains.
   *
   * @param {number} orderItemId
   * @param {Object} data
   *   - dispatchQty: number (defaults to all remaining)
   *   - transfer: 'yes'|'no'|boolean  -> dispatches.is_transfer
   *   - dispatchFrom: string          -> dispatches.dispatch_from
   *   - billCompanyName/billAddress/shipCompanyName/shipAddress: order header
   *   - freightRate: number           -> orders.freight_rate
   *   - userId: number                -> dispatch_plannings.performed_by_user_id
   */
  async submitDispatchPlanning(orderItemId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const locked = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, orderItemId)).for('update');
      if (locked.length === 0) throw new Error('Order item not found');
      const item = locked[0];

      const [gate] = await tx
        .select()
        .from(schema.dispatchPlannings)
        .where(and(
          eq(schema.dispatchPlannings.orderItemId, orderItemId),
          isNotNull(schema.dispatchPlannings.plannedAt),
          isNull(schema.dispatchPlannings.actualAt),
        ));
      if (!gate) throw staleWrite();

      const [orderRow] = await tx
        .select({ orderNo: schema.orders.orderNo, manualSaudaNo: schema.orders.manualSaudaNo })
        .from(schema.orders)
        .where(eq(schema.orders.id, item.orderId));

      const currentAvailable = toNum(item.remainingQty) ?? toNum(item.approvedQty) ?? toNum(item.orderQuantity) ?? 0;
      if (!(currentAvailable > 0)) {
        throw new Error('No remaining quantity to dispatch — order item already fully dispatched');
      }
      const dispatchQty = data.dispatchQty != null ? parseFloat(data.dispatchQty) : currentAvailable;
      if (!(dispatchQty > 0)) throw new Error('Dispatch quantity must be greater than 0');

      // Hard cap: a shipment can never dispatch more than what's left of the punched
      // original, so SUM(dispatched) can never exceed the order qty. Mirrors the
      // preclose guard below. (Stock Transfer never reaches Dispatch Planning — it
      // ships in full at Order Approval — so no category check is needed here.)
      if (dispatchQty > currentAvailable + 0.0001) {
        throw new Error(`Dispatch quantity (${dispatchQty}) cannot exceed remaining quantity (${currentAvailable})`);
      }

      const rawRemaining = currentAvailable - dispatchQty;
      const complete = rawRemaining <= 0.0001; // exactly-full dispatch → item done
      const newRemaining = complete ? 0 : rawRemaining;

      const dsrNumber = await mintDsr(tx);
      const shipmentPlannedAt = await getPlannedAt(tx, 'Actual Dispatch');
      const isTransfer = data.transfer === true || String(data.transfer ?? '').toLowerCase() === 'yes';

      const [dispatch] = await tx
        .insert(schema.dispatches)
        .values({
          orderItemId,
          dsrNumber,
          plannedAt: shipmentPlannedAt,
          qtyToBeDispatched: dispatchQty,
          dispatchFrom: data.dispatchFrom ?? null,
          isTransfer,
          // Snapshot the order's Manual Sauda No. at mint time (mirrors the
          // reference's lift_receiving_confirmation.processid copy) - it can
          // be edited later at Order Approval, so this must NOT be read live.
          manualSaudaNo: orderRow?.manualSaudaNo ?? null,
        })
        .returning();

      await tx.update(schema.orderItems).set({ remainingQty: newRemaining }).where(eq(schema.orderItems.id, orderItemId));

      // Transfer / freight details live on the order header in v2.
      const orderPatch = {};
      if (data.billCompanyName !== undefined) orderPatch.billCompanyName = data.billCompanyName || null;
      if (data.billAddress !== undefined) orderPatch.billAddress = data.billAddress || null;
      if (data.shipCompanyName !== undefined) orderPatch.shipCompanyName = data.shipCompanyName || null;
      if (data.shipAddress !== undefined) orderPatch.shipAddress = data.shipAddress || null;
      if (data.freightRate !== undefined && data.freightRate !== null) orderPatch.freightRate = data.freightRate;
      if (Object.keys(orderPatch).length) {
        await tx.update(schema.orders).set(orderPatch).where(eq(schema.orders.id, item.orderId));
      }

      if (complete) {
        const closed = await tx
          .update(schema.dispatchPlannings)
          .set({ actualAt: new Date(), performedByUserId: data.userId ?? null })
          .where(and(
            eq(schema.dispatchPlannings.orderItemId, orderItemId),
            isNotNull(schema.dispatchPlannings.plannedAt),
            isNull(schema.dispatchPlannings.actualAt),
          ))
          .returning();
        assertStageOpen({ rowCount: closed.length }, 'Dispatch Planning');
      } else {
        // Partial: record the planner but leave the gate open for the next shipment.
        await tx
          .update(schema.dispatchPlannings)
          .set({ performedByUserId: data.userId ?? null })
          .where(and(eq(schema.dispatchPlannings.orderItemId, orderItemId), isNull(schema.dispatchPlannings.actualAt)));
      }

      Logger.info(`Dispatch planned for order_item ${orderItemId}: ${dsrNumber} qty=${dispatchQty}, remaining=${newRemaining}${complete ? ' (item complete)' : ''}`);
      return {
        success: true,
        message: 'Dispatch planning submitted successfully',
        data: { dsrNumber, orderNo: orderRow?.orderNo, dispatch, remainingQty: newRemaining, complete },
      };
    });
  }

  /**
   * Revert an item from Dispatch Planning all the way back to Pre-Approval.
   * Deactivates the dispatch-planning and order-approval gates (planned/actual →
   * null, keeping the rows for audit + the revert remark) and re-opens the
   * pre-approval gate. remaining_qty is NEVER touched — it is the source of truth,
   * and any qty already shipped stays shipped. For regular orders, rates are
   * re-derived for the whole order group (mirrors the reference).
   *
   * @param {number} orderItemId
   * @param {Object} data - { userId, remarks }
   */
  async revertDispatchPlanning(orderItemId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const locked = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, orderItemId)).for('update');
      if (locked.length === 0) throw new Error('Order item not found');

      const [order] = await tx.select().from(schema.orders).where(eq(schema.orders.id, locked[0].orderId));

      // ── Split-on-revert ──────────────────────────────────────────────────────
      // If this line already has shipments (trucks out) AND still has an
      // un-dispatched remainder, DON'T revert the whole line: that would drag the
      // already-shipped boxes back to Pre-Approval, where a later SKU change would
      // relabel them (v2) / orphan them (v1). Instead keep the shipped boxes on THIS
      // line (locked — its dispatches + SKU frozen) and move ONLY the un-dispatched
      // remainder to a NEW line that goes back to Pre-Approval. Reuses the same split
      // family mechanism as partial pre-approval (origin='split' + budget_root_id),
      // so the frozen original + qty guard stay exact (shipped + remainder = original).
      const shipments = await tx
        .select({ id: schema.dispatches.id })
        .from(schema.dispatches)
        .where(eq(schema.dispatches.orderItemId, orderItemId));
      const remainingNow = toNum(locked[0].remainingQty) ?? 0;
      if (shipments.length > 0 && remainingNow > 0.0001) {
        const item = locked[0];
        // Close THIS line's open dispatch-planning gate — it's fully dispatched now.
        const closed = await tx
          .update(schema.dispatchPlannings)
          .set({ actualAt: new Date(), revertRemarks: data.remarks ?? null, performedByUserId: data.userId ?? null })
          .where(and(
            eq(schema.dispatchPlannings.orderItemId, orderItemId),
            isNotNull(schema.dispatchPlannings.plannedAt),
            isNull(schema.dispatchPlannings.actualAt),
          ))
          .returning();
        if (closed.length === 0) throw staleWrite();

        // Shrink this line to the shipped portion. Update DOWN first (so the family
        // sum only drops before the new line is added — keeps the qty guard happy).
        const shippedQty = (toNum(item.orderQuantity) ?? 0) - remainingNow;
        await tx
          .update(schema.orderItems)
          .set({ orderQuantity: shippedQty, approvedQty: shippedQty, remainingQty: 0 })
          .where(eq(schema.orderItems.id, orderItemId));

        // New line = the un-dispatched remainder, back at Pre-Approval. Same SKU/rate
        // for now; it has NO shipments so its SKU can be changed safely there.
        const [newItem] = await tx
          .insert(schema.orderItems)
          .values({
            orderId: item.orderId,
            skuId: item.skuId,
            uom: item.uom,
            alternateUom: item.alternateUom,
            alternateQtyKg: item.alternateQtyKg,
            oilType: item.oilType,
            orderQuantity: remainingNow,
            rateOfMaterial: item.rateOfMaterial,
            finalRate: item.finalRate,
            ratePer15kg: item.ratePer15kg,
            ratePerLtr: item.ratePerLtr,
            origin: 'split',
            splitFromItemId: orderItemId,
            budgetRootId: item.budgetRootId ?? item.id,
          })
          .returning();
        const preAt = await getPlannedAt(tx, 'Pre Approval');
        await tx.insert(schema.preApprovals).values({ orderItemId: newItem.id, plannedAt: preAt });

        Logger.info(`[REVERT-SPLIT] order_item ${orderItemId}: kept ${shippedQty} shipped (locked), moved remaining ${remainingNow} -> new order_item ${newItem.id} at Pre-Approval`);
        return {
          success: true,
          split: true,
          message: `Already-dispatched quantity kept on the original line; remaining ${remainingNow} moved to a new line at Pre-Approval — change the product there.`,
          data: { kept: orderItemId, moved: newItem.id },
        };
      }
      // ── end split-on-revert; below is the normal whole-line revert ────────────

      // Deactivate the (open) dispatch-planning gate and stash the revert remark.
      const reverted = await tx
        .update(schema.dispatchPlannings)
        .set({ plannedAt: null, actualAt: null, revertRemarks: data.remarks ?? null, performedByUserId: data.userId ?? null })
        .where(and(
          eq(schema.dispatchPlannings.orderItemId, orderItemId),
          isNotNull(schema.dispatchPlannings.plannedAt),
          isNull(schema.dispatchPlannings.actualAt),
        ))
        .returning();
      if (reverted.length === 0) throw staleWrite();

      // Deactivate the order-approval gate (only the active one).
      await tx
        .update(schema.orderApprovals)
        .set({ plannedAt: null, actualAt: null })
        .where(and(eq(schema.orderApprovals.orderItemId, orderItemId), isNotNull(schema.orderApprovals.plannedAt)));

      // Re-open pre-approval: reset the existing row, or create one for a regular
      // order that never had a pre-approval gate.
      const reopened = await tx
        .update(schema.preApprovals)
        .set({ plannedAt: new Date(), actualAt: null, approvedByUserId: null })
        .where(eq(schema.preApprovals.orderItemId, orderItemId))
        .returning();
      if (reopened.length === 0) {
        await tx.insert(schema.preApprovals).values({ orderItemId, plannedAt: new Date() });
      }

      // Regular orders: re-derive rate_per_15kg / rate_per_ltr / oil_type across the
      // whole order group from each line's rate_of_material (non-fatal on failure).
      if ((order?.orderType || '').toLowerCase() === 'regular') {
        try {
          const items = await tx
            .select({ id: schema.orderItems.id, productName: schema.skus.skuName, rateOfMaterial: schema.orderItems.rateOfMaterial })
            .from(schema.orderItems)
            .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
            .where(eq(schema.orderItems.orderId, order.id));
          const products = items
            .filter((p) => p.productName)
            .map((p) => ({ id: p.id, product_name: p.productName, rate_of_material: p.rateOfMaterial }));
          const ratesByOil = await deriveConsolidatedRatesForGroup(products);
          if (ratesByOil) {
            for (const p of products) {
              const oilType = detectOilType(p.product_name);
              const rates = ratesByOil[oilType] || (await deriveRatesForRegularOrder(p.product_name, parseFloat(p.rate_of_material)));
              if (rates) {
                await tx
                  .update(schema.orderItems)
                  .set({ ratePer15kg: rates.rate_per_15kg, ratePerLtr: rates.rate_per_ltr, oilType })
                  .where(eq(schema.orderItems.id, p.id));
              }
            }
            Logger.info(`[REVERT] Re-derived rates by oil type for order ${order.orderNo}`);
          }
        } catch (e) {
          Logger.warn(`[REVERT] rate re-derivation failed for order ${order?.orderNo}: ${e.message}`);
        }
      }

      Logger.info(`[REVERT] order_item ${orderItemId} reverted to Pre-Approval (remarks: ${data.remarks || 'none'})`);
      return { success: true, message: 'Dispatch planning reverted to Pre-Approval successfully' };
    });
  }

  /**
   * Cancel an item from Dispatch Planning (Super Admin only — enforced in the
   * controller). Terminates it: closes the gate (leaves History), zeroes
   * remaining_qty, and flags the order-approval gate's overall_status =
   * 'Cancelled' (the dashboard's Rejected/Cancelled signal).
   *
   * @param {number} orderItemId
   * @param {Object} data - { userId, remarks }
   */
  async cancelDispatchPlanning(orderItemId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const locked = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, orderItemId)).for('update');
      if (locked.length === 0) throw new Error('Order item not found');

      const closed = await tx
        .update(schema.dispatchPlannings)
        .set({ actualAt: new Date(), cancelRemarks: data.remarks ?? null, cancelledByUserId: data.userId ?? null })
        .where(and(
          eq(schema.dispatchPlannings.orderItemId, orderItemId),
          isNotNull(schema.dispatchPlannings.plannedAt),
          isNull(schema.dispatchPlannings.actualAt),
        ))
        .returning();
      if (closed.length === 0) throw staleWrite();

      await tx.update(schema.orderItems).set({ remainingQty: 0 }).where(eq(schema.orderItems.id, orderItemId));
      await tx
        .update(schema.orderApprovals)
        .set({ overallStatus: 'Cancelled' })
        .where(and(eq(schema.orderApprovals.orderItemId, orderItemId), isNotNull(schema.orderApprovals.plannedAt)));

      Logger.info(`[CANCEL] order_item ${orderItemId} cancelled (remarks: ${data.remarks || 'none'})`);
      return { success: true, message: 'Order cancelled successfully' };
    });
  }

  /**
   * Pre-close remaining quantity without dispatching it. Draws the qty down and
   * records it on order_items.preclose_qty; closes the gate when nothing remains.
   *
   * @param {number} orderItemId
   * @param {Object} data - { precloseQty, userId, action: 'close'|'commitment', precloseRemarks }
   */
  async precloseDispatchPlanning(orderItemId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const precloseQty = parseFloat(data.precloseQty ?? 0);
      if (!(precloseQty > 0)) throw new Error('Preclose quantity must be greater than 0');
      const action = data.action || 'close';

      const locked = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, orderItemId)).for('update');
      if (locked.length === 0) throw new Error('Order item not found');
      const item = locked[0];

      const [gate] = await tx
        .select()
        .from(schema.dispatchPlannings)
        .where(and(
          eq(schema.dispatchPlannings.orderItemId, orderItemId),
          isNotNull(schema.dispatchPlannings.plannedAt),
          isNull(schema.dispatchPlannings.actualAt),
        ));
      if (!gate) throw staleWrite();

      const currentAvailable = toNum(item.remainingQty) ?? toNum(item.approvedQty) ?? toNum(item.orderQuantity) ?? 0;
      if (precloseQty > currentAvailable + 0.0001) {
        throw new Error(`Preclose quantity (${precloseQty}) cannot exceed remaining quantity (${currentAvailable})`);
      }
      const rawRemaining = currentAvailable - precloseQty;
      const complete = rawRemaining <= 0.0001;
      const newRemaining = complete ? 0 : rawRemaining;
      const newPreclose = (toNum(item.precloseQty) ?? 0) + precloseQty;

      await tx.update(schema.orderItems).set({ remainingQty: newRemaining, precloseQty: newPreclose }).where(eq(schema.orderItems.id, orderItemId));

      if (complete) {
        const closed = await tx
          .update(schema.dispatchPlannings)
          .set({ actualAt: new Date(), precloseRemarks: data.precloseRemarks ?? null, precloseByUserId: data.userId ?? null })
          .where(and(
            eq(schema.dispatchPlannings.orderItemId, orderItemId),
            isNotNull(schema.dispatchPlannings.plannedAt),
            isNull(schema.dispatchPlannings.actualAt),
          ))
          .returning();
        assertStageOpen({ rowCount: closed.length }, 'Dispatch Planning');
      } else {
        await tx
          .update(schema.dispatchPlannings)
          .set({ precloseRemarks: data.precloseRemarks ?? null, precloseByUserId: data.userId ?? null })
          .where(and(eq(schema.dispatchPlannings.orderItemId, orderItemId), isNull(schema.dispatchPlannings.actualAt)));
      }

      // action === 'commitment': return the pre-closed qty (boxes + its MT share)
      // to the parent commitment's balance so it can be re-raised. Proportional
      // MT = (skuWeightMt / skuQuantity) * precloseQty. Mirrors the reference; the
      // qty draw-down above is identical for both actions, only this return differs.
      if (action === 'commitment') {
        const [cd] = await tx
          .select({ id: schema.commitmentDetails.id, skuWeightMt: schema.commitmentDetails.skuWeightMt, skuQuantity: schema.commitmentDetails.skuQuantity })
          .from(schema.commitmentDetails)
          .where(eq(schema.commitmentDetails.orderItemId, orderItemId));
        if (cd) {
          const totalQty = toNum(cd.skuQuantity) || 1;
          const totalMt = toNum(cd.skuWeightMt) || 0;
          const mtToReturn = (totalMt / totalQty) * precloseQty;
          await tx
            .update(schema.commitmentDetails)
            .set({
              skuWeightMt: sql`GREATEST(0, ${schema.commitmentDetails.skuWeightMt} - ${mtToReturn})`,
              skuQuantity: sql`GREATEST(0, ${schema.commitmentDetails.skuQuantity} - ${precloseQty})`,
            })
            .where(eq(schema.commitmentDetails.id, cd.id));
          Logger.info(`[PRECLOSE] Returned ${mtToReturn.toFixed(4)} MT / ${precloseQty} boxes to commitment for order_item ${orderItemId}`);
        } else {
          Logger.warn(`[PRECLOSE] No commitment_details for order_item ${orderItemId} — commitment return skipped`);
        }
      }

      Logger.info(`[PRECLOSE] order_item ${orderItemId} preclosed ${precloseQty}, remaining=${newRemaining}`);
      return {
        success: true,
        message: 'Quantity preclosed successfully',
        data: { precloseQty, newRemainingQty: newRemaining, complete },
      };
    });
  }

  /**
   * Persist transfer / freight details on the order header (pre-submit edit).
   * @param {number} orderItemId
   * @param {Object} data - { billCompanyName, billAddress, shipCompanyName, shipAddress, freightRate }
   */
  async updateTransferDetails(orderItemId, data = {}) {
    const [item] = await dbV2.select({ orderId: schema.orderItems.orderId }).from(schema.orderItems).where(eq(schema.orderItems.id, orderItemId));
    if (!item) throw new Error('Order item not found');

    await dbV2
      .update(schema.orders)
      .set({
        billCompanyName: data.billCompanyName ?? null,
        billAddress: data.billAddress ?? null,
        shipCompanyName: data.shipCompanyName ?? null,
        shipAddress: data.shipAddress ?? null,
        freightRate: data.freightRate != null ? data.freightRate : '0',
      })
      .where(eq(schema.orders.id, item.orderId));

    return { success: true, message: 'Transfer details updated successfully' };
  }
}

module.exports = new DispatchPlanningService();
