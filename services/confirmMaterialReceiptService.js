/**
 * Confirm Material Receipt Service (Gate 8: Confirm Material Receipt) — v2 schema.
 *
 * Per SHIPMENT, keyed off the `material_receipts` gate (seeded on Gate Out submit
 * / the non-BANARI Gate Out skip at Check Invoice).
 *   - Pending : material_receipts.planned_at IS NOT NULL AND actual_at IS NULL
 *   - History : material_receipts.planned_at IS NOT NULL AND actual_at IS NOT NULL
 *
 * Submitting stamps actual_at and records the received date / proof / damage
 * fields. Two side effects mirror the reference:
 *   - A billing correction (bill amount) is written to invoices.billAmount for
 *     the shipment (the old table duplicated bill_amount here; v2 keeps it on the
 *     invoice — see material_receipts.ts schema note).
 *   - When damage_status indicates damage, the final Damage Adjustment gate
 *     (gate 9) is seeded; otherwise the pipeline ends here for this shipment.
 *
 * `:id` on the mutating route is a material_receipts row id.
 */

const { Logger } = require('../utils');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, isNull, isNotNull, sql, asc, desc, inArray } = require('drizzle-orm');
const { getPlannedAt } = require('./stageUtils');

const toNum = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);

class ConfirmMaterialReceiptService {
  async getPendingReceipts(filters = {}, pagination = {}) {
    return this._listReceipts({ ...filters, ...pagination, open: true });
  }

  async getReceiptHistory(filters = {}, pagination = {}) {
    return this._listReceipts({ ...filters, ...pagination, open: false });
  }

  async _listReceipts({ open, page = 1, limit = 25, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no, d_sr_number }) {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 25;

    const conditions = [
      isNotNull(schema.materialReceipts.plannedAt),
      open ? isNull(schema.materialReceipts.actualAt) : isNotNull(schema.materialReceipts.actualAt),
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
      .from(schema.materialReceipts)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.materialReceipts.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId));

    const [{ count }] = await baseJoin(dbV2.select({ count: sql`count(*)::int` })).where(where);

    const rows = await baseJoin(
      dbV2.select({
        materialReceipt: schema.materialReceipts,
        dispatch: schema.dispatches,
        orderItem: schema.orderItems,
        order: schema.orders,
        customer: schema.customers,
        depot: schema.depots,
        sku: schema.skus,
      })
    )
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .where(where)
      .orderBy(open ? asc(schema.materialReceipts.plannedAt) : desc(schema.materialReceipts.actualAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      success: true,
      data: { orders: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } },
    };
  }

  /**
   * Confirm material receipt for one shipment.
   *
   * @param {number} materialReceiptId
   * @param {Object} data - { materialReceivedDate, receivedImageProof, damageStatus,
   *                          damageQty, damageImage, remarks, billAmount, userId }
   */
  async submitReceipt(materialReceiptId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [receipt] = await tx
        .select({ id: schema.materialReceipts.id, dispatchId: schema.materialReceipts.dispatchId, actualAt: schema.materialReceipts.actualAt })
        .from(schema.materialReceipts)
        .where(eq(schema.materialReceipts.id, materialReceiptId));
      if (!receipt) throw new Error('Material receipt record not found');

      const isDamaged = String(data.damageStatus ?? '').toLowerCase().trim() === 'damaged';

      const updated = await tx
        .update(schema.materialReceipts)
        .set({
          actualAt: new Date(),
          performedByUserId: data.userId ?? null,
          materialReceivedDate: data.materialReceivedDate ?? null,
          receivedImageProof: data.receivedImageProof ?? null,
          damageStatus: data.damageStatus ?? null,
          damageQty: toNum(data.damageQty),
          damageImage: data.damageImage ?? null,
          remarks: data.remarks ?? null,
        })
        .where(and(eq(schema.materialReceipts.id, materialReceiptId), isNull(schema.materialReceipts.actualAt)))
        .returning();
      assertStageOpen({ rowCount: updated.length }, 'Confirm Material Receipt');

      // Billing correction for damaged goods lives on the invoice in v2 (the old
      // table duplicated bill_amount on the receipt row).
      if (data.billAmount !== undefined && data.billAmount !== null && data.billAmount !== '') {
        await tx.update(schema.invoices).set({ billAmount: toNum(data.billAmount) }).where(eq(schema.invoices.dispatchId, receipt.dispatchId));
      }

      // Damage → seed the final Damage Adjustment gate; otherwise the shipment is done.
      if (isDamaged) {
        const damagePlannedAt = await getPlannedAt(tx, 'Damage Adjustment');
        await tx.insert(schema.damageAdjustments).values({ dispatchId: receipt.dispatchId, plannedAt: damagePlannedAt });
      }

      Logger.info(`[MATERIAL RECEIPT] Receipt ${materialReceiptId} (dispatch ${receipt.dispatchId}) confirmed${isDamaged ? ' → Damage Adjustment queued' : ' (pipeline complete)'}`);
      return { success: true, message: 'Material receipt submitted successfully', data: { materialReceiptId, dispatchId: receipt.dispatchId, damaged: isDamaged } };
    });
  }
}

module.exports = new ConfirmMaterialReceiptService();
