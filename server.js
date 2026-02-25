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

// ========== ORDER SCHEMA ==========
const orderSchema = new mongoose.Schema({
  // Customer info
  customerEmail: String,
  
  // Payment info
  stripeSessionId: { type: String, required: true, unique: true },
  stripePaymentIntentId: String,
  
  // Recipient info (vyplní po platbě)
  recipientName: String,
  recipientAge: Number,
  recipientGender: String,
  
  // Questionnaire answers
  q1_1: String, q1_2: String, q1_3: String, q1_4: String,
  q2_1: String, q2_2: String, q2_3: String, q2_4: String,
  q3_1: String, q3_2: String, q3_3: String,
  
  // Order status
  orderStatus: { 
    type: String, 
    enum: ['paid', 'questionnaire_completed', 'processing', 'shipped', 'delivered'],
    default: 'paid'
  },
  
  createdAt: { type: Date, default: Date.now },
  questionnaireCompletedAt: Date,
});

const Order = mongoose.model('Order', orderSchema);

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
      success_url: `${YOUR_DOMAIN}/dotaznik.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${YOUR_DOMAIN}/cancel.html`,
    });

    res.redirect(303, session.url);
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit questionnaire (after payment)
app.post('/submit-questionnaire', async (req, res) => {
  try {
    const sessionId = req.body.session_id;
    
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Missing session_id' });
    }

    // Find or create order
    let order = await Order.findOne({ stripeSessionId: sessionId });
    
    if (!order) {
      // Create order if webhook hasn't fired yet
      order = await Order.create({
        stripeSessionId: sessionId,
        orderStatus: 'paid'
      });
    }

    // Update with questionnaire data
    order.customerEmail = req.body.customer_email;
    order.recipientName = req.body.recipient_name;
    order.recipientAge = req.body.recipient_age;
    order.recipientGender = req.body.recipient_gender;
    order.q1_1 = req.body.q1_1;
    order.q1_2 = req.body.q1_2;
    order.q1_3 = req.body.q1_3;
    order.q1_4 = req.body.q1_4;
    order.q2_1 = req.body.q2_1;
    order.q2_2 = req.body.q2_2;
    order.q2_3 = req.body.q2_3;
    order.q2_4 = req.body.q2_4;
    order.q3_1 = req.body.q3_1;
    order.q3_2 = req.body.q3_2;
    order.q3_3 = req.body.q3_3;
    order.orderStatus = 'questionnaire_completed';
    order.questionnaireCompletedAt = new Date();

    await order.save();

    console.log('✅ Dotazník uložen, Order ID:', order._id);

    res.json({ success: true, orderId: order._id });

  } catch (error) {
    console.error('❌ Error in questionnaire submission:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook endpoint
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

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      console.log('💰 Payment received, Session ID:', session.id);
      
      // Create order record
      try {
        const existingOrder = await Order.findOne({ stripeSessionId: session.id });
        if (!existingOrder) {
          await Order.create({
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent,
            customerEmail: session.customer_email || session.customer_details?.email,
            orderStatus: 'paid'
          });
          console.log('✅ Order created from webhook');
        }
      } catch (err) {
        console.error('Error creating order from webhook:', err);
      }
      
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Rozbaluj.cz běží na http://localhost:${PORT}`);
});
