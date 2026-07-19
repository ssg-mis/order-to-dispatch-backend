/**
 * Security Guard Approval Service (Gate 5: Security Guard Approval) — v2 schema.
 *
 * Per SHIPMENT, keyed off the `security_guard_checks` gate (seeded when a
 * shipment is actual-dispatched). Only BANARI-depot shipments land here pending;
 * every other depot auto-skips Security at Actual Dispatch (its check row is born
 * already-closed and the invoice gate is seeded straight away).
 *   - Pending : security_guard_checks.planned_at IS NOT NULL AND actual_at IS NULL
 *   - History : security_guard_checks.planned_at IS NOT NULL AND actual_at IS NOT NULL
 *
 * A check is an ATTEMPT (one dispatch can accrue several — reject, redo, re-check):
 *   - APPROVE stamps actual_at + verdict, records the bilty, and seeds the
 *     `invoices` gate (planned_made_at) so the shipment lands pending at Make
 *     Invoice. This is the SAME seed the non-BANARI skip path performs in Actual
 *     Dispatch — faithful to the reference's set_planned_5_from_actual_4 trigger.
 *   - REJECT closes this attempt as rejected (verdict + remarks) AND re-opens the
 *     shipment's Actual Dispatch (dispatches.actual_at → null) so it can be redone.
 *     The redo mints a FRESH check attempt (Actual Dispatch inserts a new row),
 *     so the rejected attempt stays in History for audit and never collides.
 *
 * `:id` on the mutating route is a security_guard_checks (attempt) id — the row
 * the pending list represents.
 */

const { Logger } = require('../utils');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, isNull, isNotNull, sql, asc, desc, inArray } = require('drizzle-orm');
const { getPlannedAt } = require('./stageUtils');

function staleWrite() {
  const err = new Error('This shipment is no longer awaiting Security Guard Approval — it was already processed or moved by another user. Please refresh and try again.');
  err.statusCode = 409;
  err.code = 'STALE_WRITE';
  return err;
}

// Elapsed time from the planned security stamp to now, as a Postgres interval
// literal (was delay_4 — computed but never persisted in the old schema; the v2
// column is real, so we fill it).
function computeDelay(plannedAt) {
  if (!plannedAt) return null;
  const ms = Date.now() - new Date(plannedAt).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `${hours} hours`;
}

class SecurityGuardApprovalService {
  async getPendingApprovals(filters = {}, pagination = {}) {
    return this._listSecurity({ ...filters, ...pagination, open: true });
  }

  async getApprovalHistory(filters = {}, pagination = {}) {
    return this._listSecurity({ ...filters, ...pagination, open: false });
  }

  async _listSecurity({ open, page = 1, limit = 25, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no }) {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 25;

    const conditions = [
      isNotNull(schema.securityGuardChecks.plannedAt),
      open ? isNull(schema.securityGuardChecks.actualAt) : isNotNull(schema.securityGuardChecks.actualAt),
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

    const baseJoin = (q) => q
      .from(schema.securityGuardChecks)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.securityGuardChecks.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId));

    const [{ count }] = await baseJoin(dbV2.select({ count: sql`count(*)::int` })).where(where);

