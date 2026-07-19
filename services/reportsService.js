/**
 * Reports Service
 * Aggregates data for the comprehensive reports page
 */

const { Logger } = require('../utils');
const { dbV2, schema } = require('../config/db-v2.ts');
const { eq, and, ilike, gte, lte, desc, asc, isNull, isNotNull, sql, inArray } = require('drizzle-orm');

// First argument that parses to a non-zero number, else 0 - mirrors the
// reference's `a || b || c || 0` chains (falsy-skips 0/NaN/null alike).
const firstNum = (...vals) => {
  for (const v of vals) {
    const n = parseFloat(v);
    if (n) return n;
  }
  return 0;
};

class ReportsService {
  /**
   * Get comprehensive report data with filters — v2 schema.
   *
   * One row per order_item (the old report was one row per order_dispatch
   * line). Stage data comes from the real gate tables now. NOTE the old code
   * read `actual_4`/`actual_10` etc. off order_dispatch, columns that DON'T
   * EXIST there (it only has planned/actual_1..3) — so the old dashboard
   * always showed Dispatched=0 / Completed=0 / Pending=everything and 3-stage
   * timelines. This port implements the INTENDED semantics from the v2 gates
   * (same precedent as the road_tax/round-off fixes):
   *   - Dispatched: item has ≥1 shipment actually dispatched.
   *   - Completed:  item has shipments and every one has cleared Gate Out.
   *   - Timeline:   all 10 real v2 stages; per-shipment stages roll up to the
   *     item as planned=earliest planned, actual=latest actual once EVERY
   *     shipment has cleared that stage (else still pending).
   * The old `orders` key (every raw order_dispatch row, unconsumed by the
   * frontend — verified) is dropped.
   */
  async getReport(filters = {}) {
    try {
      const conditions = [];
      if (filters.order_no) conditions.push(ilike(schema.orders.orderNo, `${filters.order_no}%`));
      if (filters.customer_name) conditions.push(ilike(schema.customers.customerName, `%${filters.customer_name}%`));
      if (filters.oil_type) conditions.push(ilike(schema.orderItems.oilType, `%${filters.oil_type}%`));
      if (filters.sku_name) conditions.push(ilike(schema.skus.skuName, `%${filters.sku_name}%`));
      if (filters.from_date) conditions.push(gte(schema.orderItems.createdAt, new Date(filters.from_date)));
      if (filters.to_date) conditions.push(lte(schema.orderItems.createdAt, new Date(filters.to_date + ' 23:59:59')));

      // Helper: derive oil type from SKU name when DB column is null
      const deriveOilType = (oilType, skuName) => {
        if (oilType && oilType.trim() && oilType.trim().toLowerCase() !== 'unknown') return oilType.trim();
        const s = (skuName || '').toUpperCase();
        if (s.includes(' SBO') || s.startsWith('SBO')) return 'Soya Oil';
        if (s.includes(' RBO') || s.startsWith('RBO')) return 'Rice Bran Oil';
        if (s.includes('PALM OIL') || s.includes(' PALM') || s.startsWith('PALM')) return 'Palm Oil';
        if (s.includes('SOYA')) return 'Soya Oil';
        if (s.includes('RICE') || s.includes('RBO')) return 'Rice Bran Oil';
        return oilType || null;
      };

      // All matching order items (with order header + masters via FK)
      const all = await dbV2
        .select({
          id: schema.orderItems.id,
          orderNo: schema.orders.orderNo,
          customerName: schema.customers.customerName,
          oilType: schema.orderItems.oilType,
          skuName: schema.skus.skuName,
          orderQuantity: schema.orderItems.orderQuantity,
          alternateQtyKg: schema.orderItems.alternateQtyKg,
          uom: schema.orderItems.uom,
          createdAt: schema.orderItems.createdAt,
          deliveryDate: schema.orders.deliveryDate,
          skuWeight: schema.skus.skuWeight,
          nosPerMainUom: schema.skus.nosPerMainUom,
          mainUom: schema.skus.mainUom,
          alternateUom: schema.skus.alternateUom,
        })
        .from(schema.orderItems)
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
        .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.orderItems.createdAt));

      const itemIds = all.map(i => i.id);

      // ── Per-item gate rows (a revert can leave several rows per item — keep
      //    the latest completed one, else the latest planned/open one) ──
      const rollupByItem = (rows) => {
        const m = new Map();
        for (const r of rows) {
          const prev = m.get(r.orderItemId);
          if (!prev) { m.set(r.orderItemId, r); continue; }
          const better = r.actualAt
            ? (!prev.actualAt || new Date(r.actualAt) > new Date(prev.actualAt))
            : (!prev.actualAt);
          if (better) m.set(r.orderItemId, r);
        }
        return m;
      };
      const itemGate = async (table) => {
        if (!itemIds.length) return new Map();
        const rows = await dbV2
          .select({ orderItemId: table.orderItemId, plannedAt: table.plannedAt, actualAt: table.actualAt })
          .from(table)
          .where(inArray(table.orderItemId, itemIds))
          .orderBy(asc(table.id));
        return rollupByItem(rows);
      };
      const preByItem = await itemGate(schema.preApprovals);
      const oaByItem = await itemGate(schema.orderApprovals);
      const dpByItem = await itemGate(schema.dispatchPlannings);

      // ── Shipments + their per-shipment gates ──
      const dispatches = itemIds.length
        ? await dbV2
            .select({ id: schema.dispatches.id, orderItemId: schema.dispatches.orderItemId, plannedAt: schema.dispatches.plannedAt, actualAt: schema.dispatches.actualAt })
            .from(schema.dispatches)
            .where(inArray(schema.dispatches.orderItemId, itemIds))
        : [];
      const dispatchIds = dispatches.map(d => d.id);
      const itemIdByDispatch = new Map(dispatches.map(d => [d.id, d.orderItemId]));

      const shipmentGate = async (table, plannedCol, actualCol) => {
        if (!dispatchIds.length) return [];
        return dbV2
          .select({ dispatchId: table.dispatchId, plannedAt: plannedCol, actualAt: actualCol })
          .from(table)
          .where(inArray(table.dispatchId, dispatchIds))
          .orderBy(asc(table.id));
      };
      const secRows = await shipmentGate(schema.securityGuardChecks, schema.securityGuardChecks.plannedAt, schema.securityGuardChecks.actualAt);
      const invRows = dispatchIds.length
        ? await dbV2
            .select({
              dispatchId: schema.invoices.dispatchId,
              plannedMadeAt: schema.invoices.plannedMadeAt, madeAt: schema.invoices.madeAt,
              plannedCheckedAt: schema.invoices.plannedCheckedAt, checkedAt: schema.invoices.checkedAt,
            })
            .from(schema.invoices)
            .where(inArray(schema.invoices.dispatchId, dispatchIds))
            .orderBy(asc(schema.invoices.id))
        : [];
      const goRows = await shipmentGate(schema.gateOuts, schema.gateOuts.plannedAt, schema.gateOuts.actualAt);
      const mrRows = await shipmentGate(schema.materialReceipts, schema.materialReceipts.plannedAt, schema.materialReceipts.actualAt);
      const daRows = await shipmentGate(schema.damageAdjustments, schema.damageAdjustments.plannedAt, schema.damageAdjustments.actualAt);

      // Roll a per-shipment gate up to the item: planned = earliest planned,
      // actual = latest actual once EVERY shipment of the item has cleared it
      // (a security recheck counts by its latest attempt per shipment).
      const shipmentsByItem = new Map();
      dispatches.forEach(d => {
        if (!shipmentsByItem.has(d.orderItemId)) shipmentsByItem.set(d.orderItemId, []);
        shipmentsByItem.get(d.orderItemId).push(d);
      });
      const rollupShipmentStage = (rows) => {
        // dispatchId -> best row (prefer completed, latest)
        const byDispatch = new Map();
        for (const r of rows) {
          const prev = byDispatch.get(r.dispatchId);
          if (!prev) { byDispatch.set(r.dispatchId, r); continue; }
          const better = r.actualAt
            ? (!prev.actualAt || new Date(r.actualAt) > new Date(prev.actualAt))
            : (!prev.actualAt);
          if (better) byDispatch.set(r.dispatchId, r);
        }
        // item -> { planned, actual }
        const agg = new Map(); // itemId -> { planned, actual, doneCount, gateCount }
        for (const [dispatchId, r] of byDispatch) {
          const itemId = itemIdByDispatch.get(dispatchId);
          if (itemId == null) continue;
          if (!agg.has(itemId)) agg.set(itemId, { planned: null, actualMax: null, done: 0, total: 0 });
          const a = agg.get(itemId);
          a.total += 1;
          if (r.plannedAt && (!a.planned || new Date(r.plannedAt) < new Date(a.planned))) a.planned = r.plannedAt;
          if (r.actualAt) { a.done += 1; if (!a.actualMax || new Date(r.actualAt) > new Date(a.actualMax)) a.actualMax = r.actualAt; }
        }
        const m = new Map();
        for (const [itemId, a] of agg) {
          const shipments = (shipmentsByItem.get(itemId) || []).length;
          // complete only when every shipment has this gate cleared
          const actual = (shipments > 0 && a.done === shipments) ? a.actualMax : null;
          m.set(itemId, { plannedAt: a.planned, actualAt: actual });
        }
        return m;
      };
      // Actual Dispatch itself rolls up the same way, straight off dispatches
      const adByItem = rollupShipmentStage(dispatches.map(d => ({ dispatchId: d.id, plannedAt: d.plannedAt, actualAt: d.actualAt })));
      const secByItem = rollupShipmentStage(secRows);
      const makeByItem = rollupShipmentStage(invRows.map(r => ({ dispatchId: r.dispatchId, plannedAt: r.plannedMadeAt, actualAt: r.madeAt })));
      const checkByItem = rollupShipmentStage(invRows.map(r => ({ dispatchId: r.dispatchId, plannedAt: r.plannedCheckedAt, actualAt: r.checkedAt })));
      const goByItem = rollupShipmentStage(goRows);
      const mrByItem = rollupShipmentStage(mrRows);
      const daByItem = rollupShipmentStage(daRows);

