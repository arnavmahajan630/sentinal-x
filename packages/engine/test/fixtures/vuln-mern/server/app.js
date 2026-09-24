const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const ordersRouter = require('./routes/orders.routes');
const adminRouter = require('./routes/admin.routes.mjs');
const usersRouter = require('./src/users.routes');
const { authenticate, requireRole } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get(['/api/v1/ping', '/api/v2/ping'], (req, res) => res.send('pong'));
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRouter);

app.use(authenticate);

app.get('/api/profile', (req, res) => res.json(req.user));
app.use('/api/orders', ordersRouter);
app.use('/api/admin', requireRole('admin'), adminRouter);

require('./dynamic')(app);

module.exports = app;
