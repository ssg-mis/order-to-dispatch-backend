/**
 * Commitment Punch Service — v2 schema.
 *
 * A commitment (`commitment_main`) is a bulk pre-sale promise: a customer commits
 * to `quantity` MT of an oil type at a rate. It is RAISED in chunks over time
 * (`commitment_details`); each raise:
 *   1. draws `sku_weight_mt` MT from the commitment balance, and
 *   2. spawns a real order — one `orders` row + one `order_items` row — seeded
 *      straight into the Order Approval gate (commitment orders SKIP Pre-Approval,
 *      mirroring the old planned_2 behaviour), which then flows through the whole
 *      v2 pipeline.
 *
 * v2 clean-ups vs the reference:
 *   - No runtime ensureColumns() ALTER TABLE — the schema is fixed.
 *   - The spawned order is a real orders/order_items pair (not an order_dispatch
 *     row), so commitment_details keeps only raise/balance data + the FK link.
 *   - party/sku/depot/broker/salesperson are ids (FKs), not free text.
 */

const { Logger } = require('../utils');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, ilike, sql, asc, desc } = require('drizzle-orm');
const { getPlannedAt } = require('./stageUtils');

const toNum = (v) => (v === null || v === undefined || v === '') ? null : parseFloat(v);
const FY_CUTOVER = new Date('2026-04-01T00:00:00.000Z');

function getFinancialYearDetails(date) {
  const d = date ? new Date(date) : new Date();
  const isLegacy = d < FY_CUTOVER;
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const fyStart = month >= 3 ? year : year - 1;
  const fy = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
  return { fy, isLegacy };
}

// Per-FY commitment number: COMM/26-27/001 (or legacy COMM-001 pre-cutover).
async function generateCommitmentNo(tx, commitmentDate) {
  const { fy, isLegacy } = getFinancialYearDetails(commitmentDate);
  const prefix = isLegacy ? 'COMM-' : `COMM/${fy}/`;
  const res = await tx.execute(
    sql`SELECT commitment_no FROM commitment_main WHERE commitment_no LIKE ${prefix + '%'} ORDER BY commitment_no DESC LIMIT 1`
  );
  let next = 1;
  if (res.rows.length > 0) {
    const parsed = parseInt(String(res.rows[0].commitment_no).replace(prefix, '').replace(/[A-Z]+$/, ''), 10);
    if (!isNaN(parsed)) next = parsed + 1;
  }
  return `${prefix}${String(next).padStart(3, '0')}`;
}

// Per-FY order number DO/26-27/0084 (or legacy DO-084). Scans MAX(order_no) over
// `orders` — the SAME source Order Punch uses, so commitment + punched orders
// share one sequence and never collide.
async function generateOrderNo(tx, date) {
  const { fy, isLegacy } = getFinancialYearDetails(date);
  const prefix = isLegacy ? 'DO-' : `DO/${fy}/`;
  const padding = isLegacy ? 3 : 4;
  const res = await tx.execute(
    sql`SELECT order_no FROM orders WHERE order_no LIKE ${prefix + '%'} ORDER BY order_no DESC LIMIT 1`
  );
  let next = 1;
  if (res.rows.length > 0) {
    const parsed = parseInt(String(res.rows[0].order_no).replace(prefix, ''), 10);
    if (!isNaN(parsed)) next = parsed + 1;
  }
  return `${prefix}${String(next).padStart(padding, '0')}`;
}

