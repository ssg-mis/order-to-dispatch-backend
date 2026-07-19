/**
 * Make Invoice Service (Gate 6a: Make Invoice) — v2 schema.
 *
 * Per SHIPMENT, keyed off the Make-Invoice sub-gate on the `invoices` row
 * (seeded on Security APPROVE, or on the non-BANARI Security skip at Actual
 * Dispatch). Make Invoice + Check Invoice are two sub-gates on ONE invoices row.
 *   - Pending : invoices.planned_made_at IS NOT NULL AND made_at IS NULL
 *   - History : invoices.planned_made_at IS NOT NULL AND made_at IS NOT NULL
 *
 * Submitting records the invoice (bill type / no / date / copy / qty / amount),
 * stamps made_at, and seeds the Check-Invoice sub-gate (planned_checked_at). A CD
 * (cash discount) amount is stored on the shipment and permanently subtracted
 * from the order item's rate columns — mirrors the reference.
 *
 * `:id` on the mutating/detail route is an invoices row id.
 */

const { Logger } = require('../utils');
const { assertStageOpen } = require('../utils/staleWriteGuard');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, isNull, isNotNull, sql, asc, desc, inArray } = require('drizzle-orm');
const { alias } = require('drizzle-orm/pg-core');
const { getPlannedAt } = require('./stageUtils');

const toNum = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);

class MakeInvoiceService {
  async getPendingInvoices(filters = {}, pagination = {}) {
    return this._listMakeInvoice({ ...filters, ...pagination, open: true });
  }

  async getInvoiceHistory(filters = {}, pagination = {}) {
    return this._listMakeInvoice({ ...filters, ...pagination, open: false });
  }

  async _listMakeInvoice({ open, page = 1, limit = 25, order_no, customer_name, start_date, end_date, depo_names, manual_sauda_no, d_sr_number }) {
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 25;

    const conditions = [
      isNotNull(schema.invoices.plannedMadeAt),
      open ? isNull(schema.invoices.madeAt) : isNotNull(schema.invoices.madeAt),
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
      .from(schema.invoices)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.invoices.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId));

    const [{ count }] = await baseJoin(dbV2.select({ count: sql`count(*)::int` })).where(where);

    const makeInvoiceUser = alias(schema.users, 'make_invoice_doer');

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
        makeInvoiceUser: makeInvoiceUser.username,
      })
    )
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.dispatches.vehicleId))
      .leftJoin(schema.drivers, eq(schema.drivers.id, schema.dispatches.driverId))
      .leftJoin(schema.transporters, eq(schema.transporters.id, schema.dispatches.transporterId))
      .leftJoin(makeInvoiceUser, eq(makeInvoiceUser.id, schema.invoices.madeByUserId))
      .where(where)
      .orderBy(open ? asc(schema.orders.orderNo) : desc(schema.invoices.madeAt))
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      success: true,
      data: { invoices: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } },
    };
  }

  /**
   * Record the invoice for one shipment and advance to Check Invoice.
   *
   * @param {number} invoiceId
   * @param {Object} data - { billType, invoiceDate, invoiceNo, invoiceCopy, qty,
   *                          billAmount, cdAmount, userId }
   */
  async submitInvoice(invoiceId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const [inv] = await tx
        .select({ id: schema.invoices.id, dispatchId: schema.invoices.dispatchId, madeAt: schema.invoices.madeAt, orderItemId: schema.dispatches.orderItemId })
        .from(schema.invoices)
        .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.invoices.dispatchId))
        .where(eq(schema.invoices.id, invoiceId));
      if (!inv) throw new Error('Invoice record not found');

      const plannedCheckedAt = await getPlannedAt(tx, 'Check Invoice');
      const cd = toNum(data.cdAmount) ?? 0;

      const updated = await tx
        .update(schema.invoices)
        .set({
          madeAt: new Date(),
          plannedCheckedAt,
          billType: data.billType ?? null,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : null,
          invoiceNo: data.invoiceNo ?? null,
          invoiceCopy: data.invoiceCopy ?? null,
          qty: toNum(data.qty),
          billAmount: toNum(data.billAmount),
          madeByUserId: data.userId ?? null,
          // Clear any prior Check-Invoice "Issue" flag so a re-issued document
          // returns to normal Pending Review (not stuck on "Issue Reported").
          status: null,
          checkRemarks: null,
        })
        .where(and(eq(schema.invoices.id, invoiceId), isNull(schema.invoices.madeAt)))
        .returning();
      assertStageOpen({ rowCount: updated.length }, 'Make Invoice');

      // CD (cash discount): store on the shipment and permanently subtract from
      // the invoiced order item's rate columns (keyed on the exact order_item, so
      // sibling SKU lines are untouched — the v2 equivalent of the reference's
      // (order_no, product_name)→id disambiguation).
      if (cd > 0) {
        await tx.update(schema.dispatches).set({ cdAmount: cd }).where(eq(schema.dispatches.id, inv.dispatchId));
        await tx
          .update(schema.orderItems)
          .set({
            finalRate: sql`CASE WHEN ${schema.orderItems.finalRate} IS NOT NULL THEN ${schema.orderItems.finalRate} - ${cd} ELSE NULL END`,
            rateOfMaterial: sql`CASE WHEN ${schema.orderItems.rateOfMaterial} IS NOT NULL THEN ${schema.orderItems.rateOfMaterial} - ${cd} ELSE NULL END`,
            ratePer15kg: sql`CASE WHEN ${schema.orderItems.ratePer15kg} IS NOT NULL THEN ${schema.orderItems.ratePer15kg} - ${cd} ELSE NULL END`,
            ratePerLtr: sql`CASE WHEN ${schema.orderItems.ratePerLtr} IS NOT NULL THEN ${schema.orderItems.ratePerLtr} - ${cd} ELSE NULL END`,
          })
          .where(eq(schema.orderItems.id, inv.orderItemId));
        Logger.info(`[MAKE INVOICE] CD ${cd} applied to order_item ${inv.orderItemId} (dispatch ${inv.dispatchId})`);
      }

      Logger.info(`[MAKE INVOICE] Invoice ${invoiceId} made (dispatch ${inv.dispatchId}) → Check Invoice queued`);
      return { success: true, message: 'Invoice submitted successfully', data: { invoiceId, dispatchId: inv.dispatchId } };
    });
  }

  async getInvoiceById(invoiceId) {
    const [row] = await dbV2
      .select({
        invoice: schema.invoices,
        dispatch: schema.dispatches,
        orderItem: schema.orderItems,
        order: schema.orders,
        customer: schema.customers,
        depot: schema.depots,
        sku: schema.skus,
      })
      .from(schema.invoices)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.invoices.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .where(eq(schema.invoices.id, invoiceId));
    if (!row) throw new Error('Invoice record not found');
    return { success: true, data: row };
  }
}

module.exports = new MakeInvoiceService();
