/**
 * Damage Adjustment Service (Gate 9: Damage Adjustment — final gate) — v2 schema.
 *
 * Per SHIPMENT, keyed off the `damage_adjustments` gate (seeded on Confirm
 * Material Receipt only when the receipt was flagged damaged).
 *   - Pending : damage_adjustments.planned_at IS NOT NULL AND actual_at IS NULL
 *   - History : damage_adjustments.planned_at IS NOT NULL AND actual_at IS NOT NULL
 *
 * Submitting stamps actual_at and records the final status + credit-note details.
 * This is the last gate — nothing is seeded downstream.
 *
 * `:id` on the mutating route is a damage_adjustments row id.
 */

const { Logger } = require('../utils');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, isNull, isNotNull, sql, asc, desc, inArray } = require('drizzle-orm');

const toNum = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);

class DamageAdjustmentService {
  async getPendingAdjustments(filters = {}, pagination = {}) {
    return this._listAdjustments({ ...filters, ...pagination, open: true });
  }

  async getAdjustmentHistory(filters = {}, pagination = {}) {
    return this._listAdjustments({ ...filters, ...pagination, open: false });
  }

  async _listAdjustments({ open, page = 1, limit = 25, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no, d_sr_number }) {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 25;

    const conditions = [
      isNotNull(schema.damageAdjustments.plannedAt),
      open ? isNull(schema.damageAdjustments.actualAt) : isNotNull(schema.damageAdjustments.actualAt),
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
      .from(schema.damageAdjustments)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.damageAdjustments.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId));

    const [{ count }] = await baseJoin(dbV2.select({ count: sql`count(*)::int` })).where(where);

    const rows = await baseJoin(
      dbV2.select({
        damageAdjustment: schema.damageAdjustments,
        materialReceipt: schema.materialReceipts,
        dispatch: schema.dispatches,
        orderItem: schema.orderItems,
        order: schema.orders,
        customer: schema.customers,
        depot: schema.depots,
        sku: schema.skus,
      })
    )
      .leftJoin(schema.materialReceipts, eq(schema.materialReceipts.dispatchId, schema.dispatches.id))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .where(where)
      .orderBy(open ? asc(schema.damageAdjustments.plannedAt) : desc(schema.damageAdjustments.actualAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      success: true,
      data: { orders: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } },
    };
  }

  /**
   * Submit the final damage adjustment for one shipment.
   *
   * @param {number} damageAdjustmentId
   * @param {Object} data - { status, creditNoteDate, creditNoteNo, creditNoteCopy,
   *                          creditNoteQty, creditNoteAmount, netBalance, userId }
   */
  async submitAdjustment(damageAdjustmentId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [adj] = await tx
        .select({ id: schema.damageAdjustments.id, dispatchId: schema.damageAdjustments.dispatchId, actualAt: schema.damageAdjustments.actualAt })
        .from(schema.damageAdjustments)
        .where(eq(schema.damageAdjustments.id, damageAdjustmentId));
      if (!adj) throw new Error('Damage adjustment record not found');

      const updated = await tx
        .update(schema.damageAdjustments)
        .set({
          actualAt: new Date(),
          performedByUserId: data.userId ?? null,
          status: data.status ?? null,
          creditNoteDate: data.creditNoteDate ?? null,
          creditNoteNo: data.creditNoteNo ?? null,
          creditNoteCopy: data.creditNoteCopy ?? null,
          creditNoteQty: toNum(data.creditNoteQty),
          creditNoteAmount: toNum(data.creditNoteAmount),
          netBalance: toNum(data.netBalance),
        })
        .where(and(eq(schema.damageAdjustments.id, damageAdjustmentId), isNull(schema.damageAdjustments.actualAt)))
        .returning();
      assertStageOpen({ rowCount: updated.length }, 'Damage Adjustment');

      Logger.info(`[DAMAGE ADJUSTMENT] Adjustment ${damageAdjustmentId} (dispatch ${adj.dispatchId}) completed — pipeline finished`);
      return { success: true, message: 'Damage adjustment submitted successfully', data: { damageAdjustmentId, dispatchId: adj.dispatchId } };
    });
  }
}

module.exports = new DamageAdjustmentService();
