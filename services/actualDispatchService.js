/**
 * Actual Dispatch Service (Gate 4: Actual Dispatch) — v2 schema.
 *
 * Operates on `dispatches` rows (physical shipments). A shipment is born at
 * Dispatch Planning with `planned_at` set and `actual_at` NULL, its qty already
 * drawn down from order_items.remaining_qty.
 *   - Pending : dispatches.planned_at IS NOT NULL AND actual_at IS NULL
 *   - History : dispatches.planned_at IS NOT NULL AND actual_at IS NOT NULL
 *
 * Confirming a dispatch fills the vehicle/driver/transporter FKs, per-trip
 * weights/documents/freight, stamps `dispatches.actual_at`, and queues the next
 * gate (`security_guard_checks`). If the dispatch was for LESS than planned, the
 * shortfall is returned to remaining_qty (Sales) or dropped (Stock Transfer),
 * re-opening Dispatch Planning so the shortfall can be re-planned.
 *
 * BANARI depot skip: in the reference, a DB trigger set the Make-Invoice planned
 * timestamp the instant Security's actual stamp landed, and Actual Dispatch
 * auto-stamped Security for every depot EXCEPT "BANARI". So only BANARI shipments
 * actually pass through Security review; everyone else skips straight to Make
 * Invoice. Reproduced here in-app: for a non-BANARI depot we seed
 * security_guard_checks already-closed (planned+actual) AND seed the invoices
 * gate (planned_made_at) so the shipment lands pending at Make Invoice. BANARI
 * shipments get security_guard_checks pending (actual_at NULL); the Security
 * stage's submit will seed the invoice gate when it is migrated.
 *
 * Every mutating op locks the parent order_item FOR UPDATE first, so it
 * serializes with Dispatch Planning submit/revert/preclose on the same item
 * (no double qty draw-down / return).
 */

const { Logger } = require('../utils');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, isNull, isNotNull, sql, asc, desc, inArray } = require('drizzle-orm');
const { getPlannedAt, isStockTransfer } = require('./stageUtils');
const { deriveConsolidatedRatesForGroup, deriveRatesForRegularOrder, detectOilType } = require('../utils/rateDerivation');

const toNum = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);

function staleWrite() {
  const err = new Error('This shipment is no longer awaiting Actual Dispatch — it was already dispatched or reverted by another user. Please refresh and try again.');
  err.statusCode = 409;
  err.code = 'STALE_WRITE';
  return err;
}

// Actual Dispatch confirms a manually-entered dispatch date (calendar day). Store
// it at noon UTC so a date-only read is stable in IST (UTC+5:30). Falls back to
// the submit time. Mirrors the reference's actual_dispatch_date handling.
function resolveActualAt(actualDispatchDate) {
  if (typeof actualDispatchDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(actualDispatchDate)) {
    return new Date(`${actualDispatchDate}T12:00:00.000Z`);
  }
  return new Date();
}

// Resolve a master FK: prefer an explicit id, else look one up by a natural key
// (registration no / driving licence / name). Keeps the endpoint usable before
// the frontend is rewired to submit ids directly. Returns null if unresolved.
async function resolveFk(tx, table, idCol, byId, lookups) {
  if (byId !== undefined && byId !== null && byId !== '') return parseInt(byId, 10);
  for (const { col, val } of lookups) {
    if (val === undefined || val === null || val === '') continue;
    const [row] = await tx.select({ id: idCol }).from(table).where(eq(col, val)).limit(1);
    if (row) return row.id;
  }
  return null;
}

// Delete a shipment's downstream gate rows (real FKs to dispatches.id) in
// dependency order so the dispatch row itself can be removed on a revert.
// On a revert-from-pending only security/invoice may exist; the deeper tables
// are covered defensively for reverts of shipments that already progressed.
async function deleteDispatchChildren(tx, dispatchId) {
  await tx.delete(schema.damageAdjustments).where(eq(schema.damageAdjustments.dispatchId, dispatchId));
  await tx.delete(schema.materialReceipts).where(eq(schema.materialReceipts.dispatchId, dispatchId));
  await tx.delete(schema.gateOuts).where(eq(schema.gateOuts.dispatchId, dispatchId));
  await tx.delete(schema.invoices).where(eq(schema.invoices.dispatchId, dispatchId));
  await tx.delete(schema.securityGuardChecks).where(eq(schema.securityGuardChecks.dispatchId, dispatchId));
}

