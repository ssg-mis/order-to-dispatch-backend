/**
 * Owner Dashboard Service
 * Comprehensive analytics for the business owner.
 * Pulls data across all stages, users, parties, oil types, and aging.
 *
 * IMPORTANT DB TYPE NOTES:
 *  - order_dispatch.planned_1/2/3 and actual_1/2/3 are CHARACTER VARYING — must cast ::timestamptz for arithmetic
 *  - lift_receiving_confirmation has NO planned_2/actual_2 or planned_3/actual_3 columns
 *  - LRC qty column is qty_to_be_dispatched (not dispatch_qty)
 */

const db = require('../config/db');
const { Logger } = require('../utils');

class OwnerDashboardService {

  /**
   * Build WHERE clause and params array from filter object.
   * All conditions use `od.` alias for order_dispatch fields.
   */
  buildFilters(filters = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (filters.depot && filters.depot !== 'all') {
      conditions.push(`od.depo_name = $${idx++}`);
      params.push(filters.depot);
    }
    if (filters.order_type && filters.order_type !== 'all') {
      conditions.push(`od.order_type = $${idx++}`);
      params.push(filters.order_type);
    }
    if (filters.date_from) {
      conditions.push(`od.created_at >= $${idx++}`);
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      conditions.push(`od.created_at < ($${idx++}::date + interval '1 day')`);
      params.push(filters.date_to);
    }

    const odWhere = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const odAnd   = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    return { conditions, odWhere, odAnd, params, lastIdx: idx };
  }

  // ─────────────────────────────────────────────
  // SECTION A — KPI Bar
  // ─────────────────────────────────────────────
  async getKPI(filters = {}) {
    const { odWhere, odAnd, params } = this.buildFilters(filters);

    // od.planned_1/2/3 are varchar — IS NULL checks work fine without cast
    const odQuery = `
      SELECT
        COUNT(DISTINCT regexp_replace(od.order_no, '[A-Z]+$', ''))                                   AS total_orders,
        COUNT(DISTINCT CASE WHEN od.created_at::date = CURRENT_DATE
              THEN regexp_replace(od.order_no, '[A-Z]+$', '') END)                                   AS new_today,
        COUNT(DISTINCT CASE WHEN od.planned_2 IS NOT NULL AND od.actual_2 IS NULL
              THEN od.id END)                                                                          AS pending_approval,
        COUNT(DISTINCT CASE WHEN od.planned_3 IS NOT NULL AND od.actual_3 IS NULL
              THEN od.id END)                                                                          AS pending_dispatch_planning,
        COUNT(DISTINCT CASE WHEN od.actual_3 IS NULL AND od.created_at < NOW() - INTERVAL '24 hours'
              THEN od.id END)                                                                          AS delayed_orders
      FROM order_dispatch od
      ${odWhere}
    `;

    const lrcQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN lrc.actual_1::date = CURRENT_DATE THEN lrc.so_no END)   AS dispatched_today,
        COUNT(DISTINCT CASE WHEN lrc.actual_7::date = CURRENT_DATE THEN lrc.so_no END)   AS gate_out_today,
        COUNT(DISTINCT CASE WHEN lrc.actual_8::date = CURRENT_DATE THEN lrc.so_no END)   AS delivered_today,
        COUNT(DISTINCT CASE WHEN lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL
              THEN lrc.so_no END)                                                          AS pending_invoices,
        COALESCE(SUM(CASE WHEN lrc.actual_1::date = CURRENT_DATE
              THEN lrc.bill_amount END), 0)                                                AS total_amount_today
      FROM lift_receiving_confirmation lrc
      JOIN order_dispatch od ON od.order_no = lrc.so_no
      ${odWhere}
    `;

    const [odRes, lrcRes] = await Promise.all([
      db.query(odQuery, params),
      db.query(lrcQuery, params),
    ]);

    const od  = odRes.rows[0];
    const lrc = lrcRes.rows[0];

    return {
      totalOrders:           parseInt(od.total_orders)            || 0,
      newToday:              parseInt(od.new_today)               || 0,
      pendingApproval:       parseInt(od.pending_approval)        || 0,
      pendingDispatchPlanning: parseInt(od.pending_dispatch_planning) || 0,
      delayedOrders:         parseInt(od.delayed_orders)          || 0,
      dispatchedToday:       parseInt(lrc.dispatched_today)       || 0,
      gateOutToday:          parseInt(lrc.gate_out_today)         || 0,
      deliveredToday:        parseInt(lrc.delivered_today)        || 0,
      pendingInvoices:       parseInt(lrc.pending_invoices)       || 0,
      totalAmountToday:      parseFloat(lrc.total_amount_today)   || 0,
    };
  }

  // ─────────────────────────────────────────────
  // SECTION G — Today's Activity (every stage)
  // ─────────────────────────────────────────────
  async getTodayActivity(filters = {}) {
    const { odWhere, params } = this.buildFilters(filters);

    // od.actual_1/2/3 are varchar — cast ::timestamptz::date for date comparison
    const odQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN od.created_at::date = CURRENT_DATE THEN od.id END)                         AS orders_punched,
        COUNT(DISTINCT CASE WHEN od.actual_1::timestamptz::date = CURRENT_DATE THEN od.id END)   AS pre_approvals,
        COUNT(DISTINCT CASE WHEN od.actual_2::timestamptz::date = CURRENT_DATE THEN od.id END)   AS approvals_done,
        COUNT(DISTINCT CASE WHEN od.actual_3::timestamptz::date = CURRENT_DATE THEN od.id END)   AS dispatch_plans
      FROM order_dispatch od
      ${odWhere}
    `;

