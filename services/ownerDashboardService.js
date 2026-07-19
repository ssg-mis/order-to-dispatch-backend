/**
 * Owner Dashboard Service — v2 schema.
 *
 * Comprehensive owner analytics (KPIs, today's activity, stage pipeline, per-user
 * workload, party/oil-type views, aging, drill-downs, frequency + trend charts).
 *
 * Rewritten from the old order_dispatch/lift_receiving_confirmation raw-SQL version
 * onto the normalized v2 tables. The mapping mirrors the reports/dashboard ports:
 *
 *   old order_dispatch line   -> order_items oi  (joined to orders o, one o per base DO)
 *   old od.planned_1/actual_1 -> pre_approvals        pa.planned_at / pa.actual_at
 *   old od.planned_2/actual_2 -> order_approvals      oa.planned_at / oa.actual_at
 *   old od.planned_3/actual_3 -> dispatch_plannings   dp.planned_at / dp.actual_at
 *   old lrc shipment          -> dispatches d
 *   old lrc.planned_1/actual_1-> d.planned_at / d.actual_at
 *   old lrc.planned_4/actual_4-> security_guard_checks sg.planned_at / sg.actual_at
 *   old lrc.planned_5/actual_5-> invoices  inv.planned_made_at / inv.made_at
 *   old lrc.planned_6/actual_6-> invoices  inv.planned_checked_at / inv.checked_at
 *   old lrc.planned_7/actual_7-> gate_outs go.planned_at / go.actual_at
 *   old lrc.planned_8/actual_8-> material_receipts mr.planned_at / mr.actual_at
 *   old *_user (usernames)    -> the gate row's *_user_id FK -> users.username
 *
 * v2 clean-ups baked in (same precedent as the other analytics ports):
 *   - No ::timestamptz casts — v2 gate planned/actual columns are real timestamps.
 *   - Base-DO regex regrouping is gone — orders is already one row per base DO
 *     (COUNT(DISTINCT base) -> COUNT(DISTINCT o.id); per-line -> COUNT(DISTINCT oi.id)).
 *   - total_amount_with_gst didn't exist in v2; revenue = qty * best available rate
 *     (the same fallback the old revExpr used when the stored total was 0/null).
 *   - resolveAuditUsers (which read the old login table) is replaced by users JOINs.
 *   - Nothing here touches the old RDS — this was the last service that did.
 *
 * Response shapes are byte-for-byte identical to the old service (the frontend
 * owner-dashboard page reads these exact keys).
 */

const { Logger } = require('../utils');
const { dbV2 } = require('../config/db-v2.ts');
const { sql } = require('drizzle-orm');

// Revenue per order line. No stored total in v2 -> qty * first non-null rate.
const REV = 'COALESCE(oi.order_quantity, 0) * COALESCE(oi.final_rate, oi.rate_per_ltr, oi.rate_per_15kg, oi.rate_of_material, 0)';
const rev = () => sql.raw(REV);

class OwnerDashboardService {

  /**
   * Filter fragments over `orders o`. Returns drizzle sql fragments (values are
   * auto-parameterized): `where` (leading WHERE) and `and` (leading AND).
   */
  buildFilters(filters = {}) {
    const conds = [];
    // depot filter is a real depot_id (not a name) — the getDepots dropdown carries
    // {id,name}, so identity is by FK, never by a name string that could collide.
    if (filters.depot && filters.depot !== 'all') {
      const depotId = parseInt(filters.depot, 10);
      if (Number.isInteger(depotId)) conds.push(sql`o.depot_id = ${depotId}`);
    }
    if (filters.order_type && filters.order_type !== 'all')
      conds.push(sql`o.order_type = ${filters.order_type}`);
    if (filters.date_from)
      conds.push(sql`o.created_at >= ${filters.date_from}`);
    if (filters.date_to)
      conds.push(sql`o.created_at < (${filters.date_to}::date + interval '1 day')`);

    const joined = conds.length ? sql.join(conds, sql` AND `) : null;
    return {
      where: joined ? sql`WHERE ${joined}` : sql``,
      and:   joined ? sql`AND ${joined}`   : sql``,
    };
  }

