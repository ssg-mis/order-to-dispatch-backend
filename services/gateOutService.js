/**
 * Gate Out Service (Gate 7: Gate Out) — v2 schema.
 *
 * Per SHIPMENT, keyed off the `gate_outs` gate (seeded on Check Invoice verify).
 * Only BANARI-depot shipments land here pending; every other depot auto-skips
 * Gate Out at Check Invoice (its row is born already-closed and Material Receipt
 * is seeded straight away).
 *   - Pending : gate_outs.planned_at IS NOT NULL AND actual_at IS NULL
 *   - History : gate_outs.planned_at IS NOT NULL AND actual_at IS NOT NULL
 *
 * Submitting stamps actual_at, records the gate pass / loaded-vehicle image, and
 * seeds the Material Receipt gate (planned_at) — the same seed the non-BANARI
 * Gate Out skip performs at Check Invoice.
 *
 * `:id` on the mutating route is a gate_outs row id.
 */

const { Logger } = require('../utils');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, isNull, isNotNull, sql, asc, desc, inArray } = require('drizzle-orm');
const { getPlannedAt } = require('./stageUtils');

class GateOutService {
  async getPendingGateOut(filters = {}, pagination = {}) {
    return this._listGateOut({ ...filters, ...pagination, open: true });
  }

  async getGateOutHistory(filters = {}, pagination = {}) {
    return this._listGateOut({ ...filters, ...pagination, open: false });
  }

  async _listGateOut({ open, page = 1, limit = 25, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no, d_sr_number }) {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 25;

    const conditions = [
      isNotNull(schema.gateOuts.plannedAt),
      open ? isNull(schema.gateOuts.actualAt) : isNotNull(schema.gateOuts.actualAt),
    ];
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
      .from(schema.gateOuts)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.gateOuts.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId));

    const [{ count }] = await baseJoin(dbV2.select({ count: sql`count(*)::int` })).where(where);

    const rows = await baseJoin(
      dbV2.select({
        gateOut: schema.gateOuts,
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
      .orderBy(open ? asc(schema.gateOuts.plannedAt) : desc(schema.gateOuts.actualAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      success: true,
      data: { orders: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } },
    };
  }

  /**
   * Submit gate out for one shipment and advance to Material Receipt.
   *
   * @param {number} gateOutId
   * @param {Object} data - { gatePassCopy, vehicleLoadedImage, userId }
   */
  async submitGateOut(gateOutId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [gate] = await tx
        .select({ id: schema.gateOuts.id, dispatchId: schema.gateOuts.dispatchId, actualAt: schema.gateOuts.actualAt })
        .from(schema.gateOuts)
        .where(eq(schema.gateOuts.id, gateOutId));
      if (!gate) throw new Error('Gate out record not found');

      const updated = await tx
        .update(schema.gateOuts)
        .set({
          actualAt: new Date(),
          performedByUserId: data.userId ?? null,
          gatePassCopy: data.gatePassCopy ?? data.gate_pass ?? null,
          vehicleLoadedImage: data.vehicleLoadedImage ?? data.vehicle_image ?? null,
        })
        .where(and(eq(schema.gateOuts.id, gateOutId), isNull(schema.gateOuts.actualAt)))
        .returning();
      assertStageOpen({ rowCount: updated.length }, 'Gate Out');

      // Queue Material Receipt.
      const receiptPlannedAt = await getPlannedAt(tx, 'Confirm Material Receipt');
      await tx.insert(schema.materialReceipts).values({ dispatchId: gate.dispatchId, plannedAt: receiptPlannedAt });

      Logger.info(`[GATE OUT] Gate out ${gateOutId} (dispatch ${gate.dispatchId}) → Material Receipt queued`);
      return { success: true, message: 'Gate out submitted successfully', data: { gateOutId, dispatchId: gate.dispatchId } };
    });
  }
}

module.exports = new GateOutService();
