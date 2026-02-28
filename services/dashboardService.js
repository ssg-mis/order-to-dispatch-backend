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

        const totalOrders = allOrders.length;

        // Active orders: orders that are not yet at Final Delivery
        const activeOrders = allOrders.filter(o => !o.actual_13).length;

        // Completed orders: orders that reached Gate Out (actual_10) or beyond
        const completedOrders = allOrders.filter(o => o.actual_10).length;

        // Delayed orders: orders stuck for more than 48 hours at any intermediate stage
        const now = new Date();
        const delayedOrders = allOrders.filter(o => {
          if (o.actual_13) return false; // already complete

          // Find the latest documented timestamp
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
        }).length;

        // Rejected/Cancelled
        const rejectedOrders = allOrders.filter(o =>
          o.overall_status_of_order &&
          (o.overall_status_of_order.toLowerCase().includes('reject') ||
           o.overall_status_of_order.toLowerCase().includes('cancel'))
        ).length;

        // Stage-wise counts
        const stageCounts = STAGE_DEFS.map((stage, idx) => {
          let pending = 0;
          let completed = 0;

          if (idx === 0) {
            // Order Punch = all orders that have been entered into the system
            completed = totalOrders;
            pending = 0;
          } else {
            // Pending = order has data for previous stage but hasn't completed this stage yet
            pending = allOrders.filter(o => {
              const prevActual = STAGE_DEFS[idx - 1].actual;
              const prevDone = prevActual ? !!o[prevActual] : true; // Order Punch is always "done" for all orders
              const thisDone = stage.actual ? !!o[stage.actual] : false;
              return prevDone && !thisDone;
            }).length;

            completed = stage.actual
              ? allOrders.filter(o => !!o[stage.actual]).length
              : 0;
          }

          return {
            id: stage.id,
            label: stage.label,
            pending,
            completed,
            count: pending
          };
        });

        // All orders with current stage and stage progress for the pipeline tracker
        const enrichedOrders = allOrders.map(o => {
          const currentStageData = this.getOrderStageProgress(o);
          return {
            id: o.id,
            orderNo: o.order_no,
            doNumber: o.order_no,
            soNumber: o.order_no,
            customerName: o.customer_name,
            timestamp: o.created_at,
            date: o.created_at,
            stage: currentStageData.currentStage,
            stageIndex: currentStageData.stageIndex,
            completedStages: currentStageData.completedStages,
            totalStages: STAGE_DEFS.length,
            stageProgress: currentStageData.stageProgress,
            status: this.getOrderStatus(o)
          };
        });

        // Pending orders = not at final delivery, sorted by how stuck they are
        const pendingOrders = enrichedOrders.filter(o => !allOrders.find(raw => raw.order_no === o.orderNo && raw.actual_13));
        const completedOrdersList = enrichedOrders.filter(o => {
          const raw = allOrders.find(r => r.order_no === o.orderNo);
          return raw && raw.actual_10;
        });

        // Today's activity
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const createdToday = allOrders.filter(o => new Date(o.created_at) >= today).length;
        const dispatchedToday = allOrders.filter(o => o.actual_4 && new Date(o.actual_4) >= today).length;
        const invoicedToday = allOrders.filter(o => o.actual_8 && new Date(o.actual_8) >= today).length;
        const deliveredToday = allOrders.filter(o => {
          const d = o.actual_11 || o.actual_13;
          return d && new Date(d) >= today;
        }).length;

        return {
          total: totalOrders,
          active: activeOrders,
          completed: completedOrders,
          delayed: delayedOrders,
          cancelled: rejectedOrders,
          stageCounts,
          recentOrders: enrichedOrders, // ALL orders, not just 10
          pendingOrdersList: enrichedOrders,
          completedOrdersList,
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
        const [totalOrdersResult, pendingPreApprovalResult, pendingApprovalResult, completedOrdersResult] = await Promise.all([
          client.query('SELECT COUNT(*) FROM order_dispatch'),
          client.query('SELECT COUNT(*) FROM order_dispatch WHERE planned_1 IS NOT NULL AND actual_1 IS NULL'),
          client.query('SELECT COUNT(*) FROM order_dispatch WHERE planned_2 IS NOT NULL AND actual_2 IS NULL'),
          client.query('SELECT COUNT(*) FROM order_dispatch WHERE actual_3 IS NOT NULL')
        ]);

        return {
          totalOrders: parseInt(totalOrdersResult.rows[0].count),
          pendingPreApproval: parseInt(pendingPreApprovalResult.rows[0].count),
          pendingApproval: parseInt(pendingApprovalResult.rows[0].count),
          completedOrders: parseInt(completedOrdersResult.rows[0].count)
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
