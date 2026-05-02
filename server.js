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
const ownerDashboardRoute = require('./routes/ownerDashboardRoutes');
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
app.use('/api/v1/owner-dashboard', ownerDashboardRoute);
app.use('/api/v1/users', userRoute);
app.use('/api/v1/customers', customerRoute);
app.use('/api/v1/skus', skuRoute);
app.use('/api/v1/depots', depotRoute);
app.use('/api/v1/brokers', brokerRoute);
app.use('/api/v1/salespersons', require('./routes/salespersonRoute'));
app.use('/api/v1/sku-details', require('./routes/skuDetailsRoute'));
app.use('/api/v1/vehicle-master', require('./routes/vehicleMasterRoute'));
app.use('/api/v1/driver-master', require('./routes/driverMasterRoute'));
app.use('/api/v1/transport-master', require('./routes/transportMasterRoute'));
app.use('/api/v1/common', require('./routes/commonRoute'));
app.use('/api/v1/reports', require('./routes/reportsRoute'));
app.use('/api/v1/commitment-punch', require('./routes/commitmentPunchRoutes'));
app.use('/api/v1/drafts', require('./routes/draftRoute'));
app.use('/api/v1/gate-in', require('./routes/gateInRoute'));
app.use('/api/v1/process-stages', require('./routes/processStageRoute'));

// Test database connection and apply trigger fixes
const db = require('./config/db');
db.query('SELECT NOW()')
  .then(async () => {
    Logger.info('✅ Database connected successfully');

    // Auto-fix: update set_planned_by_order_type trigger to use correct TAT stage names
    // pre-approval → planned_1 uses 'Pre Approval' TAT
    // regular      → planned_2 uses 'Approval of Order' TAT
    try {
      await db.query(`
        CREATE OR REPLACE FUNCTION set_planned_by_order_type()
        RETURNS TRIGGER AS $$
        DECLARE
            pre_approval_tat INTERVAL;
            approval_of_order_tat INTERVAL;
        BEGIN
            SELECT stage_time INTO pre_approval_tat
            FROM process_stages
            WHERE lower(replace(trim(stage_name), ' ', '')) = 'preapproval'
            ORDER BY submitted_at DESC, id DESC
            LIMIT 1;

            SELECT stage_time INTO approval_of_order_tat
            FROM process_stages
            WHERE lower(replace(trim(stage_name), ' ', '')) = 'approvaloforder'
            ORDER BY submitted_at DESC, id DESC
            LIMIT 1;

            IF lower(trim(NEW.order_type)) = 'regular' THEN
                NEW.planned_2 := (CURRENT_TIMESTAMP + COALESCE(approval_of_order_tat, INTERVAL '0'))::TEXT;
            ELSIF lower(trim(NEW.order_type)) IN ('pre approval', 'pre-approval') THEN
                NEW.planned_1 := (CURRENT_TIMESTAMP + COALESCE(pre_approval_tat, INTERVAL '0'))::TEXT;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      Logger.info('✅ set_planned_by_order_type trigger function updated');
    } catch (err) {
      Logger.warn('⚠️ Could not update set_planned_by_order_type function (non-fatal)', err.message);
    }

    try {
      await db.query(`
        CREATE OR REPLACE FUNCTION set_planned2_from_actual1()
        RETURNS TRIGGER AS $$
        DECLARE
            approval_of_order_tat INTERVAL;
        BEGIN
            SELECT stage_time
            INTO approval_of_order_tat
            FROM process_stages
            WHERE lower(replace(trim(stage_name), ' ', '')) = 'approvaloforder'
            ORDER BY submitted_at DESC, id DESC
            LIMIT 1;

            IF NEW.actual_1 IS NOT NULL
               AND NEW.approval_qty IS NOT NULL
               AND NEW.approval_qty > 0 THEN

                NEW.planned_2 := (NEW.actual_1::timestamptz + COALESCE(approval_of_order_tat, INTERVAL '0'))::TEXT;

            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      Logger.info('✅ set_planned2_from_actual1 trigger function updated');
    } catch (err) {
      Logger.warn('⚠️ Could not update set_planned2_from_actual1 function (non-fatal)', err.message);
    }

    try {
      await db.query(`DROP TRIGGER IF EXISTS trg_set_planned_3 ON order_dispatch`);
      Logger.info('✅ trg_set_planned_3 trigger removed; approval submit sets planned_3 with Dispatch Planning TAT');
    } catch (err) {
      Logger.warn('⚠️ Could not remove trg_set_planned_3 trigger (non-fatal)', err.message);
    }

    try {
      await db.query(`
        CREATE OR REPLACE FUNCTION set_planned_4_from_actual_1()
        RETURNS TRIGGER AS $$
        DECLARE
            security_guard_tat INTERVAL;
        BEGIN
            SELECT stage_time
            INTO security_guard_tat
            FROM process_stages
            WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') IN ('securityguardapproval', 'securityapproval')
            ORDER BY submitted_at DESC, id DESC
            LIMIT 1;

            IF NEW.actual_1 IS NOT NULL
               AND (TG_OP = 'INSERT' OR OLD.actual_1 IS DISTINCT FROM NEW.actual_1) THEN
                NEW.planned_4 := NEW.actual_1::timestamptz + COALESCE(security_guard_tat, INTERVAL '0');
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      Logger.info('✅ set_planned_4_from_actual_1 trigger function updated');
    } catch (err) {
      Logger.warn('⚠️ Could not update set_planned_4_from_actual_1 function (non-fatal)', err.message);
    }

    try {
      await db.query(`
        CREATE OR REPLACE FUNCTION set_planned_5_from_actual_4()
        RETURNS TRIGGER AS $$
        DECLARE
            make_invoice_tat INTERVAL;
        BEGIN
            SELECT stage_time
            INTO make_invoice_tat
            FROM process_stages
            WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') IN ('makeinvoiceproforma', 'makeinvoice')
            ORDER BY submitted_at DESC, id DESC
            LIMIT 1;

            IF NEW.actual_4 IS NOT NULL
               AND (TG_OP = 'INSERT' OR OLD.actual_4 IS DISTINCT FROM NEW.actual_4) THEN
                NEW.planned_5 := NEW.actual_4::timestamptz + COALESCE(make_invoice_tat, INTERVAL '0');
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      Logger.info('✅ set_planned_5_from_actual_4 trigger function updated');
    } catch (err) {
      Logger.warn('⚠️ Could not update set_planned_5_from_actual_4 function (non-fatal)', err.message);
    }

    try {
      await db.query(`
        CREATE OR REPLACE FUNCTION set_planned_6_from_actual_5()
        RETURNS TRIGGER AS $$
        DECLARE
            check_invoice_tat INTERVAL;
        BEGIN
            SELECT stage_time
            INTO check_invoice_tat
            FROM process_stages
            WHERE regexp_replace(lower(trim(stage_name)), '[^a-z0-9]', '', 'g') = 'checkinvoice'
            ORDER BY submitted_at DESC, id DESC
            LIMIT 1;

            IF NEW.actual_5 IS NOT NULL
               AND (TG_OP = 'INSERT' OR OLD.actual_5 IS DISTINCT FROM NEW.actual_5) THEN
                NEW.planned_6 := NEW.actual_5::timestamptz + COALESCE(check_invoice_tat, INTERVAL '0');
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      Logger.info('✅ set_planned_6_from_actual_5 trigger function updated');
    } catch (err) {
      Logger.warn('⚠️ Could not update set_planned_6_from_actual_5 function (non-fatal)', err.message);
    }
  })
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
