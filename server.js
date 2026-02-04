const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, "db.json");
const adapter = new FileSync(dbPath);
const db = low(adapter);

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

function initDb() {
  db.defaults({ products: [], purchases: [], purchase_items: [] }).write();
  const products = db.get("products").value();
  if (!products || products.length === 0) {
    db.get("products")
      .push(
        {
          id: "p1",
          name: "Solar Panel 320W",
          description: "High-efficiency monocrystalline panel",
          price: 189,
          image: "images/product1.jpg",
          featured: 1
        },
        {
          id: "p2",
          name: "Hybrid Inverter",
          description: "Smart inverter with battery support",
          price: 499,
          image: "images/product2.jpg",
          featured: 1
        },
        {
          id: "p3",
          name: "4K Security Camera",
          description: "Weatherproof 4K camera with night vision",
          price: 129,
          image: "images/product3.jpg",
          featured: 1
        },
        {
          id: "p4",
          name: "Battery 10kWh",
          description: "Reliable energy storage for solar systems",
          price: 899,
          image: "images/product1.jpg",
          featured: 0
        }
      )
      .write();
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

app.get("/", (req, res) => {
  const featured = db.get("products").filter({ featured: 1 }).value();
  res.render("index", { featured });
});

app.get("/products", (req, res) => {
  const products = db.get("products").value();
  res.render("products", { products });
});

app.get("/products/:id", (req, res) => {
  const product = db.get("products").find({ id: req.params.id }).value();
  if (!product) {
    return res.status(404).render("product", { product: null });
  }
  res.render("product", { product });
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

app.get("/admin", (req, res) => {
  const products = db.get("products").value();
  res.render("admin", { products });
});

app.post("/admin/products", (req, res) => {
  const { id, name, description, price, image, featured } = req.body;
  const exists = db.get("products").find({ id }).value();
  if (!exists) {
    db.get("products")
      .push({
        id,
        name,
        description,
        price: Number(price),
        image,
        featured: featured ? 1 : 0
      })
      .write();
  }
  res.redirect("/admin");
});

app.post("/admin/products/:id/delete", (req, res) => {
  db.get("products").remove({ id: req.params.id }).write();
  res.redirect("/admin");
});

app.post("/admin/products/:id/feature", (req, res) => {
  const product = db.get("products").find({ id: req.params.id }).value();
  if (product) {
    db.get("products")
      .find({ id: req.params.id })
      .assign({ featured: product.featured ? 0 : 1 })
      .write();
  }
  res.redirect("/admin");
});

app.get("/api/products", (req, res) => {
  const products = db.get("products").value();
  res.json({ products });
});

app.get("/api/products/:id", (req, res) => {
  const product = db.get("products").find({ id: req.params.id }).value();
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }
  res.json({ product });
});

app.get("/api/cart", (req, res) => {
  res.json({ items: req.session.cart, total: cartTotal(req.session.cart) });
});

app.post("/api/cart/add", (req, res) => {
  const { productId, qty } = req.body;
  const quantity = Math.max(1, Number(qty || 1));
  const product = db.get("products").find({ id: productId }).value();
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }
  mergeCartItem(req.session.cart, product, quantity);
  res.json({ items: req.session.cart, total: cartTotal(req.session.cart) });
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

app.post("/api/checkout", (req, res) => {
  const { name, email, address } = req.body;
  if (!name || !email || !address) {
    return res.status(400).json({ message: "Missing checkout details" });
  }
  if (!req.session.cart.length) {
    return res.status(400).json({ message: "Cart is empty" });
  }

  const total = cartTotal(req.session.cart);
  const currentMaxId = db.get("purchases").map("id").max().value() || 0;
  const purchaseId = currentMaxId + 1;
  db.get("purchases")
    .push({
      id: purchaseId,
      name,
      email,
      address,
      total,
      created_at: new Date().toISOString()
    })
    .write();

  req.session.cart.forEach((item) => {
    db.get("purchase_items")
      .push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        purchase_id: purchaseId,
        product_id: item.productId,
        name: item.name,
        price: item.price,
        qty: item.qty,
        image: item.image
      })
      .write();
  });

  req.session.cart = [];
  res.json({ message: "Purchase complete", purchaseId, total });
});

app.get("/api/purchases/:id", (req, res) => {
  const id = Number(req.params.id);
  const purchase = db.get("purchases").find({ id }).value();
  if (!purchase) {
    return res.status(404).json({ message: "Purchase not found" });
  }
  const items = db.get("purchase_items").filter({ purchase_id: id }).value();
  res.json({ purchase, items });
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

initDb();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
