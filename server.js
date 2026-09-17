require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

require('./db/db'); // bootstraps schema + seed on first run

const authRoutes = require('./routes/auth');
const spotRoutes = require('./routes/spots');
const ticketRoutes = require('./routes/tickets');
const rateRoutes = require('./routes/rates');
const clockRoutes = require('./routes/clock');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/spots', spotRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/rates', rateRoutes);
app.use('/api/clock', clockRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Static frontend (landing page + app)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.listen(PORT, () => {
  console.log(`ParkFlow server running at http://localhost:${PORT}`);
});
