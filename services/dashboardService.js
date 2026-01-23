/**
 * Dashboard Service
 * Aggregates data for the dashboard
 */

const db = require('../config/db');
const { Logger } = require('../utils');

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

        // Calculate global metrics
        const totalOrders = allOrders.length;
        
        // Active orders: orders that haven't completed all stages
        // For simplicity, we'll consider orders where actual_12 (final stage) is null as active
        const activeOrders = allOrders.filter(o => !o.actual_12 && !o.actual_13).length;
        
        // Completed orders: orders where actual_12 or actual_13 is not null
        const completedOrders = allOrders.filter(o => o.actual_12 || o.actual_13).length;
        
        // Delayed orders: pending for more than 48 hours at any stage
        const now = new Date();
        const delayedOrders = allOrders.filter(o => {
          // Find the latest actual timestamp
          const actualFields = ['actual_1', 'actual_2', 'actual_3', 'actual_4', 'actual_5', 
                                'actual_6', 'actual_7', 'actual_8', 'actual_9', 'actual_10', 
                                'actual_11', 'actual_12', 'actual_13'];
          
          let latestActual = null;
          for (const field of actualFields) {
            if (o[field]) {
              latestActual = new Date(o[field]);
            }
          }
          
          if (!latestActual) latestActual = new Date(o.created_at);
          
          const hoursDiff = (now - latestActual) / (1000 * 60 * 60);
          return hoursDiff > 48 && !o.actual_12 && !o.actual_13;
        }).length;
        
        // Rejected/Cancelled orders
        const rejectedOrders = allOrders.filter(o => 
          o.overall_status_of_order && 
          (o.overall_status_of_order.toLowerCase().includes('reject') || 
           o.overall_status_of_order.toLowerCase().includes('cancel'))
        ).length;

        // Stage-wise breakdown
        const stages = [
          { id: 'Order Punch', label: 'Order Punch', planned: 'planned_1', actual: 'actual_1' },
          { id: 'Pre Approval', label: 'Pre Approval', planned: 'planned_1', actual: 'actual_1' },
          { id: 'Approval Of Order', label: 'Approval of Order', planned: 'planned_2', actual: 'actual_2' },
          { id: 'Dispatch Planning', label: 'Dispatch Planning', planned: 'planned_3', actual: 'actual_3' },
          { id: 'Actual Dispatch', label: 'Actual Dispatch', planned: 'planned_4', actual: 'actual_4' },
          { id: 'Vehicle Details', label: 'Vehicle Details', planned: 'planned_5', actual: 'actual_5' },
          { id: 'Material Load', label: 'Material Load', planned: 'planned_6', actual: 'actual_6' },
          { id: 'Security Approval', label: 'Security Guard Approval', planned: 'planned_7', actual: 'actual_7' },
          { id: 'Make Invoice', label: 'Invoice (Proforma)', planned: 'planned_8', actual: 'actual_8' },
          { id: 'Check Invoice', label: 'Check Invoice', planned: 'planned_9', actual: 'actual_9' },
          { id: 'Gate Out', label: 'Gate Out', planned: 'planned_10', actual: 'actual_10' },
          { id: 'Material Receipt', label: 'Confirm Material Receipt', planned: 'planned_11', actual: 'actual_11' },
          { id: 'Damage Adjustment', label: 'Damage Adjustment', planned: 'planned_12', actual: 'actual_12' },
          { id: 'Final Delivery', label: 'Final Delivery', planned: 'planned_13', actual: 'actual_13' }
        ];

        const stageCounts = stages.map(stage => {
          const pending = allOrders.filter(o => 
            o[stage.planned] && !o[stage.actual]
          ).length;
          
          const completed = allOrders.filter(o => 
            o[stage.actual]
          ).length;

          return {
            id: stage.id,
            label: stage.label,
            pending,
            completed,
            count: pending
          };
        });

        // Recent orders (last 10)
        const recentOrders = allOrders.slice(0, 10).map(o => ({
          id: o.id,
          orderNo: o.order_no,
          doNumber: o.order_no,
          soNumber: o.order_no,
          customerName: o.customer_name,
          timestamp: o.created_at,
          date: o.created_at,
          stage: this.getCurrentStage(o),
          status: this.getOrderStatus(o)
        }));

        // Today's activity
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayOrders = allOrders.filter(o => {
          const createdDate = new Date(o.created_at);
          return createdDate >= today;
        });
        
        const createdToday = todayOrders.length;
        
        const dispatchedToday = allOrders.filter(o => {
          if (!o.actual_4) return false;
          const actualDate = new Date(o.actual_4);
          return actualDate >= today;
        }).length;
        
        const invoicedToday = allOrders.filter(o => {
          if (!o.actual_8) return false;
          const actualDate = new Date(o.actual_8);
          return actualDate >= today;
        }).length;
        
        const deliveredToday = allOrders.filter(o => {
          if (!o.actual_11 && !o.actual_13) return false;
          const actualDate = new Date(o.actual_11 || o.actual_13);
          return actualDate >= today;
        }).length;

        return {
          total: totalOrders,
          active: activeOrders,
          completed: completedOrders,
          delayed: delayedOrders,
          cancelled: rejectedOrders,
          stageCounts,
          recentOrders,
          createdToday,
          dispatchedToday,
          invoicedToday,
          deliveredToday,
          attentionItems: []  // Can be enhanced based on specific business rules
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
   * Determine current stage of an order
   * @param {Object} order - Order object
   * @returns {string} Current stage name
   */
  getCurrentStage(order) {
    const stageMap = [
      { actual: 'actual_13', name: 'Final Delivery' },
      { actual: 'actual_12', name: 'Damage Adjustment' },
      { actual: 'actual_11', name: 'Material Receipt' },
      { actual: 'actual_10', name: 'Gate Out' },
      { actual: 'actual_9', name: 'Check Invoice' },
      { actual: 'actual_8', name: 'Make Invoice' },
      { actual: 'actual_7', name: 'Security Approval' },
      { actual: 'actual_6', name: 'Material Load' },
      { actual: 'actual_5', name: 'Vehicle Details' },
      { actual: 'actual_4', name: 'Actual Dispatch' },
      { actual: 'actual_3', name: 'Dispatch Planning' },
      { actual: 'actual_2', name: 'Approval Of Order' },
      { actual: 'actual_1', name: 'Pre Approval' }
    ];

    for (const stage of stageMap) {
      if (!order[stage.actual]) {
        return stage.name;
      }
    }
    
    return 'Order Punch';
  }

  /**
   * Get order status
   * @param {Object} order - Order object
   * @returns {string} Order status
   */
  getOrderStatus(order) {
    if (order.actual_13 || order.actual_12) return 'completed';
    if (order.overall_status_of_order) return order.overall_status_of_order.toLowerCase();
    return 'pending';
  }

  /**
   * Get dashboard statistics (legacy endpoint)
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    try {
      const client = await db.getClient();
      
      try {
        // Run queries in parallel for better performance
        const [
          totalOrdersResult,
          pendingPreApprovalResult,
          pendingApprovalResult,
          completedOrdersResult
        ] = await Promise.all([
          // Total Orders
          client.query('SELECT COUNT(*) FROM order_dispatch'),
          
          // Pending Pre-Approval (Stage 1)
          // planned_1 IS NOT NULL AND actual_1 IS NULL
          client.query('SELECT COUNT(*) FROM order_dispatch WHERE planned_1 IS NOT NULL AND actual_1 IS NULL'),
          
          // Pending Approval (Stage 2)
          // planned_2 IS NOT NULL AND actual_2 IS NULL
          client.query('SELECT COUNT(*) FROM order_dispatch WHERE planned_2 IS NOT NULL AND actual_2 IS NULL'),
          
          // Completed Orders (Stage 3+)
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
   * @returns {Promise<Array>} List of recent orders
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
