/**
 * Order Dispatch Backend Server
 * Professional Node.js + Express Application
 */

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const bodyParser = require('body-parser');

// Load environment variables
dotenv.config();

// Import configuration
const { app: appConfig } = require('./config');
const { Logger } = require('./utils');

// Import middleware
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');

// Initialize Express app
const app = express();

// ============ MIDDLEWARE ============

// CORS
app.use(cors(appConfig.cors));

// Body parsers
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging
app.use(requestLogger);

// ============ ROUTES ============

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    environment: appConfig.nodeEnv,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API base route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Order Dispatch Backend API',
    version: '1.0.0',
    status: 'running',
    documentation: `${appConfig.apiPrefix}/docs`,
    endpoints: {
      health: '/health',
      samples: `${appConfig.apiPrefix}/samples`,
      orders: `${appConfig.apiPrefix}/orders`
    }
  });
});

// API Routes
const sampleRoute = require('./routes/sampleRoute');
const orderDispatchRoute = require('./routes/orderDispatchRoute');
const preApprovalRoute = require('./routes/preApprovalRoute');
const orderApprovalRoute = require('./routes/orderApprovalRoute');
const dispatchPlanningRoute = require('./routes/dispatchPlanningRoute');
const actualDispatchRoute = require('./routes/actualDispatchRoute');
const vehicleDetailsRoute = require('./routes/vehicleDetailsRoute');
const materialLoadRoute = require('./routes/materialLoadRoute');
const securityGuardApprovalRoute = require('./routes/securityGuardApprovalRoute');
const makeInvoiceRoute = require('./routes/makeInvoiceRoute'); // New import
const checkInvoiceRoute = require('./routes/checkInvoiceRoute');
const gateOutRoute = require('./routes/gateOutRoute');
const confirmMaterialReceiptRoute = require('./routes/confirmMaterialReceiptRoute');
const damageAdjustmentRoute = require('./routes/damageAdjustmentRoute');
const dashboardRoute = require('./routes/dashboardRoutes');
const userRoute = require('./routes/userRoute');
const customerRoute = require('./routes/customerRoute');
const skuRoute = require('./routes/skuRoute');
const depotRoute = require('./routes/depotRoute');
const brokerRoute = require('./routes/brokerRoute');
const uploadRoute = require('./routes/uploadRoute');

// Register routes
app.use(`${appConfig.apiPrefix}/samples`, sampleRoute);
app.use(`${appConfig.apiPrefix}/orders`, orderDispatchRoute);
app.use(`${appConfig.apiPrefix}/upload`, uploadRoute);
app.use('/api/v1/pre-approval', preApprovalRoute); // Changed prefix
app.use('/api/v1/approval', orderApprovalRoute); // Changed prefix
app.use('/api/v1/dispatch-planning', dispatchPlanningRoute); // Changed prefix
app.use('/api/v1/actual-dispatch', actualDispatchRoute); // Changed prefix
app.use('/api/v1/vehicle-details', vehicleDetailsRoute); // Changed prefix
app.use('/api/v1/material-load', materialLoadRoute); // Changed prefix
app.use('/api/v1/security-approval', securityGuardApprovalRoute); // Changed prefix
app.use('/api/v1/make-invoice', makeInvoiceRoute); // New route usage
app.use('/api/v1/check-invoice', checkInvoiceRoute);
app.use('/api/v1/gate-out', gateOutRoute);
app.use('/api/v1/confirm-receipt', confirmMaterialReceiptRoute);
app.use('/api/v1/damage-adjustment', damageAdjustmentRoute);
app.use('/api/v1/dashboard', dashboardRoute);
app.use('/api/v1/users', userRoute);
app.use('/api/v1/customers', customerRoute);
app.use('/api/v1/skus', skuRoute);
app.use('/api/v1/depots', depotRoute);
app.use('/api/v1/brokers', brokerRoute);

// Test database connection
const db = require('./config/db');
db.query('SELECT NOW()')
  .then(() => Logger.info('✅ Database connected successfully'))
  .catch((err) => Logger.error('❌ Database connection failed', err));


// ============ ERROR HANDLING ============

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// ============ SERVER START ============

const PORT = appConfig.port;

app.listen(PORT, () => {
  Logger.info(`🚀 Server started successfully`);
  Logger.info(`📍 Running on: http://localhost:${PORT}`);
  Logger.info(`🌍 Environment: ${appConfig.nodeEnv}`);
  Logger.info(`📚 API Prefix: ${appConfig.apiPrefix}`);
  Logger.info(`✅ Health check: http://localhost:${PORT}/health`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  Logger.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  process.exit(1);
});

module.exports = app;
