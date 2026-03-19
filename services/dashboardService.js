/**
 * Dashboard Service
 * Aggregates data for the dashboard
 */

const db = require('../config/db');
const { Logger } = require('../utils');

// Stage definitions — ORDER matters (index = stage number)
const STAGE_DEFS = [
  { id: 'Order Punch',       label: 'Order Punch',             actual: null,       planned: null       }, // created_at acts as the entry point
  { id: 'Pre-Approval',      label: 'Pre Approval',            actual: 'actual_1', planned: 'planned_1' },
  { id: 'Approval Of Order', label: 'Approval of Order',       actual: 'actual_2', planned: 'planned_2' },
  { id: 'Dispatch Planning', label: 'Dispatch Planning',       actual: 'actual_3', planned: 'planned_3' },
  { id: 'Actual Dispatch',   label: 'Actual Dispatch',         actual: 'actual_4', planned: 'planned_4' },
  { id: 'Vehicle Details',   label: 'Vehicle Details',         actual: 'actual_5', planned: 'planned_5' },
  { id: 'Material Load',     label: 'Material Load',           actual: 'actual_6', planned: 'planned_6' },
  { id: 'Security Approval', label: 'Security Guard Approval', actual: 'actual_7', planned: 'planned_7' },
  { id: 'Make Invoice',      label: 'Invoice (Proforma)',       actual: 'actual_8', planned: 'planned_8' },
  { id: 'Check Invoice',     label: 'Check Invoice',           actual: 'actual_9', planned: 'planned_9' },
  { id: 'Gate Out',          label: 'Gate Out',                actual: 'actual_10', planned: 'planned_10' },
  { id: 'Material Receipt',  label: 'Confirm Material Receipt',actual: 'actual_11', planned: 'planned_11' },
  { id: 'Damage Adjustment', label: 'Damage Adjustment',       actual: 'actual_12', planned: 'planned_12' },
  { id: 'Final Delivery',    label: 'Final Delivery',          actual: 'actual_13', planned: 'planned_13' }
];

class DashboardService {
  /**
   * Strip trailing letter suffix(es) or -1/2 from order number.
   * DO-130A, DO-130A-1, DO-130B, DO-130B-1, DO-130C → DO-130
   */
  getBaseOrderNo(orderNo) {
    if (!orderNo) return orderNo;
    // Capture the prefix part (e.g., DO-130) and discard any suffix starting with A-Z or additional -1, etc.
    // Based on user query: regexp_replace(order_no, '^(DO-[0-9]+).*', '\1')
    const match = orderNo.match(/^(DO-\d+)/);
    return match ? match[1] : orderNo;
  }

