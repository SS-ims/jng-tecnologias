// Migration helper: imports products from the local lowdb `data/db.json`
// into the MySQL `products` table. It does NOT migrate purchases or contacts.
// Usage: set DB_* env vars (DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE) then:
//   node scripts/migrate-to-mysql.js
const fs = require('fs');
const path = require('path');

async function run() {
  const mysqlDb = require(path.join(__dirname, '..', 'db', 'mysql'));
  const dataPath = path.join(__dirname, '..', 'data', 'db.json');
  if (!fs.existsSync(dataPath)) {
    console.error('data/db.json not found');
    process.exit(1);
  }
  const raw = fs.readFileSync(dataPath, 'utf8');
  const json = JSON.parse(raw);
  const products = json.products || [];
  for (const p of products) {
    try {
      const existing = await mysqlDb.getProductById(p.id);
      if (!existing) {
        await mysqlDb.addProduct({
          id: p.id,
          name: p.name,
          description: p.description,
          price: Number(p.price || 0),
          image: p.image,
          featured: p.featured ? 1 : 0
        });
        console.log('Inserted', p.id);
      } else {
        console.log('Skipped existing', p.id);
      }
    } catch (err) {
      console.error('Error inserting', p.id, err.message || err);
    }
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
