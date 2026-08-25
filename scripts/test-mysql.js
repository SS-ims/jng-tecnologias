// MySQL deployment check. Loads .env and verifies the connection and schema.
require('dotenv').config();
const mysqlDb = require('../db/mysql');

(async function () {
  try {
    const database = await mysqlDb.testConnection();
    const products = await mysqlDb.getProducts();
    console.log(`MySQL connection OK: ${database.database}`);
    console.log(`Required tables OK: ${database.tables.join(', ')}`);
    console.log(`Products available: ${products.length}`);
    process.exit(0);
  } catch (err) {
    console.error('MySQL deployment check failed:', err.message || err);
    process.exit(1);
  }
})();
