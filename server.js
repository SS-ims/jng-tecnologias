const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, "jng.db");
const db = new sqlite3.Database(dbPath);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "jng-session-secret",
    resave: false,
    saveUninitialized: true
  })
);

app.use("/styles", express.static(path.join(__dirname, "styles")));
app.use("/scripts", express.static(path.join(__dirname, "scripts")));
app.use("/images", express.static(path.join(__dirname, "images")));

app.use((req, res, next) => {
  if (!req.session.cart) {
    req.session.cart = [];
  }
  res.locals.cartCount = req.session.cart.reduce((sum, item) => sum + item.qty, 0);
  res.locals.formatCurrency = (value) => `$${Number(value).toFixed(2)}`;
  next();
});

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  await run(
    db,
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      image TEXT NOT NULL,
      featured INTEGER DEFAULT 0
    )`
  );

  await run(
    db,
    `CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL
    )`
  );

  await run(
    db,
    `CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL,
      image TEXT NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id)
    )`
  );

  const countRow = await get(db, "SELECT COUNT(*) as count FROM products");
  if (countRow.count === 0) {
    const seed = [
      ["p1", "Solar Panel 320W", "High-efficiency monocrystalline panel", 189, "images/product1.jpg", 1],
      ["p2", "Hybrid Inverter", "Smart inverter with battery support", 499, "images/product2.jpg", 1],
      ["p3", "4K Security Camera", "Weatherproof 4K camera with night vision", 129, "images/product3.jpg", 1],
      ["p4", "Battery 10kWh", "Reliable energy storage for solar systems", 899, "images/product1.jpg", 0]
    ];
    for (const item of seed) {
      await run(
        db,
        "INSERT INTO products (id, name, description, price, image, featured) VALUES (?,?,?,?,?,?)",
        item
      );
    }
  }
}

function mergeCartItem(cart, product, qty) {
  const existing = cart.find((item) => item.productId === product.id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      qty
    });
  }
}

function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

app.get("/", async (req, res, next) => {
  try {
    const featured = await all(db, "SELECT * FROM products WHERE featured = 1");
    res.render("index", { featured });
  } catch (err) {
    next(err);
  }
});

app.get("/products", async (req, res, next) => {
  try {
    const products = await all(db, "SELECT * FROM products");
    res.render("products", { products });
  } catch (err) {
    next(err);
  }
});

app.get("/products/:id", async (req, res, next) => {
  try {
    const product = await get(db, "SELECT * FROM products WHERE id = ?", [req.params.id]);
    if (!product) {
      return res.status(404).render("product", { product: null });
    }
    res.render("product", { product });
  } catch (err) {
    next(err);
  }
});

app.get("/services", (req, res) => {
  res.render("services");
});

app.get("/contact", (req, res) => {
  res.render("contact");
});

app.get("/cart", (req, res) => {
  res.render("cart");
});

app.get("/admin", async (req, res, next) => {
  try {
    const products = await all(db, "SELECT * FROM products");
    res.render("admin", { products });
  } catch (err) {
    next(err);
  }
});

app.post("/admin/products", async (req, res, next) => {
  try {
    const { id, name, description, price, image, featured } = req.body;
    await run(
      db,
      "INSERT INTO products (id, name, description, price, image, featured) VALUES (?,?,?,?,?,?)",
      [id, name, description, Number(price), image, featured ? 1 : 0]
    );
    res.redirect("/admin");
  } catch (err) {
    next(err);
  }
});

app.post("/admin/products/:id/delete", async (req, res, next) => {
  try {
    await run(db, "DELETE FROM products WHERE id = ?", [req.params.id]);
    res.redirect("/admin");
  } catch (err) {
    next(err);
  }
});

app.post("/admin/products/:id/feature", async (req, res, next) => {
  try {
    const product = await get(db, "SELECT featured FROM products WHERE id = ?", [req.params.id]);
    if (!product) {
      return res.redirect("/admin");
    }
    const nextValue = product.featured ? 0 : 1;
    await run(db, "UPDATE products SET featured = ? WHERE id = ?", [nextValue, req.params.id]);
    res.redirect("/admin");
  } catch (err) {
    next(err);
  }
});

app.get("/api/products", async (req, res, next) => {
  try {
    const products = await all(db, "SELECT * FROM products");
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

app.get("/api/products/:id", async (req, res, next) => {
  try {
    const product = await get(db, "SELECT * FROM products WHERE id = ?", [req.params.id]);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

app.get("/api/cart", (req, res) => {
  res.json({ items: req.session.cart, total: cartTotal(req.session.cart) });
});

app.post("/api/cart/add", async (req, res, next) => {
  try {
    const { productId, qty } = req.body;
    const quantity = Math.max(1, Number(qty || 1));
    const product = await get(db, "SELECT * FROM products WHERE id = ?", [productId]);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    mergeCartItem(req.session.cart, product, quantity);
    res.json({ items: req.session.cart, total: cartTotal(req.session.cart) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/cart/update", (req, res) => {
  const { productId, qty } = req.body;
  const quantity = Math.max(1, Number(qty || 1));
  const item = req.session.cart.find((entry) => entry.productId === productId);
  if (!item) {
    return res.status(404).json({ message: "Item not found" });
  }
  item.qty = quantity;
  res.json({ items: req.session.cart, total: cartTotal(req.session.cart) });
});

app.post("/api/cart/remove", (req, res) => {
  const { productId } = req.body;
  req.session.cart = req.session.cart.filter((entry) => entry.productId !== productId);
  res.json({ items: req.session.cart, total: cartTotal(req.session.cart) });
});

app.post("/api/checkout", async (req, res, next) => {
  try {
    const { name, email, address } = req.body;
    if (!name || !email || !address) {
      return res.status(400).json({ message: "Missing checkout details" });
    }
    if (!req.session.cart.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const total = cartTotal(req.session.cart);
    const result = await run(
      db,
      "INSERT INTO purchases (name, email, address, total, created_at) VALUES (?,?,?,?,?)",
      [name, email, address, total, new Date().toISOString()]
    );

    const purchaseId = result.lastID;
    for (const item of req.session.cart) {
      await run(
        db,
        "INSERT INTO purchase_items (purchase_id, product_id, name, price, qty, image) VALUES (?,?,?,?,?,?)",
        [purchaseId, item.productId, item.name, item.price, item.qty, item.image]
      );
    }

    req.session.cart = [];
    res.json({ message: "Purchase complete", purchaseId, total });
  } catch (err) {
    next(err);
  }
});

app.get("/api/purchases/:id", async (req, res, next) => {
  try {
    const purchase = await get(db, "SELECT * FROM purchases WHERE id = ?", [req.params.id]);
    if (!purchase) {
      return res.status(404).json({ message: "Purchase not found" });
    }
    const items = await all(db, "SELECT * FROM purchase_items WHERE purchase_id = ?", [req.params.id]);
    res.json({ purchase, items });
  } catch (err) {
    next(err);
  }
});

app.post("/api/chat", (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.json({ reply: "Please share how we can help." });
  }
  const reply = `Thanks for your message: "${message}". A JNG specialist will reply shortly.`;
  res.json({ reply });
});

app.get("/api/location", (req, res) => {
  res.json({
    name: "JNG Solar & Security",
    address: "Maputo, Mozambique",
    phone: "+258 84 000 0000",
    hours: "Mon-Fri 08:00 - 17:00",
    mapUrl: "https://maps.google.com/?q=Maputo%2C%20Mozambique"
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Server error");
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