    const rows = await baseJoin(
      dbV2.select({
        securityCheck: schema.securityGuardChecks,
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
      .orderBy(open ? asc(schema.orders.orderNo) : desc(schema.securityGuardChecks.actualAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      success: true,
      data: rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    };
  }

  /**
   * Submit a security guard verdict for one check attempt.
   *
   * @param {number} securityCheckId  security_guard_checks id
   * @param {Object} data
   *   - verdictStatus: 'APPROVE' | 'REJECT'
   *   - userId
   *   - APPROVE: biltyNo, biltyImage, vehicleImageAttachment
   *   - REJECT:  remarks (→ revert_remarks)
   */
  async submitApproval(securityCheckId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [chk] = await tx
        .select({
          id: schema.securityGuardChecks.id,
          dispatchId: schema.securityGuardChecks.dispatchId,
          plannedAt: schema.securityGuardChecks.plannedAt,
          actualAt: schema.securityGuardChecks.actualAt,
        })
        .from(schema.securityGuardChecks)
        .where(eq(schema.securityGuardChecks.id, securityCheckId));
      if (!chk) throw new Error('Security guard record not found');

      const verdict = String(data.verdictStatus ?? data.verdict_status ?? 'APPROVE').toUpperCase();
      const now = new Date();
      const delay = computeDelay(chk.plannedAt);

      if (verdict === 'REJECT') {
        const rejected = await tx
          .update(schema.securityGuardChecks)
          .set({
            actualAt: now,
            delay,
            verdictStatus: 'REJECT',
            performedByUserId: data.userId ?? null,
            revertRemarks: data.remarks ?? null,
          })
          .where(and(eq(schema.securityGuardChecks.id, securityCheckId), isNull(schema.securityGuardChecks.actualAt)))
          .returning();
        assertStageOpen({ rowCount: rejected.length }, 'Security Guard Approval');

        // Kick the shipment back to redo Actual Dispatch. The redo mints a fresh
        // security check attempt; this rejected one remains in History.
        await tx.update(schema.dispatches).set({ actualAt: null }).where(eq(schema.dispatches.id, chk.dispatchId));

        Logger.info(`[SECURITY] REJECT check ${securityCheckId} (dispatch ${chk.dispatchId}) → reopened Actual Dispatch (remarks: ${data.remarks || 'none'})`);
        return { success: true, message: 'Security guard approval rejected; shipment returned to Actual Dispatch', data: { securityCheckId, dispatchId: chk.dispatchId, verdict: 'REJECT' } };
      }

      const approved = await tx
        .update(schema.securityGuardChecks)
        .set({
          actualAt: now,
          delay,
          verdictStatus: 'APPROVE',
          performedByUserId: data.userId ?? null,
          biltyNo: data.biltyNo ?? null,
          biltyImage: data.biltyImage ?? null,
          vehicleImageAttachment: data.vehicleImageAttachment ?? null,
        })
        .where(and(eq(schema.securityGuardChecks.id, securityCheckId), isNull(schema.securityGuardChecks.actualAt)))
        .returning();
      assertStageOpen({ rowCount: approved.length }, 'Security Guard Approval');

      // Seed the Make Invoice gate for this shipment.
      const invoicePlannedAt = await getPlannedAt(tx, 'Make Invoice (Proforma)');
      await tx.insert(schema.invoices).values({ dispatchId: chk.dispatchId, plannedMadeAt: invoicePlannedAt });

      Logger.info(`[SECURITY] APPROVE check ${securityCheckId} (dispatch ${chk.dispatchId}) → Make Invoice queued`);
      return { success: true, message: 'Security guard approval submitted successfully', data: { securityCheckId, dispatchId: chk.dispatchId, verdict: 'APPROVE' } };
    });
  }

  /** Fetch one security check attempt (joined to its shipment/order context). */
  async getApprovalById(securityCheckId) {
    const [row] = await dbV2
      .select({
        securityCheck: schema.securityGuardChecks,
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
      .from(schema.securityGuardChecks)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.securityGuardChecks.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.dispatches.vehicleId))
      .leftJoin(schema.drivers, eq(schema.drivers.id, schema.dispatches.driverId))
      .leftJoin(schema.transporters, eq(schema.transporters.id, schema.dispatches.transporterId))
      .where(eq(schema.securityGuardChecks.id, securityCheckId));
    if (!row) throw new Error('Security guard record not found');
    return { success: true, data: row };
  }

  /** Dynamic filter options (customers + depots) over the pending security list. */
  async getFilterOptions() {
    const where = and(isNotNull(schema.securityGuardChecks.plannedAt), isNull(schema.securityGuardChecks.actualAt));
    const rows = await dbV2
      .selectDistinct({ customerName: schema.customers.customerName, depotName: schema.depots.depotName })
      .from(schema.securityGuardChecks)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.securityGuardChecks.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .where(where);
    return {
      success: true,
      data: {
        customerNames: [...new Set(rows.map((r) => r.customerName).filter(Boolean))].sort(),
        depots: [...new Set(rows.map((r) => r.depotName).filter(Boolean))].sort(),
      },
    };
  }
}

module.exports = new SecurityGuardApprovalService();
