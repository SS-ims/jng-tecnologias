// Simple MySQL connection test. Loads .env, connects and runs SELECT 1.
require('dotenv').config();
const mysqlDb = require('../db/mysql');

(async function () {
  try {
    const [rows] = await mysqlDb.pool.query('SELECT 1 AS ok');
    console.log('MySQL test query result:', rows);
    // Also attempt a products query to ensure the table works (non-fatal)
    try {
      const products = await mysqlDb.getProducts();
      console.log('Products query returned', products.length, 'rows');
    } catch (err) {
      console.warn('Products query failed (table may not exist):', err.message || err);
    }
    process.exit(0);
  } catch (err) {
    console.error('MySQL connection test failed:', err.message || err);
    process.exit(1);
  }
})();