class ActualDispatchService {
  async getPendingDispatches(filters = {}, pagination = {}) {
    return this._listActualDispatch({ ...filters, ...pagination, open: true });
  }

  async getDispatchHistory(filters = {}, pagination = {}) {
    return this._listActualDispatch({ ...filters, ...pagination, open: false });
  }

  async _listActualDispatch({ open, page = 1, limit = 25, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no }) {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 25;

    const conditions = [
      isNotNull(schema.dispatches.plannedAt),
      open ? isNull(schema.dispatches.actualAt) : isNotNull(schema.dispatches.actualAt),
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
      .from(schema.dispatches)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .where(where);

    const rows = await dbV2
      .select({
        dispatch: schema.dispatches,
        orderItem: schema.orderItems,
        order: schema.orders,
        customer: schema.customers,
        depot: schema.depots,
        sku: schema.skus,
        // "Slip status": has any OTHER shipment on this order already been
        // actual-dispatched? (drives the frontend's already-dispatched indicator).
        hasPriorDispatch: sql`EXISTS (
          SELECT 1 FROM dispatches d2
          JOIN order_items oi2 ON oi2.id = d2.order_item_id
          WHERE oi2.order_id = ${schema.orders.id}
            AND d2.id <> ${schema.dispatches.id}
            AND d2.actual_at IS NOT NULL
        )`,
      })
      .from(schema.dispatches)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .where(where)
      .orderBy(open ? asc(schema.orders.orderNo) : desc(schema.dispatches.actualAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      success: true,
      data: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
  }

  /**
   * Confirm a dispatch (shipment). Fills vehicle/driver/transporter + weights/docs/
   * freight, stamps actual_at, handles under/over-dispatch, and queues Security
   * (auto-skipping it + queuing Make Invoice for non-BANARI depots).
   *
   * @param {number} dispatchId
   * @param {Object} data
   *   - actualDispatchDate 'YYYY-MM-DD', userId
   *   - actualQtyDispatch / actualQty (defaults to planned), checkStatus, remarks
   *   - vehicleId | registrationNo, driverId | drivingLicenceNo/driverName,
   *     transporterId | transporterName
   *   - vehicleNoPlateImage, {fitness,insurance,taxCopy,pollution,permit1,permit2OutState}Image
   *     + matching *EndDate, weightmentSlipCopy, rstNo, gross/tare/net/extra/packaging/passing weight,
   *     difference, reasonOfWeightDifference, vehicleOverloadRemarks,
   *     freightRateType, freightAmount, cdAmount, advanceBhada{Bank,DieselAdvance,Cash}, finalRate
   */
  async submitActualDispatch(dispatchId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [row] = await tx
        .select({
          dispatchId: schema.dispatches.id,
          orderItemId: schema.dispatches.orderItemId,
          dsrNumber: schema.dispatches.dsrNumber,
          qtyToBeDispatched: schema.dispatches.qtyToBeDispatched,
          plannedAt: schema.dispatches.plannedAt,
          actualAt: schema.dispatches.actualAt,
          orderId: schema.orders.id,
          orderNo: schema.orders.orderNo,
          orderCategory: schema.orders.orderCategory,
          depotName: schema.depots.depotName,
        })
        .from(schema.dispatches)
        .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
        .where(eq(schema.dispatches.id, dispatchId));
      if (!row) throw new Error('Dispatch record not found');

      // Serialize with Dispatch Planning submit/revert/preclose on the same item.
      await tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, row.orderItemId)).for('update');
      const [item] = await tx
        .select({ remainingQty: schema.orderItems.remainingQty })
        .from(schema.orderItems)
        .where(eq(schema.orderItems.id, row.orderItemId));

      const vehicleId = await resolveFk(tx, schema.vehicles, schema.vehicles.id, data.vehicleId, [
        { col: schema.vehicles.registrationNo, val: data.registrationNo },
      ]);
      const driverId = await resolveFk(tx, schema.drivers, schema.drivers.id, data.driverId, [
        { col: schema.drivers.drivingLicenceNo, val: data.drivingLicenceNo },
        { col: schema.drivers.driverName, val: data.driverName },
      ]);
      const transporterId = await resolveFk(tx, schema.transporters, schema.transporters.id, data.transporterId, [
        { col: schema.transporters.transporterName, val: data.transporterName },
      ]);

      const plannedQty = toNum(row.qtyToBeDispatched) ?? 0;
      const actualQtyVal = toNum(data.actualQtyDispatch) ?? toNum(data.actualQty) ?? plannedQty;
      const isStockTransferOrder = isStockTransfer(row.orderCategory);

      // No over-delivery for Sales: a shipment may be dispatched SHORT (the shortfall
      // returns to be re-planned) but never OVER its planned qty — so cumulative actual
      // can never pass the planned total, which is already capped at the order qty.
      // Stock Transfer is exempt (ships above the punch by design).
      if (!isStockTransferOrder && actualQtyVal > plannedQty + 0.0001) {
        throw new Error(`Actual dispatched qty (${actualQtyVal}) cannot exceed the planned qty (${plannedQty}) for this shipment`);
      }

      // Only include a field in the patch when the caller supplied it, so a sparse
      // submit never clobbers a value with null. Core stamps are always set.
      const patch = {
        actualAt: resolveActualAt(data.actualDispatchDate),
        performedByUserId: data.userId ?? null,
        actualQtyDispatch: actualQtyVal,
        actualQty: toNum(data.actualQty) ?? actualQtyVal,
      };
      const set = (key, val) => { if (val !== undefined) patch[key] = val; };
      if (vehicleId !== null) patch.vehicleId = vehicleId;
      if (driverId !== null) patch.driverId = driverId;
      if (transporterId !== null) patch.transporterId = transporterId;
      set('checkStatus', data.checkStatus);
      set('remarks', data.remarks);
      set('dispatchFrom', data.dispatchFrom);
      set('vehicleNoPlateImage', data.vehicleNoPlateImage);
      set('fitnessImage', data.fitnessImage);
      set('fitnessEndDate', data.fitnessEndDate);
      set('insuranceImage', data.insuranceImage);
      set('insuranceEndDate', data.insuranceEndDate);
      set('taxCopyImage', data.taxCopyImage);
      set('taxEndDate', data.taxEndDate);
      set('pollutionImage', data.pollutionImage);
      set('pollutionEndDate', data.pollutionEndDate);
      set('permit1Image', data.permit1Image);
      set('permit1EndDate', data.permit1EndDate);
      set('permit2OutStateImage', data.permit2OutStateImage);
      set('permit2EndDate', data.permit2EndDate);
      set('weightmentSlipCopy', data.weightmentSlipCopy);
      set('rstNo', data.rstNo);
      if (data.grossWeight !== undefined) patch.grossWeight = toNum(data.grossWeight);
      if (data.tareWeight !== undefined) patch.tareWeight = toNum(data.tareWeight);
      if (data.netWeight !== undefined) patch.netWeight = toNum(data.netWeight);
      if (data.extraWeight !== undefined) patch.extraWeight = toNum(data.extraWeight);
      if (data.packagingWeight !== undefined) patch.packagingWeight = toNum(data.packagingWeight);
      if (data.passingWeight !== undefined) patch.passingWeight = toNum(data.passingWeight);
      if (data.difference !== undefined) patch.difference = toNum(data.difference);
      set('reasonOfWeightDifference', data.reasonOfWeightDifference);
      set('vehicleOverloadRemarks', data.vehicleOverloadRemarks);
      set('freightRateType', data.freightRateType);
      if (data.freightAmount !== undefined) patch.freightAmount = toNum(data.freightAmount);
      if (data.cdAmount !== undefined) patch.cdAmount = toNum(data.cdAmount);
      if (data.advanceBhadaBank !== undefined) patch.advanceBhadaBank = toNum(data.advanceBhadaBank);
      if (data.advanceBhadaDieselAdvance !== undefined) patch.advanceBhadaDieselAdvance = toNum(data.advanceBhadaDieselAdvance);
      if (data.advanceBhadaCash !== undefined) patch.advanceBhadaCash = toNum(data.advanceBhadaCash);
      if (data.finalRate !== undefined) patch.finalRate = toNum(data.finalRate);

      // Guarded stage-advance: only dispatch a shipment still pending (actual_at
      // NULL). Fires BEFORE the partial qty math below, so a stale second submit
      // can't double-return the shortfall.
      const updated = await tx
        .update(schema.dispatches)
        .set(patch)
        .where(and(eq(schema.dispatches.id, dispatchId), isNull(schema.dispatches.actualAt)))
        .returning();
      assertStageOpen({ rowCount: updated.length }, 'Actual Dispatch');

      // Under/over-dispatch: the shipment's planned qty was drawn from
      // remaining_qty at planning time; a shortfall (planned > actual) goes back.
      const diffQty = plannedQty - actualQtyVal;
      if (Math.abs(diffQty) > 0.0001) {
        if (!isStockTransferOrder) {
          const oldRemaining = toNum(item?.remainingQty) ?? 0;
          const newRemaining = Math.max(0, oldRemaining + diffQty);
          await tx.update(schema.orderItems).set({ remainingQty: newRemaining }).where(eq(schema.orderItems.id, row.orderItemId));
          if (newRemaining > 0) {
            // Shortfall to re-plan: re-open Dispatch Planning (only the closed gate;
            // a still-open partial gate is unaffected).
            await tx
              .update(schema.dispatchPlannings)
              .set({ actualAt: null })
              .where(and(eq(schema.dispatchPlannings.orderItemId, row.orderItemId), isNotNull(schema.dispatchPlannings.plannedAt)));
          }
          Logger.info(`[ACTUAL DISPATCH] Partial for order_item ${row.orderItemId}: planned=${plannedQty} actual=${actualQtyVal} → remaining=${newRemaining}`);
        } else {
          // Stock Transfer: shortfall is dropped (pre-closed), remaining stays as-is.
          Logger.info(`[ACTUAL DISPATCH] Stock Transfer shortfall dropped for order_item ${row.orderItemId}: planned=${plannedQty} actual=${actualQtyVal}`);
        }
      }

      // Queue Security Guard. Non-BANARI depots skip it (auto-closed) and jump
      // straight to Make Invoice — reproducing the reference's trigger behaviour.
      const securityPlannedAt = await getPlannedAt(tx, 'Security Guard Approval');
      const skipSecurity = (row.depotName || '').toUpperCase() !== 'BANARI';
      await tx.insert(schema.securityGuardChecks).values({
        dispatchId,
        plannedAt: securityPlannedAt,
        actualAt: skipSecurity ? new Date() : null,
      });
      if (skipSecurity) {
        const invoicePlannedAt = await getPlannedAt(tx, 'Make Invoice (Proforma)');
        await tx.insert(schema.invoices).values({ dispatchId, plannedMadeAt: invoicePlannedAt });
      }

      Logger.info(`[ACTUAL DISPATCH] Dispatched ${row.dsrNumber} (order ${row.orderNo}), security ${skipSecurity ? 'skipped → Make Invoice queued' : 'pending (BANARI)'}`);
      return {
        success: true,
        message: 'Actual dispatch submitted successfully',
        data: { dispatchId, dsrNumber: row.dsrNumber, orderNo: row.orderNo, actualQty: actualQtyVal, securitySkipped: skipSecurity },
      };
    });
  }

  /**
   * Revert a shipment all the way back to Pre-Approval. Deletes the shipment
   * (and its downstream gate rows) and returns its qty.
   *
   * Sibling-aware: if this order_item has OTHER dispatches (active or already
   * settled elsewhere in the pipeline), reopening the shared order-approval /
   * pre-approval gates for the WHOLE item would re-litigate approval for
   * quantity that has nothing to do with this one shipment. Instead, this
   * shipment's quantity is carved into its own line (origin='split', same
   * budget_root_id family) and only THAT line goes back to Pre-Approval — the
   * original item, its siblings, and its approval history are untouched.
   * Mirrors dispatchPlanningService.revertDispatchPlanning's split-on-revert.
   *
   * Only when no siblings exist does the whole item revert as before. For
   * regular orders in that case, rates are re-derived across the order group.
   *
   * @param {number} dispatchId
   * @param {Object} data - { userId, remarks }
   */
  async revertActualDispatch(dispatchId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [row] = await tx
        .select({
          orderItemId: schema.dispatches.orderItemId,
          dsrNumber: schema.dispatches.dsrNumber,
          qtyToBeDispatched: schema.dispatches.qtyToBeDispatched,
          orderId: schema.orders.id,
          orderNo: schema.orders.orderNo,
          orderType: schema.orders.orderType,
        })
        .from(schema.dispatches)
        .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .where(eq(schema.dispatches.id, dispatchId));
      if (!row) throw new Error('Dispatch record not found');

      const locked = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, row.orderItemId)).for('update');
      const item = locked[0];

      // Any OTHER dispatch (active or settled) on this same order_item?
      const siblings = await tx
        .select({ id: schema.dispatches.id })
        .from(schema.dispatches)
        .where(and(eq(schema.dispatches.orderItemId, row.orderItemId), sql`${schema.dispatches.id} <> ${dispatchId}`));

      // Delete the shipment. rowCount is the concurrency gate: 0 → already reverted.
      await deleteDispatchChildren(tx, dispatchId);
      const del = await tx.delete(schema.dispatches).where(eq(schema.dispatches.id, dispatchId)).returning();
      if (del.length === 0) throw staleWrite();

      const revertedQty = toNum(row.qtyToBeDispatched) ?? 0;

      if (siblings.length > 0) {
        // Shrink the original line by exactly this shipment's qty (family total
        // unchanged, so the qty-guard trigger stays satisfied) and fork a new
        // line for the reverted qty — send only that back to Pre-Approval.
        const newOrderQuantity = (toNum(item.orderQuantity) ?? 0) - revertedQty;
        const newApprovedQty = (toNum(item.approvedQty) ?? 0) - revertedQty;
        await tx
          .update(schema.orderItems)
          .set({ orderQuantity: newOrderQuantity, approvedQty: newApprovedQty })
          .where(eq(schema.orderItems.id, row.orderItemId));

        const [newItem] = await tx
          .insert(schema.orderItems)
          .values({
            orderId: item.orderId,
            skuId: item.skuId,
            uom: item.uom,
            alternateUom: item.alternateUom,
            alternateQtyKg: item.alternateQtyKg,
            oilType: item.oilType,
            orderQuantity: revertedQty,
            rateOfMaterial: item.rateOfMaterial,
            finalRate: item.finalRate,
            ratePer15kg: item.ratePer15kg,
            ratePerLtr: item.ratePerLtr,
            origin: 'split',
            splitFromItemId: row.orderItemId,
            budgetRootId: item.budgetRootId ?? item.id,
          })
          .returning();
        const preAt = await getPlannedAt(tx, 'Pre Approval');
        await tx.insert(schema.preApprovals).values({ orderItemId: newItem.id, plannedAt: preAt });

        Logger.info(`[ACTUAL DISPATCH][REVERT-SPLIT] ${row.dsrNumber}: kept order_item ${row.orderItemId} untouched (siblings exist), moved reverted qty ${revertedQty} -> new order_item ${newItem.id} at Pre-Approval`);
        return {
          success: true,
          split: true,
          message: `This shipment had sibling shipments on the same line; the reverted quantity (${revertedQty}) was moved to a new line at Pre-Approval instead of reopening the original line's approval.`,
          data: { kept: row.orderItemId, moved: newItem.id },
        };
      }

      // No siblings — normal whole-line revert (unchanged from before).
      const restored = (toNum(item.remainingQty) ?? 0) + revertedQty;
      await tx.update(schema.orderItems).set({ remainingQty: restored }).where(eq(schema.orderItems.id, row.orderItemId));

      // Deactivate dispatch-planning + order-approval gates (keep rows for audit),
      // stash the revert remark, and re-open pre-approval.
      await tx
        .update(schema.dispatchPlannings)
        .set({ plannedAt: null, actualAt: null, revertRemarks: data.remarks ?? null, performedByUserId: data.userId ?? null })
        .where(and(eq(schema.dispatchPlannings.orderItemId, row.orderItemId), isNotNull(schema.dispatchPlannings.plannedAt)));
      await tx
        .update(schema.orderApprovals)
        .set({ plannedAt: null, actualAt: null })
        .where(and(eq(schema.orderApprovals.orderItemId, row.orderItemId), isNotNull(schema.orderApprovals.plannedAt)));
      const reopened = await tx
        .update(schema.preApprovals)
        .set({ plannedAt: new Date(), actualAt: null, approvedByUserId: null })
        .where(eq(schema.preApprovals.orderItemId, row.orderItemId))
        .returning();
      if (reopened.length === 0) {
        await tx.insert(schema.preApprovals).values({ orderItemId: row.orderItemId, plannedAt: new Date() });
      }

      if ((row.orderType || '').toLowerCase() === 'regular') {
        await this._rederiveGroupRates(tx, row.orderId, row.orderNo);
      }

      Logger.info(`[ACTUAL DISPATCH][REVERT] ${row.dsrNumber} reverted to Pre-Approval (order ${row.orderNo}, +${revertedQty} qty, remarks: ${data.remarks || 'none'})`);
      return { success: true, message: 'Actual dispatch reverted to Pre-Approval successfully' };
    });
  }

  /**
   * Revert a shipment one stage back to Dispatch Planning (not all the way to
   * Pre-Approval). Deletes the shipment + children and returns its qty.
   *
   * Sibling-aware, same rationale as revertActualDispatch above: if this
   * order_item has OTHER dispatches (active or already settled), reopening the
   * shared dispatch-planning gate for the WHOLE item would let a re-plan touch
   * quantity that has nothing to do with this one shipment. Instead, this
   * shipment's quantity is carved into its own line and only THAT line reopens
   * at Dispatch Planning — the original item and its siblings are untouched.
   *
   * Only when no siblings exist does the whole item's gate reopen as before.
   *
   * @param {number} dispatchId
   * @param {Object} data - { userId, remarks }
   */
  async revertToDispatchPlanning(dispatchId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [row] = await tx
        .select({
          orderItemId: schema.dispatches.orderItemId,
          dsrNumber: schema.dispatches.dsrNumber,
          qtyToBeDispatched: schema.dispatches.qtyToBeDispatched,
        })
        .from(schema.dispatches)
        .where(eq(schema.dispatches.id, dispatchId));
      if (!row) throw new Error('Dispatch record not found');

      const locked = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, row.orderItemId)).for('update');
      const item = locked[0];

      // Any OTHER dispatch (active or settled) on this same order_item?
      const siblings = await tx
        .select({ id: schema.dispatches.id })
        .from(schema.dispatches)
        .where(and(eq(schema.dispatches.orderItemId, row.orderItemId), sql`${schema.dispatches.id} <> ${dispatchId}`));

      await deleteDispatchChildren(tx, dispatchId);
      const del = await tx.delete(schema.dispatches).where(eq(schema.dispatches.id, dispatchId)).returning();
      if (del.length === 0) throw staleWrite();

      const revertedQty = toNum(row.qtyToBeDispatched) ?? 0;

      if (siblings.length > 0) {
        // Shrink the original line by exactly this shipment's qty (family total
        // unchanged, so the qty-guard trigger stays satisfied) and fork a new
        // line for the reverted qty — send only that back to Dispatch Planning.
        const newOrderQuantity = (toNum(item.orderQuantity) ?? 0) - revertedQty;
        const newApprovedQty = (toNum(item.approvedQty) ?? 0) - revertedQty;
        await tx
          .update(schema.orderItems)
          .set({ orderQuantity: newOrderQuantity, approvedQty: newApprovedQty })
          .where(eq(schema.orderItems.id, row.orderItemId));

        const [newItem] = await tx
          .insert(schema.orderItems)
          .values({
            orderId: item.orderId,
            skuId: item.skuId,
            uom: item.uom,
            alternateUom: item.alternateUom,
            alternateQtyKg: item.alternateQtyKg,
            oilType: item.oilType,
            orderQuantity: revertedQty,
            rateOfMaterial: item.rateOfMaterial,
            finalRate: item.finalRate,
            ratePer15kg: item.ratePer15kg,
            ratePerLtr: item.ratePerLtr,
            origin: 'split',
            splitFromItemId: row.orderItemId,
            budgetRootId: item.budgetRootId ?? item.id,
          })
          .returning();
        await tx.insert(schema.dispatchPlannings).values({
          orderItemId: newItem.id,
          plannedAt: new Date(),
          revertRemarks: data.remarks ?? null,
          performedByUserId: data.userId ?? null,
        });

        Logger.info(`[ACTUAL DISPATCH][REVERT→PLANNING-SPLIT] ${row.dsrNumber}: kept order_item ${row.orderItemId} untouched (siblings exist), moved reverted qty ${revertedQty} -> new order_item ${newItem.id} at Dispatch Planning`);
        return {
          success: true,
          split: true,
          message: `This shipment had sibling shipments on the same line; the reverted quantity (${revertedQty}) was moved to a new line at Dispatch Planning instead of reopening the original line.`,
          data: { kept: row.orderItemId, moved: newItem.id },
        };
      }

      // No siblings — normal whole-line revert (unchanged from before).
      const restored = (toNum(item.remainingQty) ?? 0) + revertedQty;
      await tx.update(schema.orderItems).set({ remainingQty: restored }).where(eq(schema.orderItems.id, row.orderItemId));

      // Re-open the dispatch-planning gate (keep planned_at; COALESCE guards a
      // Stock-Transfer item whose gate skipped planning and left planned_at NULL).
      await tx
        .update(schema.dispatchPlannings)
        .set({ actualAt: null, plannedAt: sql`COALESCE(${schema.dispatchPlannings.plannedAt}, now())`, revertRemarks: data.remarks ?? null, performedByUserId: data.userId ?? null })
        .where(eq(schema.dispatchPlannings.orderItemId, row.orderItemId));

      Logger.info(`[ACTUAL DISPATCH][REVERT→PLANNING] ${row.dsrNumber} reverted (order_item ${row.orderItemId}, +${revertedQty} qty, remarks: ${data.remarks || 'none'})`);
      return { success: true, message: 'Actual dispatch reverted to Dispatch Planning successfully' };
    });
  }

  /**
   * Cancel Stock-Transfer shipments left unselected in an Actual Dispatch batch.
   * Stock Transfers ship in one go, so any deselected pending shipment is dropped
   * entirely (shipment + children deleted, remaining_qty zeroed) rather than left
   * pending for a future partial dispatch (which is desired for Sales orders).
   *
   * @param {number[]} dispatchIds
   */
  async cancelUnselectedDispatches(dispatchIds) {
    if (!Array.isArray(dispatchIds) || dispatchIds.length === 0) {
      return { success: true, cancelled: 0 };
    }
    const ids = dispatchIds.map((v) => parseInt(v, 10)).filter((v) => Number.isFinite(v));
    if (ids.length === 0) return { success: true, cancelled: 0 };

    return dbV2.transaction(async (tx) => {
      const rows = await tx
        .select({ dispatchId: schema.dispatches.id, orderItemId: schema.dispatches.orderItemId, dsrNumber: schema.dispatches.dsrNumber })
        .from(schema.dispatches)
        .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .where(and(
          inArray(schema.dispatches.id, ids),
          isNotNull(schema.dispatches.plannedAt),
          isNull(schema.dispatches.actualAt),
          eq(schema.orders.orderCategory, 'Stock Transfer'),
        ));

      for (const r of rows) {
        await deleteDispatchChildren(tx, r.dispatchId);
        await tx.delete(schema.dispatches).where(eq(schema.dispatches.id, r.dispatchId));
        await tx.update(schema.orderItems).set({ remainingQty: 0 }).where(eq(schema.orderItems.id, r.orderItemId));
      }

      Logger.info(`[ACTUAL DISPATCH] Cancelled ${rows.length} unselected Stock Transfer shipment(s)`, { dsrNumbers: rows.map((r) => r.dsrNumber) });
      return { success: true, cancelled: rows.length };
    });
  }

  async getFilterOptions() {
    const rows = await dbV2
      .selectDistinct({ customerName: schema.customers.customerName })
      .from(schema.dispatches)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .where(and(isNotNull(schema.dispatches.plannedAt), isNull(schema.dispatches.actualAt)))
      .orderBy(asc(schema.customers.customerName));
    return {
      success: true,
      data: { customerNames: rows.map((r) => r.customerName).filter(Boolean) },
    };
  }

  // Regular-order rate re-derivation across the whole order group (by oil type),
  // shared by the revert path. Non-fatal on failure. Mirrors dispatchPlanningService.
  async _rederiveGroupRates(tx, orderId, orderNo) {
    try {
      const items = await tx
        .select({ id: schema.orderItems.id, productName: schema.skus.skuName, rateOfMaterial: schema.orderItems.rateOfMaterial })
        .from(schema.orderItems)
        .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
        .where(eq(schema.orderItems.orderId, orderId));
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
        Logger.info(`[ACTUAL DISPATCH][REVERT] Re-derived rates by oil type for order ${orderNo}`);
      }
    } catch (e) {
      Logger.warn(`[ACTUAL DISPATCH][REVERT] rate re-derivation failed for order ${orderNo}: ${e.message}`);
    }
  }
}

module.exports = new ActualDispatchService();
