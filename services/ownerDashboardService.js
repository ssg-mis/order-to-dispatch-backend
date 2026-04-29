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

    // Robust revenue calculation: Use total_amount_with_gst, or calculate from qty * (best available rate)
    const revExpr = `COALESCE(NULLIF(od.total_amount_with_gst, 0), (COALESCE(od.order_quantity, 0) * COALESCE(od.final_rate, od.rate_per_ltr, od.rate_per_15kg, od.rate_of_material, od.approval_rate_of_material, 0)))`;

    const revenueQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN od.created_at::date = CURRENT_DATE THEN ${revExpr} END), 0) AS daily_revenue,
        COALESCE(SUM(${revExpr}), 0)                                                      AS total_revenue
      FROM order_dispatch od
      ${odWhere}
    `;

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

    const lrcStatusQuery = `
      SELECT
        COUNT(DISTINCT CASE WHEN lrc.actual_1::date = CURRENT_DATE THEN lrc.so_no END)   AS dispatched_today,
        COUNT(DISTINCT CASE WHEN lrc.actual_7::date = CURRENT_DATE THEN lrc.so_no END)   AS gate_out_today,
        COUNT(DISTINCT CASE WHEN lrc.actual_8::date = CURRENT_DATE THEN lrc.so_no END)   AS delivered_today,
        COUNT(DISTINCT CASE WHEN lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL
              THEN lrc.so_no END)                                                          AS pending_invoices
      FROM lift_receiving_confirmation lrc
      JOIN order_dispatch od ON od.order_no = lrc.so_no
      ${odWhere}
    `;

    const [revRes, odRes, lrcRes] = await Promise.all([
      db.query(revenueQuery, params),
      db.query(odQuery, params),
      db.query(lrcStatusQuery, params),
    ]);

    const rev = revRes.rows[0];
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
      totalAmountToday:      parseFloat(rev.daily_revenue)        || 0,
      totalRevenue:          parseFloat(rev.total_revenue)        || 0,
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
        COALESCE(SUM(CASE WHEN lrc.actual_5::date = CURRENT_DATE THEN od.total_amount_with_gst END), 0)  AS total_bill_today
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

      UNION ALL SELECT 'Security Guard Approval', 5,
        COUNT(*), COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - lrc.planned_4))/60),0), MIN(lrc.planned_4)
      FROM lift_receiving_confirmation lrc JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL ${odAnd}

      UNION ALL SELECT 'Make Invoice (Proforma)', 6,
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

      UNION ALL SELECT 'Confirm Material Receipt', 9,
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
      'Pre Approval':              { label: 'Pre Approval',              pending: parseInt(pending.pre_approval)||0,       completedToday: parseInt(today.pre_approval)||0 },
      'Approval of Order':         { label: 'Approval of Order',         pending: parseInt(pending.order_approval)||0,     completedToday: parseInt(today.order_approval)||0 },
      'Dispatch Planning':         { label: 'Dispatch Planning',         pending: parseInt(pending.dispatch_planning)||0,  completedToday: parseInt(today.dispatch_planning)||0 },
      'Actual Dispatch':           { label: 'Actual Dispatch',           pending: parseInt(pending.actual_dispatch)||0,    completedToday: parseInt(today.actual_dispatch)||0 },
      'Vehicle Details':           { label: 'Vehicle Details',           pending: parseInt(pending.actual_dispatch)||0,    completedToday: parseInt(today.actual_dispatch)||0 },
      'Material Load':             { label: 'Material Load',             pending: parseInt(pending.actual_dispatch)||0,    completedToday: parseInt(today.actual_dispatch)||0 },
      'Security Guard Approval':   { label: 'Security Guard Approval',   pending: parseInt(pending.security_approval)||0,  completedToday: parseInt(today.security_approval)||0 },
      'Make Invoice':              { label: 'Make Invoice (Proforma)',   pending: parseInt(pending.make_invoice)||0,       completedToday: parseInt(today.make_invoice)||0 },
      'Check Invoice':             { label: 'Check Invoice',             pending: parseInt(pending.check_invoice)||0,      completedToday: parseInt(today.check_invoice)||0 },
      'Gate Out':                  { label: 'Gate Out',                  pending: parseInt(pending.gate_out)||0,           completedToday: parseInt(today.gate_out)||0 },
      'Confirm Material Receipt':  { label: 'Confirm Material Receipt',  pending: parseInt(pending.material_receipt)||0,   completedToday: parseInt(today.material_receipt)||0 },
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
  // SECTION C — User Detail (Eye Icon Drill-Down)
  // ─────────────────────────────────────────────
  async getUserDetail(userId, filters = {}) {
    const { odAnd, params } = this.buildFilters(filters);

    // Fetch user info
    const userRes = await db.query(
      `SELECT id, username, page_access, status FROM login WHERE id = $1`,
      [userId]
    );
    if (!userRes.rows[0]) throw new Error('User not found');

    const user = userRes.rows[0];
    let pageAccess = user.page_access;
    if (typeof pageAccess === 'string') {
      try { pageAccess = JSON.parse(pageAccess); } catch { pageAccess = []; }
    }
    const pages = Array.isArray(pageAccess) ? pageAccess : Object.keys(pageAccess || {});

    // OD-based stages (order_dispatch table)
    const OD_STAGES = {
      'Pre Approval':    { planned: 'planned_1', actual: 'actual_1', label: 'Pre Approval',     prevActual: null },
      'Approval of Order': { planned: 'planned_2', actual: 'actual_2', label: 'Approval of Order', prevActual: 'actual_1' },
      'Dispatch Planning': { planned: 'planned_3', actual: 'actual_3', label: 'Dispatch Planning', prevActual: 'actual_2' },
    };

    // LRC-based stages (lift_receiving_confirmation table)
    const LRC_STAGES = {
      'Actual Dispatch':          { planned: 'planned_1', actual: 'actual_1', label: 'Actual Dispatch',           prevActual: 'od.actual_3' },
      'Vehicle Details':          { planned: 'planned_1', actual: 'actual_1', label: 'Vehicle Details',           prevActual: 'od.actual_3' },
      'Material Load':            { planned: 'planned_1', actual: 'actual_1', label: 'Material Load',             prevActual: 'od.actual_3' },
      'Security Guard Approval':  { planned: 'planned_4', actual: 'actual_4', label: 'Security Guard Approval',   prevActual: 'lrc.actual_1' },
      'Make Invoice':             { planned: 'planned_5', actual: 'actual_5', label: 'Make Invoice (Proforma)',   prevActual: 'lrc.actual_4' },
      'Check Invoice':            { planned: 'planned_6', actual: 'actual_6', label: 'Check Invoice',             prevActual: 'lrc.actual_5' },
      'Gate Out':                 { planned: 'planned_7', actual: 'actual_7', label: 'Gate Out',                  prevActual: 'lrc.actual_6' },
      'Confirm Material Receipt': { planned: 'planned_8', actual: 'actual_8', label: 'Confirm Material Receipt',  prevActual: 'lrc.actual_7' },
    };

    const stageDetails = [];
    let totalOnTime = 0;
    let totalLate   = 0;
    const seenLrcStages = new Set();

    for (const page of pages) {
      if (OD_STAGES[page]) {
        const { planned, actual, label, prevActual } = OD_STAGES[page];
        const stageStartExpr = prevActual
          ? `COALESCE(od.${prevActual}::timestamptz, od.created_at)`
          : `od.created_at`;

        const pendingQ = `
          SELECT
            od.id,
            od.order_no,
            od.customer_name,
            od.order_type,
            od.depo_name,
            od.${planned}::timestamptz                                           AS planned_date,
            od.created_at,
            ROUND(
              EXTRACT(EPOCH FROM (NOW() - od.${planned}::timestamptz)) / 86400
            , 1)                                                                  AS days_overdue,
            GREATEST(0, LEAST(200, ROUND(
              EXTRACT(EPOCH FROM (NOW() - ${stageStartExpr})) /
              NULLIF(EXTRACT(EPOCH FROM (od.${planned}::timestamptz - ${stageStartExpr})), 0) * 100
            , 0)))                                                                AS progress_pct
          FROM order_dispatch od
          WHERE od.${planned} IS NOT NULL
            AND od.${actual}  IS NULL
          ${odAnd}
          ORDER BY od.${planned}::timestamptz ASC
          LIMIT 100
        `;

        const perfQ = `
          SELECT
            COUNT(*) FILTER (WHERE od.${actual}::timestamptz <= od.${planned}::timestamptz) AS on_time,
            COUNT(*) FILTER (WHERE od.${actual}::timestamptz >  od.${planned}::timestamptz) AS late
          FROM order_dispatch od
          WHERE od.${actual} IS NOT NULL
          ${odAnd}
        `;

        const [pendingRes, perfRes] = await Promise.all([
          db.query(pendingQ, params),
          db.query(perfQ, params),
        ]);

        const onTime = parseInt(perfRes.rows[0]?.on_time) || 0;
        const late   = parseInt(perfRes.rows[0]?.late)    || 0;
        totalOnTime += onTime;
        totalLate   += late;

        stageDetails.push({
          label,
          pending: pendingRes.rows.map(r => ({
            id:          r.id,
            orderNo:     r.order_no,
            customer:    r.customer_name,
            orderType:   r.order_type,
            depot:       r.depo_name,
            plannedDate: r.planned_date,
            createdAt:   r.created_at,
            daysOverdue: parseFloat(r.days_overdue) || 0,
            progressPct: parseFloat(r.progress_pct) || 0,
          })),
          onTime,
          late,
        });
      } else if (LRC_STAGES[page]) {
        const { planned, actual, label, prevActual } = LRC_STAGES[page];
        const stageStartExpr = `COALESCE(${prevActual}${prevActual.includes('od.') ? '::timestamptz' : ''}, od.created_at)`;
        // Deduplicate LRC stages that share the same planned/actual columns
        const key = `${planned}_${actual}`;
        if (seenLrcStages.has(key)) continue;
        seenLrcStages.add(key);

        const pendingQ = `
          SELECT
            od.id,
            od.order_no,
            od.customer_name,
            od.order_type,
            od.depo_name,
            lrc.${planned}                                                         AS planned_date,
            od.created_at,
            ROUND(EXTRACT(EPOCH FROM (NOW() - lrc.${planned})) / 86400, 1)        AS days_overdue,
            GREATEST(0, LEAST(200, ROUND(
              EXTRACT(EPOCH FROM (NOW() - ${stageStartExpr})) /
              NULLIF(EXTRACT(EPOCH FROM (lrc.${planned} - ${stageStartExpr})), 0) * 100
            , 0)))                                                                AS progress_pct
          FROM lift_receiving_confirmation lrc
          JOIN order_dispatch od ON od.order_no = lrc.so_no
          WHERE lrc.${planned} IS NOT NULL
            AND lrc.${actual}  IS NULL
          ${odAnd}
          ORDER BY lrc.${planned} ASC
          LIMIT 100
        `;

        const perfQ = `
          SELECT
            COUNT(*) FILTER (WHERE lrc.${actual} <= lrc.${planned}) AS on_time,
            COUNT(*) FILTER (WHERE lrc.${actual} >  lrc.${planned}) AS late
          FROM lift_receiving_confirmation lrc
          JOIN order_dispatch od ON od.order_no = lrc.so_no
          WHERE lrc.${actual} IS NOT NULL
          ${odAnd}
        `;

        const [pendingRes, perfRes] = await Promise.all([
          db.query(pendingQ, params),
          db.query(perfQ, params),
        ]);

        const onTime = parseInt(perfRes.rows[0]?.on_time) || 0;
        const late   = parseInt(perfRes.rows[0]?.late)    || 0;
        totalOnTime += onTime;
        totalLate   += late;

        stageDetails.push({
          label,
          pending: pendingRes.rows.map(r => ({
            id:          r.id,
            orderNo:     r.order_no,
            customer:    r.customer_name,
            orderType:   r.order_type,
            depot:       r.depo_name,
            plannedDate: r.planned_date,
            createdAt:   r.created_at,
            daysOverdue: parseFloat(r.days_overdue) || 0,
            progressPct: parseFloat(r.progress_pct) || 0,
          })),
          onTime,
          late,
        });
      }
    }

    const totalCompleted = totalOnTime + totalLate;
    return {
      userId:     user.id,
      username:   user.username,
      pageAccess: pages,
      stageDetails,
      performance: {
        totalOnTime,
        totalLate,
        totalCompleted,
        onTimePct: totalCompleted > 0 ? Math.round((totalOnTime / totalCompleted) * 100) : 0,
      },
    };
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
        COUNT(DISTINCT CASE WHEN lrc.actual_8 IS NULL THEN od.id END)                        AS pre_dispatch_pending,
        COUNT(DISTINCT CASE WHEN DATE_TRUNC('month',od.created_at) = DATE_TRUNC('month',NOW()) THEN od.id END) AS this_month,
        COALESCE(SUM(od.total_amount_with_gst), 0)                                          AS total_value,
        MAX(od.party_credit_status)                                                          AS credit_status,
        MAX(od.created_at)                                                                   AS last_order_at,
        COUNT(*) OVER()                                                                      AS full_count
      FROM order_dispatch od
      LEFT JOIN lift_receiving_confirmation lrc ON od.order_no = lrc.so_no
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

    const revExpr = `COALESCE(od.total_amount_with_gst, (COALESCE(od.order_quantity, 0) * COALESCE(od.final_rate, od.approval_rate_of_material, 0)))`;
    const query = `
      SELECT
        od.oil_type,
        COUNT(DISTINCT od.id)                                                             AS total_orders,
        COUNT(DISTINCT CASE WHEN od.created_at::date = CURRENT_DATE THEN od.id END)      AS new_today,
        COUNT(DISTINCT CASE WHEN lrc.actual_8 IS NULL THEN od.id END)                     AS pre_dispatch_pending,
        COALESCE(SUM(od.order_quantity), 0)                                               AS total_qty,
        COALESCE(SUM(${revExpr}), 0)                                                      AS total_value
      FROM order_dispatch od
      LEFT JOIN lift_receiving_confirmation lrc ON od.order_no = lrc.so_no
      WHERE od.oil_type IS NOT NULL AND od.oil_type != '' ${odAnd}
      GROUP BY od.oil_type
      ORDER BY total_orders DESC
    `;

    const res = await db.query(query, params);

    return res.rows.map(r => ({
      oilType:            r.oil_type,
      totalOrders:        parseInt(r.total_orders)         || 0,
      newToday:           parseInt(r.new_today)            || 0,
      preDispatchPending: parseInt(r.pre_dispatch_pending) || 0,
      totalQty:           parseFloat(r.total_qty)          || 0,
      totalValue:         parseFloat(r.total_value)        || 0,
    }));
  }

  // ─────────────────────────────────────────────
  // SECTION H — Aging Report (top 60 most stuck)
  // ─────────────────────────────────────────────
  async getAgingReport(filters = {}) {
    const { odAnd, params, lastIdx } = this.buildFilters(filters);
    const limit  = parseInt(filters.limit)  || 20;
    const offset = parseInt(filters.offset) || 0;
    const search = filters.search ? filters.search.trim() : null;

    let searchAnd = '';
    let searchParams = [...params];
    let nextIdx = lastIdx;

    if (search) {
      searchAnd = `AND (od.order_no ILIKE $${nextIdx} OR od.customer_name ILIKE $${nextIdx})`;
      searchParams.push(`%${search}%`);
      nextIdx++;
    }

    const odQuery = `
      SELECT
        od.order_no, od.customer_name, od.oil_type, od.depo_name AS depot, od.order_type,
        od.order_quantity, od.uom, COALESCE(od.sku_name, od.product_name) AS sku_name,
        CASE
          WHEN od.planned_1 IS NOT NULL AND od.actual_1 IS NULL THEN 'Pre Approval'
          WHEN od.planned_2 IS NOT NULL AND od.actual_2 IS NULL THEN 'Approval of Order'
          WHEN od.planned_3 IS NOT NULL AND od.actual_3 IS NULL THEN 'Dispatch Planning'
        END AS current_stage,
        CASE
          WHEN od.planned_1 IS NOT NULL AND od.actual_1 IS NULL THEN od.created_at
          WHEN od.planned_2 IS NOT NULL AND od.actual_2 IS NULL THEN od.actual_1::timestamptz
          WHEN od.planned_3 IS NOT NULL AND od.actual_3 IS NULL THEN od.actual_2::timestamptz
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
      ) ${odAnd} ${searchAnd}
    `;

    const lrcQuery = `
      SELECT
        od.order_no, od.customer_name, od.oil_type, od.depo_name AS depot, od.order_type,
        od.order_quantity, od.uom, COALESCE(od.sku_name, od.product_name) AS sku_name,
        CASE
          WHEN lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL THEN 'Actual Dispatch'
          WHEN lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL THEN 'Security Guard Approval'
          WHEN lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL THEN 'Make Invoice (Proforma)'
          WHEN lrc.planned_6 IS NOT NULL AND lrc.actual_6 IS NULL THEN 'Check Invoice'
          WHEN lrc.planned_7 IS NOT NULL AND lrc.actual_7 IS NULL THEN 'Gate Out'
          WHEN lrc.planned_8 IS NOT NULL AND lrc.actual_8 IS NULL THEN 'Confirm Material Receipt'
        END AS current_stage,
        CASE
          WHEN lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL THEN od.actual_3::timestamptz
          WHEN lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL THEN lrc.actual_1
          WHEN lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL THEN lrc.actual_4
          WHEN lrc.planned_6 IS NOT NULL AND lrc.actual_6 IS NULL THEN lrc.actual_5
          WHEN lrc.planned_7 IS NOT NULL AND lrc.actual_7 IS NULL THEN lrc.actual_6
          WHEN lrc.planned_8 IS NOT NULL AND lrc.actual_8 IS NULL THEN lrc.actual_7
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
      ) ${odAnd} ${searchAnd}
    `;

    const [odRes, lrcRes] = await Promise.all([
      db.query(odQuery, searchParams),
      db.query(lrcQuery, searchParams),
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
  // DRILL-DOWN A — Customer Orders
  // ─────────────────────────────────────────────
  async getCustomerOrders(customerName, filters = {}) {
    const { odAnd, params, lastIdx } = this.buildFilters(filters);

    const revExpr = `COALESCE(NULLIF(od.total_amount_with_gst, 0), (COALESCE(od.order_quantity, 0) * COALESCE(od.final_rate, od.rate_per_ltr, od.rate_per_15kg, od.rate_of_material, od.approval_rate_of_material, 0)))`;
    const query = `
      SELECT
        od.order_no AS "orderNo",
        od.order_type AS "orderType",
        od.oil_type AS "oilType",
        COALESCE(od.sku_name, od.product_name) AS "skuName",
        od.depo_name AS "depot",
        od.order_quantity AS "quantity",
        od.uom,
        ${revExpr} AS "amount",
        od.party_credit_status AS "partyCreditStatus",
        od.created_at AS "createdAt",
        CASE
          WHEN lrc.actual_8 IS NOT NULL                               THEN 'Confirm Material Receipt'
          WHEN lrc.actual_7 IS NOT NULL                               THEN 'Gate Out'
          WHEN lrc.actual_6 IS NOT NULL                               THEN 'Check Invoice'
          WHEN lrc.actual_5 IS NOT NULL                               THEN 'Make Invoice (Proforma)'
          WHEN lrc.actual_4 IS NOT NULL                               THEN 'Security Guard Approval'
          WHEN lrc.actual_1 IS NOT NULL                               THEN 'Actual Dispatch'
          WHEN od.actual_3   IS NOT NULL                              THEN 'Dispatch Planning'
          WHEN od.actual_2   IS NOT NULL                              THEN 'Approval of Order'
          WHEN od.actual_1   IS NOT NULL                              THEN 'Pre Approval'
          ELSE 'Awaiting Pre Approval'
        END AS "currentStage",
        CASE
          WHEN lrc.actual_8 IS NOT NULL THEN 'completed'
          WHEN (
            (od.planned_1 IS NOT NULL AND od.actual_1 IS NULL) OR
            (od.planned_2 IS NOT NULL AND od.actual_2 IS NULL) OR
            (od.planned_3 IS NOT NULL AND od.actual_3 IS NULL) OR
            (lrc.planned_1 IS NOT NULL AND lrc.actual_1 IS NULL) OR
            (lrc.planned_4 IS NOT NULL AND lrc.actual_4 IS NULL) OR
            (lrc.planned_5 IS NOT NULL AND lrc.actual_5 IS NULL) OR
            (lrc.planned_6 IS NOT NULL AND lrc.actual_6 IS NULL) OR
            (lrc.planned_7 IS NOT NULL AND lrc.actual_7 IS NULL) OR
            (lrc.planned_8 IS NOT NULL AND lrc.actual_8 IS NULL)
          ) THEN 'pending'
          ELSE 'in_progress'
        END AS status
      FROM order_dispatch od
      LEFT JOIN lift_receiving_confirmation lrc ON od.order_no = lrc.so_no
      WHERE od.customer_name = $${lastIdx} ${odAnd}
      ORDER BY od.created_at DESC
      LIMIT 100
    `;

    const res = await db.query(query, [...params, customerName]);
    return res.rows.map(r => ({
      orderNo:       r.orderNo,
      orderType:     r.orderType,
      oilType:       r.oilType,
      skuName:       r.skuName,
      depot:         r.depot,
      quantity:      parseFloat(r.quantity) || 0,
      uom:           r.uom,
      amount:        parseFloat(r.amount)   || 0,
      creditStatus:  r.partyCreditStatus,
      createdAt:     r.createdAt,
      currentStage:  r.currentStage,
      status:        r.status,
    }));
  }

  // ─────────────────────────────────────────────
  // DRILL-DOWN B — Order Journey (full timeline)
  // ─────────────────────────────────────────────
  async getOrderJourney(orderNo) {
    const revExpr = `COALESCE(NULLIF(od.total_amount_with_gst, 0), (COALESCE(od.order_quantity, 0) * COALESCE(od.final_rate, od.rate_per_ltr, od.rate_per_15kg, od.rate_of_material, od.approval_rate_of_material, 0)))`;
    const [odRes, lrcRes] = await Promise.all([
      db.query(
        `SELECT od.order_no AS "orderNo", od.customer_name AS "customerName", od.order_type AS "orderType", 
                od.oil_type AS "oilType", COALESCE(od.sku_name, od.product_name) AS "skuName", od.depo_name AS "depot",
                od.order_quantity AS "quantity", od.uom, ${revExpr} AS "amount", 
                od.party_credit_status AS "partyCreditStatus", od.created_at AS "createdAt",
                od.planned_1, od.actual_1, od.planned_2, od.actual_2, od.planned_3, od.actual_3,
                od.order_punch_user, od.pre_approval_user, od.order_approval_user, od.dispatch_planning_user
         FROM order_dispatch od WHERE od.order_no = $1`, [orderNo]
      ),
      db.query(
        `SELECT planned_1, actual_1, planned_4, actual_4, planned_5, actual_5,
                planned_6, actual_6, planned_7, actual_7, planned_8, actual_8,
                qty_to_be_dispatched,
                actual_dispatch_user, security_guard_user, make_invoice_user, 
                check_invoice_user, gate_out_user, material_receipt_user
         FROM lift_receiving_confirmation WHERE so_no = $1`, [orderNo]
      ),
    ]);

    if (!odRes.rows[0]) throw new Error('Order not found');
    const od  = odRes.rows[0];
    const lrc = lrcRes.rows[0] || {};

    const mkStage = (label, planned, actual, user = null, cast = false) => {
      const p = planned ? (cast ? new Date(planned + 'Z').toISOString() : new Date(planned).toISOString()) : null;
      const a = actual  ? (cast ? new Date(actual  + 'Z').toISOString() : new Date(actual).toISOString())  : null;
      const status = !p ? 'not_started' : a ? 'done' : 'pending';
      const onTime = (p && a) ? new Date(a) <= new Date(p) : null;
      const overdueDays = (p && !a) ? Math.round((Date.now() - new Date(p)) / 86400000 * 10) / 10 : null;
      return { label, plannedAt: p, actualAt: a, status, onTime, overdueDays, responsible: user || '—' };
    };

    const stages = [
      mkStage('Order Punching',    od.createdAt,  od.createdAt, od.order_punch_user),
      mkStage('Pre Approval',      od.planned_1,  od.actual_1,  od.pre_approval_user, true),
      mkStage('Order Approval',    od.planned_2,  od.actual_2,  od.order_approval_user, true),
      mkStage('Dispatch Planning', od.planned_3,  od.actual_3,  od.dispatch_planning_user, true),
      mkStage('Actual Dispatch',   lrc.planned_1, lrc.actual_1, lrc.actual_dispatch_user),
      mkStage('Security Approval', lrc.planned_4, lrc.actual_4, lrc.security_guard_user),
      mkStage('Make Invoice',      lrc.planned_5, lrc.actual_5, lrc.make_invoice_user),
      mkStage('Check Invoice',     lrc.planned_6, lrc.actual_6, lrc.check_invoice_user),
      mkStage('Gate Out',          lrc.planned_7, lrc.actual_7, lrc.gate_out_user),
      mkStage('Material Receipt',  lrc.planned_8, lrc.actual_8, lrc.material_receipt_user),
    ];

    return {
      orderNo:      od.orderNo,
      customer:     od.customerName,
      orderType:    od.orderType,
      oilType:      od.oilType,
      skuName:      od.skuName,
      depot:        od.depot,
      quantity:     parseFloat(od.quantity) || 0,
      uom:          od.uom,
      amount:       parseFloat(od.amount) || 0,
      creditStatus: od.partyCreditStatus,
      createdAt:    od.createdAt,
      dispatchQty:  parseFloat(lrc.qty_to_be_dispatched) || 0,
      stages,
    };
  }

  // ─────────────────────────────────────────────
  // DRILL-DOWN C — Stage Orders (pipeline click)
  // ─────────────────────────────────────────────
  async getStageOrders(stageName, filters = {}) {
    const { odAnd, params } = this.buildFilters(filters);

    const OD_STAGE_MAP = {
      'Pre Approval':    { table: 'od', planned: 'planned_1', actual: 'actual_1' },
      'Order Approval':  { table: 'od', planned: 'planned_2', actual: 'actual_2' },
      'Dispatch Planning':{ table: 'od', planned: 'planned_3', actual: 'actual_3' },
    };
    const LRC_STAGE_MAP = {
      'Actual Dispatch':   { planned: 'planned_1', actual: 'actual_1' },
      'Security Approval': { planned: 'planned_4', actual: 'actual_4' },
      'Make Invoice':      { planned: 'planned_5', actual: 'actual_5' },
      'Check Invoice':     { planned: 'planned_6', actual: 'actual_6' },
      'Gate Out':          { planned: 'planned_7', actual: 'actual_7' },
      'Material Receipt':  { planned: 'planned_8', actual: 'actual_8' },
    };

    let rows = [];

    const revExpr = `COALESCE(NULLIF(od.total_amount_with_gst, 0), (COALESCE(od.order_quantity, 0) * COALESCE(od.final_rate, od.rate_per_ltr, od.rate_per_15kg, od.rate_of_material, od.approval_rate_of_material, 0)))`;
    if (OD_STAGE_MAP[stageName]) {
      const { planned, actual } = OD_STAGE_MAP[stageName];
      const res = await db.query(`
        SELECT od.order_no AS "orderNo", 
               od.customer_name AS "customer", 
               od.oil_type AS "oilType", 
               COALESCE(od.sku_name, od.product_name) AS "skuName", 
               od.depo_name AS "depot",
               od.order_quantity AS "quantity", 
               od.uom, 
               ${revExpr} AS "amount",
               od.${planned}::timestamptz AS "plannedAt",
               od.created_at AS "createdAt",
               ROUND(EXTRACT(EPOCH FROM (NOW() - od.${planned}::timestamptz)) / 86400, 1) AS "daysOverdue"
        FROM order_dispatch od
        WHERE od.${planned} IS NOT NULL AND od.${actual} IS NULL
        ${odAnd}
        ORDER BY od.${planned}::timestamptz ASC
        LIMIT 200
      `, params);
      rows = res.rows;
    } else if (LRC_STAGE_MAP[stageName]) {
      const { planned, actual } = LRC_STAGE_MAP[stageName];
      const res = await db.query(`
        SELECT od.order_no AS "orderNo", 
               od.customer_name AS "customer", 
               od.oil_type AS "oilType", 
               COALESCE(od.sku_name, od.product_name) AS "skuName", 
               od.depo_name AS "depot",
               lrc.qty_to_be_dispatched AS "quantity", 
               od.uom,
               ${revExpr} AS "amount",
               lrc.${planned} AS "plannedAt",
               od.created_at AS "createdAt",
               ROUND(EXTRACT(EPOCH FROM (NOW() - lrc.${planned})) / 86400, 1) AS "daysOverdue"
        FROM lift_receiving_confirmation lrc
        JOIN order_dispatch od ON od.order_no = lrc.so_no
        WHERE lrc.${planned} IS NOT NULL AND lrc.${actual} IS NULL
        ${odAnd}
        ORDER BY lrc.${planned} ASC
        LIMIT 200
      `, params);
      rows = res.rows;
    }

    return rows.map(r => ({
      orderNo:     r.orderNo,
      customer:    r.customer,
      oilType:     r.oilType,
      skuName:     r.skuName,
      depot:       r.depot,
      quantity:    parseFloat(r.quantity) || 0,
      uom:         r.uom,
      amount:      parseFloat(r.amount) || 0,
      plannedAt:   r.plannedAt,
      createdAt:   r.createdAt,
      daysOverdue: parseFloat(r.daysOverdue) || 0,
    }));
  }

  // ─────────────────────────────────────────────
  // DRILL-DOWN D — Oil Type Orders
  // ─────────────────────────────────────────────
  async getOilTypeOrders(oilType, filters = {}) {
    const { odAnd, params, lastIdx } = this.buildFilters(filters);
    const revExpr = `COALESCE(NULLIF(od.total_amount_with_gst, 0), (COALESCE(od.order_quantity, 0) * COALESCE(od.final_rate, od.rate_per_ltr, od.rate_per_15kg, od.rate_of_material, od.approval_rate_of_material, 0)))`;
    const res = await db.query(`
      SELECT od.order_no AS "orderNo", 
             od.customer_name AS "customer", 
             od.order_type AS "orderType", 
             COALESCE(od.sku_name, od.product_name) AS "skuName", 
             od.depo_name AS "depot",
             od.order_quantity AS "quantity",
             od.uom,
             ${revExpr} AS "amount",
             od.created_at AS "createdAt",
             CASE
               WHEN lrc.actual_8 IS NOT NULL THEN 'Confirm Material Receipt'
               WHEN lrc.actual_1 IS NOT NULL THEN 'Actual Dispatch'
               WHEN od.actual_3   IS NOT NULL THEN 'Dispatch Planning'
               WHEN od.actual_2   IS NOT NULL THEN 'Approval of Order'
               WHEN od.actual_1   IS NOT NULL THEN 'Pre Approval'
               ELSE 'Awaiting Pre Approval'
             END AS "currentStage"
      FROM order_dispatch od
      LEFT JOIN lift_receiving_confirmation lrc ON od.order_no = lrc.so_no
      WHERE od.oil_type = $${lastIdx} ${odAnd}
      ORDER BY od.created_at DESC
      LIMIT 100
    `, [...params, oilType]);
    return res.rows.map(r => ({
      orderNo:      r.orderNo,
      customer:     r.customer,
      orderType:    r.orderType,
      skuName:      r.skuName,
      depot:        r.depot,
      quantity:     parseFloat(r.quantity) || 0,
      uom:          r.uom,
      amount:       parseFloat(r.amount) || 0,
      createdAt:    r.createdAt,
      currentStage: r.currentStage,
      status:       r.currentStage === 'Confirm Material Receipt' ? 'completed' : 'pending',
    }));
  }

  // ─────────────────────────────────────────────
  // NEW SECTION — Client Frequency Analysis
  // ─────────────────────────────────────────────
  async getClientFrequency(filters = {}) {
    const { odWhere, params } = this.buildFilters(filters);
    const query = `
      SELECT
        od.customer_name,
        COUNT(*) AS order_count,
        COALESCE(SUM(od.total_amount_with_gst), 0) AS total_value
      FROM order_dispatch od
      ${odWhere}
      GROUP BY od.customer_name
      ORDER BY order_count DESC
      LIMIT 10
    `;
    const res = await db.query(query, params);
    return res.rows;
  }

  // ─────────────────────────────────────────────
  // NEW SECTION — Product Frequency Analysis
  // ─────────────────────────────────────────────
  async getProductFrequency(filters = {}) {
    const { odWhere, params } = this.buildFilters(filters);
    const query = `
      SELECT
        od.sku_name,
        od.uom,
        COUNT(DISTINCT od.id) AS order_count,
        COALESCE(SUM(od.order_quantity), 0) AS total_qty
      FROM order_dispatch od
      ${odWhere ? odWhere + ' AND od.sku_name IS NOT NULL' : 'WHERE od.sku_name IS NOT NULL'}
      GROUP BY od.sku_name, od.uom
      ORDER BY order_count DESC
      LIMIT 10
    `;
    const res = await db.query(query, params);
    return res.rows;
  }

  // ─────────────────────────────────────────────
  // NEW SECTION — Delivery Performance
  // ─────────────────────────────────────────────
  async getDeliveryPerformance(filters = {}) {
    const { odAnd, params } = this.buildFilters(filters);
    const query = `
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (lrc.actual_8::timestamp - lrc.actual_1::timestamp)) / 3600), 0) AS avg_delivery_hours,
        COUNT(CASE WHEN EXTRACT(EPOCH FROM (lrc.actual_8::timestamp - lrc.actual_1::timestamp)) / 3600 <= 48 THEN 1 END) * 100.0 / NULLIF(COUNT(lrc.actual_8), 0) AS on_time_percent
      FROM lift_receiving_confirmation lrc
      JOIN order_dispatch od ON od.order_no = lrc.so_no
      WHERE lrc.actual_8 IS NOT NULL AND lrc.actual_1 IS NOT NULL ${odAnd}
    `;
    const res = await db.query(query, params);
    return res.rows[0];
  }

  // ─────────────────────────────────────────────
  // NEW SECTION — Revenue Trends (Last 7 Days)
  // ─────────────────────────────────────────────
  async getRevenueTrends(filters = {}) {
    const { odAnd, params } = this.buildFilters(filters);
    const revExpr = `COALESCE(od.total_amount_with_gst, (COALESCE(od.order_quantity, 0) * COALESCE(od.final_rate, od.approval_rate_of_material, 0)))`;
    const query = `
      SELECT
        d.date::date AS day,
        COALESCE(SUM(${revExpr}), 0) AS revenue
      FROM (SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date AS date) d
      LEFT JOIN order_dispatch od ON od.created_at::date = d.date ${odAnd}
      GROUP BY d.date
      ORDER BY d.date
    `;
    const res = await db.query(query, params);
    return res.rows;
  }

  // ─────────────────────────────────────────────
  // 9. SLA Performance Trends (Average Wait Minutes)
  // ─────────────────────────────────────────────
  async getSlaTrends(filters = {}) {
    const { odAnd, params } = this.buildFilters(filters);
    const query = `
      SELECT
        d.date::date AS day,
        COALESCE(AVG(EXTRACT(EPOCH FROM (lrc.actual_8 - od.created_at))/60), 0)::float AS avg_wait_mins
      FROM (SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date AS date) d
      LEFT JOIN lift_receiving_confirmation lrc ON lrc.actual_8::date = d.date
      LEFT JOIN order_dispatch od ON od.order_no = lrc.so_no ${odAnd}
      GROUP BY d.date
      ORDER BY d.date
    `;
    const res = await db.query(query, params);
    return res.rows;
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
        COUNT(DISTINCT CASE WHEN lrc.actual_8 IS NULL THEN od.id END)                                 AS pre_dispatch,
        COALESCE(SUM(od.total_amount_with_gst), 0)                                                   AS total_value
      FROM order_dispatch od
      LEFT JOIN lift_receiving_confirmation lrc ON od.order_no = lrc.so_no
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
      const [kpi, todayActivity, stagePipeline, userActivity, partyView, oilTypeView, agingReport, orderTypeBreakdown, depots, clientFreq, productFreq, deliveryPerf, revTrends, slaTrends] =
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
          this.getClientFrequency(filters),
          this.getProductFrequency(filters),
          this.getDeliveryPerformance(filters),
          this.getRevenueTrends(filters),
          this.getSlaTrends(filters)
        ]);

      return { kpi, todayActivity, stagePipeline, userActivity, partyView, oilTypeView, agingReport, orderTypeBreakdown, depots, clientFreq, productFreq, deliveryPerf, revTrends, slaTrends };
    } catch (err) {
      Logger.error('Error fetching owner dashboard', err);
      throw err;
    }
  }
}

module.exports = new OwnerDashboardService();