  // ─────────────────────────────────────────────
  // SECTION A — KPI Bar
  // ─────────────────────────────────────────────
  async getKPI(filters = {}) {
    const { where, and } = this.buildFilters(filters);

    const revenueQuery = dbV2.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN o.created_at::date = CURRENT_DATE THEN ${rev()} END), 0) AS daily_revenue,
        COALESCE(SUM(${rev()}), 0)                                                      AS total_revenue
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      ${where}
    `);

    const odQuery = dbV2.execute(sql`
      SELECT
        COUNT(DISTINCT o.id)                                                              AS total_orders,
        COUNT(DISTINCT CASE WHEN o.created_at::date = CURRENT_DATE THEN o.id END)         AS new_today,
        COUNT(DISTINCT CASE WHEN oa.planned_at IS NOT NULL AND oa.actual_at IS NULL
              THEN oi.id END)                                                             AS pending_approval,
        COUNT(DISTINCT CASE WHEN dp.planned_at IS NOT NULL AND dp.actual_at IS NULL
              THEN oi.id END)                                                             AS pending_dispatch_planning,
        COUNT(DISTINCT CASE WHEN dp.actual_at IS NULL AND o.created_at < NOW() - INTERVAL '24 hours'
              THEN oi.id END)                                                             AS delayed_orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN order_approvals oa ON oa.order_item_id = oi.id
      LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id
      ${where}
    `);

    const lrcStatusQuery = dbV2.execute(sql`
      SELECT
        COUNT(DISTINCT CASE WHEN d.actual_at::date  = CURRENT_DATE THEN o.order_no END) AS dispatched_today,
        COUNT(DISTINCT CASE WHEN go.actual_at::date = CURRENT_DATE THEN o.order_no END) AS gate_out_today,
        COUNT(DISTINCT CASE WHEN mr.actual_at::date = CURRENT_DATE THEN o.order_no END) AS delivered_today,
        COUNT(DISTINCT CASE WHEN inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL
              THEN o.order_no END)                                                       AS pending_invoices
      FROM dispatches d
      JOIN order_items oi ON oi.id = d.order_item_id
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN gate_outs go ON go.dispatch_id = d.id
      LEFT JOIN material_receipts mr ON mr.dispatch_id = d.id
      LEFT JOIN invoices inv ON inv.dispatch_id = d.id
      ${where}
    `);

    const [revRes, odRes, lrcRes] = await Promise.all([revenueQuery, odQuery, lrcStatusQuery]);
    const r = revRes.rows[0], od = odRes.rows[0], lrc = lrcRes.rows[0];

    return {
      totalOrders:             parseInt(od.total_orders)              || 0,
      newToday:                parseInt(od.new_today)                 || 0,
      pendingApproval:         parseInt(od.pending_approval)          || 0,
      pendingDispatchPlanning: parseInt(od.pending_dispatch_planning) || 0,
      delayedOrders:           parseInt(od.delayed_orders)            || 0,
      dispatchedToday:         parseInt(lrc.dispatched_today)         || 0,
      gateOutToday:            parseInt(lrc.gate_out_today)           || 0,
      deliveredToday:          parseInt(lrc.delivered_today)          || 0,
      pendingInvoices:         parseInt(lrc.pending_invoices)         || 0,
      totalAmountToday:        parseFloat(r.daily_revenue)            || 0,
      totalRevenue:            parseFloat(r.total_revenue)            || 0,
    };
  }

  // ─────────────────────────────────────────────
  // SECTION G — Today's Activity (every stage)
  // ─────────────────────────────────────────────
  async getTodayActivity(filters = {}) {
    const { where } = this.buildFilters(filters);

    const odQuery = dbV2.execute(sql`
      SELECT
        COUNT(DISTINCT CASE WHEN o.created_at::date = CURRENT_DATE THEN o.id END)  AS orders_punched,
        COUNT(DISTINCT CASE WHEN pa.actual_at::date = CURRENT_DATE THEN oi.id END) AS pre_approvals,
        COUNT(DISTINCT CASE WHEN oa.actual_at::date = CURRENT_DATE THEN oi.id END) AS approvals_done,
        COUNT(DISTINCT CASE WHEN dp.actual_at::date = CURRENT_DATE THEN oi.id END) AS dispatch_plans
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN pre_approvals pa ON pa.order_item_id = oi.id
      LEFT JOIN order_approvals oa ON oa.order_item_id = oi.id
      LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id
      ${where}
    `);

    const lrcQuery = dbV2.execute(sql`
      SELECT
        COUNT(CASE WHEN d.actual_at::date   = CURRENT_DATE THEN 1 END) AS actually_dispatched,
        COUNT(CASE WHEN sg.actual_at::date  = CURRENT_DATE THEN 1 END) AS security_approvals,
        COUNT(CASE WHEN inv.made_at::date   = CURRENT_DATE THEN 1 END) AS invoices_made,
        COUNT(CASE WHEN inv.checked_at::date= CURRENT_DATE THEN 1 END) AS invoices_checked,
        COUNT(CASE WHEN go.actual_at::date  = CURRENT_DATE THEN 1 END) AS gate_outs,
        COUNT(CASE WHEN mr.actual_at::date  = CURRENT_DATE THEN 1 END) AS deliveries_confirmed,
        COALESCE(SUM(CASE WHEN go.actual_at::date = CURRENT_DATE THEN d.qty_to_be_dispatched END), 0) AS gate_out_qty,
        COALESCE(SUM(CASE WHEN inv.made_at::date  = CURRENT_DATE THEN ${rev()} END), 0)               AS total_bill_today
      FROM dispatches d
      JOIN order_items oi ON oi.id = d.order_item_id
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN security_guard_checks sg ON sg.dispatch_id = d.id
      LEFT JOIN invoices inv ON inv.dispatch_id = d.id
      LEFT JOIN gate_outs go ON go.dispatch_id = d.id
      LEFT JOIN material_receipts mr ON mr.dispatch_id = d.id
      ${where}
    `);

    const [odRes, lrcRes] = await Promise.all([odQuery, lrcQuery]);
    const od = odRes.rows[0], lrc = lrcRes.rows[0];

    return {
      ordersPunched:       parseInt(od.orders_punched)       || 0,
      preApprovals:        parseInt(od.pre_approvals)         || 0,
      approvalsDone:       parseInt(od.approvals_done)        || 0,
      dispatchPlans:       parseInt(od.dispatch_plans)        || 0,
      actuallyDispatched:  parseInt(lrc.actually_dispatched)  || 0,
      vehiclesAssigned:    0,  // v2 dropped Vehicle Details — folded into Actual Dispatch
      materialsLoaded:     0,  // v2 dropped Material Load — folded into Actual Dispatch
      securityApprovals:   parseInt(lrc.security_approvals)   || 0,
      invoicesMade:        parseInt(lrc.invoices_made)        || 0,
      invoicesChecked:     parseInt(lrc.invoices_checked)     || 0,
      gateOuts:            parseInt(lrc.gate_outs)            || 0,
      deliveriesConfirmed: parseInt(lrc.deliveries_confirmed) || 0,
      gateOutQty:          parseFloat(lrc.gate_out_qty)       || 0,
      totalBillToday:      parseFloat(lrc.total_bill_today)   || 0,
    };
  }

  // ─────────────────────────────────────────────
  // SECTION C — Stage Pipeline
  // ─────────────────────────────────────────────
  async getStagePipeline(filters = {}) {
    const { and } = this.buildFilters(filters);

    const odStagesQuery = dbV2.execute(sql`
      SELECT 'Pre Approval' AS stage_name, 1 AS stage_num,
        COUNT(*) AS pending_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - pa.planned_at)) / 60), 0) AS avg_wait_min,
        MIN(pa.planned_at) AS oldest_at
      FROM pre_approvals pa
      JOIN order_items oi ON oi.id = pa.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE pa.planned_at IS NOT NULL AND pa.actual_at IS NULL ${and}

      UNION ALL
      SELECT 'Order Approval', 2, COUNT(*),
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - oa.planned_at)) / 60), 0), MIN(oa.planned_at)
      FROM order_approvals oa
      JOIN order_items oi ON oi.id = oa.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE oa.planned_at IS NOT NULL AND oa.actual_at IS NULL ${and}

      UNION ALL
      SELECT 'Dispatch Planning', 3, COUNT(*),
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - dp.planned_at)) / 60), 0), MIN(dp.planned_at)
      FROM dispatch_plannings dp
      JOIN order_items oi ON oi.id = dp.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE dp.planned_at IS NOT NULL AND dp.actual_at IS NULL ${and}
    `);

    const lrcStagesQuery = dbV2.execute(sql`
      SELECT 'Actual Dispatch' AS stage_name, 4 AS stage_num,
        COUNT(*) AS pending_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - d.planned_at)) / 60), 0) AS avg_wait_min,
        MIN(d.planned_at) AS oldest_at
      FROM dispatches d
      JOIN order_items oi ON oi.id = d.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE d.planned_at IS NOT NULL AND d.actual_at IS NULL ${and}

      UNION ALL SELECT 'Security Guard Approval', 5, COUNT(*),
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - sg.planned_at))/60),0), MIN(sg.planned_at)
      FROM security_guard_checks sg
      JOIN dispatches d ON d.id = sg.dispatch_id
      JOIN order_items oi ON oi.id = d.order_item_id JOIN orders o ON o.id = oi.order_id
      WHERE sg.planned_at IS NOT NULL AND sg.actual_at IS NULL ${and}

      UNION ALL SELECT 'Make Invoice (Proforma)', 6, COUNT(*),
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - inv.planned_made_at))/60),0), MIN(inv.planned_made_at)
      FROM invoices inv
      JOIN dispatches d ON d.id = inv.dispatch_id
      JOIN order_items oi ON oi.id = d.order_item_id JOIN orders o ON o.id = oi.order_id
      WHERE inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL ${and}

      UNION ALL SELECT 'Check Invoice', 7, COUNT(*),
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - inv.planned_checked_at))/60),0), MIN(inv.planned_checked_at)
      FROM invoices inv
      JOIN dispatches d ON d.id = inv.dispatch_id
      JOIN order_items oi ON oi.id = d.order_item_id JOIN orders o ON o.id = oi.order_id
      WHERE inv.planned_checked_at IS NOT NULL AND inv.checked_at IS NULL ${and}

      UNION ALL SELECT 'Gate Out', 8, COUNT(*),
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - go.planned_at))/60),0), MIN(go.planned_at)
      FROM gate_outs go
      JOIN dispatches d ON d.id = go.dispatch_id
      JOIN order_items oi ON oi.id = d.order_item_id JOIN orders o ON o.id = oi.order_id
      WHERE go.planned_at IS NOT NULL AND go.actual_at IS NULL ${and}

      UNION ALL SELECT 'Confirm Material Receipt', 9, COUNT(*),
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - mr.planned_at))/60),0), MIN(mr.planned_at)
      FROM material_receipts mr
      JOIN dispatches d ON d.id = mr.dispatch_id
      JOIN order_items oi ON oi.id = d.order_item_id JOIN orders o ON o.id = oi.order_id
      WHERE mr.planned_at IS NOT NULL AND mr.actual_at IS NULL ${and}
    `);

    const [odRes, lrcRes] = await Promise.all([odStagesQuery, lrcStagesQuery]);
    const rows = [...odRes.rows, ...lrcRes.rows].sort((a, b) => a.stage_num - b.stage_num);

    return rows.map(r => ({
      stageName:      r.stage_name,
      stageNum:       parseInt(r.stage_num),
      pendingCount:   parseInt(r.pending_count)              || 0,
      avgWaitMinutes: Math.round(parseFloat(r.avg_wait_min)) || 0,
      oldestAt:       r.oldest_at || null,
    }));
  }

  // ─────────────────────────────────────────────
  // SECTION B — User Activity
  // ─────────────────────────────────────────────
  async getUserActivity(filters = {}) {
    const { and } = this.buildFilters(filters);

    const usersRes = await dbV2.execute(sql`
      SELECT id, username, page_access, status FROM users WHERE status = 'active' ORDER BY username
    `);

    const pendingQuery = dbV2.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM pre_approvals pa JOIN order_items oi ON oi.id=pa.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE pa.planned_at IS NOT NULL AND pa.actual_at IS NULL ${and}) AS pre_approval,
        (SELECT COUNT(*) FROM order_approvals oa JOIN order_items oi ON oi.id=oa.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE oa.planned_at IS NOT NULL AND oa.actual_at IS NULL ${and}) AS order_approval,
        (SELECT COUNT(*) FROM dispatch_plannings dp JOIN order_items oi ON oi.id=dp.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE dp.planned_at IS NOT NULL AND dp.actual_at IS NULL ${and}) AS dispatch_planning,
        (SELECT COUNT(*) FROM dispatches d JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE d.planned_at IS NOT NULL AND d.actual_at IS NULL ${and}) AS actual_dispatch,
        (SELECT COUNT(*) FROM security_guard_checks sg JOIN dispatches d ON d.id=sg.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE sg.planned_at IS NOT NULL AND sg.actual_at IS NULL ${and}) AS security_approval,
        (SELECT COUNT(*) FROM invoices inv JOIN dispatches d ON d.id=inv.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL ${and}) AS make_invoice,
        (SELECT COUNT(*) FROM invoices inv JOIN dispatches d ON d.id=inv.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE inv.planned_checked_at IS NOT NULL AND inv.checked_at IS NULL ${and}) AS check_invoice,
        (SELECT COUNT(*) FROM gate_outs go JOIN dispatches d ON d.id=go.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE go.planned_at IS NOT NULL AND go.actual_at IS NULL ${and}) AS gate_out,
        (SELECT COUNT(*) FROM material_receipts mr JOIN dispatches d ON d.id=mr.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE mr.planned_at IS NOT NULL AND mr.actual_at IS NULL ${and}) AS material_receipt
    `);

    const completedTodayQuery = dbV2.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM pre_approvals pa JOIN order_items oi ON oi.id=pa.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE pa.actual_at::date = CURRENT_DATE ${and}) AS pre_approval,
        (SELECT COUNT(*) FROM order_approvals oa JOIN order_items oi ON oi.id=oa.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE oa.actual_at::date = CURRENT_DATE ${and}) AS order_approval,
        (SELECT COUNT(*) FROM dispatch_plannings dp JOIN order_items oi ON oi.id=dp.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE dp.actual_at::date = CURRENT_DATE ${and}) AS dispatch_planning,
        (SELECT COUNT(*) FROM dispatches d JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE d.actual_at::date = CURRENT_DATE ${and}) AS actual_dispatch,
        (SELECT COUNT(*) FROM security_guard_checks sg JOIN dispatches d ON d.id=sg.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE sg.actual_at::date = CURRENT_DATE ${and}) AS security_approval,
        (SELECT COUNT(*) FROM invoices inv JOIN dispatches d ON d.id=inv.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE inv.made_at::date = CURRENT_DATE ${and}) AS make_invoice,
        (SELECT COUNT(*) FROM invoices inv JOIN dispatches d ON d.id=inv.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE inv.checked_at::date = CURRENT_DATE ${and}) AS check_invoice,
        (SELECT COUNT(*) FROM gate_outs go JOIN dispatches d ON d.id=go.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE go.actual_at::date = CURRENT_DATE ${and}) AS gate_out,
        (SELECT COUNT(*) FROM material_receipts mr JOIN dispatches d ON d.id=mr.dispatch_id JOIN order_items oi ON oi.id=d.order_item_id JOIN orders o ON o.id=oi.order_id
           WHERE mr.actual_at::date = CURRENT_DATE ${and}) AS material_receipt
    `);

    const [pendingRes, todayRes] = await Promise.all([pendingQuery, completedTodayQuery]);
    const pending = pendingRes.rows[0], today = todayRes.rows[0];

    // Vehicle Details / Material Load kept as aliases of Actual Dispatch for any
    // user whose historical page_access still lists them (v2 folded both in).
    const PAGE_MAP = {
      'Pre Approval':             { label: 'Pre Approval',             pending: parseInt(pending.pre_approval)||0,      completedToday: parseInt(today.pre_approval)||0 },
      'Approval of Order':        { label: 'Approval of Order',        pending: parseInt(pending.order_approval)||0,    completedToday: parseInt(today.order_approval)||0 },
      'Dispatch Planning':        { label: 'Dispatch Planning',        pending: parseInt(pending.dispatch_planning)||0, completedToday: parseInt(today.dispatch_planning)||0 },
      'Actual Dispatch':          { label: 'Actual Dispatch',          pending: parseInt(pending.actual_dispatch)||0,   completedToday: parseInt(today.actual_dispatch)||0 },
      'Vehicle Details':          { label: 'Vehicle Details',          pending: parseInt(pending.actual_dispatch)||0,   completedToday: parseInt(today.actual_dispatch)||0 },
      'Material Load':            { label: 'Material Load',            pending: parseInt(pending.actual_dispatch)||0,   completedToday: parseInt(today.actual_dispatch)||0 },
      'Security Guard Approval':  { label: 'Security Guard Approval',  pending: parseInt(pending.security_approval)||0, completedToday: parseInt(today.security_approval)||0 },
      'Make Invoice':             { label: 'Make Invoice (Proforma)',  pending: parseInt(pending.make_invoice)||0,      completedToday: parseInt(today.make_invoice)||0 },
      'Check Invoice':            { label: 'Check Invoice',            pending: parseInt(pending.check_invoice)||0,     completedToday: parseInt(today.check_invoice)||0 },
      'Gate Out':                 { label: 'Gate Out',                 pending: parseInt(pending.gate_out)||0,          completedToday: parseInt(today.gate_out)||0 },
      'Confirm Material Receipt': { label: 'Confirm Material Receipt', pending: parseInt(pending.material_receipt)||0,  completedToday: parseInt(today.material_receipt)||0 },
    };

    return usersRes.rows.map(user => {
      let pageAccess = user.page_access;
      if (typeof pageAccess === 'string') { try { pageAccess = JSON.parse(pageAccess); } catch { pageAccess = []; } }
      const pages = Array.isArray(pageAccess) ? pageAccess : Object.keys(pageAccess || {});
      const stages = pages.filter(p => PAGE_MAP[p]).map(p => ({ page: p, ...PAGE_MAP[p] }));
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
    const { and } = this.buildFilters(filters);

    const userRes = await dbV2.execute(sql`SELECT id, username, page_access, status FROM users WHERE id = ${userId}`);
    if (!userRes.rows[0]) throw new Error('User not found');
    const user = userRes.rows[0];
    let pageAccess = user.page_access;
    if (typeof pageAccess === 'string') { try { pageAccess = JSON.parse(pageAccess); } catch { pageAccess = []; } }
    const pages = Array.isArray(pageAccess) ? pageAccess : Object.keys(pageAccess || {});

    // Item-grain gates: {gate table, start-of-stage expr, extra join for the start expr}
    const OD_STAGES = {
      'Pre Approval':      { g: 'pre_approvals',      label: 'Pre Approval',      start: 'o.created_at',                   extra: sql`` },
      'Approval of Order': { g: 'order_approvals',    label: 'Approval of Order', start: 'COALESCE(pa.actual_at, o.created_at)', extra: sql`LEFT JOIN pre_approvals pa ON pa.order_item_id = oi.id` },
      'Dispatch Planning': { g: 'dispatch_plannings', label: 'Dispatch Planning', start: 'COALESCE(oa.actual_at, o.created_at)', extra: sql`LEFT JOIN order_approvals oa ON oa.order_item_id = oi.id` },
    };
    // Ship-grain gates: {gate table, planned col, actual col, start expr}. Dedup key = table+cols.
    const LRC_STAGES = {
      'Actual Dispatch':          { g: 'dispatches',            p: 'planned_at',         a: 'actual_at',   start: 'COALESCE(dp.actual_at, o.created_at)', pre: sql`LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id`, self: true,  label: 'Actual Dispatch' },
      'Vehicle Details':          { g: 'dispatches',            p: 'planned_at',         a: 'actual_at',   start: 'COALESCE(dp.actual_at, o.created_at)', pre: sql`LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id`, self: true,  label: 'Vehicle Details' },
      'Material Load':            { g: 'dispatches',            p: 'planned_at',         a: 'actual_at',   start: 'COALESCE(dp.actual_at, o.created_at)', pre: sql`LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id`, self: true,  label: 'Material Load' },
      'Security Guard Approval':  { g: 'security_guard_checks', p: 'planned_at',         a: 'actual_at',   start: 'COALESCE(d.actual_at, o.created_at)',  pre: sql``, self: false, label: 'Security Guard Approval' },
      'Make Invoice':             { g: 'invoices',              p: 'planned_made_at',    a: 'made_at',     start: 'COALESCE(d.actual_at, o.created_at)',  pre: sql``, self: false, label: 'Make Invoice (Proforma)' },
      'Check Invoice':            { g: 'invoices',              p: 'planned_checked_at', a: 'checked_at',  start: 'COALESCE(g.made_at, o.created_at)',    pre: sql``, self: false, label: 'Check Invoice' },
      'Gate Out':                 { g: 'gate_outs',             p: 'planned_at',         a: 'actual_at',   start: 'COALESCE(d.actual_at, o.created_at)',  pre: sql``, self: false, label: 'Gate Out' },
      'Confirm Material Receipt': { g: 'material_receipts',     p: 'planned_at',         a: 'actual_at',   start: 'COALESCE(d.actual_at, o.created_at)',  pre: sql``, self: false, label: 'Confirm Material Receipt' },
    };

    const stageDetails = [];
    let totalOnTime = 0, totalLate = 0;
    const seenLrc = new Set();

    for (const page of pages) {
      if (OD_STAGES[page]) {
        const { g, start, extra, label } = OD_STAGES[page];
        const gt = sql.raw(g), st = sql.raw(start);

        const pendingQ = dbV2.execute(sql`
          SELECT oi.id, o.order_no, c.customer_name, o.order_type, dep.depot_name,
                 g.planned_at AS planned_date, o.created_at,
                 ROUND(EXTRACT(EPOCH FROM (NOW() - g.planned_at)) / 86400, 1) AS days_overdue,
                 GREATEST(0, LEAST(200, ROUND(
                   EXTRACT(EPOCH FROM (NOW() - ${st})) /
                   NULLIF(EXTRACT(EPOCH FROM (g.planned_at - ${st})), 0) * 100, 0))) AS progress_pct
          FROM ${gt} g
          JOIN order_items oi ON oi.id = g.order_item_id
          JOIN orders o ON o.id = oi.order_id
          LEFT JOIN customers c ON c.id = o.customer_id
          LEFT JOIN depots dep ON dep.id = o.depot_id
          ${extra}
          WHERE g.planned_at IS NOT NULL AND g.actual_at IS NULL ${and}
          ORDER BY g.planned_at ASC LIMIT 100
        `);
        const perfQ = dbV2.execute(sql`
          SELECT COUNT(*) FILTER (WHERE g.actual_at <= g.planned_at) AS on_time,
                 COUNT(*) FILTER (WHERE g.actual_at >  g.planned_at) AS late
          FROM ${gt} g
          JOIN order_items oi ON oi.id = g.order_item_id
          JOIN orders o ON o.id = oi.order_id
          WHERE g.actual_at IS NOT NULL ${and}
        `);
        const [pRes, fRes] = await Promise.all([pendingQ, perfQ]);
        const onTime = parseInt(fRes.rows[0]?.on_time) || 0, late = parseInt(fRes.rows[0]?.late) || 0;
        totalOnTime += onTime; totalLate += late;
        stageDetails.push({ label, pending: pRes.rows.map(this._mapPending), onTime, late });

      } else if (LRC_STAGES[page]) {
        const { g, p, a, start, pre, self, label } = LRC_STAGES[page];
        const key = `${g}_${p}_${a}`;
        if (seenLrc.has(key)) continue;
        seenLrc.add(key);
        const gt = sql.raw(g), pc = sql.raw(p), ac = sql.raw(a), st = sql.raw(start);
        // When the gate IS the dispatch, `d` == `g`; otherwise join dispatches d.
        const dispJoin = self ? sql`` : sql`JOIN dispatches d ON d.id = g.dispatch_id`;
        const dAlias   = self ? sql`g` : sql`d`;

        const pendingQ = dbV2.execute(sql`
          SELECT oi.id, o.order_no, c.customer_name, o.order_type, dep.depot_name,
                 g.${pc} AS planned_date, o.created_at,
                 ROUND(EXTRACT(EPOCH FROM (NOW() - g.${pc})) / 86400, 1) AS days_overdue,
                 GREATEST(0, LEAST(200, ROUND(
                   EXTRACT(EPOCH FROM (NOW() - ${st})) /
                   NULLIF(EXTRACT(EPOCH FROM (g.${pc} - ${st})), 0) * 100, 0))) AS progress_pct
          FROM ${gt} g
          ${dispJoin}
          JOIN order_items oi ON oi.id = ${dAlias}.order_item_id
          JOIN orders o ON o.id = oi.order_id
          LEFT JOIN customers c ON c.id = o.customer_id
          LEFT JOIN depots dep ON dep.id = o.depot_id
          ${pre}
          WHERE g.${pc} IS NOT NULL AND g.${ac} IS NULL ${and}
          ORDER BY g.${pc} ASC LIMIT 100
        `);
        const perfQ = dbV2.execute(sql`
          SELECT COUNT(*) FILTER (WHERE g.${ac} <= g.${pc}) AS on_time,
                 COUNT(*) FILTER (WHERE g.${ac} >  g.${pc}) AS late
          FROM ${gt} g
          ${dispJoin}
          JOIN order_items oi ON oi.id = ${dAlias}.order_item_id
          JOIN orders o ON o.id = oi.order_id
          WHERE g.${ac} IS NOT NULL ${and}
        `);
        const [pRes, fRes] = await Promise.all([pendingQ, perfQ]);
        const onTime = parseInt(fRes.rows[0]?.on_time) || 0, late = parseInt(fRes.rows[0]?.late) || 0;
        totalOnTime += onTime; totalLate += late;
        stageDetails.push({ label, pending: pRes.rows.map(this._mapPending), onTime, late });
      }
    }

    const totalCompleted = totalOnTime + totalLate;
    return {
      userId: user.id, username: user.username, pageAccess: pages, stageDetails,
      performance: {
        totalOnTime, totalLate, totalCompleted,
        onTimePct: totalCompleted > 0 ? Math.round((totalOnTime / totalCompleted) * 100) : 0,
      },
    };
  }

  _mapPending(r) {
    return {
      id:          r.id,
      orderNo:     r.order_no,
      customer:    r.customer_name,
      orderType:   r.order_type,
      depot:       r.depot_name,
      plannedDate: r.planned_date,
      createdAt:   r.created_at,
      daysOverdue: parseFloat(r.days_overdue) || 0,
      progressPct: parseFloat(r.progress_pct) || 0,
    };
  }

  // ─────────────────────────────────────────────
  // SECTION D — Party (Customer) View
  // ─────────────────────────────────────────────
  async getPartyView(filters = {}) {
    const { where } = this.buildFilters(filters);
    const limit  = parseInt(filters.partyLimit)  || 10;
    const offset = parseInt(filters.partyOffset) || 0;

    // Value/counts computed at order-line grain (no dispatch fan-out). "pre-dispatch
    // pending" = the line still has un-delivered qty (remaining_qty > 0), which is
    // the clean v2 read of the old "lrc.actual_8 IS NULL" proxy.
    // Group on the customers FK (o.customer_id), not the name — distinct customer
    // records that happen to share a name stay distinct, and NULL customer_id
    // (backfill name-drift) forms one explicit "unmapped" group. customer_id is
    // returned so the drill-down is FK-based too.
    const res = await dbV2.execute(sql`
      SELECT
        o.customer_id,
        MAX(c.customer_name)                                                            AS customer_name,
        o.customer_type,
        COUNT(DISTINCT oi.id)                                                            AS total_orders,
        COUNT(DISTINCT CASE WHEN o.created_at::date = CURRENT_DATE THEN oi.id END)       AS orders_today,
        COUNT(DISTINCT CASE WHEN COALESCE(oi.remaining_qty, oi.order_quantity) > 0 THEN oi.id END) AS pre_dispatch_pending,
        COUNT(DISTINCT CASE WHEN DATE_TRUNC('month',o.created_at)=DATE_TRUNC('month',NOW()) THEN oi.id END) AS this_month,
        COALESCE(SUM(${rev()}), 0)                                                       AS total_value,
        MAX(oa.party_credit_status)                                                      AS credit_status,
        MAX(o.created_at)                                                                AS last_order_at,
        COUNT(*) OVER()                                                                  AS full_count
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_approvals oa ON oa.order_item_id = oi.id
      ${where}
      GROUP BY o.customer_id, o.customer_type
      ORDER BY orders_today DESC, pre_dispatch_pending DESC, total_orders DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return {
      data: res.rows.map(r => ({
        customerId:         r.customer_id != null ? parseInt(r.customer_id) : null,
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
      total: parseInt(res.rows[0]?.full_count) || 0,
    };
  }

  // ─────────────────────────────────────────────
  // SECTION E — Oil Type View
  // ─────────────────────────────────────────────
  async getOilTypeView(filters = {}) {
    const { and } = this.buildFilters(filters);
    const res = await dbV2.execute(sql`
      SELECT
        oi.oil_type,
        COUNT(DISTINCT oi.id)                                                            AS total_orders,
        COUNT(DISTINCT CASE WHEN o.created_at::date = CURRENT_DATE THEN oi.id END)       AS new_today,
        COUNT(DISTINCT CASE WHEN COALESCE(oi.remaining_qty, oi.order_quantity) > 0 THEN oi.id END) AS pre_dispatch_pending,
        COALESCE(SUM(oi.order_quantity), 0)                                              AS total_qty,
        COALESCE(SUM(${rev()}), 0)                                                       AS total_value
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.oil_type IS NOT NULL AND oi.oil_type != '' ${and}
      GROUP BY oi.oil_type
      ORDER BY total_orders DESC
    `);
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
  // SECTION H — Aging Report (most stuck)
  // ─────────────────────────────────────────────
  async getAgingReport(filters = {}) {
    const { and } = this.buildFilters(filters);
    const limit  = parseInt(filters.limit)  || 20;
    const offset = parseInt(filters.offset) || 0;
    const search = filters.search ? filters.search.trim() : null;
    const searchOd  = search ? sql`AND (o.order_no ILIKE ${'%' + search + '%'} OR c.customer_name ILIKE ${'%' + search + '%'})` : sql``;

    // Pre-dispatch (item-grain) — earliest open item gate.
    const odQuery = dbV2.execute(sql`
      SELECT o.order_no, c.customer_name, oi.oil_type, dep.depot_name AS depot, o.order_type,
        oi.order_quantity, oi.uom, sk.sku_name,
        CASE
          WHEN pa.planned_at IS NOT NULL AND pa.actual_at IS NULL THEN 'Pre Approval'
          WHEN oa.planned_at IS NOT NULL AND oa.actual_at IS NULL THEN 'Approval of Order'
          WHEN dp.planned_at IS NOT NULL AND dp.actual_at IS NULL THEN 'Dispatch Planning'
        END AS current_stage,
        CASE
          WHEN pa.planned_at IS NOT NULL AND pa.actual_at IS NULL THEN o.created_at
          WHEN oa.planned_at IS NOT NULL AND oa.actual_at IS NULL THEN pa.actual_at
          WHEN dp.planned_at IS NOT NULL AND dp.actual_at IS NULL THEN oa.actual_at
        END AS stage_entered_at,
        EXTRACT(EPOCH FROM (NOW() - CASE
          WHEN pa.planned_at IS NOT NULL AND pa.actual_at IS NULL THEN pa.planned_at
          WHEN oa.planned_at IS NOT NULL AND oa.actual_at IS NULL THEN oa.planned_at
          WHEN dp.planned_at IS NOT NULL AND dp.actual_at IS NULL THEN dp.planned_at
        END)) / 60 AS pending_minutes
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN depots dep ON dep.id = o.depot_id
      LEFT JOIN skus sk ON sk.id = oi.sku_id
      LEFT JOIN pre_approvals pa ON pa.order_item_id = oi.id
      LEFT JOIN order_approvals oa ON oa.order_item_id = oi.id
      LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id
      WHERE (
        (pa.planned_at IS NOT NULL AND pa.actual_at IS NULL) OR
        (oa.planned_at IS NOT NULL AND oa.actual_at IS NULL) OR
        (dp.planned_at IS NOT NULL AND dp.actual_at IS NULL)
      ) ${and} ${searchOd}
    `);

    // Shipment-grain — earliest open dispatch gate (only while not yet delivered).
    const lrcQuery = dbV2.execute(sql`
      SELECT o.order_no, c.customer_name, oi.oil_type, dep.depot_name AS depot, o.order_type,
        d.qty_to_be_dispatched AS order_quantity, oi.uom, sk.sku_name,
        CASE
          WHEN d.planned_at   IS NOT NULL AND d.actual_at   IS NULL THEN 'Actual Dispatch'
          WHEN sg.planned_at  IS NOT NULL AND sg.actual_at  IS NULL THEN 'Security Guard Approval'
          WHEN inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL THEN 'Make Invoice (Proforma)'
          WHEN inv.planned_checked_at IS NOT NULL AND inv.checked_at IS NULL THEN 'Check Invoice'
          WHEN go.planned_at  IS NOT NULL AND go.actual_at  IS NULL THEN 'Gate Out'
          WHEN mr.planned_at  IS NOT NULL AND mr.actual_at  IS NULL THEN 'Confirm Material Receipt'
        END AS current_stage,
        CASE
          WHEN d.planned_at   IS NOT NULL AND d.actual_at   IS NULL THEN dp.actual_at
          WHEN sg.planned_at  IS NOT NULL AND sg.actual_at  IS NULL THEN d.actual_at
          WHEN inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL THEN d.actual_at
          WHEN inv.planned_checked_at IS NOT NULL AND inv.checked_at IS NULL THEN inv.made_at
          WHEN go.planned_at  IS NOT NULL AND go.actual_at  IS NULL THEN inv.checked_at
          WHEN mr.planned_at  IS NOT NULL AND mr.actual_at  IS NULL THEN go.actual_at
        END AS stage_entered_at,
        EXTRACT(EPOCH FROM (NOW() - CASE
          WHEN d.planned_at   IS NOT NULL AND d.actual_at   IS NULL THEN d.planned_at
          WHEN sg.planned_at  IS NOT NULL AND sg.actual_at  IS NULL THEN sg.planned_at
          WHEN inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL THEN inv.planned_made_at
          WHEN inv.planned_checked_at IS NOT NULL AND inv.checked_at IS NULL THEN inv.planned_checked_at
          WHEN go.planned_at  IS NOT NULL AND go.actual_at  IS NULL THEN go.planned_at
          WHEN mr.planned_at  IS NOT NULL AND mr.actual_at  IS NULL THEN mr.planned_at
        END)) / 60 AS pending_minutes
      FROM dispatches d
      JOIN order_items oi ON oi.id = d.order_item_id
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN depots dep ON dep.id = o.depot_id
      LEFT JOIN skus sk ON sk.id = oi.sku_id
      LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id
      LEFT JOIN security_guard_checks sg ON sg.dispatch_id = d.id
      LEFT JOIN invoices inv ON inv.dispatch_id = d.id
      LEFT JOIN gate_outs go ON go.dispatch_id = d.id
      LEFT JOIN material_receipts mr ON mr.dispatch_id = d.id
      WHERE mr.actual_at IS NULL AND (
        (d.planned_at   IS NOT NULL AND d.actual_at   IS NULL) OR
        (sg.planned_at  IS NOT NULL AND sg.actual_at  IS NULL) OR
        (inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL) OR
        (inv.planned_checked_at IS NOT NULL AND inv.checked_at IS NULL) OR
        (go.planned_at  IS NOT NULL AND go.actual_at  IS NULL) OR
        (mr.planned_at  IS NOT NULL AND mr.actual_at  IS NULL)
      ) ${and} ${searchOd}
    `);

    const [odRes, lrcRes] = await Promise.all([odQuery, lrcQuery]);
    const all = [...odRes.rows, ...lrcRes.rows];
    all.sort((a, b) => (parseFloat(b.pending_minutes) || 0) - (parseFloat(a.pending_minutes) || 0));

    const total = all.length;
    const paginated = all.slice(offset, offset + limit);

    return {
      data: paginated.map(r => {
        const mins = parseFloat(r.pending_minutes) || 0;
        const days = Math.floor(mins / 1440), hrs = Math.floor((mins % 1440) / 60), m = Math.floor(mins % 60);
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
      total,
    };
  }

  // ─────────────────────────────────────────────
  // DRILL-DOWN A — Customer Orders
  // ─────────────────────────────────────────────
  async getCustomerOrders(customerId, filters = {}) {
    const { and } = this.buildFilters(filters);
    // Identity is the customers FK, NOT the name — duplicate customer names
    // (e.g. two "Reliance" master rows) would otherwise merge distinct customers'
    // orders. An absent/non-numeric id = the unmapped ("—") group (customer_id NULL).
    const id = parseInt(customerId, 10);
    const custWhere = Number.isInteger(id) ? sql`o.customer_id = ${id}` : sql`o.customer_id IS NULL`;
    const res = await dbV2.execute(sql`
      SELECT
        o.order_no AS "orderNo", o.order_type AS "orderType", oi.oil_type AS "oilType",
        sk.sku_name AS "skuName", dep.depot_name AS "depot", oi.order_quantity AS "quantity",
        oi.uom, ${rev()} AS "amount", oa.party_credit_status AS "partyCreditStatus",
        o.created_at AS "createdAt",
        CASE
          WHEN mr.actual_at  IS NOT NULL THEN 'Confirm Material Receipt'
          WHEN go.actual_at  IS NOT NULL THEN 'Gate Out'
          WHEN inv.checked_at IS NOT NULL THEN 'Check Invoice'
          WHEN inv.made_at   IS NOT NULL THEN 'Make Invoice (Proforma)'
          WHEN sg.actual_at  IS NOT NULL THEN 'Security Guard Approval'
          WHEN d.actual_at   IS NOT NULL THEN 'Actual Dispatch'
          WHEN dp.actual_at  IS NOT NULL THEN 'Dispatch Planning'
          WHEN oa.actual_at  IS NOT NULL THEN 'Approval of Order'
          WHEN pa.actual_at  IS NOT NULL THEN 'Pre Approval'
          ELSE 'Awaiting Pre Approval'
        END AS "currentStage",
        CASE
          WHEN mr.actual_at IS NOT NULL THEN 'completed'
          WHEN (
            (pa.planned_at IS NOT NULL AND pa.actual_at IS NULL) OR
            (oa.planned_at IS NOT NULL AND oa.actual_at IS NULL) OR
            (dp.planned_at IS NOT NULL AND dp.actual_at IS NULL) OR
            (d.planned_at  IS NOT NULL AND d.actual_at  IS NULL) OR
            (sg.planned_at IS NOT NULL AND sg.actual_at IS NULL) OR
            (inv.planned_made_at IS NOT NULL AND inv.made_at IS NULL) OR
            (inv.planned_checked_at IS NOT NULL AND inv.checked_at IS NULL) OR
            (go.planned_at IS NOT NULL AND go.actual_at IS NULL) OR
            (mr.planned_at IS NOT NULL AND mr.actual_at IS NULL)
          ) THEN 'pending'
          ELSE 'in_progress'
        END AS status
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN depots dep ON dep.id = o.depot_id
      LEFT JOIN skus sk ON sk.id = oi.sku_id
      LEFT JOIN pre_approvals pa ON pa.order_item_id = oi.id
      LEFT JOIN order_approvals oa ON oa.order_item_id = oi.id
      LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id
      LEFT JOIN dispatches d ON d.order_item_id = oi.id
      LEFT JOIN security_guard_checks sg ON sg.dispatch_id = d.id
      LEFT JOIN invoices inv ON inv.dispatch_id = d.id
      LEFT JOIN gate_outs go ON go.dispatch_id = d.id
      LEFT JOIN material_receipts mr ON mr.dispatch_id = d.id
      WHERE ${custWhere} ${and}
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
    return res.rows.map(r => ({
      orderNo:      r.orderNo,
      orderType:    r.orderType,
      oilType:      r.oilType,
      skuName:      r.skuName,
      depot:        r.depot,
      quantity:     parseFloat(r.quantity) || 0,
      uom:          r.uom,
      amount:       parseFloat(r.amount)   || 0,
      creditStatus: r.partyCreditStatus,
      createdAt:    r.createdAt,
      currentStage: r.currentStage,
      status:       r.status,
    }));
  }

  // ─────────────────────────────────────────────
  // DRILL-DOWN B — Order Journey (full timeline)
  // ─────────────────────────────────────────────
  async getOrderJourney(orderNo) {
    // First line of the order + its first shipment (the old code took row[0] of each).
    const odRes = await dbV2.execute(sql`
      SELECT o.order_no AS "orderNo", c.customer_name AS "customerName", o.order_type AS "orderType",
             oi.oil_type AS "oilType", sk.sku_name AS "skuName", dep.depot_name AS "depot",
             oi.order_quantity AS "quantity", oi.uom, ${rev()} AS "amount",
             oa.party_credit_status AS "partyCreditStatus", o.created_at AS "createdAt",
             pa.planned_at AS planned_1, pa.actual_at AS actual_1,
             oa.planned_at AS planned_2, oa.actual_at AS actual_2,
             dp.planned_at AS planned_3, dp.actual_at AS actual_3,
             pu.username AS order_punch_user, pau.username AS pre_approval_user,
             oau.username AS order_approval_user, dpu.username AS dispatch_planning_user,
             oi.id AS order_item_id
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN depots dep ON dep.id = o.depot_id
      LEFT JOIN skus sk ON sk.id = oi.sku_id
      LEFT JOIN pre_approvals pa ON pa.order_item_id = oi.id
      LEFT JOIN order_approvals oa ON oa.order_item_id = oi.id
      LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id
      LEFT JOIN users pu  ON pu.id  = o.order_punch_user_id
      LEFT JOIN users pau ON pau.id = pa.approved_by_user_id
      LEFT JOIN users oau ON oau.id = oa.approved_by_user_id
      LEFT JOIN users dpu ON dpu.id = dp.performed_by_user_id
      WHERE o.order_no = ${orderNo}
      ORDER BY oi.id ASC
      LIMIT 1
    `);
    if (!odRes.rows[0]) throw new Error('Order not found');
    const od = odRes.rows[0];

    const lrcRes = await dbV2.execute(sql`
      SELECT d.planned_at AS planned_1, d.actual_at AS actual_1,
             sg.planned_at AS planned_4, sg.actual_at AS actual_4,
             inv.planned_made_at AS planned_5, inv.made_at AS actual_5,
             inv.planned_checked_at AS planned_6, inv.checked_at AS actual_6,
             go.planned_at AS planned_7, go.actual_at AS actual_7,
             mr.planned_at AS planned_8, mr.actual_at AS actual_8,
             d.qty_to_be_dispatched,
             adu.username AS actual_dispatch_user, sgu.username AS security_guard_user,
             miu.username AS make_invoice_user, ciu.username AS check_invoice_user,
             gou.username AS gate_out_user, mru.username AS material_receipt_user
      FROM dispatches d
      LEFT JOIN security_guard_checks sg ON sg.dispatch_id = d.id
      LEFT JOIN invoices inv ON inv.dispatch_id = d.id
      LEFT JOIN gate_outs go ON go.dispatch_id = d.id
      LEFT JOIN material_receipts mr ON mr.dispatch_id = d.id
      LEFT JOIN users adu ON adu.id = d.performed_by_user_id
      LEFT JOIN users sgu ON sgu.id = sg.performed_by_user_id
      LEFT JOIN users miu ON miu.id = inv.made_by_user_id
      LEFT JOIN users ciu ON ciu.id = inv.checked_by_user_id
      LEFT JOIN users gou ON gou.id = go.performed_by_user_id
      LEFT JOIN users mru ON mru.id = mr.performed_by_user_id
      WHERE d.order_item_id = ${od.order_item_id}
      ORDER BY d.id ASC
      LIMIT 1
    `);
    const lrc = lrcRes.rows[0] || {};

    const mkStage = (label, planned, actual, user = null) => {
      const p = planned ? new Date(planned).toISOString() : null;
      const a = actual  ? new Date(actual).toISOString()  : null;
      const status = !p ? 'not_started' : a ? 'done' : 'pending';
      const onTime = (p && a) ? new Date(a) <= new Date(p) : null;
      const overdueDays = (p && !a) ? Math.round((Date.now() - new Date(p)) / 86400000 * 10) / 10 : null;
      return { label, plannedAt: p, actualAt: a, status, onTime, overdueDays, responsible: user || '—' };
    };

    const stages = [
      mkStage('Order Punching',    od.createdAt,  od.createdAt, od.order_punch_user),
      mkStage('Pre Approval',      od.planned_1,  od.actual_1,  od.pre_approval_user),
      mkStage('Order Approval',    od.planned_2,  od.actual_2,  od.order_approval_user),
      mkStage('Dispatch Planning', od.planned_3,  od.actual_3,  od.dispatch_planning_user),
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
    const { and } = this.buildFilters(filters);

    const OD_STAGE_MAP = {
      'Pre Approval':      'pre_approvals',
      'Order Approval':    'order_approvals',
      'Dispatch Planning': 'dispatch_plannings',
    };
    const LRC_STAGE_MAP = {
      'Actual Dispatch':   { g: 'dispatches',            p: 'planned_at',         a: 'actual_at',  self: true },
      'Security Approval': { g: 'security_guard_checks', p: 'planned_at',         a: 'actual_at',  self: false },
      'Make Invoice':      { g: 'invoices',              p: 'planned_made_at',    a: 'made_at',    self: false },
      'Check Invoice':     { g: 'invoices',              p: 'planned_checked_at', a: 'checked_at', self: false },
      'Gate Out':          { g: 'gate_outs',             p: 'planned_at',         a: 'actual_at',  self: false },
      'Material Receipt':  { g: 'material_receipts',     p: 'planned_at',         a: 'actual_at',  self: false },
    };

    let rows = [];
    if (OD_STAGE_MAP[stageName]) {
      const gt = sql.raw(OD_STAGE_MAP[stageName]);
      const res = await dbV2.execute(sql`
        SELECT o.order_no AS "orderNo", c.customer_name AS "customer", oi.oil_type AS "oilType",
               sk.sku_name AS "skuName", dep.depot_name AS "depot", oi.order_quantity AS "quantity",
               oi.uom, ${rev()} AS "amount", g.planned_at AS "plannedAt", o.created_at AS "createdAt",
               ROUND(EXTRACT(EPOCH FROM (NOW() - g.planned_at)) / 86400, 1) AS "daysOverdue"
        FROM ${gt} g
        JOIN order_items oi ON oi.id = g.order_item_id
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN depots dep ON dep.id = o.depot_id
        LEFT JOIN skus sk ON sk.id = oi.sku_id
        WHERE g.planned_at IS NOT NULL AND g.actual_at IS NULL ${and}
        ORDER BY g.planned_at ASC LIMIT 200
      `);
      rows = res.rows;
    } else if (LRC_STAGE_MAP[stageName]) {
      const { g, p, a, self } = LRC_STAGE_MAP[stageName];
      const gt = sql.raw(g), pc = sql.raw(p), ac = sql.raw(a);
      const dispJoin = self ? sql`` : sql`JOIN dispatches d ON d.id = g.dispatch_id`;
      const dAlias   = self ? sql`g` : sql`d`;
      const res = await dbV2.execute(sql`
        SELECT o.order_no AS "orderNo", c.customer_name AS "customer", oi.oil_type AS "oilType",
               sk.sku_name AS "skuName", dep.depot_name AS "depot", ${dAlias}.qty_to_be_dispatched AS "quantity",
               oi.uom, ${rev()} AS "amount", g.${pc} AS "plannedAt", o.created_at AS "createdAt",
               ROUND(EXTRACT(EPOCH FROM (NOW() - g.${pc})) / 86400, 1) AS "daysOverdue"
        FROM ${gt} g
        ${dispJoin}
        JOIN order_items oi ON oi.id = ${dAlias}.order_item_id
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN customers c ON c.id = o.customer_id
        LEFT JOIN depots dep ON dep.id = o.depot_id
        LEFT JOIN skus sk ON sk.id = oi.sku_id
        WHERE g.${pc} IS NOT NULL AND g.${ac} IS NULL ${and}
        ORDER BY g.${pc} ASC LIMIT 200
      `);
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
    const { and } = this.buildFilters(filters);
    const res = await dbV2.execute(sql`
      SELECT o.order_no AS "orderNo", c.customer_name AS "customer", o.order_type AS "orderType",
             sk.sku_name AS "skuName", dep.depot_name AS "depot", oi.order_quantity AS "quantity",
             oi.uom, ${rev()} AS "amount", o.created_at AS "createdAt",
             CASE
               WHEN mr.actual_at IS NOT NULL THEN 'Confirm Material Receipt'
               WHEN d.actual_at  IS NOT NULL THEN 'Actual Dispatch'
               WHEN dp.actual_at IS NOT NULL THEN 'Dispatch Planning'
               WHEN oa.actual_at IS NOT NULL THEN 'Approval of Order'
               WHEN pa.actual_at IS NOT NULL THEN 'Pre Approval'
               ELSE 'Awaiting Pre Approval'
             END AS "currentStage"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN depots dep ON dep.id = o.depot_id
      LEFT JOIN skus sk ON sk.id = oi.sku_id
      LEFT JOIN pre_approvals pa ON pa.order_item_id = oi.id
      LEFT JOIN order_approvals oa ON oa.order_item_id = oi.id
      LEFT JOIN dispatch_plannings dp ON dp.order_item_id = oi.id
      LEFT JOIN dispatches d ON d.order_item_id = oi.id
      LEFT JOIN material_receipts mr ON mr.dispatch_id = d.id
      WHERE oi.oil_type = ${oilType} ${and}
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
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
  // Client Frequency Analysis
  // ─────────────────────────────────────────────
  async getClientFrequency(filters = {}) {
    const { where } = this.buildFilters(filters);
    // Group on the customers FK; customer_id feeds the FK-based drill-down.
    const res = await dbV2.execute(sql`
      SELECT o.customer_id, MAX(c.customer_name) AS customer_name, COUNT(*) AS order_count, COALESCE(SUM(${rev()}), 0) AS total_value
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      ${where}
      GROUP BY o.customer_id
      ORDER BY order_count DESC
      LIMIT 10
    `);
    return res.rows;
  }

  // ─────────────────────────────────────────────
  // Product Frequency Analysis
  // ─────────────────────────────────────────────
  async getProductFrequency(filters = {}) {
    const { and } = this.buildFilters(filters);
    const res = await dbV2.execute(sql`
      SELECT sk.sku_name, oi.uom, COUNT(DISTINCT oi.id) AS order_count, COALESCE(SUM(oi.order_quantity), 0) AS total_qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN skus sk ON sk.id = oi.sku_id
      WHERE sk.sku_name IS NOT NULL ${and}
      GROUP BY sk.sku_name, oi.uom
      ORDER BY order_count DESC
      LIMIT 10
    `);
    return res.rows;
  }

  // ─────────────────────────────────────────────
  // Delivery Performance (dispatch -> material receipt hours)
  // ─────────────────────────────────────────────
  async getDeliveryPerformance(filters = {}) {
    const { and } = this.buildFilters(filters);
    const res = await dbV2.execute(sql`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (mr.actual_at - d.actual_at)) / 3600), 0) AS avg_delivery_hours,
        COUNT(CASE WHEN EXTRACT(EPOCH FROM (mr.actual_at - d.actual_at)) / 3600 <= 48 THEN 1 END) * 100.0
          / NULLIF(COUNT(mr.actual_at), 0) AS on_time_percent
      FROM material_receipts mr
      JOIN dispatches d ON d.id = mr.dispatch_id
      JOIN order_items oi ON oi.id = d.order_item_id
      JOIN orders o ON o.id = oi.order_id
      WHERE mr.actual_at IS NOT NULL AND d.actual_at IS NOT NULL ${and}
    `);
    return res.rows[0];
  }

  // ─────────────────────────────────────────────
  // Revenue Trends (Last 7 Days)
  // ─────────────────────────────────────────────
  async getRevenueTrends(filters = {}) {
    const { and } = this.buildFilters(filters);
    const res = await dbV2.execute(sql`
      SELECT gs.date::date AS day, COALESCE(SUM(${rev()}), 0) AS revenue
      FROM (SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date AS date) gs
      LEFT JOIN orders o ON o.created_at::date = gs.date ${and}
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY gs.date
      ORDER BY gs.date
    `);
    return res.rows;
  }

  // ─────────────────────────────────────────────
  // SLA Performance Trends (Avg wait minutes to delivery)
  // ─────────────────────────────────────────────
  async getSlaTrends(filters = {}) {
    const { and } = this.buildFilters(filters);
    const res = await dbV2.execute(sql`
      SELECT gs.date::date AS day,
        COALESCE(AVG(EXTRACT(EPOCH FROM (mr.actual_at - o.created_at)) / 60), 0)::float AS avg_wait_mins
      FROM (SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date AS date) gs
      LEFT JOIN material_receipts mr ON mr.actual_at::date = gs.date
      LEFT JOIN dispatches d ON d.id = mr.dispatch_id
      LEFT JOIN order_items oi ON oi.id = d.order_item_id
      LEFT JOIN orders o ON o.id = oi.order_id ${and}
      GROUP BY gs.date
      ORDER BY gs.date
    `);
    return res.rows;
  }

  // ─────────────────────────────────────────────
  // SECTION I — Order Type Breakdown
  // ─────────────────────────────────────────────
  async getOrderTypeBreakdown(filters = {}) {
    const { and } = this.buildFilters(filters);
    const res = await dbV2.execute(sql`
      SELECT
        o.order_type,
        COUNT(DISTINCT oi.id)                                                            AS total_orders,
        COUNT(DISTINCT CASE WHEN o.created_at::date = CURRENT_DATE THEN oi.id END)       AS created_today,
        COUNT(DISTINCT CASE WHEN COALESCE(oi.remaining_qty, oi.order_quantity) > 0 THEN oi.id END) AS pre_dispatch,
        COALESCE(SUM(${rev()}), 0)                                                       AS total_value
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.order_type IS NOT NULL ${and}
      GROUP BY o.order_type
      ORDER BY total_orders DESC
    `);
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
    // {id, name} so the filter selects a depot_id (FK), never a name string.
    const res = await dbV2.execute(sql`
      SELECT DISTINCT dep.id, dep.depot_name
      FROM orders o JOIN depots dep ON dep.id = o.depot_id
      WHERE dep.depot_name IS NOT NULL AND dep.depot_name != ''
      ORDER BY dep.depot_name
    `);
    return res.rows.map(r => ({ id: r.id, name: r.depot_name }));
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
          this.getSlaTrends(filters),
        ]);

      return { kpi, todayActivity, stagePipeline, userActivity, partyView, oilTypeView, agingReport, orderTypeBreakdown, depots, clientFreq, productFreq, deliveryPerf, revTrends, slaTrends };
    } catch (err) {
      Logger.error('Error fetching owner dashboard', err);
      throw err;
    }
  }
}

module.exports = new OwnerDashboardService();
