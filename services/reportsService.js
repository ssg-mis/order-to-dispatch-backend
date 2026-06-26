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

      // Optional row cap (used by the on-screen export preview). Sanitized to a
      // positive integer; ignored for the full export so the download stays complete.
      const limitNum = parseInt(filters.limit, 10);
      const limitClause = Number.isInteger(limitNum) && limitNum > 0 ? `LIMIT ${limitNum}` : '';

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
        ${limitClause}
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

  /**
   * CP Pending Sauda Report
   * Source: order_dispatch rows stuck in the Dispatch Planning stage
   *         (planned_3 IS NOT NULL AND actual_3 IS NULL).
   * One report row per base DO (DO-314 groups DO-314A, DO-314B, ...).
   * Per-DO quantities are bucketed into Rice / Soya / Palm columns by oil type,
   * KGS = balance qty × per-DO SKU weight, and the "Dispatched Qty Detail" is the
   * list of already-dispatched quantities (lift_receiving_confirmation.qty_to_be_dispatched).
   * Rows are grouped into months by Start Date, with per-month subtotals (units + KGS)
   * and a grand total at the end.
   */
  async getPendingSaudaReport(filters = {}) {
    const client = await db.getClient();
    try {
      const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
        'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

      // Base DO grouping expression (matches dispatchPlanningService)
      const baseDoExp = `COALESCE(substring(order_no from '^(DO[-\\/](?:\\d{2}-\\d{2}\\/)?\\d+)'), order_no)`;

      const conditions = ['planned_3 IS NOT NULL', 'actual_3 IS NULL'];
      const params = [];
      let p = 1;
      if (filters.customer_name) { conditions.push(`customer_name ILIKE $${p}`); params.push(`%${filters.customer_name}%`); p++; }
      if (filters.order_no)      { conditions.push(`order_no ILIKE $${p}`);      params.push(`${filters.order_no}%`);     p++; }
      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const ordersRes = await client.query(
        `SELECT *, ${baseDoExp} AS base_do FROM order_dispatch ${whereClause}
         ORDER BY start_date ASC NULLS LAST, created_at ASC, order_no ASC`,
        params
      );
      const rows = ordersRes.rows;

      // SKU weight lookup (prefer sku_weight; fall back to oil_filling_per_unit)
      const skuMap = new Map();
      try {
        const skuRes = await client.query(`SELECT sku_name, sku_weight, oil_filling_per_unit FROM sku_details`);
        skuRes.rows.forEach(s => skuMap.set((s.sku_name || '').toUpperCase().trim(), s));
      } catch (e) { /* table shape may differ — weights default to 0 */ }

      // Already-dispatched quantities per DO (in dispatch order)
      const orderNos = [...new Set(rows.map(r => r.order_no).filter(Boolean))];
      const dispatchedByOrder = new Map();
      if (orderNos.length) {
        const lrcRes = await client.query(
          `SELECT so_no, qty_to_be_dispatched FROM lift_receiving_confirmation
           WHERE so_no = ANY($1) ORDER BY timestamp ASC NULLS LAST, id ASC`,
          [orderNos]
        );
        lrcRes.rows.forEach(l => {
          const q = parseFloat(l.qty_to_be_dispatched);
          if (!q) return;
          if (!dispatchedByOrder.has(l.so_no)) dispatchedByOrder.set(l.so_no, []);
          dispatchedByOrder.get(l.so_no).push(q);
        });
      }

      const classifyOil = (oilType, skuName) => {
        const s = `${oilType || ''} ${skuName || ''}`.toLowerCase();
        if (s.includes('palm')) return 'palm';
        if (s.includes('soya') || s.includes('sbo')) return 'soya';
        if (s.includes('rice') || s.includes('rbo')) return 'rice';
        return null;
      };
      const balOf = (r) => {
        const v = r.remaining_dispatch_qty != null ? parseFloat(r.remaining_dispatch_qty)
          : (r.approval_qty != null ? parseFloat(r.approval_qty) : parseFloat(r.order_quantity));
        return Number.isFinite(v) ? v : 0;
      };
      const wtOf = (r) => {
        const sku = skuMap.get((r.sku_name || r.product_name || '').toUpperCase().trim());
        if (!sku) return 0;
        return parseFloat(sku.sku_weight) || parseFloat(sku.oil_filling_per_unit) || 0;
      };
      const rateOf = (r) => parseFloat(r.final_rate ?? r.rate_per_15kg ?? r.rate_of_material) || 0;

      // Group by base DO
      const groups = new Map();
      for (const r of rows) {
        const key = r.base_do || r.order_no;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }

      // Build one row per DO
      const doRows = [];
      for (const [baseDo, items] of groups) {
        const first = items[0];
        const buckets = { rice: { qty: 0, kg: 0, rate: 0 }, soya: { qty: 0, kg: 0, rate: 0 }, palm: { qty: 0, kg: 0, rate: 0 } };
        let totalBal = 0, totalKg = 0;
        const dispatched = [];
        const seenOrders = new Set();
        for (const it of items) {
          const bal = balOf(it);
          const w = wtOf(it);
          totalBal += bal;
          totalKg += bal * w;
          const oil = classifyOil(it.oil_type, it.sku_name || it.product_name);
          if (oil && buckets[oil]) {
            buckets[oil].qty += bal;
            buckets[oil].kg += bal * w;
            if (!buckets[oil].rate) buckets[oil].rate = rateOf(it);
          }
          if (!seenOrders.has(it.order_no)) {
            seenOrders.add(it.order_no);
            (dispatchedByOrder.get(it.order_no) || []).forEach(q => dispatched.push(q));
          }
        }
        doRows.push({
          do_date: first.created_at,
          do_no: baseDo,
          sauda_no: items.map(i => i.processid).find(Boolean) || '',
          customer_name: first.customer_name || '',
          broker_name: items.map(i => i.broker_name).find(Boolean) || '',
          rice: buckets.rice,
          soya: buckets.soya,
          palm: buckets.palm,
          total_bal: totalBal,
          total_kg: totalKg,
          start_date: first.start_date,
          end_date: first.end_date,
          delivery_purpose: first.order_type_delivery_purpose,
          dispatched,
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
    } finally {
      client.release();
    }
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
    const client = await db.getClient();
    try {
      const baseDoExp = `COALESCE(substring(order_no from '^(DO[-\\/](?:\\d{2}-\\d{2}\\/)?\\d+)'), order_no)`;

      const conditions = ['planned_3 IS NOT NULL', 'actual_3 IS NULL'];
      const params = [];
      let p = 1;
      if (filters.customer_name) { conditions.push(`customer_name ILIKE $${p}`); params.push(`%${filters.customer_name}%`); p++; }
      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const ordersRes = await client.query(
        `SELECT *, ${baseDoExp} AS base_do FROM order_dispatch ${whereClause}
         ORDER BY customer_name ASC, created_at ASC, order_no ASC`,
        params
      );
      const rows = ordersRes.rows;

      const classifyOil = (oilType, skuName) => {
        const s = `${oilType || ''} ${skuName || ''}`.toLowerCase();
        if (s.includes('palm')) return 'palm';
        if (s.includes('soya') || s.includes('sbo')) return 'soya';
        if (s.includes('rice') || s.includes('rbo')) return 'rice';
        return null;
      };
      const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
      const origOf = (r) => (r.order_quantity != null ? num(r.order_quantity) : num(r.approval_qty));
      const pendOf = (r) => (r.remaining_dispatch_qty != null ? num(r.remaining_dispatch_qty) : origOf(r));
      const rateOf = (r) => num(r.rate_per_15kg) || num(r.final_rate) || num(r.rate_of_material);
      const OIL_LABEL = { rice: 'Rice Oil', soya: 'Soya Oil', palm: 'Palm Oil' };
      const OIL_ORDER = ['rice', 'soya', 'palm'];

      // customer -> sauda(base DO) -> oil bucket
      const customers = new Map();
      for (const r of rows) {
        const cName = r.customer_name || '—';
        if (!customers.has(cName)) customers.set(cName, { customer_name: cName, saudas: new Map() });
        const cust = customers.get(cName);
        const saudaKey = r.base_do || r.order_no;
        if (!cust.saudas.has(saudaKey)) {
          cust.saudas.set(saudaKey, {
            sauda_no: saudaKey,
            sauda_date: r.created_at,
            oils: { rice: { original: 0, pending: 0, rate: 0 }, soya: { original: 0, pending: 0, rate: 0 }, palm: { original: 0, pending: 0, rate: 0 } },
          });
        }
        const sauda = cust.saudas.get(saudaKey);
        const oil = classifyOil(r.oil_type, r.sku_name || r.product_name);
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
    } finally {
      client.release();
    }
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
    const client = await db.getClient();
    try {
      const baseDoExp = `COALESCE(substring(order_no from '^(DO[-\\/](?:\\d{2}-\\d{2}\\/)?\\d+)'), order_no)`;
      const baseDoOf = (s) => {
        if (!s) return s;
        const m = String(s).match(/^(DO[-\/](?:\d{2}-\d{2}\/)?\d+)/);
        return m ? m[1] : s;
      };

      const conditions = ['planned_3 IS NOT NULL', 'actual_3 IS NULL'];
      const params = [];
      let p = 1;
      if (filters.customer_name) { conditions.push(`customer_name ILIKE $${p}`); params.push(`%${filters.customer_name}%`); p++; }
      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const ordersRes = await client.query(
        `SELECT *, ${baseDoExp} AS base_do FROM order_dispatch ${whereClause}
         ORDER BY customer_name ASC, created_at ASC, order_no ASC`,
        params
      );
      const orders = ordersRes.rows;

      // sku_details lookup
      const skuMap = new Map();
      try {
        const skuRes = await client.query(`SELECT sku_name, main_uom, sku_weight, gross_weight, oil_filling_per_unit FROM sku_details`);
        skuRes.rows.forEach(s => skuMap.set((s.sku_name || '').toUpperCase().trim(), s));
      } catch (e) { /* skip */ }

      // Dispatch/billing lines for these DOs. Each actually-dispatched or invoiced
      // lift_receiving_confirmation row is a billing record; the "document" is its
      // invoice (CPOIL/…) when invoiced, otherwise its DSR number.
      const orderNos = [...new Set(orders.map(o => o.order_no).filter(Boolean))];
      const lrcByBaseDo = new Map(); // base_do -> [ lrc rows ]
      if (orderNos.length) {
        const lrcRes = await client.query(
          `SELECT so_no, d_sr_number, product_name, actual_qty, actual_qty_dispatch, qty, qty_to_be_dispatched,
                  invoice_no, invoice_date, actual_1, gross_weight, tare_weight, extra_weight, timestamp
           FROM lift_receiving_confirmation
           WHERE so_no = ANY($1)
           ORDER BY invoice_date ASC NULLS LAST, timestamp ASC NULLS LAST, id ASC`,
          [orderNos]
        );
        lrcRes.rows.forEach(r => {
          const b = baseDoOf(r.so_no);
          if (!lrcByBaseDo.has(b)) lrcByBaseDo.set(b, []);
          lrcByBaseDo.get(b).push(r);
        });
      }

      const classifyOil = (oilType, skuName) => {
        const s = `${oilType || ''} ${skuName || ''}`.toLowerCase();
        if (s.includes('palm')) return 'palm';
        if (s.includes('soya') || s.includes('sbo')) return 'soya';
        if (s.includes('rice') || s.includes('rbo')) return 'rice';
        return null;
      };
      const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
      const skuWeightOf = (name) => {
        const sku = skuMap.get((name || '').toUpperCase().trim());
        if (!sku) return 0;
        return num(sku.sku_weight) || num(sku.gross_weight) || num(sku.oil_filling_per_unit);
      };
      const uomOf = (name, fallback) => {
        const sku = skuMap.get((name || '').toUpperCase().trim());
        return (sku && sku.main_uom) || fallback || '';
      };
      const OIL_LABEL = { rice: 'Rice Oil', soya: 'Soya Oil', palm: 'Palm Oil' };
      const OIL_ORDER = ['rice', 'soya', 'palm'];

      // Group orders by base DO
      const doGroups = new Map();
      for (const o of orders) {
        const key = o.base_do || o.order_no;
        if (!doGroups.has(key)) doGroups.set(key, []);
        doGroups.get(key).push(o);
      }

      const customers = new Map(); // name -> { customer_name, dos: [] }

      for (const [baseDo, items] of doGroups) {
        const first = items[0];
        const cName = first.customer_name || '—';

        // Per-oil ordered aggregates + rate/uom per ordered product
        const oilAgg = {}; // oil -> { sauda, bal, orderedSkus:Set, rateByProduct:Map, uomByProduct:Map }
        OIL_ORDER.forEach(k => { oilAgg[k] = { sauda: 0, bal: 0, orderedSkus: new Set(), rateByProduct: new Map(), uomByProduct: new Map() }; });
        for (const o of items) {
          const oil = classifyOil(o.oil_type, o.sku_name || o.product_name);
          if (!oil || !oilAgg[oil]) continue;
          const name = o.sku_name || o.product_name || '';
          oilAgg[oil].sauda += num(o.order_quantity != null ? o.order_quantity : o.approval_qty);
          oilAgg[oil].bal += (o.remaining_dispatch_qty != null ? num(o.remaining_dispatch_qty) : num(o.order_quantity));
          if (name) {
            oilAgg[oil].orderedSkus.add(name);
            const rate = num(o.rate_of_material) || num(o.final_rate) || num(o.rate_per_15kg);
            if (!oilAgg[oil].rateByProduct.has(name.toUpperCase())) oilAgg[oil].rateByProduct.set(name.toUpperCase(), rate);
            oilAgg[oil].uomByProduct.set(name.toUpperCase(), o.uom || '');
          }
        }

        // Billed quantities come ONLY from invoiced records (the CPOIL bills you see in
        // Check Invoice history) — qty + invoice_no set at Make Invoice. The item rows,
        // however, are the full dispatch breakdown (every SKU line for the DO) so an
        // un-billed line still appears with a blank Billed column.
        const lrc = lrcByBaseDo.get(baseDo) || [];
        const docOrder = [];
        const docMeta = new Map();                                                // invoice_no -> meta
        const billed = { rice: new Map(), soya: new Map(), palm: new Map() };     // oil -> product -> { display, byInv }
        const breakdown = { rice: new Map(), soya: new Map(), palm: new Map() };  // oil -> product -> display (every dispatch line)

        for (const r of lrc) {
          const oil = classifyOil(null, r.product_name);
          const pname = (r.product_name || '').toUpperCase();
          // Every dispatch line is part of the breakdown (the item rows)
          if (oil && breakdown[oil] && pname && !breakdown[oil].has(pname)) breakdown[oil].set(pname, r.product_name || '');

          // Billed: invoiced rows only
          const hasInvoice = r.invoice_no && String(r.invoice_no).trim();
          if (!hasInvoice) continue;
          const inv = r.invoice_no;
          if (!docMeta.has(inv)) {
            docMeta.set(inv, { doc_no: inv, doc_date: r.invoice_date || r.timestamp, packing: 0, gross: 0, tare: 0, extra: 0 });
            docOrder.push(inv);
          }
          const meta = docMeta.get(inv);
          // Per-line billed COUNT (tins/boxes). actual_qty_dispatch / qty_to_be_dispatched
          // hold the per-line count; qty / actual_qty hold the whole-invoice total.
          const count = num(r.actual_qty_dispatch) || num(r.qty_to_be_dispatched) || num(r.qty) || num(r.actual_qty);
          meta.packing += count * skuWeightOf(r.product_name);
          // Weighbridge values repeat on every line of an invoice — take once, don't sum.
          meta.gross = Math.max(meta.gross, num(r.gross_weight));
          meta.tare = Math.max(meta.tare, num(r.tare_weight));
          meta.extra = Math.max(meta.extra, num(r.extra_weight));
          if (oil && billed[oil]) {
            if (!billed[oil].has(pname)) billed[oil].set(pname, { display: r.product_name || '', byInv: new Map() });
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
          do_date: first.created_at,
          do_no: baseDo,
          do_valid_upto: first.end_date,
          broker_name: items.map(i => i.broker_name).find(Boolean) || '',
          oils,
          docs,
          grand,
        });
      }

      const customerList = [...customers.values()].sort((a, b) => a.customer_name.localeCompare(b.customer_name));
      customerList.forEach(c => { c.sauda_count = c.dos.length; });
      return { customers: customerList, count: customerList.length };
    } finally {
      client.release();
    }
  }

  /**
   * Oil Dispatch Voucher (Reports)
   * One voucher per pending DO (Dispatch Planning stage). Mirrors the dispatch-slip:
   * products grouped by oil with Net Wt = sku_weight × qty and Gross Wt = gross_weight × qty,
   * a per-DO header (Customer / Broker / Address / Mob / Status) and a Punch / Pre-Approve /
   * Approve footer. Returns one entry per base DO; the frontend picker chooses which to print.
   */
  async getOilDispatchVoucher(filters = {}) {
    const client = await db.getClient();
    try {
      const baseDoExp = `COALESCE(substring(order_no from '^(DO[-\\/](?:\\d{2}-\\d{2}\\/)?\\d+)'), order_no)`;

      const conditions = ['planned_3 IS NOT NULL', 'actual_3 IS NULL'];
      const params = [];
      let p = 1;
      if (filters.order_no) { conditions.push(`order_no ILIKE $${p}`); params.push(`${filters.order_no}%`); p++; }
      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const ordersRes = await client.query(
        `SELECT *, ${baseDoExp} AS base_do FROM order_dispatch ${whereClause}
         ORDER BY created_at DESC, order_no ASC`,
        params
      );
      const orders = ordersRes.rows;

      const skuMap = new Map();
      try {
        const skuRes = await client.query(`SELECT sku_name, sku_weight, gross_weight FROM sku_details`);
        skuRes.rows.forEach(s => skuMap.set((s.sku_name || '').toUpperCase().trim(), s));
      } catch (e) { /* skip */ }

      const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
      const classifyOil = (oilType, skuName) => {
        const s = `${oilType || ''} ${skuName || ''}`.toLowerCase();
        if (s.includes('palm')) return 'palm';
        if (s.includes('soya') || s.includes('sbo')) return 'soya';
        if (s.includes('rice') || s.includes('rbo')) return 'rice';
        return 'other';
      };
      const skuWtOf = (name) => {
        const sku = skuMap.get((name || '').toUpperCase().trim());
        return { net: sku ? num(sku.sku_weight) : 0, gross: sku ? (num(sku.gross_weight) || num(sku.sku_weight)) : 0 };
      };

      const groups = new Map();
      for (const o of orders) {
        const key = o.base_do || o.order_no;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(o);
      }

      const vouchers = [];
      for (const [baseDo, items] of groups) {
        const first = items[0];
        const isBroker = first.is_order_through_broker || (first.is_order_through || '').toLowerCase() === 'broker';
        const products = items.map(o => {
          const name = o.sku_name || o.product_name || '—';
          const qty = num(o.order_quantity != null ? o.order_quantity : o.approval_qty);
          const w = skuWtOf(name);
          return {
            product_name: name,
            uom: o.uom || '',
            qty,
            oil: classifyOil(o.oil_type, name),
            net_wt: Math.round(qty * w.net * 1000) / 1000,
            gross_wt: Math.round(qty * w.gross * 1000) / 1000,
          };
        });

        vouchers.push({
          do_no: baseDo,
          do_date: first.created_at,
          customer_name: first.customer_name || '—',
          agent_name: (isBroker ? first.broker_name : (first.broker_name || '')) || '—',
          agent_label: isBroker ? 'Broker' : 'Broker / Salesperson',
          address: first.customer_address || '—',
          mobile: first.customer_contact_person_whatsapp_no || first.customer_contact_person_name || '—',
          status: 'Original/Pending',
          products,
          punch_by: first.order_punch_user || '—',
          punch_at: first.created_at || null,
          pre_approve_by: first.pre_approval_user || '—',
          pre_approve_at: first.actual_1 || null,
          approve_by: first.order_approval_user || '—',
          approve_at: first.actual_2 || null,
        });
      }

      vouchers.sort((a, b) => String(a.do_no).localeCompare(String(b.do_no)));
      return { vouchers, count: vouchers.length };
    } finally {
      client.release();
    }
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
    const client = await db.getClient();
    try {
      const blank = () => ({ rice: { qty: 0, net: 0, gross: 0 }, soya: { qty: 0, net: 0, gross: 0 }, palm: { qty: 0, net: 0, gross: 0 }, grand: { qty: 0, net: 0, gross: 0 } });
      const date = filters.date;
      if (!date) return { date: null, blocks: [], dayTotals: blank(), packing_wt: 0, rst_wt: 0, diff: 0, count: 0 };

      const res = await client.query(
        `SELECT lrc.invoice_no, lrc.invoice_date, lrc.so_no, lrc.party_name, lrc.product_name, lrc.truck_no,
                lrc.actual_qty_dispatch, lrc.qty_to_be_dispatched, lrc.qty, lrc.actual_qty,
                lrc.gross_weight, lrc.tare_weight, lrc.extra_weight, lrc.id,
                od.customer_name AS od_customer, od.customer_address, od.uom AS od_uom,
                od.rate_of_material, od.final_rate, od.oil_type,
                sd.main_uom, sd.sku_weight, sd.gross_weight AS sku_gross
         FROM lift_receiving_confirmation lrc
         LEFT JOIN order_dispatch od ON lrc.so_no = od.order_no
         LEFT JOIN sku_details sd ON UPPER(TRIM(sd.sku_name)) = UPPER(TRIM(lrc.product_name))
         WHERE lrc.invoice_no IS NOT NULL AND lrc.invoice_no <> ''
           AND lrc.invoice_date::date = $1::date
         ORDER BY lrc.invoice_no ASC, lrc.id ASC`,
        [date]
      );
      const rows = res.rows;

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
          customer_name: first.od_customer || first.party_name || '—',
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
    } finally {
      client.release();
    }
  }
}

module.exports = new ReportsService();
