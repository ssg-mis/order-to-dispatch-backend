/**
 * Check Invoice Service (Gate 6b: Check Invoice) — v2 schema.
 *
 * Per SHIPMENT, keyed off the Check-Invoice sub-gate on the `invoices` row
 * (seeded when Make Invoice completes). Shares the row with Make Invoice.
 *   - Pending : invoices.planned_checked_at IS NOT NULL AND checked_at IS NULL
 *               AND (invoices.made_at IS NOT NULL OR invoices.status = 'Issue')
 *   - History : invoices.planned_checked_at IS NOT NULL AND checked_at IS NOT NULL
 *
 * Verdict:
 *   - status !== 'Issue' (verify) → stamp checked_at, then queue Gate Out. As at
 *     Security, a non-BANARI depot auto-skips Gate Out (its row is born
 *     already-closed) and the Material Receipt gate is seeded straight away;
 *     BANARI shipments get Gate Out pending.
 *   - status === 'Issue' → revert the document to Make Invoice (null made_at,
 *     leave checked_at null, flag status='Issue' + remarks). Make Invoice's
 *     re-submit clears the flag and re-stamps made_at.
 *
 * `:id` on the mutating route is an invoices row id.
 */

const { Logger } = require('../utils');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, or, isNull, isNotNull, sql, asc, desc, inArray } = require('drizzle-orm');
const { getPlannedAt } = require('./stageUtils');

class CheckInvoiceService {
  async getPendingInvoices(filters = {}, pagination = {}) {
    return this._listCheckInvoice({ ...filters, ...pagination, open: true });
  }

  async getCheckHistory(filters = {}, pagination = {}) {
    return this._listCheckInvoice({ ...filters, ...pagination, open: false });
  }

  async _listCheckInvoice({ open, page = 1, limit = 25, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no, d_sr_number }) {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 25;

    const conditions = [isNotNull(schema.invoices.plannedCheckedAt)];
    if (open) {
      conditions.push(isNull(schema.invoices.checkedAt));
      // Still awaiting Make Invoice re-issue OR flagged as an Issue.
      conditions.push(or(isNotNull(schema.invoices.madeAt), eq(schema.invoices.status, 'Issue')));
    } else {
      conditions.push(isNotNull(schema.invoices.checkedAt));
    }
    if (d_sr_number) conditions.push(eq(schema.dispatches.dsrNumber, d_sr_number));
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

    const baseJoin = (q) => q
      .from(schema.invoices)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.invoices.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId));

    const [{ count }] = await baseJoin(dbV2.select({ count: sql`count(*)::int` })).where(where);

    const rows = await baseJoin(
      dbV2.select({
        invoice: schema.invoices,
        dispatch: schema.dispatches,
        orderItem: schema.orderItems,
        order: schema.orders,
        customer: schema.customers,
        depot: schema.depots,
        sku: schema.skus,
        vehicle: schema.vehicles,
        driver: schema.drivers,
        transporter: schema.transporters,
      })
    )
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.dispatches.vehicleId))
      .leftJoin(schema.drivers, eq(schema.drivers.id, schema.dispatches.driverId))
      .leftJoin(schema.transporters, eq(schema.transporters.id, schema.dispatches.transporterId))
      .where(where)
      .orderBy(open ? asc(schema.orders.orderNo) : desc(schema.invoices.checkedAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      success: true,
      data: { invoices: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } },
    };
  }

  /**
   * Submit a check-invoice verdict for one shipment.
   *
   * @param {number} invoiceId
   * @param {Object} data - { status?: 'Issue'|other, remarks?, userId }
   */
  async submitCheck(invoiceId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [inv] = await tx
        .select({
          id: schema.invoices.id,
          dispatchId: schema.invoices.dispatchId,
          madeAt: schema.invoices.madeAt,
          checkedAt: schema.invoices.checkedAt,
          depotName: schema.depots.depotName,
        })
        .from(schema.invoices)
        .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.invoices.dispatchId))
        .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
        .where(eq(schema.invoices.id, invoiceId));
      if (!inv) throw new Error('Invoice record not found');

      const isIssue = data.status === 'Issue';

      if (isIssue) {
        // Revert the document to Make Invoice: null made_at (reappears in Make
        // Invoice pending), keep checked_at null, flag the issue + remarks.
        const reverted = await tx
          .update(schema.invoices)
          .set({ madeAt: null, status: 'Issue', checkRemarks: data.remarks ?? null, checkedByUserId: data.userId ?? null })
          .where(and(eq(schema.invoices.id, invoiceId), isNull(schema.invoices.checkedAt)))
          .returning();
        assertStageOpen({ rowCount: reverted.length }, 'Check Invoice');

        Logger.info(`[CHECK INVOICE] Issue raised on invoice ${invoiceId} → returned to Make Invoice (remarks: ${data.remarks || 'none'})`);
        return { success: true, message: 'Invoice issue reported; returned to Make Invoice', data: { invoiceId, dispatchId: inv.dispatchId, status: 'Issue' } };
      }

      // Verify. Guard: the document must have been (re-)made first — otherwise a
      // stale verify could stamp checked_at while made_at stays null (a record
      // that looks done here yet still sits in Make Invoice pending).
      if (!inv.madeAt) {
        throw new Error('This invoice has not been (re-)issued from Make Invoice yet and cannot be verified. It may still be awaiting correction after a reported issue.');
      }

      const verified = await tx
        .update(schema.invoices)
        .set({ checkedAt: new Date(), status: data.status ?? null, checkRemarks: data.remarks ?? null, checkedByUserId: data.userId ?? null })
        .where(and(eq(schema.invoices.id, invoiceId), isNull(schema.invoices.checkedAt)))
        .returning();
      assertStageOpen({ rowCount: verified.length }, 'Check Invoice');

      // Queue Gate Out. Non-BANARI depots skip it (auto-closed) and jump straight
      // to Material Receipt — same skip pattern as Security at Actual Dispatch.
      const gateOutPlannedAt = await getPlannedAt(tx, 'Gate Out');
      const skipGateOut = (inv.depotName || '').toUpperCase() !== 'BANARI';
      await tx.insert(schema.gateOuts).values({
        dispatchId: inv.dispatchId,
        plannedAt: gateOutPlannedAt,
        actualAt: skipGateOut ? new Date() : null,
        performedByUserId: skipGateOut ? (data.userId ?? null) : null,
      });
      if (skipGateOut) {
        const receiptPlannedAt = await getPlannedAt(tx, 'Confirm Material Receipt');
        await tx.insert(schema.materialReceipts).values({ dispatchId: inv.dispatchId, plannedAt: receiptPlannedAt });
      }

      Logger.info(`[CHECK INVOICE] Invoice ${invoiceId} verified (dispatch ${inv.dispatchId}), gate out ${skipGateOut ? 'skipped → Material Receipt queued' : 'pending (BANARI)'}`);
      return { success: true, message: 'Check invoice submitted successfully', data: { invoiceId, dispatchId: inv.dispatchId, gateOutSkipped: skipGateOut } };
    });
  }
}

module.exports = new CheckInvoiceService();
