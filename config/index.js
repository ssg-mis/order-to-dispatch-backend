// App config only. The old prod-RDS `db` block (config/database.js) was removed
// once every service moved to the local v2 client (config/db-v2.ts) — nothing
// reads config.db anymore.
const appConfig = require('./app');

module.exports = {
  app: appConfig,
};
