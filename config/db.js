/**
 * PostgreSQL Database Connection Pool
 */

const { Pool } = require('pg');
const config = require('../config');
const { Logger } = require('../utils');

// Create connection pool with keepalive and better error handling
const pool = new Pool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
  max: process.env.DB_POOL_MAX || 10,
  min: process.env.DB_POOL_MIN || 2,
  idleTimeoutMillis: 60000, // Increased to 60 seconds
  connectionTimeoutMillis: 10000, // Increased to 10 seconds
  // Enable keepalive to prevent idle connection termination
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // SSL configuration for AWS RDS (always enabled)
  ssl: {
    rejectUnauthorized: false
  }
});

// Test connection
pool.on('connect', () => {
  Logger.info('PostgreSQL database connected successfully');
});

pool.on('error', (err) => {
  Logger.error('Unexpected error on idle client', err);
  // If connection is terminated, the pool will automatically try to reconnect
  if (err.message.includes('Connection terminated')) {
    Logger.warn('Connection terminated, pool will attempt to reconnect on next query');
  }
});

/**
 * Query helper function
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
const query = async (text, params, retries = 1) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    Logger.debug('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    // Retry once if connection was terminated
    if (retries > 0 && error.message && error.message.includes('Connection terminated')) {
      Logger.warn('Connection terminated, retrying query...', { retries });
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms before retry
      return query(text, params, retries - 1);
    }
    Logger.error('Database query error', error, { text, params });
    throw error;
  }
};

/**
 * Get a client from pool for transactions
 * @returns {Promise<Object>} Client
 */
const getClient = async () => {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  
  // Set a timeout of 5 seconds
  const timeout = setTimeout(() => {
    Logger.error('A client has been checked out for more than 5 seconds!');
  }, 5000);
  
  // Monkey patch the release method to clear timeout
  client.release = () => {
    clearTimeout(timeout);
    client.release = release;
    return release();
  };
  
  return client;
};

module.exports = {
  query,
  getClient,
  pool
};
