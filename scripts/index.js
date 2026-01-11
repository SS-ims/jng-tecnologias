// server/index.js
// Example Node.js Express server to proxy chat requests to OpenAI and create Stripe Checkout sessions.
// Install dependencies: express node-fetch@2 dotenv stripe
// Usage:
//   - copy .env.example -> .env and set OPENAI_API_KEY and STRIPE_SECRET_KEY
//   - npm install express node-fetch@2 dotenv stripe
//   - node index.js

const express = require('express');
const fetch = require('node-fetch'); // v2
require('dotenv').config();
const path = require('path');
const Stripe = require('stripe');

const app = express();
app.use(express.json());

const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

// /api/chat -> proxies to OpenAI
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if(!process.env.OPENAI_API_KEY){
    return res.status(500).json({ error: 'OpenAI key not configured on server.' });
  }
  try{
    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful sales and support assistant for a solar and security company.'},
        { role: 'user', content: message }
      ],
      max_tokens: 400
    };
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    const reply = j.choices && j.choices[0] && j.choices[0].message ? j.choices[0].message.content : (j.error ? j.error.message : 'No reply');
    res.json({ reply });
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Chat error' });
  }
});

// /create-checkout-session -> creates a Stripe Checkout session with the cart items
app.post('/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY in .env.' });
  try {
    const { cart } = req.body;
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Build line_items: price data requires cents and integer
    const line_items = cart.map(item => {
      // item.price comes in "$123" style in prototype; strip non-digits.
      const numeric = String(item.price || '').replace(/[^0-9.]/g, '');
      const amount = Math.round(parseFloat(numeric || '0') * 100); // cents
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: item.image ? [ (item.image.startsWith('http') ? item.image : `${req.protocol}://${req.get('host')}/${item.image}`) ] : []
          },
          unit_amount: amount
        },
        quantity: item.qty || 1
      };
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items,
      success_url: `${req.protocol}://${req.get('host')}/cart.html?success=1`,
      cancel_url: `${req.protocol}://${req.get('host')}/cart.html?canceled=1`,
      // You can add metadata or customer creation here
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stripe error', details: err.message });
  }
});

// Serve the prototype static files (adjust path if necessary)
app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
