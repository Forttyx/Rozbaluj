require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB připojeno'))
  .catch(err => console.error('❌ MongoDB chyba:', err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// ========== USER SCHEMA ==========
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  name: { type: String },
  orderStatus: { 
    type: String, 
    enum: ['none', 'pending', 'paid', 'processing', 'shipped', 'delivered'],
    default: 'none' 
  },
  stripeCustomerId: String,
  stripePaymentIntentId: String,
  stripeSessionId: String,
  createdAt: { type: Date, default: Date.now },
  // Dotazník data (vyplní při objednávce)
  recipientName: String,
  recipientAge: Number,
  recipientGender: String,
  recipientInterests: [String],
  specialNotes: String,
});

const User = mongoose.model('User', userSchema);

// ========== API ROUTES ==========

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    project: 'Rozbaluj.cz',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    stripe: process.env.STRIPE_SECRET_KEY ? 'configured' : 'missing'
  });
});

// ========== STRIPE CHECKOUT ==========

// Create Checkout Session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const YOUR_DOMAIN = process.env.DOMAIN || 'http://localhost:3000';
    
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${YOUR_DOMAIN}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${YOUR_DOMAIN}/cancel.html`,
      automatic_tax: { enabled: false }, // můžeš zapnout později
    });

    res.redirect(303, session.url);
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint (pro příjem potvrzení plateb od Stripe)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('💰 Payment received:', session.id);
      // Tady můžeš updatovat User v databázi, poslat email, atd.
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Test route - vytvoř test usera
app.post('/api/test-user', async (req, res) => {
  try {
    const testUser = await User.create({
      email: 'test@rozbaluj.cz',
      password: 'heslo123', // v produkci by bylo hashované!
      name: 'Test User',
    });
    res.json({ success: true, user: testUser });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Fallback – všechny ostatní cesty vrátí index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Rozbaluj.cz běží na http://localhost:${PORT}`);
});