  /**
   * Get comprehensive dashboard statistics
   * @returns {Promise<Object>} Complete dashboard data
   */
  async getComprehensiveStats() {
    try {
      const client = await db.getClient();

      try {
        // Get all orders
        const allOrdersResult = await client.query('SELECT * FROM order_dispatch ORDER BY created_at DESC');
        const allOrders = allOrdersResult.rows;

        // Group orders by base number for statistics
        const groupedMap = new Map();
        allOrders.forEach(order => {
          const baseNo = this.getBaseOrderNo(order.order_no);
          if (!groupedMap.has(baseNo)) {
            groupedMap.set(baseNo, []);
          }
          groupedMap.get(baseNo).push(order);
        });

        const groupedOrdersArray = Array.from(groupedMap.values());

        // Get completed orders from lift_receiving_confirmation history
        // Completion: actual_8 IS NOT NULL in lift_receiving_confirmation
        const receiptHistoryResult = await client.query('SELECT so_no FROM lift_receiving_confirmation WHERE actual_8 IS NOT NULL');
        const receiptHistory = receiptHistoryResult.rows;
        
        // Count unique base order numbers in history
        const completedBaseNos = new Set(receiptHistory.map(r => this.getBaseOrderNo(r.so_no)));
        const completedOrders = completedBaseNos.size;

        // KPI Counts based on groups
        const totalOrders = groupedMap.size;

        // Active: A group is active if ANY of its sub-orders are not complete (actual_13 is null AND NOT in completedBaseNos)
        const activeOrders = groupedOrdersArray.filter(group => {
          const isCompleted = completedBaseNos.has(group[0] ? this.getBaseOrderNo(group[0].order_no) : '');
          return !isCompleted && group.some(o => !o.actual_13);
        }).length;

        // Delayed: A group is delayed if ANY sub-order is delayed > 48h and NOT completed
        const now = new Date();
        const delayedOrders = groupedOrdersArray.filter(group => {
          const isCompleted = completedBaseNos.has(group[0] ? this.getBaseOrderNo(group[0].order_no) : '');
          if (isCompleted) return false;

          return group.some(o => {
            if (o.actual_13) return false;
            const actualFields = ['actual_1','actual_2','actual_3','actual_4','actual_5',
                                  'actual_6','actual_7','actual_8','actual_9','actual_10',
                                  'actual_11','actual_12','actual_13'];
            let latestActual = null;
            for (const field of actualFields) {
              if (o[field]) latestActual = new Date(o[field]);
            }
            if (!latestActual) latestActual = new Date(o.created_at);
            const hoursDiff = (now - latestActual) / (1000 * 60 * 60);
            return hoursDiff > 48;
          });
        }).length;

        // Rejected/Cancelled: A group is rejected if ANY sub-order is rejected/cancelled and NOT completed
        const rejectedOrders = groupedOrdersArray.filter(group => {
          const isCompleted = completedBaseNos.has(group[0] ? this.getBaseOrderNo(group[0].order_no) : '');
          if (isCompleted) return false;

          return group.some(o => 
            o.overall_status_of_order &&
            (o.overall_status_of_order.toLowerCase().includes('reject') ||
             o.overall_status_of_order.toLowerCase().includes('cancel'))
          );
        }).length;

        // Stage-wise counts: unique base orders per stage
        const stageCounts = STAGE_DEFS.map((stage, idx) => {
          let pendingBaseCount = 0;
          let completedBaseCount = 0;

          if (idx === 0) {
            completedBaseCount = totalOrders;
            pendingBaseCount = 0;
          } else {
            // A group is "Pending" at this stage if at least one sub-order is pending here
            pendingBaseCount = groupedOrdersArray.filter(group => {
              return group.some(o => {
                const prevActual = STAGE_DEFS[idx - 1].actual;
                const prevDone = prevActual ? !!o[prevActual] : true;
                const thisDone = stage.actual ? !!o[stage.actual] : false;
                return prevDone && !thisDone;
              });
            }).length;

            // A group is "Completed" at this stage if at least one sub-order completed it
            completedBaseCount = stage.actual
              ? groupedOrdersArray.filter(group => group.some(o => !!o[stage.actual])).length
              : 0;
          }

          return {
            id: stage.id,
            label: stage.label,
            pending: pendingBaseCount,
            completed: completedBaseCount,
            count: pendingBaseCount
          };
        });

        // All orders with current stage and stage progress for the pipeline tracker
        const enrichedOrders = allOrders.map(o => {
          const currentStageData = this.getOrderStageProgress(o);
          const baseNo = this.getBaseOrderNo(o.order_no);
          const isCompleted = completedBaseNos.has(baseNo);
          
          return {
            id: o.id,
            orderNo: o.order_no,
            doNumber: o.order_no,
            soNumber: o.order_no,
            customerName: o.customer_name,
            timestamp: o.created_at,
            date: o.created_at,
            stage: isCompleted ? 'Final Delivery' : currentStageData.currentStage,
            stageIndex: isCompleted ? STAGE_DEFS.length - 1 : currentStageData.stageIndex,
            completedStages: isCompleted ? STAGE_DEFS.length : currentStageData.completedStages,
            totalStages: STAGE_DEFS.length,
            stageProgress: currentStageData.stageProgress,
            status: isCompleted ? 'completed' : this.getOrderStatus(o)
          };
        });

        // Today's activity (Still uses individual sub-orders for granular tracking)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const createdTodayRaw = allOrders.filter(o => new Date(o.created_at) >= today);
        const createdToday = new Set(createdTodayRaw.map(o => this.getBaseOrderNo(o.order_no))).size;

        const dispatchedTodayRaw = allOrders.filter(o => o.actual_4 && new Date(o.actual_4) >= today);
        const dispatchedToday = new Set(dispatchedTodayRaw.map(o => this.getBaseOrderNo(o.order_no))).size;

        const invoicedTodayRaw = allOrders.filter(o => o.actual_8 && new Date(o.actual_8) >= today);
        const invoicedToday = new Set(invoicedTodayRaw.map(o => this.getBaseOrderNo(o.order_no))).size;

        const deliveredTodayRaw = allOrders.filter(o => {
          const d = o.actual_11 || o.actual_13;
          return d && new Date(d) >= today;
        });
        const deliveredToday = new Set(deliveredTodayRaw.map(o => this.getBaseOrderNo(o.order_no))).size;

        return {
          total: totalOrders,
          active: activeOrders,
          completed: completedOrders,
          delayed: delayedOrders,
          cancelled: rejectedOrders,
          stageCounts,
          recentOrders: enrichedOrders,
          pendingOrdersList: enrichedOrders,
          completedOrdersList: enrichedOrders.filter(o => o.status === 'completed'),
          createdToday,
          dispatchedToday,
          invoicedToday,
          deliveredToday,
          attentionItems: []
        };
      } finally {
        client.release();
      }
    } catch (error) {
      Logger.error('Error fetching comprehensive dashboard stats', error);
      throw error;
    }
  }

