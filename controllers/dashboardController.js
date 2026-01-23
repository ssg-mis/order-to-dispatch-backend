/**
 * Dashboard Controller
 * Handles dashboard data requests
 */

const dashboardService = require('../services/dashboardService');
const { Logger } = require('../utils');

class DashboardController {
  /**
   * Get dashboard statistics and recent activity
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getDashboardStats(req, res, next) {
    try {
      const stats = await dashboardService.getStats();
      const recentActivity = await dashboardService.getRecentActivity();
      
      res.status(200).json({
        success: true,
        data: {
          stats,
          recentActivity
        }
      });
    } catch (error) {
      Logger.error('Error in getDashboardStats controller', error);
      next(error);
    }
  }

  /**
   * Get comprehensive dashboard overview
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next middleware
   */
  async getDashboardOverview(req, res, next) {
    try {
      const data = await dashboardService.getComprehensiveStats();
      
      res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      Logger.error('Error in getDashboardOverview controller', error);
      next(error);
    }
  }
}

module.exports = new DashboardController();