class CommitmentPunchService {
  /**
   * Create one or more commitment_main rows (A/B/C suffixes for multi-line).
   * @param {Object} data - { commitmentDate, customerId, customerContactPersonName,
   *                          whatsappNo, address }
   * @param {Array}  rows - per-line { oilType, quantity, unit, rate } (defaults to [data])
   */
  async createCommitment(data, rows = []) {
    return dbV2.transaction(async (tx) => {
      const baseNo = await generateCommitmentNo(tx, data.commitmentDate);
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const items = rows.length > 0 ? rows : [data];
      const inserted = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const commitmentNo = `${baseNo}${items.length > 1 ? letters[i] : ''}`;
        const [row] = await tx
          .insert(schema.commitmentMain)
          .values({
            commitmentNo,
            commitmentDate: data.commitmentDate ?? null,
            customerId: data.customerId ?? null,
            oilType: item.oilType ?? null,
            quantity: toNum(item.quantity),
            unit: item.unit ?? null,
            rate: toNum(item.rate),
            plannedAt: data.commitmentDate ? new Date(data.commitmentDate) : new Date(),
            customerContactPersonName: data.customerContactPersonName ?? null,
            whatsappNo: data.whatsappNo ?? null,
            address: data.address ?? null,
          })
          .returning();
        inserted.push(row);
      }

      Logger.info(`Created ${inserted.length} commitment row(s). Base: ${baseNo}`);
      return { success: true, message: 'Commitment created successfully', data: { commitment_no: baseNo, commitments: inserted } };
    });
  }

  async getAll(filters = {}, pagination = {}) {
    const page = parseInt(pagination.page) || 1;
    const limit = parseInt(pagination.limit) || 20;

    const conds = [];
    if (filters.customer_name) conds.push(ilike(schema.customers.customerName, `%${filters.customer_name}%`));
    if (filters.search) conds.push(ilike(schema.commitmentMain.commitmentNo, `%${filters.search}%`));
    const where = conds.length ? and(...conds) : undefined;

    const [{ count }] = await dbV2
      .select({ count: sql`count(*)::int` })
      .from(schema.commitmentMain)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.commitmentMain.customerId))
      .where(where);

    const rows = await dbV2
      .select({ commitment: schema.commitmentMain, customer: schema.customers })
      .from(schema.commitmentMain)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.commitmentMain.customerId))
      .where(where)
      .orderBy(desc(schema.commitmentMain.createdAt), asc(schema.commitmentMain.commitmentNo))
      .limit(limit)
      .offset((page - 1) * limit);

    return { success: true, data: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
  }

  /**
   * Pending = commitments that still have MT balance to raise. Balances and the
   * delivered / PO-pending split are computed from commitment_details and the
   * spawned order_items (correlated subqueries, mirroring the reference).
   */
  async getPending(filters = {}, pagination = {}) {
    const page = parseInt(pagination.page) || 1;
    const limit = parseInt(pagination.limit) || 50;
    const offset = (page - 1) * limit;

    const searchClause = filters.search
      ? sql`AND cm.commitment_no ILIKE ${'%' + filters.search + '%'}`
      : sql``;

    const baseWhere = sql`
      cm.planned_at IS NOT NULL
      AND cm.quantity > COALESCE((SELECT SUM(sku_weight_mt) FROM commitment_details WHERE commitment_id = cm.id), 0)
      ${searchClause}
    `;

    const countRes = await dbV2.execute(sql`SELECT COUNT(*)::int AS total FROM commitment_main cm WHERE ${baseWhere}`);
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const dataRes = await dbV2.execute(sql`
      SELECT
        cm.id, cm.commitment_no, cm.commitment_date, cm.oil_type, cm.quantity, cm.unit, cm.rate, cm.planned_at, cm.created_at,
        c.customer_name AS party_name,
        COALESCE((SELECT SUM(cd.sku_weight_mt) FROM commitment_details cd WHERE cd.commitment_id = cm.id), 0) AS processed_qty,
        cm.quantity - COALESCE((SELECT SUM(cd.sku_weight_mt) FROM commitment_details cd WHERE cd.commitment_id = cm.id), 0) AS remaining_qty,
        COALESCE((
          SELECT SUM(CASE WHEN oi.order_quantity > 0
                          THEN ((oi.order_quantity - COALESCE(oi.remaining_qty, 0)) / oi.order_quantity) * cd.sku_weight_mt
                          ELSE 0 END)
          FROM commitment_details cd JOIN order_items oi ON oi.id = cd.order_item_id
          WHERE cd.commitment_id = cm.id
        ), 0) AS delivery_qty,
        COALESCE((
          SELECT SUM(CASE WHEN oi.order_quantity > 0
                          THEN (COALESCE(oi.remaining_qty, 0) / oi.order_quantity) * cd.sku_weight_mt
                          ELSE 0 END)
          FROM commitment_details cd JOIN order_items oi ON oi.id = cd.order_item_id
          WHERE cd.commitment_id = cm.id
        ), 0) AS po_pending_qty
      FROM commitment_main cm
      LEFT JOIN customers c ON c.id = cm.customer_id
      WHERE ${baseWhere}
      ORDER BY cm.created_at DESC, cm.commitment_no ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return { success: true, data: dataRes.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Raise a commitment: draw MT from its balance and spawn a real order that
   * lands pending at Order Approval.
   *
   * @param {number} commitmentId
   * @param {Object} data
   *   - skuId, skuQuantity (boxes), skuRate, poNo, poDate, remarks
   *   - orderType ('regular'|'pre-approval', default regular), orderCategory
   *     ('Sales'|'Stock Transfer', default Sales)
   *   - depotId, brokerId, salespersonId, deliveryPurpose, orderThrough,
   *     paymentTerms, advancePaymentToBeTaken, advanceAmount, typeOfTransporting,
   *     startDate, endDate, deliveryDate, futurePeriodDate, uploadCopy, userId
   */
  async processCommitment(commitmentId, data = {}) {
    return dbV2.transaction(async (tx) => {
      const locked = await tx.select().from(schema.commitmentMain).where(eq(schema.commitmentMain.id, commitmentId)).for('update');
      if (locked.length === 0) throw new Error('Commitment not found');
      const cm = locked[0];

      const skuQty = toNum(data.skuQuantity) ?? 0;
      if (!(skuQty > 0)) throw new Error('SKU quantity must be greater than 0');
      if (data.skuId == null) throw new Error('skuId is required');

      const [sku] = await tx.select({ id: schema.skus.id, skuWeight: schema.skus.skuWeight }).from(schema.skus).where(eq(schema.skus.id, data.skuId));
      if (!sku) throw new Error(`SKU id ${data.skuId} not found in master`);

      // MT = (net weight per box in KG / 1000) * boxes.
      const skuWeightKg = toNum(sku.skuWeight) ?? 0;
      const requestedMt = (skuWeightKg / 1000) * skuQty;

      const [{ processedmt }] = await tx.execute(
        sql`SELECT COALESCE(SUM(sku_weight_mt), 0) AS processedmt FROM commitment_details WHERE commitment_id = ${commitmentId}`
      ).then((r) => r.rows);
      const processedMt = parseFloat(processedmt) || 0;
      const remainingMt = (toNum(cm.quantity) ?? 0) - processedMt;
      if (requestedMt > remainingMt + 0.0001) {
        throw new Error(`Requested SKU weight (${requestedMt.toFixed(4)} MT) exceeds remaining commitment balance (${remainingMt.toFixed(4)} MT)`);
      }

      let delayDays = null;
      if (cm.plannedAt) {
        delayDays = Math.round((Date.now() - new Date(cm.plannedAt).getTime()) / (1000 * 60 * 60 * 24));
      }

      const orderNo = await generateOrderNo(tx, data.poDate || cm.commitmentDate);
      const orderType = String(data.orderType ?? '').toLowerCase() === 'pre-approval' ? 'pre-approval' : 'regular';
      const orderCategory = (data.orderCategory || 'Sales');
      const skuRate = toNum(data.skuRate) ?? toNum(cm.rate);

      // 1) Spawn the order header.
      const [order] = await tx
        .insert(schema.orders)
        .values({
          orderNo,
          customerId: cm.customerId ?? null,
          depotId: data.depotId ?? null,
          brokerId: data.brokerId ?? null,
          salespersonId: data.salespersonId ?? null,
          orderType,
          orderCategory,
          deliveryPurpose: data.deliveryPurpose ?? null,
          orderThrough: data.orderThrough ?? null,
          partySoDate: cm.commitmentDate ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          deliveryDate: data.deliveryDate ?? null,
          futurePeriodDate: data.futurePeriodDate ?? null,
          customerContactPersonName: cm.customerContactPersonName ?? null,
          customerContactPersonWhatsappNo: cm.whatsappNo ?? null,
          customerAddress: cm.address ?? null,
          paymentTerms: data.paymentTerms ?? null,
          advancePaymentToBeTaken: data.advancePaymentToBeTaken ?? false,
          advanceAmount: toNum(data.advanceAmount),
          typeOfTransporting: data.typeOfTransporting ?? null,
          uploadCopy: data.uploadCopy ?? null,
          orderPunchRemarks: data.remarks ?? null,
          orderPunchUserId: data.userId ?? null,
        })
        .returning();

      // 2) Spawn the single line item. Commitment orders skip Pre-Approval, so
      // remaining_qty is knowable immediately (like a regular order).
      const [orderItem] = await tx
        .insert(schema.orderItems)
        .values({
          orderId: order.id,
          skuId: data.skuId,
          uom: cm.unit ?? null,
          oilType: cm.oilType ?? null,
          orderQuantity: skuQty,
          remainingQty: skuQty,
          rateOfMaterial: skuRate,
          finalRate: skuRate,
        })
        .returning();

      // 3) Seed the Order Approval gate (skip Pre-Approval — mirrors old planned_2).
      const plannedAt = await getPlannedAt(tx, 'Approval of Order');
      await tx.insert(schema.orderApprovals).values({ orderItemId: orderItem.id, plannedAt });

      // 4) Record the raise (draws requestedMt from the commitment balance).
      const [detail] = await tx
        .insert(schema.commitmentDetails)
        .values({
          commitmentId,
          orderId: order.id,
          orderItemId: orderItem.id,
          raisedAt: new Date(),
          delayDays,
          poNo: data.poNo ?? null,
          poDate: data.poDate ?? null,
          skuId: data.skuId,
          skuQuantity: skuQty,
          skuRate,
          skuWeightMt: requestedMt,
          remarks: data.remarks ?? null,
        })
        .returning();

      Logger.info(`Commitment ${commitmentId} raised → order ${orderNo} (order_item ${orderItem.id}, ${requestedMt.toFixed(4)} MT), pending Order Approval`);
      return { success: true, message: `Commitment processed successfully. Order No: ${orderNo}`, data: { order_no: orderNo, order, orderItem, detail } };
    });
  }

  /**
   * All raises for a commitment + the parent context.
   */
  async getDetails(commitmentId) {
    const [commitment] = await dbV2
      .select({ commitment: schema.commitmentMain, customer: schema.customers })
      .from(schema.commitmentMain)
      .leftJoin(schema.customers, eq(schema.customers.id, schema.commitmentMain.customerId))
      .where(eq(schema.commitmentMain.id, commitmentId));
    if (!commitment) throw new Error('Commitment not found');

    const details = await dbV2
      .select({ detail: schema.commitmentDetails, order: schema.orders, orderItem: schema.orderItems, sku: schema.skus })
      .from(schema.commitmentDetails)
      .leftJoin(schema.orders, eq(schema.orders.id, schema.commitmentDetails.orderId))
      .leftJoin(schema.orderItems, eq(schema.orderItems.id, schema.commitmentDetails.orderItemId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.commitmentDetails.skuId))
      .where(eq(schema.commitmentDetails.commitmentId, commitmentId))
      .orderBy(asc(schema.commitmentDetails.id));

    const totalProcessed = details.reduce((sum, r) => sum + (parseFloat(r.detail.skuWeightMt) || 0), 0);

    return {
      success: true,
      message: 'Commitment details fetched',
      data: { commitment, details, total_processed_mt: totalProcessed, raise_count: details.length },
    };
  }
}

module.exports = new CommitmentPunchService();