      // Any-shipment-dispatched (the "Dispatched" KPI: Actual Dispatch happened
      // at least once for the item, even if more shipments are still planned)
      const anyDispatched = new Set();
      dispatches.forEach(d => { if (d.actualAt) anyDispatched.add(d.orderItemId); });

      // ── Per-order timeline report ──
      const stageMap = [
        { label: 'Pre Approval', map: preByItem },
        { label: 'Approval of Order', map: oaByItem },
        { label: 'Dispatch Planning', map: dpByItem },
        { label: 'Actual Dispatch', map: adByItem },
        { label: 'Security Approval', map: secByItem },
        { label: 'Make Invoice', map: makeByItem },
        { label: 'Check Invoice', map: checkByItem },
        { label: 'Gate Out', map: goByItem },
        { label: 'Material Receipt', map: mrByItem },
        { label: 'Damage Adjustment', map: daByItem },
      ];

      const orderTimeline = all.map(o => {
        const stages = stageMap.map(s => {
          const g = s.map.get(o.id);
          const planned = g?.plannedAt ? new Date(g.plannedAt) : null;
          const actual = g?.actualAt ? new Date(g.actualAt) : null;
          let delayDays = null;
          let delayHours = null;
          if (planned && actual) {
            const diffMs = actual - planned;
            delayDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            delayHours = Math.round(diffMs / (1000 * 60 * 60));
          }
          return {
            stage: s.label,
            planned: planned ? g.plannedAt : null,
            actual: actual ? g.actualAt : null,
            delayDays,
            delayHours,
            onTime: planned && actual ? actual <= planned : null
          };
        }).filter(s => s.planned || s.actual); // only show stages with data

        const derivedOilType = deriveOilType(o.oilType, o.skuName);
        const skuWeight = parseFloat(o.skuWeight) || 0;
        const rawQty = parseFloat(o.orderQuantity) || 0;
        const order_quantity_kg = skuWeight > 0 ? rawQty * skuWeight : rawQty;

        return {
          id: o.id,
          order_no: o.orderNo,
          customer_name: o.customerName,
          oil_type: derivedOilType,
          sku_name: o.skuName,
          order_quantity: rawQty,
          order_quantity_kg,
          sku_weight: skuWeight,
          alternate_qty_kg: o.alternateQtyKg,
          uom: o.uom,
          created_at: o.createdAt,
          delivery_date: o.deliveryDate,
          stages
        };
      });

      // ── Summary KPIs (off the real gates) ──
      const qtyOf = (o) => parseFloat(o.orderQuantity) || 0;
      const isCompleted = (o) => goByItem.get(o.id)?.actualAt != null;
      const totalReceived = all.length;
      const totalReceivedKg = all.reduce((sum, o) => sum + qtyOf(o), 0);
      const dispatched = all.filter(o => anyDispatched.has(o.id));
      const totalDispatchedCount = dispatched.length;
      const totalDispatchedKg = dispatched.reduce((sum, o) => sum + qtyOf(o), 0);
      const pending = all.filter(o => !isCompleted(o));
      const totalPendingCount = pending.length;
      const totalPendingKg = pending.reduce((sum, o) => sum + qtyOf(o), 0);
      const completed = all.filter(o => isCompleted(o));
      const totalCompletedCount = completed.length;
      const totalCompletedKg = completed.reduce((sum, o) => sum + qtyOf(o), 0);
      const totalRemainingKg = totalReceivedKg - totalDispatchedKg;

      // ── Top Selling SKUs by oil type ──
      const skuMap = new Map();
      all.forEach(o => {
        const rawOil = deriveOilType(o.oilType, o.skuName);
        const key = `${rawOil || 'Unknown'}__${o.skuName || 'Unknown'}`;
        if (!skuMap.has(key)) {
          skuMap.set(key, {
            oil_type: rawOil || 'Unknown',
            sku: o.skuName || 'Unknown',
            total_kg: 0,
            total_qty: 0,      // box / nos count (from alternate_qty_kg field)
            total_qty_kg: 0,   // qty × sku_weight in KG
            sku_weight: parseFloat(o.skuWeight) || 0,
            nos_per_main_uom: parseFloat(o.nosPerMainUom) || 0,
            main_uom: o.mainUom ?? null,
            alternate_uom: o.alternateUom ?? null,
            count: 0
          });
        }
        const entry = skuMap.get(key);
        const altQty = parseFloat(o.alternateQtyKg) || 0;
        entry.total_kg += qtyOf(o);
        entry.total_qty += altQty;
        entry.total_qty_kg += altQty * entry.sku_weight;
        entry.count += 1;
      });
      const topSkus = Array.from(skuMap.values())
        .sort((a, b) => b.total_kg - a.total_kg)
        .slice(0, 20);