    // LRC has NO actual_2 or actual_3 columns — Vehicle Details and Material Load reuse actual_1
    const lrcQuery = `
      SELECT
        COUNT(CASE WHEN lrc.actual_1::date = CURRENT_DATE THEN 1 END) AS actually_dispatched,
        COUNT(CASE WHEN lrc.actual_4::date = CURRENT_DATE THEN 1 END) AS security_approvals,
        COUNT(CASE WHEN lrc.actual_5::date = CURRENT_DATE THEN 1 END) AS invoices_made,
        COUNT(CASE WHEN lrc.actual_6::date = CURRENT_DATE THEN 1 END) AS invoices_checked,
        COUNT(CASE WHEN lrc.actual_7::date = CURRENT_DATE THEN 1 END) AS gate_outs,
        COUNT(CASE WHEN lrc.actual_8::date = CURRENT_DATE THEN 1 END) AS deliveries_confirmed,
        COALESCE(SUM(CASE WHEN lrc.actual_7::date = CURRENT_DATE THEN lrc.qty_to_be_dispatched END), 0) AS gate_out_qty,
        COALESCE(SUM(CASE WHEN lrc.actual_1::date = CURRENT_DATE THEN lrc.bill_amount END), 0)  AS total_bill_today
      FROM lift_receiving_confirmation lrc
      JOIN order_dispatch od ON od.order_no = lrc.so_no
      ${odWhere}
    `;

    const [odRes, lrcRes] = await Promise.all([
      db.query(odQuery, params),
      db.query(lrcQuery, params),
    ]);

    const od  = odRes.rows[0];
    const lrc = lrcRes.rows[0];

