require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
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
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
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