      return {
        summary: {
          totalReceived,
          totalReceivedKg,
          totalPendingCount,
          totalPendingKg,
          totalDispatchedCount,
          totalDispatchedKg,
          totalCompletedCount,
          totalCompletedKg,
          totalRemainingKg: Math.max(0, totalRemainingKg)
        },
        topSkus,
        orderTimeline,
      };
    } catch (error) {
      Logger.error('Error generating report', error);
      throw error;
    }
  }

  /**
   * Get detailed dispatch report (CLAUDE.md's CP Dispatch Report Format), one
   * row per shipment (`dispatches`) - v2 schema. Per-field mapping from the
   * pre-migration `lift_receiving_confirmation`/`order_dispatch` version, and
   * the 2 real per-shipment snapshot gaps it surfaced (dispatch_date, sauda_no
   * - see dispatches.createdAt/manualSaudaNo), are documented in the v2
   * migration project memory, not repeated here as comments.
   */
  async getDispatchReport(filters = {}) {
    const conditions = [];
    if (filters.from_date) conditions.push(gte(schema.dispatches.createdAt, new Date(filters.from_date)));
    if (filters.to_date) conditions.push(lte(schema.dispatches.createdAt, new Date(filters.to_date + ' 23:59:59')));
    if (filters.customer_name) conditions.push(ilike(schema.customers.customerName, `%${filters.customer_name}%`));
    if (filters.dispatch_no) conditions.push(ilike(schema.dispatches.dsrNumber, `%${filters.dispatch_no}%`));
    if (filters.order_no) conditions.push(ilike(schema.orders.orderNo, `%${filters.order_no}%`));
    const where = conditions.length ? and(...conditions) : undefined;

    // Optional row cap (used by the on-screen export preview). Sanitized to a
    // positive integer; ignored for the full export so the download stays complete.
    const limitNum = parseInt(filters.limit, 10);

    let query = dbV2
      .select({
        dispatch: schema.dispatches,
        orderItem: schema.orderItems,
        order: schema.orders,
        customer: schema.customers,
        depot: schema.depots,
        broker: schema.brokers,
        salesperson: schema.salespersons,
        sku: schema.skus,
        vehicle: schema.vehicles,
        driver: schema.drivers,
        transporter: schema.transporters,
        invoice: schema.invoices,
        gateOut: schema.gateOuts,
      })
      .from(schema.dispatches)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.depots, eq(schema.depots.id, schema.orders.depotId))
      .leftJoin(schema.brokers, eq(schema.brokers.id, schema.orders.brokerId))
      .leftJoin(schema.salespersons, eq(schema.salespersons.id, schema.orders.salespersonId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.dispatches.vehicleId))
      .leftJoin(schema.drivers, eq(schema.drivers.id, schema.dispatches.driverId))
      .leftJoin(schema.transporters, eq(schema.transporters.id, schema.dispatches.transporterId))
      .leftJoin(schema.invoices, eq(schema.invoices.dispatchId, schema.dispatches.id))
      .leftJoin(schema.gateOuts, eq(schema.gateOuts.dispatchId, schema.dispatches.id))
      .where(where)
      .orderBy(desc(schema.dispatches.createdAt));
    if (Number.isInteger(limitNum) && limitNum > 0) query = query.limit(limitNum);

    const result = await query;

    // ── Pass 1: per-row calculations ─────────────────────────────────────────
    const pass1 = result.map(({ dispatch: d, orderItem: oi, order: o, customer: c, depot: dep, broker: br, salesperson: sp, sku, vehicle: v, driver: dr, transporter: tr, invoice: inv, gateOut: go }, i) => {
      const gstRate = 0.05;
      const saudaRate = firstNum(oi.finalRate, oi.rateOfMaterial);
      const freightRate = firstNum(o.freightRate);
      const netRate = saudaRate + freightRate;                                         // BD
      const rateWoGst = netRate > 0 ? Math.round((netRate / (1 + gstRate)) * 100) / 100 : 0; // BF
      const qty = firstNum(d.actualQty, d.qtyToBeDispatched, oi.alternateQtyKg);
      const itemTaxable = Math.round(qty * rateWoGst * 100) / 100;                    // BH
      const itemCgst = Math.round((gstRate / 2) * itemTaxable * 100) / 100;           // BJ
      const itemAmount = Math.round(qty * netRate * 100) / 100;                       // BG

      const skuWt = firstNum(sku?.skuWeight);                                         // CI (per unit)
      const oilWt = firstNum(sku?.oilFillingPerUnit);                                 // CJ (per unit)
      const skuGrossWtPerUnit = firstNum(sku?.grossWeight);                           // CD (per unit)

      // Weight chain (CA → CC)
      const rstGrossWt = firstNum(d.grossWeight);
      const rstTareWt = firstNum(d.tareWeight);
      const rstNetWt = rstGrossWt - rstTareWt;                                        // CA
      const extraMatWt = firstNum(d.extraWeight);
      const rstWt = rstNetWt - extraMatWt;                                            // CC

      // Per-row quantity totals (CE, CK, CL)
      const totalGrossWt = (skuGrossWtPerUnit && qty) ? Math.round(skuGrossWtPerUnit * qty * 1000) / 1000 : null; // CE
      const totalSkuWt   = (skuWt && qty)           ? Math.round(skuWt * qty * 1000) / 1000 : null;              // CK
      const totalOilWt   = (oilWt && qty)           ? Math.round(oilWt * qty * 1000) / 1000 : null;              // CL

      // U: Total Freight = Freight Rate per MT × RST Net Wt / 1000
      const freightRatePerMt = firstNum(o.freightRate);
      const totalFreight = (freightRatePerMt && rstNetWt) ? Math.round(freightRatePerMt * rstNetWt / 1000 * 100) / 100 : null;

      const advanceCashBank = (firstNum(d.advanceBhadaCash) + firstNum(d.advanceBhadaBank)) || null;

      // Fulfillment: Gate Out on-time (preferred) else Actual Dispatch on-time.
      let fulfillmentStatus = null;
      if (go?.plannedAt && go?.actualAt) {
        fulfillmentStatus = new Date(go.actualAt) <= new Date(go.plannedAt) ? 'On-Time' : 'Late';
      } else if (d.plannedAt && d.actualAt) {
        fulfillmentStatus = new Date(d.actualAt) <= new Date(d.plannedAt) ? 'On-Time' : 'Late';
      }

      return {
        // private fields used in pass 2
        _invoice_no:     inv?.invoiceNo ?? null,
        _item_taxable:   itemTaxable,
        _item_amount:    itemAmount,
        _total_gross_wt: totalGrossWt,
        _total_sku_wt:   totalSkuWt,
        _total_oil_wt:   totalOilWt,
        _rst_net_wt:     rstNetWt,
        _gst_rate:       gstRate,

        sn: i + 1,
        dispatch_date: d.createdAt,
        dispatch_no: d.dsrNumber,
        dispatch_type: o.orderCategory,
        vehicle_no: v?.registrationNo ?? null,
        // taxEndDate supersedes the legacy road_tax snapshot (100% redundant
        // with it in every pre-migration row that had one - see memory).
        road_tax: d.taxEndDate || v?.roadTax || null,
        pollution: d.pollutionEndDate,
        insurance: d.insuranceEndDate,
        fitness: d.fitnessEndDate,
        state_permit: d.permit1EndDate,
        national_permit: d.permit2EndDate,
        godown_id: dep?.depotCode ?? null,
        godown_name: d.dispatchFrom || dep?.depotName || null,
        destination: c?.state ?? null,
        delivery_type: o.deliveryPurpose,
        transport_type: o.typeOfTransporting,
        transporter_id: tr?.transporterCode ?? null,
        transporter_name: tr?.transporterName ?? null,
        transporter_gstin: tr?.gstin ?? null,
        freight_rate_per_mt: freightRatePerMt || null,
        total_freight: totalFreight,                                                  // U
        advance_freight_cash_bank: advanceCashBank,
        advance_freight_diesel: d.advanceBhadaDieselAdvance,
        driver_name: dr?.driverName ?? null,
        driver_mobile: dr?.mobileNo ?? null,
        driving_licence_no: dr?.drivingLicenceNo ?? null,
        licence_expiry: dr?.validUpto ?? null,
        salesman_id: sp?.salespersonCode ?? null,
        salesman_name: sp?.salespersonName ?? null,
        broker_id: br?.brokerCode ?? null,
        broker_name: br?.brokerName ?? null,
        broker_gstin: null,
        customer_id: c?.customerCode ?? null,
        customer_name: c?.customerName ?? null,
        customer_gstin: c?.gstin ?? null,
        place_area: c?.state ?? null,
        customer_address: o.customerAddress,
        sauda_transfer: d.isTransfer ? 'yes' : 'no',
        bill_to: o.billCompanyName,
        bill_to_gstin: null,
        bill_to_address: o.billAddress,
        ship_to: o.shipCompanyName,
        ship_to_gstin: null,
        ship_to_address: o.shipAddress,
        do_no: o.orderNo,
        sauda_no: d.manualSaudaNo,
        sauda_date: o.partySoDate || o.createdAt,
        sku_id: sku?.skuCode ?? null,
        sku_name: sku?.skuName ?? null,
        filling_pcs: sku?.nosPerMainUom ?? null,
        rate_per_pcs: oi.finalRate ?? oi.rateOfMaterial,
        qty_box_tin: qty || null,
        balance_qty: oi.remainingQty,
        sauda_rate: saudaRate || null,                                                // BB
        freight_rate: freightRate || null,
        net_rate: netRate || null,                                                    // BD
        gst_rate: gstRate,
        rate_wo_gst: rateWoGst || null,                                              // BF
        item_amount: itemAmount || null,                                              // BG
        item_taxable_amount: itemTaxable || null,                                    // BH
        item_igst: null,
        item_cgst: itemCgst || null,                                                 // BJ
        item_sgst: itemCgst || null,                                                 // BK
        invoice_date: inv?.invoiceDate ?? null,
        invoice_no: inv?.invoiceNo ?? null,
        // BN, BP, BQ, BR, BS, BT, BU filled in pass 2
        fulfillment_status: fulfillmentStatus,
        sauda_end_date: o.endDate || o.deliveryDate,
        rst_no: d.rstNo,
        rst_gross_wt: rstGrossWt || null,
        rst_tare_wt: rstTareWt || null,
        rst_net_wt: rstNetWt || null,                                                // CA
        extra_mat_wt: extraMatWt || null,
        rst_wt: rstWt || null,                                                       // CC
        sku_gross_wt: skuGrossWtPerUnit || null,                                     // CD (per unit)
        total_gross_wt: totalGrossWt,                                                // CE
        // CF (gross_wt) filled in pass 2
        wt_diff_reason: d.reasonOfWeightDifference,
        sku_wt: skuWt || null,                                                       // CI (per unit)
        oil_wt: oilWt || null,                                                       // CJ (per unit)
        total_sku_wt: totalSkuWt,                                                    // CK
        total_oil_wt: totalOilWt,                                                    // CL
        // CM, CN filled in pass 2
        bhada_type: d.freightRateType,
      };
    });

    // ── Pass 2: SUMIFS aggregations by invoice_no ─────────────────────────────
    const invoiceAgg = new Map();
    pass1.forEach(row => {
      const inv = row._invoice_no;
      if (!inv) return;
      if (!invoiceAgg.has(inv)) {
        invoiceAgg.set(inv, { taxable: 0, item_amount: 0, total_gross_wt: 0, total_sku_wt: 0, total_oil_wt: 0, gst_rate: row._gst_rate });
      }
      const e = invoiceAgg.get(inv);
      e.taxable       += row._item_taxable   || 0;
      e.item_amount   += row._item_amount    || 0;
      e.total_gross_wt += row._total_gross_wt || 0;
      e.total_sku_wt  += row._total_sku_wt   || 0;
      e.total_oil_wt  += row._total_oil_wt   || 0;
    });

    const rows = pass1.map(row => {
      const agg = row._invoice_no ? invoiceAgg.get(row._invoice_no) : null;

      const taxableAmount = agg ? Math.round(agg.taxable * 100) / 100 : (row._item_taxable || null);  // BN
      const gstRate = row._gst_rate;
      const cgst = taxableAmount ? Math.round((gstRate / 2) * taxableAmount * 100) / 100 : null;      // BP
      const sgst = cgst;                                                                                // BQ
      const total = taxableAmount ? Math.round((taxableAmount + (cgst || 0) + (sgst || 0)) * 100) / 100 : null; // BR
      const roundOff = total != null ? Math.round((Math.round(total) - total) * 100) / 100 : null;    // BS
      const invoiceAmount = total != null ? Math.round((total + (roundOff || 0)) * 100) / 100 : null; // BT
      const billAmount = agg ? Math.round(agg.item_amount * 100) / 100 : null;                        // BU

      const grossWt = agg ? Math.round(agg.total_gross_wt * 1000) / 1000 : null;                     // CF
      const billSkuWt = agg ? Math.round(agg.total_sku_wt * 1000) / 1000 : null;                     // CM
      const billOilWt = agg ? Math.round(agg.total_oil_wt * 1000) / 1000 : null;                     // CN
      const wtDiff = (row._rst_net_wt != null && grossWt != null) ? Math.round((row._rst_net_wt - grossWt) * 1000) / 1000 : null; // CG

      const { _invoice_no, _item_taxable, _item_amount, _total_gross_wt, _total_sku_wt, _total_oil_wt, _rst_net_wt, _gst_rate, ...rest } = row;

      return {
        ...rest,
        taxable_amount: taxableAmount,   // BN
        igst: null,
        cgst,                            // BP
        sgst,                            // BQ
        total,                           // BR
        round_off: roundOff,             // BS
        invoice_amount: invoiceAmount,   // BT
        bill_amount: billAmount,         // BU
        gross_wt: grossWt,              // CF
        wt_diff: wtDiff,                // CG
        bill_sku_wt: billSkuWt,         // CM
        bill_oil_wt: billOilWt,         // CN
      };
    });

    return rows;
  }

  /**
   * Shared: every order_item currently PENDING at Dispatch Planning — the v2
   * replacement for the old `SELECT * FROM order_dispatch WHERE planned_3 IS NOT
   * NULL AND actual_3 IS NULL`. One row per pending order_item with its order
   * header, customer / broker and SKU joined. Base-DO grouping (0084A/0084B) is
   * MOOT in v2: `orders` is already one row per real order, so `order_no` IS the
   * base DO. Consumed by all four pending-sauda reports + the oil dispatch voucher.
   * Ordered by (order created_at, order_no) so DOs land in a stable, source-like
   * order within each customer for the reports that preserve insertion order.
   */
  async _fetchPendingSaudaRows({ customer_name, order_no } = {}) {
    const conditions = [
      isNotNull(schema.dispatchPlannings.plannedAt),
      isNull(schema.dispatchPlannings.actualAt),
    ];
    if (customer_name) conditions.push(ilike(schema.customers.customerName, `%${customer_name}%`));
    if (order_no) conditions.push(ilike(schema.orders.orderNo, `${order_no}%`));

    return dbV2
      .select({
        orderId: schema.orders.id,
        orderItemId: schema.orderItems.id,
        itemCreatedAt: schema.orderItems.createdAt,
        orderNo: schema.orders.orderNo,
        partySoDate: schema.orders.partySoDate,
        orderCreatedAt: schema.orders.createdAt,
        orderPunchUserId: schema.orders.orderPunchUserId,
        startDate: schema.orders.startDate,
        endDate: schema.orders.endDate,
        deliveryPurpose: schema.orders.deliveryPurpose,
        manualSaudaNo: schema.orders.manualSaudaNo,
        orderThrough: schema.orders.orderThrough,
        customerName: schema.customers.customerName,
        customerAddress: schema.orders.customerAddress,
        customerWhatsapp: schema.orders.customerContactPersonWhatsappNo,
        customerContact: schema.orders.customerContactPersonName,
        brokerName: schema.brokers.brokerName,
        oilType: schema.orderItems.oilType,
        uom: schema.orderItems.uom,
        orderQuantity: schema.orderItems.orderQuantity,
        approvedQty: schema.orderItems.approvedQty,
        remainingQty: schema.orderItems.remainingQty,
        finalRate: schema.orderItems.finalRate,
        ratePer15kg: schema.orderItems.ratePer15kg,
        rateOfMaterial: schema.orderItems.rateOfMaterial,
        skuName: schema.skus.skuName,
        skuMainUom: schema.skus.mainUom,
        skuWeight: schema.skus.skuWeight,
        skuGrossWeight: schema.skus.grossWeight,
        oilFillingPerUnit: schema.skus.oilFillingPerUnit,
      })
      .from(schema.dispatchPlannings)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatchPlannings.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.brokers, eq(schema.brokers.id, schema.orders.brokerId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .where(and(...conditions))
      // (order created_at, order_no) sets the DO order; source_order_no is the
      // final tiebreak WITHIN an order — it preserves the old suffix-variant
      // `order_no ASC` ordering, which the reports rely on for their
      // "first non-zero rate per oil bucket" pick to match the source report.
      .orderBy(asc(schema.orders.createdAt), asc(schema.orders.orderNo), asc(schema.orderItems.sourceOrderNo));
  }

  /**
   * Shared: already-dispatched quantities for a set of pending order_items,
   * grouped by their order (base DO). v2 replacement for the old per-`so_no`
   * `lift_receiving_confirmation.qty_to_be_dispatched` lookup — shipments now
   * hang off `dispatches.order_item_id`, ordered by the shipment's birth time.
   */
  async _fetchDispatchedByOrder(itemIds = []) {
    const map = new Map();
    if (!itemIds.length) return map;
    const disp = await dbV2
      .select({
        orderId: schema.orders.id,
        qty: schema.dispatches.qtyToBeDispatched,
      })
      .from(schema.dispatches)
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .where(inArray(schema.dispatches.orderItemId, itemIds))
      .orderBy(asc(schema.dispatches.orderItemId), asc(schema.dispatches.createdAt), asc(schema.dispatches.id));
    for (const d of disp) {
      const q = parseFloat(d.qty);
      if (!q) continue;
      if (!map.has(d.orderId)) map.set(d.orderId, []);
      map.get(d.orderId).push(q);
    }
    return map;
  }

  /**
   * CP Pending Sauda Report — v2 schema.
   * Source: order_items stuck in the Dispatch Planning gate (dispatch_plannings
   * planned_at IS NOT NULL AND actual_at IS NULL), one report row per base DO
   * (= one `orders` row; the old suffix-variant regrouping is gone).
   * Per-DO quantities are bucketed into Rice / Soya / Palm columns by oil type,
   * KGS = balance qty × per-DO SKU weight, and the "Dispatched Qty Detail" is the
   * list of already-dispatched quantities (dispatches.qty_to_be_dispatched).
   * Rows are grouped into months by Start Date, with per-month subtotals (units + KGS)
   * and a grand total at the end.
   */
  async getPendingSaudaReport(filters = {}) {
    const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

    const rows = await this._fetchPendingSaudaRows(filters);
    const dispatchedByOrder = await this._fetchDispatchedByOrder(rows.map(r => r.orderItemId));

    const classifyOil = (oilType, skuName) => {
      const s = `${oilType || ''} ${skuName || ''}`.toLowerCase();
      if (s.includes('palm')) return 'palm';
      if (s.includes('soya') || s.includes('sbo')) return 'soya';
      if (s.includes('rice') || s.includes('rbo')) return 'rice';
      return null;
    };
    const balOf = (r) => {
      const v = r.remainingQty != null ? parseFloat(r.remainingQty)
        : (r.approvedQty != null ? parseFloat(r.approvedQty) : parseFloat(r.orderQuantity));
      return Number.isFinite(v) ? v : 0;
    };
    const wtOf = (r) => (parseFloat(r.skuWeight) || parseFloat(r.oilFillingPerUnit) || 0);
    const rateOf = (r) => parseFloat(r.finalRate ?? r.ratePer15kg ?? r.rateOfMaterial) || 0;

    // Group by base DO (= order)
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.orderId)) groups.set(r.orderId, []);
      groups.get(r.orderId).push(r);
    }

    // Build one row per DO
    const doRows = [];
    for (const [orderId, items] of groups) {
      const first = items[0];
      const buckets = { rice: { qty: 0, kg: 0, rate: 0 }, soya: { qty: 0, kg: 0, rate: 0 }, palm: { qty: 0, kg: 0, rate: 0 } };
      let totalBal = 0, totalKg = 0;
      for (const it of items) {
        const bal = balOf(it);
        const w = wtOf(it);
        totalBal += bal;
        totalKg += bal * w;
        const oil = classifyOil(it.oilType, it.skuName);
        if (oil && buckets[oil]) {
          buckets[oil].qty += bal;
          buckets[oil].kg += bal * w;
          if (!buckets[oil].rate) buckets[oil].rate = rateOf(it);
        }
      }
      doRows.push({
        // DO Date is the date entered at Order Punch (party_so_date), NOT the DB
        // insert timestamp. Fall back to created_at only for legacy rows missing it.
        do_date: first.partySoDate || first.orderCreatedAt,
        do_no: first.orderNo,
        sauda_no: first.manualSaudaNo || '',
        customer_name: first.customerName || '',
        broker_name: first.brokerName || '',
        rice: buckets.rice,
        soya: buckets.soya,
        palm: buckets.palm,
        total_bal: totalBal,
        total_kg: totalKg,
        start_date: first.startDate,
        end_date: first.endDate,
        delivery_purpose: first.deliveryPurpose,
        dispatched: dispatchedByOrder.get(orderId) || [],
      });
    }

    // Month is decided by Start Date; but rows WITHIN a month are ordered by DO
    // Date (created_at) ascending — matching the source report.
    const monthSortOf = (r) => {
      if (!r.start_date) return Number.MAX_SAFE_INTEGER;
      const d = new Date(r.start_date);
      return d.getFullYear() * 12 + d.getMonth();
    };
    const doDateOf = (r) => (r.do_date ? new Date(r.do_date).getTime() : Infinity);
    doRows.sort((a, b) => (monthSortOf(a) - monthSortOf(b)) || (doDateOf(a) - doDateOf(b)));

    const months = [];
    const monthIndex = new Map();
    for (const r of doRows) {
      let mkey, mlabel, msort;
      if (r.start_date) {
        const d = new Date(r.start_date);
        mkey = `${d.getFullYear()}-${d.getMonth()}`;
        mlabel = `MONTH OF ${MONTH_NAMES[d.getMonth()]}`;
        msort = d.getFullYear() * 12 + d.getMonth();
      } else { mkey = 'none'; mlabel = 'MONTH OF —'; msort = Number.MAX_SAFE_INTEGER; }
      if (!monthIndex.has(mkey)) {
        const g = { label: mlabel, sort: msort, rows: [] };
        monthIndex.set(mkey, g);
        months.push(g);
      }
      monthIndex.get(mkey).rows.push(r);
    }
    months.sort((a, b) => a.sort - b.sort);

    // Subtotals per month + grand total
    const blankAgg = () => ({ rice: 0, soya: 0, palm: 0, total: 0, riceKg: 0, soyaKg: 0, palmKg: 0, totalKg: 0 });
    const grand = blankAgg();
    months.forEach(m => {
      const agg = blankAgg();
      m.rows.forEach(r => {
        agg.rice += r.rice.qty;  agg.riceKg += r.rice.kg;
        agg.soya += r.soya.qty;  agg.soyaKg += r.soya.kg;
        agg.palm += r.palm.qty;  agg.palmKg += r.palm.kg;
        agg.total += r.total_bal; agg.totalKg += r.total_kg;
      });
      m.subtotal = agg;
      grand.rice += agg.rice; grand.riceKg += agg.riceKg;
      grand.soya += agg.soya; grand.soyaKg += agg.soyaKg;
      grand.palm += agg.palm; grand.palmKg += agg.palmKg;
      grand.total += agg.total; grand.totalKg += agg.totalKg;
      delete m.sort;
    });

    return { months, grandTotal: grand, count: doRows.length };
  }

  /**
   * Customer-Wise CP Pending Sauda Report (Summary)
   * Same pending scope as getPendingSaudaReport (DOs stuck in Dispatch Planning),
   * but grouped Customer -> Sauda (base DO) -> Oil type, with Original Qty,
   * Pending Qty and the per-15KG-tin rate. Returns per-customer sections plus
   * per-customer totals; the frontend aggregates the chosen customers for the
   * final summary block.
   */
  async getPendingSaudaCustomerReport(filters = {}) {
    const rows = await this._fetchPendingSaudaRows({ customer_name: filters.customer_name });

    const classifyOil = (oilType, skuName) => {
      const s = `${oilType || ''} ${skuName || ''}`.toLowerCase();
      if (s.includes('palm')) return 'palm';
      if (s.includes('soya') || s.includes('sbo')) return 'soya';
      if (s.includes('rice') || s.includes('rbo')) return 'rice';
      return null;
    };
    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const origOf = (r) => (r.orderQuantity != null ? num(r.orderQuantity) : num(r.approvedQty));
    const pendOf = (r) => (r.remainingQty != null ? num(r.remainingQty) : origOf(r));
    const rateOf = (r) => num(r.ratePer15kg) || num(r.finalRate) || num(r.rateOfMaterial);
    const OIL_LABEL = { rice: 'Rice Oil', soya: 'Soya Oil', palm: 'Palm Oil' };
    const OIL_ORDER = ['rice', 'soya', 'palm'];

    // customer -> sauda(base DO = order) -> oil bucket
    const customers = new Map();
    for (const r of rows) {
      const cName = r.customerName || '—';
      if (!customers.has(cName)) customers.set(cName, { customer_name: cName, saudas: new Map() });
      const cust = customers.get(cName);
      const saudaKey = r.orderId;
      if (!cust.saudas.has(saudaKey)) {
        cust.saudas.set(saudaKey, {
          sauda_no: r.orderNo,
          sauda_date: r.orderCreatedAt,
          oils: { rice: { original: 0, pending: 0, rate: 0 }, soya: { original: 0, pending: 0, rate: 0 }, palm: { original: 0, pending: 0, rate: 0 } },
        });
      }
      const sauda = cust.saudas.get(saudaKey);
      const oil = classifyOil(r.oilType, r.skuName);
      if (oil && sauda.oils[oil]) {
        sauda.oils[oil].original += origOf(r);
        sauda.oils[oil].pending += pendOf(r);
        if (!sauda.oils[oil].rate) sauda.oils[oil].rate = rateOf(r);
      }
    }

    // shape output
    const customerList = [];
    for (const cust of customers.values()) {
      const saudas = [];
      const totals = { rice: { original: 0, pending: 0 }, soya: { original: 0, pending: 0 }, palm: { original: 0, pending: 0 }, grand: { original: 0, pending: 0 } };
      for (const s of cust.saudas.values()) {
        const oils = [];
        let totalOriginal = 0, totalPending = 0;
        OIL_ORDER.forEach(k => {
          const b = s.oils[k];
          if (b.original || b.pending) {
            oils.push({ oil_type: OIL_LABEL[k], original_qty: b.original, pending_qty: b.pending, rate: b.rate });
            totalOriginal += b.original; totalPending += b.pending;
            totals[k].original += b.original; totals[k].pending += b.pending;
          }
        });
        totals.grand.original += totalOriginal;
        totals.grand.pending += totalPending;
        saudas.push({ sauda_no: s.sauda_no, sauda_date: s.sauda_date, oils, total_original: totalOriginal, total_pending: totalPending });
      }
      customerList.push({ customer_name: cust.customer_name, sauda_count: saudas.length, saudas, totals });
    }

    customerList.sort((a, b) => a.customer_name.localeCompare(b.customer_name));
    return { customers: customerList, count: customerList.length };
  }

  /**
   * Customer-Wise CP Pending Sauda Report (Detailed)
   * For each pending DO (Dispatch Planning stage), shows item-level billing detail.
   * Item rows = the full dispatch breakdown (every SKU line for the DO). Billed Qty
   * columns come ONLY from invoiced records (the CPOIL bills in Check Invoice history) —
   * one column per invoice — so un-billed lines appear with blank Billed. Per oil shows
   * Sauda Qty (ordered) and Bal Qty (= Sauda − Billed); plus oil totals, a grand total,
   * and a per-invoice footer (Doc Date, Doc No., Packing Wt, RST Wt, Diff). By customer.
   */
  async getPendingSaudaDetailedReport(filters = {}) {
    const rows = await this._fetchPendingSaudaRows({ customer_name: filters.customer_name });

    // Shipment/billing lines for the pending items. Each shipment (dispatches
    // row) is a billing record once invoiced (invoices.invoice_no set at Make
    // Invoice); SKU identity/weights come through order_item -> sku. Same
    // pending-only scope as the old `so_no = ANY(pending order_nos)` lookup.
    const itemIds = rows.map(r => r.orderItemId);
    let shipRows = [];
    if (itemIds.length) {
      shipRows = await dbV2
        .select({
          orderId: schema.orders.id,
          productName: schema.skus.skuName,
          skuMainUom: schema.skus.mainUom,
          skuWeight: schema.skus.skuWeight,
          skuGrossWeight: schema.skus.grossWeight,
          oilFillingPerUnit: schema.skus.oilFillingPerUnit,
          actualQtyDispatch: schema.dispatches.actualQtyDispatch,
          qtyToBeDispatched: schema.dispatches.qtyToBeDispatched,
          actualQty: schema.dispatches.actualQty,
          grossWeight: schema.dispatches.grossWeight,
          tareWeight: schema.dispatches.tareWeight,
          extraWeight: schema.dispatches.extraWeight,
          createdAt: schema.dispatches.createdAt,
          invoiceNo: schema.invoices.invoiceNo,
          invoiceDate: schema.invoices.invoiceDate,
          invoiceQty: schema.invoices.qty,
        })
        .from(schema.dispatches)
        .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
        .leftJoin(schema.invoices, eq(schema.invoices.dispatchId, schema.dispatches.id))
        .where(inArray(schema.dispatches.orderItemId, itemIds))
        // ASC already puts NULLs last in Postgres — matches the old
        // `invoice_date ASC NULLS LAST, timestamp ASC NULLS LAST, id ASC`.
        .orderBy(asc(schema.invoices.invoiceDate), asc(schema.dispatches.createdAt), asc(schema.dispatches.id));
    }
    const shipByOrder = new Map(); // orderId -> [ shipment rows ]
    for (const s of shipRows) {
      if (!shipByOrder.has(s.orderId)) shipByOrder.set(s.orderId, []);
      shipByOrder.get(s.orderId).push(s);
    }

    const classifyOil = (oilType, skuName) => {
      const s = `${oilType || ''} ${skuName || ''}`.toLowerCase();
      if (s.includes('palm')) return 'palm';
      if (s.includes('soya') || s.includes('sbo')) return 'soya';
      if (s.includes('rice') || s.includes('rbo')) return 'rice';
      return null;
    };
    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    // name -> sku info, built from the joined sku columns (same master rows the
    // old code loaded wholesale from sku_details).
    const skuInfoByName = new Map();
    const noteSku = (name, mainUom, wt, gross, fill) => {
      const key = (name || '').toUpperCase().trim();
      if (key && !skuInfoByName.has(key)) skuInfoByName.set(key, { main_uom: mainUom, weight: num(wt) || num(gross) || num(fill) });
    };
    rows.forEach(r => noteSku(r.skuName, r.skuMainUom, r.skuWeight, r.skuGrossWeight, r.oilFillingPerUnit));
    shipRows.forEach(s => noteSku(s.productName, s.skuMainUom, s.skuWeight, s.skuGrossWeight, s.oilFillingPerUnit));
    const skuWeightOf = (name) => skuInfoByName.get((name || '').toUpperCase().trim())?.weight || 0;
    const uomOf = (name, fallback) => skuInfoByName.get((name || '').toUpperCase().trim())?.main_uom || fallback || '';
    const OIL_LABEL = { rice: 'Rice Oil', soya: 'Soya Oil', palm: 'Palm Oil' };
    const OIL_ORDER = ['rice', 'soya', 'palm'];

    // Group pending items by base DO (= order)
    const doGroups = new Map();
    for (const r of rows) {
      if (!doGroups.has(r.orderId)) doGroups.set(r.orderId, []);
      doGroups.get(r.orderId).push(r);
    }

    const customers = new Map(); // name -> { customer_name, dos: [] }

    for (const [orderId, items] of doGroups) {
      const first = items[0];
      const cName = first.customerName || '—';

      // Per-oil ordered aggregates + rate/uom per ordered product
      const oilAgg = {}; // oil -> { sauda, bal, orderedSkus:Set, rateByProduct:Map, uomByProduct:Map }
      OIL_ORDER.forEach(k => { oilAgg[k] = { sauda: 0, bal: 0, orderedSkus: new Set(), rateByProduct: new Map(), uomByProduct: new Map() }; });
      for (const o of items) {
        const oil = classifyOil(o.oilType, o.skuName);
        if (!oil || !oilAgg[oil]) continue;
        const name = o.skuName || '';
        oilAgg[oil].sauda += num(o.orderQuantity != null ? o.orderQuantity : o.approvedQty);
        oilAgg[oil].bal += (o.remainingQty != null ? num(o.remainingQty) : num(o.orderQuantity));
        if (name) {
          oilAgg[oil].orderedSkus.add(name);
          const rate = num(o.rateOfMaterial) || num(o.finalRate) || num(o.ratePer15kg);
          if (!oilAgg[oil].rateByProduct.has(name.toUpperCase())) oilAgg[oil].rateByProduct.set(name.toUpperCase(), rate);
          oilAgg[oil].uomByProduct.set(name.toUpperCase(), o.uom || '');
        }
      }

      // Billed quantities come ONLY from invoiced records (the CPOIL bills you see in
      // Check Invoice history) — qty + invoice_no set at Make Invoice. The item rows,
      // however, are the full dispatch breakdown (every SKU line for the DO) so an
      // un-billed line still appears with a blank Billed column.
      const ships = shipByOrder.get(orderId) || [];
      const docOrder = [];
      const docMeta = new Map();                                                // invoice_no -> meta
      const billed = { rice: new Map(), soya: new Map(), palm: new Map() };     // oil -> product -> { display, byInv }
      const breakdown = { rice: new Map(), soya: new Map(), palm: new Map() };  // oil -> product -> display (every dispatch line)

      for (const r of ships) {
        const oil = classifyOil(null, r.productName);
        const pname = (r.productName || '').toUpperCase();
        // Every dispatch line is part of the breakdown (the item rows)
        if (oil && breakdown[oil] && pname && !breakdown[oil].has(pname)) breakdown[oil].set(pname, r.productName || '');

        // Billed: invoiced rows only
        const hasInvoice = r.invoiceNo && String(r.invoiceNo).trim();
        if (!hasInvoice) continue;
        const inv = r.invoiceNo;
        if (!docMeta.has(inv)) {
          docMeta.set(inv, { doc_no: inv, doc_date: r.invoiceDate || r.createdAt, packing: 0, gross: 0, tare: 0, extra: 0 });
          docOrder.push(inv);
        }
        const meta = docMeta.get(inv);
        // Per-line billed COUNT (tins/boxes). actual_qty_dispatch / qty_to_be_dispatched
        // hold the per-line count; invoices.qty / actual_qty hold the whole-invoice total.
        const count = num(r.actualQtyDispatch) || num(r.qtyToBeDispatched) || num(r.invoiceQty) || num(r.actualQty);
        meta.packing += count * skuWeightOf(r.productName);
        // Weighbridge values repeat on every line of an invoice — take once, don't sum.
        meta.gross = Math.max(meta.gross, num(r.grossWeight));
        meta.tare = Math.max(meta.tare, num(r.tareWeight));
        meta.extra = Math.max(meta.extra, num(r.extraWeight));
        if (oil && billed[oil]) {
          if (!billed[oil].has(pname)) billed[oil].set(pname, { display: r.productName || '', byInv: new Map() });
          const e = billed[oil].get(pname);
          e.byInv.set(inv, (e.byInv.get(inv) || 0) + count);
        }
      }

      const docs = docOrder.map(inv => {
        const m = docMeta.get(inv);
        const rst = m.gross - m.tare - m.extra;
        const packing = Math.round(m.packing * 1000) / 1000;
        const rstR = Math.round(rst * 1000) / 1000;
        return { doc_no: m.doc_no, doc_date: m.doc_date, packing_wt: packing, rst_wt: rstR, diff: Math.round((rstR - packing) * 1000) / 1000 };
      });

      // Build oils with item rows
      const grand = { sauda: 0, bal: 0, billed: docOrder.map(() => 0) };
      const oils = [];
      OIL_ORDER.forEach(k => {
        const agg = oilAgg[k];
        const billedMap = billed[k];
        const breakdownMap = breakdown[k];
        if (breakdownMap.size === 0 && billedMap.size === 0 && agg.sauda === 0) return; // nothing for this oil

        // Item rows = full dispatch breakdown; fall back to billed products, then ordered SKUs
        let itemNames;
        if (breakdownMap.size) itemNames = [...breakdownMap.values()];
        else if (billedMap.size) itemNames = [...billedMap.values()].map(v => v.display);
        else itemNames = [...agg.orderedSkus];
        itemNames.sort((a, b) => {
          const ao = agg.orderedSkus.has(a) ? 0 : 1;
          const bo = agg.orderedSkus.has(b) ? 0 : 1;
          return ao - bo || a.localeCompare(b);
        });

        const items2 = itemNames.map(name => {
          const up = name.toUpperCase();
          const be = billedMap.get(up);
          const billedArr = docOrder.map(inv => (be ? (be.byInv.get(inv) || 0) : 0));
          return {
            item_name: name,
            uom: uomOf(name, agg.uomByProduct.get(up)),
            rate: agg.rateByProduct.get(up) || 0,
            billed: billedArr,
          };
        });

        const billedTotal = docOrder.map((inv, di) => items2.reduce((s, it) => s + (it.billed[di] || 0), 0));
        // Balance = remaining-to-dispatch (system-maintained in the order's base unit;
        // billed counts span mixed packings, so they can't be subtracted directly).
        const balQty = agg.bal;
        billedTotal.forEach((v, di) => { grand.billed[di] += v; });
        grand.sauda += agg.sauda;
        grand.bal += balQty;

        oils.push({
          oil: k,
          label: OIL_LABEL[k],
          sauda_qty: agg.sauda,
          bal_qty: balQty,
          items: items2,
          billed_total: billedTotal,
        });
      });

      if (!oils.length) continue;

      if (!customers.has(cName)) customers.set(cName, { customer_name: cName, dos: [] });
      customers.get(cName).dos.push({
        // DO Date is the date entered at Order Punch (party_so_date), not the DB insert timestamp.
        do_date: first.partySoDate || first.orderCreatedAt,
        do_no: first.orderNo,
        do_valid_upto: first.endDate,
        broker_name: first.brokerName || '',
        oils,
        docs,
        grand,
      });
    }

    const customerList = [...customers.values()].sort((a, b) => a.customer_name.localeCompare(b.customer_name));
    customerList.forEach(c => { c.sauda_count = c.dos.length; });
    return { customers: customerList, count: customerList.length };
  }

  /**
   * Oil Dispatch Voucher (Reports)
   * One voucher per pending DO (Dispatch Planning stage). Mirrors the dispatch-slip:
   * products grouped by oil with Net Wt = sku_weight × qty and Gross Wt = gross_weight × qty,
   * a per-DO header (Customer / Broker / Address / Mob / Status) and a Punch / Pre-Approve /
   * Approve footer. Returns one entry per base DO; the frontend picker chooses which to print.
   */
  async getOilDispatchVoucher(filters = {}) {
    const rows = await this._fetchPendingSaudaRows({ order_no: filters.order_no });
    const itemIds = rows.map(r => r.orderItemId);

    // Per-item gate info (was order_dispatch's actual_1/actual_2 + audit-user
    // columns): pre_approvals + order_approvals rows for the pending items. A
    // revert can leave several pre_approvals rows per item — keep the latest
    // completed one, mirroring the single value the old columns held.
    const preByItem = new Map();   // orderItemId -> { actualAt, userId }
    const oaByItem = new Map();
    if (itemIds.length) {
      const pres = await dbV2
        .select({
          orderItemId: schema.preApprovals.orderItemId,
          actualAt: schema.preApprovals.actualAt,
          userId: schema.preApprovals.approvedByUserId,
        })
        .from(schema.preApprovals)
        .where(inArray(schema.preApprovals.orderItemId, itemIds))
        .orderBy(asc(schema.preApprovals.id));
      for (const g of pres) {
        const prev = preByItem.get(g.orderItemId);
        if (!prev || (g.actualAt && (!prev.actualAt || new Date(g.actualAt) > new Date(prev.actualAt)))) preByItem.set(g.orderItemId, g);
      }
      const oas = await dbV2
        .select({
          orderItemId: schema.orderApprovals.orderItemId,
          actualAt: schema.orderApprovals.actualAt,
          userId: schema.orderApprovals.approvedByUserId,
        })
        .from(schema.orderApprovals)
        .where(inArray(schema.orderApprovals.orderItemId, itemIds))
        .orderBy(asc(schema.orderApprovals.id));
      for (const g of oas) {
        const prev = oaByItem.get(g.orderItemId);
        if (!prev || (g.actualAt && (!prev.actualAt || new Date(g.actualAt) > new Date(prev.actualAt)))) oaByItem.set(g.orderItemId, g);
      }
    }

    // One batched username lookup (replaces resolveAuditUsers on the old rows)
    const userIds = new Set();
    rows.forEach(r => { if (r.orderPunchUserId) userIds.add(r.orderPunchUserId); });
    preByItem.forEach(g => { if (g.userId) userIds.add(g.userId); });
    oaByItem.forEach(g => { if (g.userId) userIds.add(g.userId); });
    const nameById = new Map();
    if (userIds.size) {
      const users = await dbV2
        .select({ id: schema.users.id, username: schema.users.username })
        .from(schema.users)
        .where(inArray(schema.users.id, [...userIds]));
      users.forEach(u => nameById.set(u.id, u.username));
    }

    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const classifyOil = (oilType, skuName) => {
      const s = `${oilType || ''} ${skuName || ''}`.toLowerCase();
      if (s.includes('palm')) return 'palm';
      if (s.includes('soya') || s.includes('sbo')) return 'soya';
      if (s.includes('rice') || s.includes('rbo')) return 'rice';
      return 'other';
    };

    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.orderId)) groups.set(r.orderId, []);
      groups.get(r.orderId).push(r);
    }

    const vouchers = [];
    for (const [, items] of groups) {
      // Old query ordered rows created_at DESC before grouping, so the group's
      // header/footer fields came from the newest line — mirror that here.
      items.sort((a, b) => new Date(b.itemCreatedAt || 0) - new Date(a.itemCreatedAt || 0));
      const first = items[0];
      const isBroker = (first.orderThrough || '').toLowerCase() === 'broker';
      const products = items.map(o => {
        const name = o.skuName || '—';
        const qty = num(o.orderQuantity != null ? o.orderQuantity : o.approvedQty);
        const net = num(o.skuWeight);
        const gross = num(o.skuGrossWeight) || net;
        return {
          product_name: name,
          uom: o.uom || '',
          qty,
          oil: classifyOil(o.oilType, name),
          net_wt: Math.round(qty * net * 1000) / 1000,
          gross_wt: Math.round(qty * gross * 1000) / 1000,
        };
      });

      const pre = preByItem.get(first.orderItemId);
      const oa = oaByItem.get(first.orderItemId);
      vouchers.push({
        do_no: first.orderNo,
        do_date: first.orderCreatedAt,
        customer_name: first.customerName || '—',
        agent_name: (isBroker ? first.brokerName : (first.brokerName || '')) || '—',
        agent_label: isBroker ? 'Broker' : 'Broker / Salesperson',
        address: first.customerAddress || '—',
        mobile: first.customerWhatsapp || first.customerContact || '—',
        status: 'Original/Pending',
        products,
        punch_by: (first.orderPunchUserId && nameById.get(first.orderPunchUserId)) || '—',
        punch_at: first.orderCreatedAt || null,
        pre_approve_by: (pre?.userId && nameById.get(pre.userId)) || '—',
        pre_approve_at: pre?.actualAt || null,
        approve_by: (oa?.userId && nameById.get(oa.userId)) || '—',
        approve_at: oa?.actualAt || null,
      });
    }

    vouchers.sort((a, b) => String(a.do_no).localeCompare(String(b.do_no)));
    return { vouchers, count: vouchers.length };
  }

  /**
   * Daily CP Dispatch Report (CP Sale Dispatch Report)
   * All invoiced dispatches (CPOIL bills) for a given Doc Date (invoice_date), one
   * numbered block per invoice: Customer + Address / Doc No. / Doc Date / Vehicle, with
   * item lines grouped by oil (Qty / UOM / Rate / Net Wt / Gross Wt), per-oil + block
   * grand totals. Plus a day-level Packing Wt (= total gross), RST Wt (weighbridge) and
   * Diff, and a "Total for a Day" per-oil + grand summary.
   */
  async getDailyDispatchReport(filters = {}) {
    const blank = () => ({ rice: { qty: 0, net: 0, gross: 0 }, soya: { qty: 0, net: 0, gross: 0 }, palm: { qty: 0, net: 0, gross: 0 }, grand: { qty: 0, net: 0, gross: 0 } });
    const date = filters.date;
    if (!date) return { date: null, blocks: [], dayTotals: blank(), packing_wt: 0, rst_wt: 0, diff: 0, count: 0 };

    // One row per invoiced shipment line for the Doc Date. The old
    // `lrc LEFT JOIN od ON so_no+product_name` linkage is the dispatches ->
    // order_items FK here; SKU master fields come through order_items.sku_id.
    const rows = await dbV2
      .select({
        invoice_no: schema.invoices.invoiceNo,
        invoice_date: schema.invoices.invoiceDate,
        product_name: schema.skus.skuName,
        truck_no: schema.vehicles.registrationNo,
        actual_qty_dispatch: schema.dispatches.actualQtyDispatch,
        qty_to_be_dispatched: schema.dispatches.qtyToBeDispatched,
        qty: schema.invoices.qty,
        actual_qty: schema.dispatches.actualQty,
        gross_weight: schema.dispatches.grossWeight,
        tare_weight: schema.dispatches.tareWeight,
        extra_weight: schema.dispatches.extraWeight,
        od_customer: schema.customers.customerName,
        customer_address: schema.orders.customerAddress,
        od_uom: schema.orderItems.uom,
        rate_of_material: schema.orderItems.rateOfMaterial,
        final_rate: schema.orderItems.finalRate,
        oil_type: schema.orderItems.oilType,
        main_uom: schema.skus.mainUom,
        sku_weight: schema.skus.skuWeight,
        sku_gross: schema.skus.grossWeight,
      })
      .from(schema.invoices)
      .innerJoin(schema.dispatches, eq(schema.dispatches.id, schema.invoices.dispatchId))
      .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
      .leftJoin(schema.customers, eq(schema.customers.id, schema.orders.customerId))
      .leftJoin(schema.skus, eq(schema.skus.id, schema.orderItems.skuId))
      .leftJoin(schema.vehicles, eq(schema.vehicles.id, schema.dispatches.vehicleId))
      .where(and(
        isNotNull(schema.invoices.invoiceNo),
        sql`${schema.invoices.invoiceNo} <> ''`,
        // invoice_date is a NAIVE timestamp that drizzle writes as the UTC
        // components of a local(IST)-midnight instant — a raw `::date` on it
        // lands on the previous day. Filter with JS Dates so the params get
        // serialized through the exact same convention the values were written
        // with (`new Date('YYYY-MM-DDTHH:mm:ss')` = LOCAL time per ES spec).
        gte(schema.invoices.invoiceDate, new Date(`${date}T00:00:00`)),
        lte(schema.invoices.invoiceDate, new Date(`${date}T23:59:59.999`)),
      ))
      .orderBy(asc(schema.invoices.invoiceNo), asc(schema.dispatches.id));

    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const classifyOil = (oilType, skuName) => {
      const s = `${oilType || ''} ${skuName || ''}`.toLowerCase();
      if (s.includes('palm')) return 'palm';
      if (s.includes('soya') || s.includes('sbo')) return 'soya';
      if (s.includes('rice') || s.includes('rbo')) return 'rice';
      return 'other';
    };
    const OIL_LABEL = { rice: 'Rice Oil', soya: 'Soya Oil', palm: 'Palm Oil', other: 'Other' };
    const OIL_ORDER = ['rice', 'soya', 'palm', 'other'];

    // Group by invoice (= one block: customer + vehicle + doc)
    const invMap = new Map();
    for (const r of rows) {
      const inv = r.invoice_no;
      if (!invMap.has(inv)) invMap.set(inv, []);
      invMap.get(inv).push(r);
    }

    const dayTotals = blank();
    let packing = 0, rst = 0;
    const blocks = [];
    let sn = 0;

    for (const [inv, lines] of invMap) {
      const first = lines[0];
      sn += 1;
      // weighbridge once per invoice
      let gMax = 0, tMax = 0, eMax = 0;
      lines.forEach(l => { gMax = Math.max(gMax, num(l.gross_weight)); tMax = Math.max(tMax, num(l.tare_weight)); eMax = Math.max(eMax, num(l.extra_weight)); });
      const invRst = gMax - tMax - eMax;
      rst += invRst;

      // bucket lines by oil (each line is its own item row — do not merge)
      const oilBuckets = { rice: [], soya: [], palm: [], other: [] };
      const blockGrand = { qty: 0, net: 0, gross: 0 };
      for (const l of lines) {
        const qty = num(l.actual_qty_dispatch) || num(l.qty_to_be_dispatched) || num(l.qty) || num(l.actual_qty);
        const netUnit = num(l.sku_weight);
        const grossUnit = num(l.sku_gross) || num(l.sku_weight);
        const net = Math.round(qty * netUnit * 1000) / 1000;
        const gross = Math.round(qty * grossUnit * 1000) / 1000;
        const oil = classifyOil(l.oil_type, l.product_name);
        oilBuckets[oil].push({
          item_name: l.product_name || '—',
          qty,
          uom: l.main_uom || l.od_uom || '',
          rate: num(l.rate_of_material) || num(l.final_rate),
          net, gross,
        });
        blockGrand.qty += qty; blockGrand.net += net; blockGrand.gross += gross;
        dayTotals[oil].qty += qty; dayTotals[oil].net += net; dayTotals[oil].gross += gross;
        dayTotals.grand.qty += qty; dayTotals.grand.net += net; dayTotals.grand.gross += gross;
        packing += gross;
      }

      const oils = [];
      OIL_ORDER.forEach(k => {
        const items = oilBuckets[k];
        if (!items.length) return;
        const total = items.reduce((t, it) => ({ qty: t.qty + it.qty, net: t.net + it.net, gross: t.gross + it.gross }), { qty: 0, net: 0, gross: 0 });
        oils.push({ oil: k, label: OIL_LABEL[k], items, total: { qty: total.qty, net: Math.round(total.net * 1000) / 1000, gross: Math.round(total.gross * 1000) / 1000 } });
      });

      blocks.push({
        sn,
        customer_name: first.od_customer || '—',
        customer_address: first.customer_address || '',
        doc_no: inv,
        doc_date: first.invoice_date,
        vehicle_no: first.truck_no || '',
        oils,
        grand: { qty: blockGrand.qty, net: Math.round(blockGrand.net * 1000) / 1000, gross: Math.round(blockGrand.gross * 1000) / 1000 },
      });
    }

    const round3 = (n) => Math.round(n * 1000) / 1000;
    ['rice', 'soya', 'palm', 'grand'].forEach(k => { dayTotals[k].net = round3(dayTotals[k].net); dayTotals[k].gross = round3(dayTotals[k].gross); });
    packing = round3(packing);
    rst = round3(rst);

    return { date, blocks, dayTotals, packing_wt: packing, rst_wt: rst, diff: round3(rst - packing), count: blocks.length };
  }

  /**
   * SKU & Customer-Wise CP Pending Sauda Report
   * Pending DOs (Dispatch Planning stage) grouped by Customer -> base DO, with one
   * row per ordered SKU line (Item / Rate per pcs / Order Qty / Pending Qty). Each DO
   * block also carries Last Dispatch (total dispatched qty + latest dispatch date from
   * lift_receiving_confirmation), Order Type (W-W vs Future Period), Valid Upto (end_date)
   * and Broker. Status (Expired / N days left) is derived on the client from Valid Upto
   * vs the download date. Optional query param: customer_name.
   */
  async getPendingSaudaSkuReport(filters = {}) {
    const rows = await this._fetchPendingSaudaRows({ customer_name: filters.customer_name });

    // Latest dispatch DATE per order = max(invoice_date ?? shipment birth time)
    // across the order's PENDING items' shipments. The dispatched QTY is derived
    // from the order's own fields below (Order Qty − Pending Qty), not the shipments.
    const itemIds = rows.map(r => r.orderItemId);
    const lastDispDateByOrder = new Map();
    if (itemIds.length) {
      const disp = await dbV2
        .select({
          orderId: schema.orders.id,
          createdAt: schema.dispatches.createdAt,
          invoiceDate: schema.invoices.invoiceDate,
        })
        .from(schema.dispatches)
        .innerJoin(schema.orderItems, eq(schema.orderItems.id, schema.dispatches.orderItemId))
        .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId))
        .leftJoin(schema.invoices, eq(schema.invoices.dispatchId, schema.dispatches.id))
        .where(inArray(schema.dispatches.orderItemId, itemIds));
      for (const d of disp) {
        const dt = d.invoiceDate || d.createdAt;
        if (!dt) continue;
        const prev = lastDispDateByOrder.get(d.orderId);
        if (!prev || new Date(dt).getTime() > new Date(prev).getTime()) lastDispDateByOrder.set(d.orderId, dt);
      }
    }

    const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const orderTypeOf = (purpose) => {
      const s = (purpose || '').toLowerCase();
      if (s.includes('week') || s.includes('w-w') || s.includes('w w')) return 'W-W';
      return 'Future Period';
    };

    // Group by customer -> base DO (= order), one item row per ordered SKU line.
    const customers = new Map();
    for (const o of rows) {
      const cName = o.customerName || '—';
      if (!customers.has(cName)) customers.set(cName, { customer_name: cName, dosByKey: new Map() });
      const cust = customers.get(cName);
      const key = o.orderId;
      if (!cust.dosByKey.has(key)) {
        cust.dosByKey.set(key, {
          do_no: o.orderNo,
          // DO Date is the date entered at Order Punch (party_so_date), not the DB insert timestamp.
          do_date: o.partySoDate || o.orderCreatedAt,
          valid_upto: o.endDate,
          order_type: orderTypeOf(o.deliveryPurpose),
          broker_name: o.brokerName || '',
          last_disp_qty: 0, // accumulated below = Σ(order_qty − pending_qty)
          last_disp_date: lastDispDateByOrder.get(key) || null,
          items: [],
        });
      }
      const doObj = cust.dosByKey.get(key);
      if (!doObj.broker_name && o.brokerName) doObj.broker_name = o.brokerName;
      const orderQty = num(o.orderQuantity != null ? o.orderQuantity : o.approvedQty);
      const pendingQty = o.remainingQty != null ? num(o.remainingQty) : orderQty;
      doObj.last_disp_qty += Math.max(0, orderQty - pendingQty);
      doObj.items.push({
        item_name: o.skuName || '—',
        rate: num(o.rateOfMaterial) || num(o.finalRate) || num(o.ratePer15kg),
        order_qty: orderQty,
        pending_qty: pendingQty,
      });
    }

    const customerList = [];
    for (const cust of customers.values()) {
      const dos = [...cust.dosByKey.values()];
      customerList.push({ customer_name: cust.customer_name, sauda_count: dos.length, dos });
    }
    customerList.sort((a, b) => a.customer_name.localeCompare(b.customer_name));
    return { customers: customerList, count: customerList.length };
  }
}

module.exports = new ReportsService();
