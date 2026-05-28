/**
 * Reports Service
 * Aggregates data for the comprehensive reports page
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class ReportsService {
  /**
   * Get comprehensive report data with filters
   */
  async getReport(filters = {}) {
    try {
      const client = await db.getClient();
      try {
        // Build WHERE clause for filters
        let conditions = [];
        let params = [];
        let p = 1;

        if (filters.order_no) {
          // Match base order number (DO-416 matches DO-416A, DO-416B)
          conditions.push(`order_no ILIKE $${p}`);
          params.push(`${filters.order_no}%`);
          p++;
        }

        if (filters.customer_name) {
          conditions.push(`customer_name ILIKE $${p}`);
          params.push(`%${filters.customer_name}%`);
          p++;
        }

        if (filters.oil_type) {
          conditions.push(`oil_type ILIKE $${p}`);
          params.push(`%${filters.oil_type}%`);
          p++;
        }

        if (filters.sku_name) {
          conditions.push(`sku_name ILIKE $${p}`);
          params.push(`%${filters.sku_name}%`);
          p++;
        }

        if (filters.from_date) {
          conditions.push(`created_at >= $${p}`);
          params.push(filters.from_date);
          p++;
        }

        if (filters.to_date) {
          conditions.push(`created_at <= $${p}`);
          params.push(filters.to_date + ' 23:59:59');
          p++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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

        // All matching orders
        const ordersResult = await client.query(
          `SELECT * FROM order_dispatch ${whereClause} ORDER BY created_at DESC`,
          params
        );
        const all = ordersResult.rows;

        // Summary KPIs
        const totalReceived = all.length;

        // Dispatched = actual_4 (Actual Dispatch) filled
        const dispatched = all.filter(o => o.actual_4);
        const totalDispatchedCount = dispatched.length;
        const totalDispatchedKg = dispatched.reduce((sum, o) => sum + (parseFloat(o.order_quantity) || 0), 0);

        // Pending = NOT completed (no actual_10/Gate Out)
        const pending = all.filter(o => !o.actual_10);
        const totalPendingCount = pending.length;
        const totalPendingKg = pending.reduce((sum, o) => sum + (parseFloat(o.order_quantity) || 0), 0);

        // Remaining = total qty - dispatched qty
        const totalReceivedKg = all.reduce((sum, o) => sum + (parseFloat(o.order_quantity) || 0), 0);
        const totalRemainingKg = totalReceivedKg - totalDispatchedKg;

        // Completed (Gate Out done)
        const completed = all.filter(o => o.actual_10);
        const totalCompletedCount = completed.length;
        const totalCompletedKg = completed.reduce((sum, o) => sum + (parseFloat(o.order_quantity) || 0), 0);

        // ── Load SKU details for weight lookup ──
        let skuDetailsMap = new Map();
        try {
          const skuResult = await client.query(`SELECT sku_name, sku_weight, nos_per_main_uom, main_uom, alternate_uom FROM sku_details`);
          skuResult.rows.forEach(sku => {
            skuDetailsMap.set((sku.sku_name || '').toUpperCase().trim(), sku);
          });
        } catch (e) {
          // sku_details may not exist or have different schema — gracefully skip
        }

        // ── Top Selling SKUs by oil type ──
        const skuMap = new Map();
        all.forEach(o => {
          const rawOil = deriveOilType(o.oil_type, o.sku_name || o.product_name);
          const key = `${rawOil || 'Unknown'}__${o.sku_name || o.product_name || 'Unknown'}`;
          if (!skuMap.has(key)) {
            const skuName = (o.sku_name || o.product_name || '').toUpperCase().trim();
            const skuDetail = skuDetailsMap.get(skuName);
            skuMap.set(key, {
              oil_type: rawOil || 'Unknown',
              sku: o.sku_name || o.product_name || 'Unknown',
              total_kg: 0,
              total_qty: 0,      // box / nos count (from alternate_qty_kg field)
              total_qty_kg: 0,   // qty × sku_weight in KG
              sku_weight: skuDetail ? parseFloat(skuDetail.sku_weight) || 0 : 0,
              nos_per_main_uom: skuDetail ? parseFloat(skuDetail.nos_per_main_uom) || 0 : 0,
              main_uom: skuDetail ? skuDetail.main_uom : null,
              alternate_uom: skuDetail ? skuDetail.alternate_uom : null,
              count: 0
            });
          }
          const entry = skuMap.get(key);
          const altQty = parseFloat(o.alternate_qty_kg) || 0;
          entry.total_kg += parseFloat(o.order_quantity) || 0;
          entry.total_qty += altQty;
          entry.total_qty_kg += altQty * entry.sku_weight;
          entry.count += 1;
        });
        const topSkus = Array.from(skuMap.values())
          .sort((a, b) => b.total_kg - a.total_kg)
          .slice(0, 20);

        // ── Stage timing report (planned vs actual per stage) ──
        const stageMap = [
          { key: 'stage_1', label: 'Pre Approval', planned: 'planned_1', actual: 'actual_1' },
          { key: 'stage_2', label: 'Approval of Order', planned: 'planned_2', actual: 'actual_2' },
          { key: 'stage_3', label: 'Dispatch Planning', planned: 'planned_3', actual: 'actual_3' },
          { key: 'stage_4', label: 'Actual Dispatch', planned: 'planned_4', actual: 'actual_4' },
          { key: 'stage_5', label: 'Vehicle Details', planned: 'planned_5', actual: 'actual_5' },
          { key: 'stage_6', label: 'Material Load', planned: 'planned_6', actual: 'actual_6' },
          { key: 'stage_7', label: 'Security Approval', planned: 'planned_7', actual: 'actual_7' },
          { key: 'stage_8', label: 'Make Invoice', planned: 'planned_8', actual: 'actual_8' },
          { key: 'stage_9', label: 'Check Invoice', planned: 'planned_9', actual: 'actual_9' },
          { key: 'stage_10', label: 'Gate Out', planned: 'planned_10', actual: 'actual_10' },
          { key: 'stage_11', label: 'Material Receipt', planned: 'planned_11', actual: 'actual_11' },
          { key: 'stage_12', label: 'Damage Adjustment', planned: 'planned_12', actual: 'actual_12' },
          { key: 'stage_13', label: 'Final Delivery', planned: 'planned_13', actual: 'actual_13' },
        ];

        // ── Per-order timeline report ──
        const orderTimeline = all.map(o => {
          const stages = stageMap.map(s => {
            const planned = o[s.planned] ? new Date(o[s.planned]) : null;
            const actual = o[s.actual] ? new Date(o[s.actual]) : null;
            let delayDays = null;
            let delayHours = null;
            if (planned && actual) {
              const diffMs = actual - planned;
              delayDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              delayHours = Math.round(diffMs / (1000 * 60 * 60));
            }
            return {
              stage: s.label,
              planned: planned ? o[s.planned] : null,
              actual: actual ? o[s.actual] : null,
              delayDays,
              delayHours,
              onTime: planned && actual ? actual <= planned : null
            };
          }).filter(s => s.planned || s.actual); // only show stages with data

          const skuName = o.sku_name || o.product_name;
          const derivedOilType = deriveOilType(o.oil_type, skuName);
          const skuKey = (skuName || '').toUpperCase().trim();
          const skuDetail = skuDetailsMap.get(skuKey);
          const skuWeight = skuDetail ? parseFloat(skuDetail.sku_weight) || 0 : 0;
          const rawQty = parseFloat(o.order_quantity) || 0;
          const order_quantity_kg = skuWeight > 0 ? rawQty * skuWeight : rawQty;

          return {
            id: o.id,
            order_no: o.order_no,
            customer_name: o.customer_name,
            oil_type: derivedOilType,
            sku_name: skuName,
            order_quantity: rawQty,
            order_quantity_kg,
            sku_weight: skuWeight,
            alternate_qty_kg: o.alternate_qty_kg,
            uom: o.uom,
            created_at: o.created_at,
            delivery_date: o.delivery_date,
            stages
          };
        });

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
          orders: all
        };
      } finally {
        client.release();
      }
    } catch (error) {
      Logger.error('Error generating report', error);
      throw error;
    }
  }

  /**
   * Get detailed dispatch report from lift_receiving_confirmation (source of truth)
   * Joins order_dispatch, customer_details, transport_master, broker_details,
   * salesperson_details, sku_details, depot_details, vehicle_master
   */
  async getDispatchReport(filters = {}) {
    const client = await db.getClient();
    try {
      let conditions = [];
      let params = [];
      let p = 1;

      if (filters.from_date) {
        conditions.push(`lrc.timestamp >= $${p}`);
        params.push(filters.from_date);
        p++;
      }
      if (filters.to_date) {
        conditions.push(`lrc.timestamp <= $${p}`);
        params.push(filters.to_date + ' 23:59:59');
        p++;
      }
      if (filters.customer_name) {
        conditions.push(`(od.customer_name ILIKE $${p} OR lrc.party_name ILIKE $${p})`);
        params.push(`%${filters.customer_name}%`);
        p++;
      }
      if (filters.dispatch_no) {
        conditions.push(`lrc.d_sr_number ILIKE $${p}`);
        params.push(`%${filters.dispatch_no}%`);
        p++;
      }
      if (filters.order_no) {
        conditions.push(`lrc.so_no ILIKE $${p}`);
        params.push(`%${filters.order_no}%`);
        p++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await client.query(`
        SELECT DISTINCT ON (lrc.id)
          lrc.*,
          od.order_type             AS dispatch_type,
          od.order_category,
          od.order_type_delivery_purpose AS delivery_type,
          od.customer_name          AS od_customer_name,
          od.customer_address       AS od_customer_address,
          od.type_of_transporting   AS od_transport_type,
          od.freight_rate           AS od_freight_rate,
          od.salesperson_name,
          od.broker_name,
          od.depo_name,
          od.sku_name,
          od.product_name           AS od_product_name,
          od.oil_type,
          od.uom,
          od.order_quantity,
          od.alternate_qty_kg,
          od.remaining_dispatch_qty,
          od.rate_of_material,
          od.final_rate,
          od.party_so_date,
          od.created_at             AS order_created_at,
          od.end_date               AS od_end_date,
          od.delivery_date,
          od.bill_company_name      AS od_bill_company_name,
          od.bill_address           AS od_bill_address,
          od.ship_company_name      AS od_ship_company_name,
          od.ship_address           AS od_ship_address,
          od.transfer               AS od_transfer,
          cd.customer_id,
          cd.gstin                  AS customer_gstin,
          cd.state                  AS customer_state,
          dd.depot_id               AS godown_id,
          tm.transport_master_id    AS transporter_id,
          tm.gstin                  AS transporter_gstin,
          bd.broker_id,
          sp.broker_id              AS salesperson_id,
          sd.sku_code,
          sd.nos_per_main_uom       AS filling_pcs,
          sd.sku_weight,
          sd.oil_filling_per_unit,
          sd.gross_weight           AS sku_gross_weight_per_unit,
          vm.road_tax               AS vm_road_tax,
          vm.pollution              AS vm_pollution,
          vm.insurance              AS vm_insurance,
          vm.fitness                AS vm_fitness,
          vm.state_permit           AS vm_state_permit,
          dm.mobile_no              AS dm_mobile_no,
          dm.driving_licence_no     AS dm_driving_licence_no,
          dm.valid_upto             AS dm_valid_upto
        FROM lift_receiving_confirmation lrc
        LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
        LEFT JOIN customer_details cd ON LOWER(TRIM(od.customer_name)) = LOWER(TRIM(cd.customer_name))
        LEFT JOIN depot_details dd ON LOWER(TRIM(od.depo_name)) = LOWER(TRIM(dd.depot_name))
        LEFT JOIN transport_master tm ON LOWER(TRIM(lrc.transporter_name)) = LOWER(TRIM(tm.transporter_name))
        LEFT JOIN broker_details bd ON LOWER(TRIM(od.broker_name)) = LOWER(TRIM(bd.salesman_name))
        LEFT JOIN salesperson_details sp ON LOWER(TRIM(od.salesperson_name)) = LOWER(TRIM(sp.salesman_name))
        LEFT JOIN sku_details sd ON LOWER(TRIM(COALESCE(od.sku_name, od.product_name, lrc.product_name))) = LOWER(TRIM(sd.sku_name))
        LEFT JOIN vehicle_master vm ON LOWER(TRIM(lrc.truck_no)) = LOWER(TRIM(vm.registration_no))
        LEFT JOIN driver_master dm ON LOWER(TRIM(lrc.driving_license_no)) = LOWER(TRIM(dm.driving_licence_no))
        ${whereClause}
        ORDER BY lrc.id, lrc.timestamp DESC
      `, params);

      // ── Pass 1: per-row calculations ─────────────────────────────────────────
      const pass1 = result.rows.map((r, i) => {
        const gstRate = 0.05;
        const saudaRate = parseFloat(r.final_rate || r.rate_of_material || 0);
        const freightRate = parseFloat(r.od_freight_rate || 0);
        const netRate = saudaRate + freightRate;                                         // BD
        const rateWoGst = netRate > 0 ? Math.round((netRate / (1 + gstRate)) * 100) / 100 : 0; // BF
        const qty = parseFloat(r.actual_qty || r.qty_to_be_dispatched || r.alternate_qty_kg || 0);
        const itemTaxable = Math.round(qty * rateWoGst * 100) / 100;                    // BH
        const itemCgst = Math.round((gstRate / 2) * itemTaxable * 100) / 100;           // BJ
        const itemAmount = Math.round(qty * netRate * 100) / 100;                       // BG

        const skuWt = parseFloat(r.sku_weight || 0);                                    // CI (per unit)
        const oilWt = parseFloat(r.oil_filling_per_unit || 0);                          // CJ (per unit)
        const skuGrossWtPerUnit = parseFloat(r.sku_gross_weight_per_unit || 0);         // CD (per unit)

        // Weight chain (CA → CC)
        const rstGrossWt = parseFloat(r.gross_weight || 0);
        const rstTareWt = parseFloat(r.tare_weight || 0);
        const rstNetWt = rstGrossWt - rstTareWt;                                        // CA
        const extraMatWt = parseFloat(r.extra_weight || 0);
        const rstWt = rstNetWt - extraMatWt;                                            // CC

        // Per-row quantity totals (CE, CK, CL)
        const totalGrossWt = (skuGrossWtPerUnit && qty) ? Math.round(skuGrossWtPerUnit * qty * 1000) / 1000 : null; // CE
        const totalSkuWt   = (skuWt && qty)           ? Math.round(skuWt * qty * 1000) / 1000 : null;              // CK
        const totalOilWt   = (oilWt && qty)           ? Math.round(oilWt * qty * 1000) / 1000 : null;              // CL

        // U: Total Freight = Freight Rate per MT × RST Net Wt / 1000
        const freightRatePerMt = parseFloat(r.od_freight_rate || 0);
        const totalFreight = (freightRatePerMt && rstNetWt) ? Math.round(freightRatePerMt * rstNetWt / 1000 * 100) / 100 : null;

        const advanceCashBank = (parseFloat(r.advance_bhada_cash || 0) + parseFloat(r.advance_bhada_bank || 0)) || null;

        let fulfillmentStatus = null;
        if (r.planned_7 && r.actual_7) {
          fulfillmentStatus = new Date(r.actual_7) <= new Date(r.planned_7) ? 'On-Time' : 'Late';
        } else if (r.planned_1 && r.actual_1) {
          fulfillmentStatus = new Date(r.actual_1) <= new Date(r.planned_1) ? 'On-Time' : 'Late';
        }

        return {
          // private fields used in pass 2
          _invoice_no:     r.invoice_no,
          _item_taxable:   itemTaxable,
          _item_amount:    itemAmount,
          _total_gross_wt: totalGrossWt,
          _total_sku_wt:   totalSkuWt,
          _total_oil_wt:   totalOilWt,
          _rst_net_wt:     rstNetWt,
          _gst_rate:       gstRate,

          sn: i + 1,
          dispatch_date: r.timestamp,
          dispatch_no: r.d_sr_number,
          dispatch_type: r.order_category,
          vehicle_no: r.truck_no,
          road_tax: r.road_tax || r.vm_road_tax,
          pollution: r.pollution_end_date,
          insurance: r.insurance_end_date,
          fitness: r.fitness_end_date,
          state_permit: r.permit1_end_date,
          national_permit: r.permit2_end_date,
          godown_id: r.godown_id,
          godown_name: r.dispatch_from || r.depo_name,
          destination: r.customer_state,
          delivery_type: r.delivery_type,
          transport_type: r.type_of_transporting || r.od_transport_type,
          transporter_id: r.transporter_id,
          transporter_name: r.transporter_name,
          transporter_gstin: r.transporter_gstin,
          freight_rate_per_mt: freightRatePerMt || null,
          total_freight: totalFreight,                                                  // U
          advance_freight_cash_bank: advanceCashBank,
          advance_freight_diesel: r.advance_bhada_diesel_advance,
          driver_name: r.driver_name,
          driver_mobile: r.driver_contact_no || r.dm_mobile_no,
          driving_licence_no: r.driving_license_no || r.dm_driving_licence_no,
          licence_expiry: r.dl_valid_upto || r.dm_valid_upto,
          salesman_id: r.salesperson_id,
          salesman_name: r.salesperson_name,
          broker_id: r.broker_id,
          broker_name: r.broker_name,
          broker_gstin: null,
          customer_id: r.customer_id,
          customer_name: r.od_customer_name || r.party_name,
          customer_gstin: r.customer_gstin,
          place_area: r.customer_state,
          customer_address: r.od_customer_address,
          sauda_transfer: r.transfer || r.od_transfer,
          bill_to: r.bill_company_name || r.od_bill_company_name,
          bill_to_gstin: null,
          bill_to_address: r.bill_address || r.od_bill_address,
          ship_to: r.ship_company_name || r.od_ship_company_name,
          ship_to_gstin: null,
          ship_to_address: r.ship_address || r.od_ship_address,
          do_no: r.so_no,
          sauda_no: r.processid,
          sauda_date: r.party_so_date || r.order_created_at,
          sku_id: r.sku_code,
          sku_name: r.sku_name || r.product_name || r.od_product_name,
          filling_pcs: r.filling_pcs,
          rate_per_pcs: r.final_rate || r.rate_of_material,
          qty_box_tin: qty || null,
          balance_qty: r.remaining_dispatch_qty,
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
          invoice_date: r.invoice_date,
          invoice_no: r.invoice_no,
          // BN, BP, BQ, BR, BS, BT, BU filled in pass 2
          fulfillment_status: fulfillmentStatus,
          sauda_end_date: r.od_end_date || r.delivery_date,
          rst_no: r.rst_no,
          rst_gross_wt: rstGrossWt || null,
          rst_tare_wt: rstTareWt || null,
          rst_net_wt: rstNetWt || null,                                                // CA
          extra_mat_wt: extraMatWt || null,
          rst_wt: rstWt || null,                                                       // CC
          sku_gross_wt: skuGrossWtPerUnit || null,                                     // CD (per unit)
          total_gross_wt: totalGrossWt,                                                // CE
          // CF (gross_wt) filled in pass 2
          wt_diff_reason: r.reason_of_difference_in_weight_if_any_speacefic,
          sku_wt: skuWt || null,                                                       // CI (per unit)
          oil_wt: oilWt || null,                                                       // CJ (per unit)
          total_sku_wt: totalSkuWt,                                                    // CK
          total_oil_wt: totalOilWt,                                                    // CL
          // CM, CN filled in pass 2
          bhada_type: r.freight_rate_type,
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
    } finally {
      client.release();
    }
  }
}

module.exports = new ReportsService();