  /**
   * Get the current stage and progress for an order
   */
  getOrderStageProgress(order) {
    const stageProgress = STAGE_DEFS.map((stage, idx) => {
      let done = false;
      if (idx === 0) {
        done = true; // Order Punch is always done if order exists
      } else {
        done = stage.actual ? !!order[stage.actual] : false;
      }
      return {
        id: stage.id,
        label: stage.label,
        done,
        idx
      };
    });

    // Current stage = first stage that is NOT done (after the first done stage)
    let stageIndex = 0;
    let completedStages = 0;
    for (let i = 0; i < stageProgress.length; i++) {
      if (stageProgress[i].done) {
        completedStages = i + 1;
        stageIndex = i + 1; // Next stage
      } else {
        // This is the stuck stage
        stageIndex = i;
        break;
      }
    }

    if (stageIndex >= STAGE_DEFS.length) stageIndex = STAGE_DEFS.length - 1;

    return {
      currentStage: STAGE_DEFS[stageIndex]?.id || 'Final Delivery',
      currentStageLabel: STAGE_DEFS[stageIndex]?.label || 'Final Delivery',
      stageIndex,
      completedStages,
      stageProgress
    };
  }

  /**
   * Get order status
   */
  getOrderStatus(order) {
    if (order.actual_13) return 'completed';
    if (order.actual_10) return 'completed';
    if (order.overall_status_of_order) return order.overall_status_of_order.toLowerCase();
    return 'pending';
  }

  /**
   * Get dashboard statistics (legacy endpoint)
   */
  async getStats() {
    try {
      const client = await db.getClient();
      try {
        const orderQuery = 'SELECT order_no, planned_1, actual_1, planned_2, actual_2, actual_3 FROM order_dispatch';
        const receiptQuery = 'SELECT so_no FROM lift_receiving_confirmation WHERE actual_8 IS NOT NULL';
        
        const [orderResult, receiptResult] = await Promise.all([
          client.query(orderQuery),
          client.query(receiptQuery)
        ]);

        const rows = orderResult.rows;
        const receiptHistory = receiptResult.rows;
        const completedBaseNos = new Set(receiptHistory.map(r => this.getBaseOrderNo(r.so_no)));

        // Group by base number
        const groupedMap = new Map();
        rows.forEach(r => {
          const baseNo = this.getBaseOrderNo(r.order_no);
          if (!groupedMap.has(baseNo)) groupedMap.set(baseNo, []);
          groupedMap.get(baseNo).push(r);
        });

        const groups = Array.from(groupedMap.values());

        return {
          totalOrders: groups.length,
          pendingPreApproval: groups.filter(g => {
            const baseNo = g[0] ? this.getBaseOrderNo(g[0].order_no) : '';
            return !completedBaseNos.has(baseNo) && g.some(r => r.planned_1 && !r.actual_1);
          }).length,
          pendingApproval: groups.filter(g => {
            const baseNo = g[0] ? this.getBaseOrderNo(g[0].order_no) : '';
            return !completedBaseNos.has(baseNo) && g.some(r => r.planned_2 && !r.actual_2);
          }).length,
          completedOrders: completedBaseNos.size
        };
      } finally {
        client.release();
      }
    } catch (error) {
      Logger.error('Error fetching dashboard stats', error);
      throw error;
    }
  }

  /**
   * Get recent activity (last 5 orders)
   */
  async getRecentActivity() {
    try {
      const query = `
        SELECT id, order_no, customer_name, created_at, overall_status_of_order
        FROM order_dispatch
        ORDER BY created_at DESC
        LIMIT 5
      `;
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      Logger.error('Error fetching recent activity', error);
      throw error;
    }
  }
}

module.exports = new DashboardService();