    return {
      ordersPunched:       parseInt(od.orders_punched)         || 0,
      preApprovals:        parseInt(od.pre_approvals)          || 0,
      approvalsDone:       parseInt(od.approvals_done)         || 0,
      dispatchPlans:       parseInt(od.dispatch_plans)         || 0,
      actuallyDispatched:  parseInt(lrc.actually_dispatched)   || 0,
      vehiclesAssigned:    0,  // LRC has no planned_2/actual_2 — shares stage with Actual Dispatch
      materialsLoaded:     0,  // LRC has no planned_3/actual_3 — shares stage with Actual Dispatch
      securityApprovals:   parseInt(lrc.security_approvals)    || 0,
      invoicesMade:        parseInt(lrc.invoices_made)         || 0,
      invoicesChecked:     parseInt(lrc.invoices_checked)      || 0,
      gateOuts:            parseInt(lrc.gate_outs)             || 0,
      deliveriesConfirmed: parseInt(lrc.deliveries_confirmed)  || 0,
      gateOutQty:          parseFloat(lrc.gate_out_qty)        || 0,
      totalBillToday:      parseFloat(lrc.total_bill_today)    || 0,
    };
  }

  // ─────────────────────────────────────────────
  // SECTION C — Stage Pipeline
  // ─────────────────────────────────────────────
  async getStagePipeline(filters = {}) {
    const { odAnd, params } = this.buildFilters(filters);

    // od.planned_1/2/3 are varchar — cast ::timestamptz for arithmetic (NOW() - ...)
    const odStagesQuery = `
      SELECT 'Pre Approval' AS stage_name, 1 AS stage_num,
        COUNT(*) AS pending_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - od.planned_1::timestamptz)) / 60), 0) AS avg_wait_min,
        MIN(od.planned_1::timestamptz) AS oldest_at
      FROM order_dispatch od
      WHERE od.planned_1 IS NOT NULL AND od.actual_1 IS NULL ${odAnd}

      UNION ALL

      SELECT 'Order Approval', 2,
        COUNT(*),
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - od.planned_2::timestamptz)) / 60), 0),
        MIN(od.planned_2::timestamptz)
      FROM order_dispatch od
      WHERE od.planned_2 IS NOT NULL AND od.actual_2 IS NULL ${odAnd}

      UNION ALL

      SELECT 'Dispatch Planning', 3,
        COUNT(*),
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - od.planned_3::timestamptz)) / 60), 0),
        MIN(od.planned_3::timestamptz)
      FROM order_dispatch od
      WHERE od.planned_3 IS NOT NULL AND od.actual_3 IS NULL ${odAnd}
    `;

    // LRC-based stages — NO planned_2/actual_2 or planned_3/actual_3 in LRC table
    const lrcStagesQuery = `
      SELECT 'Actual Dispatch' AS stage_name, 4 AS stage_num,
        COUNT(*) AS pending_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - lrc.planned_1)) / 60), 0) AS avg_wait_min,
        MIN(lrc.planned_1) AS oldest_at
      FROM lift_receiving_confirmation lrc
      JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL ${odAnd}

      UNION ALL SELECT 'Security Approval', 5,
        COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - lrc.planned_4))/60),0), MIN(lrc.planned_4)
      FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL ${odAnd}

      UNION ALL SELECT 'Make Invoice', 6,
        COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - lrc.planned_5))/60),0), MIN(lrc.planned_5)
      FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL ${odAnd}

      UNION ALL SELECT 'Check Invoice', 7,
        COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - lrc.planned_6))/60),0), MIN(lrc.planned_6)
      FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.planned_6 IS NOT NULL AND lrc.actual_6 IS NULL ${odAnd}

      UNION ALL SELECT 'Gate Out', 8,
        COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - lrc.planned_7))/60),0), MIN(lrc.planned_7)
      FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.planned_7 IS NOT NULL AND lrc.actual_7 IS NULL ${odAnd}

      UNION ALL SELECT 'Material Receipt', 9,
        COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - lrc.planned_8))/60),0), MIN(lrc.planned_8)
      FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.planned_8 IS NOT NULL AND lrc.actual_8 IS NULL ${odAnd}
    `;

    const [odRes, lrcRes] = await Promise.all([
      db.query(odStagesQuery, params),
      db.query(lrcStagesQuery, params),
    ]);

    const rows = [...odRes.rows, ...lrcRes.rows].sort((a, b) => a.stage_num - b.stage_num);

    return rows.map(r => ({
      stageName:      r.stage_name,
      stageNum:       parseInt(r.stage_num),
      pendingCount:   parseInt(r.pending_count)          || 0,
      avgWaitMinutes: Math.round(parseFloat(r.avg_wait_min)) || 0,
      oldestAt:       r.oldest_at || null,
    }));
  }

  // ─────────────────────────────────────────────
  // SECTION B — User Activity
  // ─────────────────────────────────────────────
  async getUserActivity(filters = {}) {
    const { odAnd, params } = this.buildFilters(filters);

    const usersRes = await db.query(
      `SELECT id, username, page_access, status FROM login WHERE status = 'active' ORDER BY username`
    );

    // LRC has NO planned_2/actual_2 or planned_3/actual_3 — Vehicle Details and Material Load are removed
    const pendingQuery = `
      SELECT
        (SELECT COUNT(*) FROM order_dispatch od WHERE od.planned_1 IS NOT NULL AND od.actual_1 IS NULL ${odAnd}) AS pre_approval,
        (SELECT COUNT(*) FROM order_dispatch od WHERE od.planned_2 IS NOT NULL AND od.actual_2 IS NULL ${odAnd}) AS order_approval,
        (SELECT COUNT(*) FROM order_dispatch od WHERE od.planned_3 IS NOT NULL AND od.actual_3 IS NULL ${odAnd}) AS dispatch_planning,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL ${odAnd}) AS actual_dispatch,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL ${odAnd}) AS security_approval,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL ${odAnd}) AS make_invoice,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.planned_6 IS NOT NULL AND lrc.actual_6 IS NULL ${odAnd}) AS check_invoice,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.planned_7 IS NOT NULL AND lrc.actual_7 IS NULL ${odAnd}) AS gate_out,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.planned_8 IS NOT NULL AND lrc.actual_8 IS NULL ${odAnd}) AS material_receipt
    `;

    // od.actual_1/2/3 are varchar — cast ::timestamptz::date for date comparison
    const completedTodayQuery = `
      SELECT
        (SELECT COUNT(*) FROM order_dispatch od WHERE od.actual_1::timestamptz::date = CURRENT_DATE ${odAnd}) AS pre_approval,
        (SELECT COUNT(*) FROM order_dispatch od WHERE od.actual_2::timestamptz::date = CURRENT_DATE ${odAnd}) AS order_approval,
        (SELECT COUNT(*) FROM order_dispatch od WHERE od.actual_3::timestamptz::date = CURRENT_DATE ${odAnd}) AS dispatch_planning,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.actual_1::date = CURRENT_DATE ${odAnd}) AS actual_dispatch,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.actual_4::date = CURRENT_DATE ${odAnd}) AS security_approval,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.actual_5::date = CURRENT_DATE ${odAnd}) AS make_invoice,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.actual_6::date = CURRENT_DATE ${odAnd}) AS check_invoice,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.actual_7::date = CURRENT_DATE ${odAnd}) AS gate_out,
        (SELECT COUNT(*) FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no=lrc.so_no WHERE lrc.actual_8::date = CURRENT_DATE ${odAnd}) AS material_receipt
    `;

    const [pendingRes, todayRes] = await Promise.all([
      db.query(pendingQuery, params),
      db.query(completedTodayQuery, params),
    ]);

    const pending = pendingRes.rows[0];
    const today   = todayRes.rows[0];

    // Vehicle Details and Material Load share actual_dispatch counts (same LRC planned_1/actual_1)
    const PAGE_MAP = {
      'Pre Approval':              { label: 'Pre Approval',       pending: parseInt(pending.pre_approval)||0,       completedToday: parseInt(today.pre_approval)||0 },
      'Approval of Order':         { label: 'Order Approval',     pending: parseInt(pending.order_approval)||0,     completedToday: parseInt(today.order_approval)||0 },
      'Dispatch Planning':         { label: 'Dispatch Planning',  pending: parseInt(pending.dispatch_planning)||0,  completedToday: parseInt(today.dispatch_planning)||0 },
      'Actual Dispatch':           { label: 'Actual Dispatch',    pending: parseInt(pending.actual_dispatch)||0,    completedToday: parseInt(today.actual_dispatch)||0 },
      'Vehicle Details':           { label: 'Vehicle Details',    pending: parseInt(pending.actual_dispatch)||0,    completedToday: parseInt(today.actual_dispatch)||0 },
      'Material Load':             { label: 'Material Load',      pending: parseInt(pending.actual_dispatch)||0,    completedToday: parseInt(today.actual_dispatch)||0 },
      'Security Guard Approval':   { label: 'Security Approval',  pending: parseInt(pending.security_approval)||0,  completedToday: parseInt(today.security_approval)||0 },
      'Make Invoice':              { label: 'Make Invoice',       pending: parseInt(pending.make_invoice)||0,       completedToday: parseInt(today.make_invoice)||0 },
      'Check Invoice':             { label: 'Check Invoice',      pending: parseInt(pending.check_invoice)||0,      completedToday: parseInt(today.check_invoice)||0 },
      'Gate Out':                  { label: 'Gate Out',           pending: parseInt(pending.gate_out)||0,           completedToday: parseInt(today.gate_out)||0 },
      'Confirm Material Receipt':  { label: 'Material Receipt',   pending: parseInt(pending.material_receipt)||0,   completedToday: parseInt(today.material_receipt)||0 },
    };

    return usersRes.rows.map(user => {
      let pageAccess = user.page_access;
      if (typeof pageAccess === 'string') {
        try { pageAccess = JSON.parse(pageAccess); } catch { pageAccess = []; }
      }
      // Support both array format and object format { page: level }
      const pages = Array.isArray(pageAccess)
        ? pageAccess
        : Object.keys(pageAccess || {});

      const stages = pages
        .filter(p => PAGE_MAP[p])
        .map(p => ({ page: p, ...PAGE_MAP[p] }));

      return {
        userId:              user.id,
        username:            user.username,
        pageAccess:          pages,
        stages,
        totalPending:        stages.reduce((s, st) => s + st.pending, 0),
        totalCompletedToday: stages.reduce((s, st) => s + st.completedToday, 0),
        status:              user.status,
      };
    });
  }

  // ─────────────────────────────────────────────
  // SECTION D — Party (Customer) View
  // ─────────────────────────────────────────────
  async getPartyView(filters = {}) {
    const { odWhere, params, lastIdx } = this.buildFilters(filters);
    const limit  = parseInt(filters.partyLimit)  || 10;
    const offset = parseInt(filters.partyOffset) || 0;

    const query = `
      SELECT
        od.customer_name,
        od.customer_type,
        COUNT(DISTINCT od.id)                                                                AS total_orders,
        COUNT(DISTINCT CASE WHEN od.created_at::date = CURRENT_DATE THEN od.id END)         AS orders_today,
        COUNT(DISTINCT CASE WHEN od.actual_3 IS NULL THEN od.id END)                        AS pre_dispatch_pending,
        COUNT(DISTINCT CASE WHEN DATE_TRUNC('month',od.created_at) = DATE_TRUNC('month',NOW()) THEN od.id END) AS this_month,
        COALESCE(SUM(od.total_amount_with_gst), 0)                                          AS total_value,
        MAX(od.party_credit_status)                                                          AS credit_status,
        MAX(od.created_at)                                                                   AS last_order_at,
        COUNT(*) OVER()                                                                      AS full_count
      FROM order_dispatch od
      ${odWhere}
      GROUP BY od.customer_name, od.customer_type
      ORDER BY orders_today DESC, pre_dispatch_pending DESC, total_orders DESC
      LIMIT $${lastIdx} OFFSET $${lastIdx + 1}
    `;

    const res = await db.query(query, [...params, limit, offset]);

    return {
      data: res.rows.map(r => ({
        customerName:       r.customer_name,
        customerType:       r.customer_type,
        totalOrders:        parseInt(r.total_orders)         || 0,
        ordersToday:        parseInt(r.orders_today)         || 0,
        preDispatchPending: parseInt(r.pre_dispatch_pending) || 0,
        thisMonth:          parseInt(r.this_month)           || 0,
        totalValue:         parseFloat(r.total_value)        || 0,
        creditStatus:       r.credit_status || null,
        lastOrderAt:        r.last_order_at,
      })),
      total: parseInt(res.rows[0]?.full_count) || 0
    };
  }

  // ─────────────────────────────────────────────
  // SECTION E — Oil Type View
  // ─────────────────────────────────────────────
  async getOilTypeView(filters = {}) {
    const { odAnd, params } = this.buildFilters(filters);

    const query = `
      SELECT
        od.oil_type,
        COUNT(DISTINCT od.id)                                                             AS total_orders,
        COUNT(DISTINCT CASE WHEN od.created_at::date = CURRENT_DATE THEN od.id END)      AS new_today,
        COUNT(DISTINCT CASE WHEN od.actual_3 IS NULL THEN od.id END)                     AS pre_dispatch_pending,
        COALESCE(SUM(od.order_quantity), 0)                                               AS total_qty,
        COALESCE(SUM(od.total_amount_with_gst), 0)                                       AS total_value
      FROM order_dispatch od
      WHERE od.oil_type IS NOT NULL AND od.oil_type != '' ${odAnd}
      GROUP BY od.oil_type
      ORDER BY total_orders DESC
    `;

    const lrcQuery = `
      SELECT od.oil_type,
        COUNT(*)                                                                            AS dispatched_today,
        COALESCE(SUM(lrc.qty_to_be_dispatched), 0)                                         AS qty_dispatched_today
      FROM lift_receiving_confirmation lrc
      JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.actual_1::date = CURRENT_DATE AND od.oil_type IS NOT NULL ${odAnd}
      GROUP BY od.oil_type
    `;

    const gateOutQuery = `
      SELECT od.oil_type,
        COUNT(*) AS gate_out_today
      FROM lift_receiving_confirmation lrc
      JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.actual_7::date = CURRENT_DATE AND od.oil_type IS NOT NULL ${odAnd}
      GROUP BY od.oil_type
    `;

    const [mainRes, lrcRes, gateRes] = await Promise.all([
      db.query(query, params),
      db.query(lrcQuery, params),
      db.query(gateOutQuery, params),
    ]);

    const lrcMap  = {};
    const gateMap = {};
    lrcRes.rows.forEach(r => { lrcMap[r.oil_type]  = { dispatched: parseInt(r.dispatched_today)||0, qty: parseFloat(r.qty_dispatched_today)||0 }; });
    gateRes.rows.forEach(r => { gateMap[r.oil_type] = parseInt(r.gate_out_today)||0; });

    return mainRes.rows.map(r => ({
      oilType:            r.oil_type,
      totalOrders:        parseInt(r.total_orders)         || 0,
      newToday:           parseInt(r.new_today)            || 0,
      preDispatchPending: parseInt(r.pre_dispatch_pending) || 0,
      totalQty:           parseFloat(r.total_qty)          || 0,
      totalValue:         parseFloat(r.total_value)        || 0,
      dispatchedToday:    lrcMap[r.oil_type]?.dispatched   || 0,
      qtyDispatchedToday: lrcMap[r.oil_type]?.qty          || 0,
      gateOutToday:       gateMap[r.oil_type]              || 0,
    }));
  }

  // ─────────────────────────────────────────────
  // SECTION H — Aging Report (top 60 most stuck)
  // ─────────────────────────────────────────────
  async getAgingReport(filters = {}) {
    const { odAnd, params, lastIdx } = this.buildFilters(filters);
    const limit  = parseInt(filters.agingLimit)  || 10;
    const offset = parseInt(filters.agingOffset) || 0;

    const odQuery = `
      SELECT
        od.order_no, od.customer_name, od.oil_type, od.depo_name AS depot,
        od.order_type, od.order_quantity, od.sku_name, od.uom,
        CASE
          WHEN od.planned_1 IS NOT NULL AND od.actual_1 IS NULL THEN 'Pre Approval'
          WHEN od.planned_2 IS NOT NULL AND od.actual_2 IS NULL THEN 'Order Approval'
          WHEN od.planned_3 IS NOT NULL AND od.actual_3 IS NULL THEN 'Dispatch Planning'
        END AS current_stage,
        CASE
          WHEN od.planned_1 IS NOT NULL AND od.actual_1 IS NULL THEN od.planned_1::timestamptz
          WHEN od.planned_2 IS NOT NULL AND od.actual_2 IS NULL THEN od.planned_2::timestamptz
          WHEN od.planned_3 IS NOT NULL AND od.actual_3 IS NULL THEN od.planned_3::timestamptz
        END AS stage_entered_at,
        EXTRACT(EPOCH FROM (NOW() - CASE
          WHEN od.planned_1 IS NOT NULL AND od.actual_1 IS NULL THEN od.planned_1::timestamptz
          WHEN od.planned_2 IS NOT NULL AND od.actual_2 IS NULL THEN od.planned_2::timestamptz
          WHEN od.planned_3 IS NOT NULL AND od.actual_3 IS NULL THEN od.planned_3::timestamptz
        END)) / 60 AS pending_minutes
      FROM order_dispatch od
      WHERE (
        (od.planned_1 IS NOT NULL AND od.actual_1 IS NULL) OR
        (od.planned_2 IS NOT NULL AND od.actual_2 IS NULL) OR
        (od.planned_3 IS NOT NULL AND od.actual_3 IS NULL)
      ) ${odAnd}
    `;

    const lrcQuery = `
      SELECT
        od.order_no, od.customer_name, od.oil_type, od.depo_name AS depot,
        od.order_type, lrc.qty_to_be_dispatched AS order_quantity, od.sku_name, od.uom,
        CASE
          WHEN lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL THEN 'Actual Dispatch'
          WHEN lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL THEN 'Security Approval'
          WHEN lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL THEN 'Make Invoice'
          WHEN lrc.planned_6 IS NOT NULL AND lrc.actual_6 IS NULL THEN 'Check Invoice'
          WHEN lrc.planned_7 IS NOT NULL AND lrc.actual_7 IS NULL THEN 'Gate Out'
          WHEN lrc.planned_8 IS NOT NULL AND lrc.actual_8 IS NULL THEN 'Material Receipt'
        END AS current_stage,
        CASE
          WHEN lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL THEN lrc.planned_1
          WHEN lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL THEN lrc.planned_4
          WHEN lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL THEN lrc.planned_5
          WHEN lrc.planned_6 IS NOT NULL AND lrc.actual_6 IS NULL THEN lrc.planned_6
          WHEN lrc.planned_7 IS NOT NULL AND lrc.actual_7 IS NULL THEN lrc.planned_7
          WHEN lrc.planned_8 IS NOT NULL AND lrc.actual_8 IS NULL THEN lrc.planned_8
        END AS stage_entered_at,
        EXTRACT(EPOCH FROM (NOW() - CASE
          WHEN lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL THEN lrc.planned_1
          WHEN lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL THEN lrc.planned_4
          WHEN lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL THEN lrc.planned_5
          WHEN lrc.planned_6 IS NOT NULL AND lrc.actual_6 IS NULL THEN lrc.planned_6
          WHEN lrc.planned_7 IS NOT NULL AND lrc.actual_7 IS NULL THEN lrc.planned_7
          WHEN lrc.planned_8 IS NOT NULL AND lrc.actual_8 IS NULL THEN lrc.planned_8
        END)) / 60 AS pending_minutes
      FROM lift_receiving_confirmation lrc
      JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.actual_8 IS NULL AND (
        (lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL) OR
        (lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL) OR
        (lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL) OR
        (lrc.planned_6 IS NOT NULL AND lrc.actual_6 IS NULL) OR
        (lrc.planned_7 IS NOT NULL AND lrc.actual_7 IS NULL) OR
        (lrc.planned_8 IS NOT NULL AND lrc.actual_8 IS NULL)
      ) ${odAnd}
    `;

    const [odRes, lrcRes] = await Promise.all([
      db.query(odQuery, params),
      db.query(lrcQuery, params),
    ]);

    const all = [...odRes.rows, ...lrcRes.rows];
    all.sort((a, b) => (parseFloat(b.pending_minutes)||0) - (parseFloat(a.pending_minutes)||0));

    const total = all.length;
    const paginated = all.slice(offset, offset + limit);

    return {
      data: paginated.map(r => {
        const mins  = parseFloat(r.pending_minutes) || 0;
        const days  = Math.floor(mins / 1440);
        const hrs   = Math.floor((mins % 1440) / 60);
        const m     = Math.floor(mins % 60);
        const duration = days > 0 ? `${days}d ${hrs}h` : hrs > 0 ? `${hrs}h ${m}m` : `${m}m`;

        let bracket = 'fresh';
        if      (mins > 7 * 1440) bracket = 'severe';
        else if (mins > 3 * 1440) bracket = 'critical';
        else if (mins > 1440)     bracket = 'delayed';
        else if (mins > 240)      bracket = 'normal';

        return {
          orderNo:         r.order_no,
          customerName:    r.customer_name,
          oilType:         r.oil_type,
          depot:           r.depot,
          orderType:       r.order_type,
          quantity:        parseFloat(r.order_quantity) || 0,
          uom:             r.uom || 'Unit',
          skuName:         r.sku_name,
          currentStage:    r.current_stage,
          stageEnteredAt:  r.stage_entered_at,
          pendingMinutes:  Math.round(mins),
          pendingDuration: duration,
          agingBracket:    bracket,
        };
      }),
      total
    };
  }

  // ─────────────────────────────────────────────
  // SECTION I — Order Type Breakdown
  // ─────────────────────────────────────────────
  async getOrderTypeBreakdown(filters = {}) {
    const { odAnd, params } = this.buildFilters(filters);

    const query = `
      SELECT
        od.order_type,
        COUNT(DISTINCT od.id)                                                                         AS total_orders,
        COUNT(DISTINCT CASE WHEN od.created_at::date = CURRENT_DATE THEN od.id END)                  AS created_today,
        COUNT(DISTINCT CASE WHEN od.actual_3 IS NULL THEN od.id END)                                 AS pre_dispatch,
        COALESCE(SUM(od.total_amount_with_gst), 0)                                                   AS total_value
      FROM order_dispatch od
      WHERE od.order_type IS NOT NULL ${odAnd}
      GROUP BY od.order_type
      ORDER BY total_orders DESC
    `;

    const res = await db.query(query, params);

    return res.rows.map(r => ({
      orderType:    r.order_type,
      totalOrders:  parseInt(r.total_orders)  || 0,
      createdToday: parseInt(r.created_today) || 0,
      preDispatch:  parseInt(r.pre_dispatch)  || 0,
      totalValue:   parseFloat(r.total_value) || 0,
    }));
  }

  // ─────────────────────────────────────────────
  // Depots list (for filter dropdown)
  // ─────────────────────────────────────────────
  async getDepots() {
    const res = await db.query(
      `SELECT DISTINCT depo_name FROM order_dispatch WHERE depo_name IS NOT NULL AND depo_name != '' ORDER BY depo_name`
    );
    return res.rows.map(r => r.depo_name);
  }

  // ─────────────────────────────────────────────
  // MAIN — Full dashboard (all sections in parallel)
  // ─────────────────────────────────────────────
  async getFullDashboard(filters = {}) {
    try {
      const [kpi, todayActivity, stagePipeline, userActivity, partyView, oilTypeView, agingReport, orderTypeBreakdown, depots] =
        await Promise.all([
          this.getKPI(filters),
          this.getTodayActivity(filters),
          this.getStagePipeline(filters),
          this.getUserActivity(filters),
          this.getPartyView(filters),
          this.getOilTypeView(filters),
          this.getAgingReport(filters),
          this.getOrderTypeBreakdown(filters),
          this.getDepots(),
        ]);

      return { kpi, todayActivity, stagePipeline, userActivity, partyView, oilTypeView, agingReport, orderTypeBreakdown, depots };
    } catch (err) {
      Logger.error('Error fetching owner dashboard', err);
      throw err;
    }
  }
}

module.exports = new OwnerDashboardService();
