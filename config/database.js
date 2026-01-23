// Database configuration for PostgreSQL
const dbConfig = {
  development: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'order_dispatch',
    port: process.env.DB_PORT || 5432
  },
  production: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432
  }
};

module.exports = dbConfig[process.env.NODE_ENV || 'development'];
