const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

router.post('/login', async (req, res) => {
  const user = await User.findOne({ username: req.body.username, password: req.body.password });
  if (!user) return res.status(401).json({ error: 'bad credentials' });
  const token = jwt.sign({ id: user._id, role: user.role }, 'secret123', { expiresIn: '7d' });
  res.json({ token, user });
});

router.post('/register', async (req, res) => {
  const user = await User.create(req.body);
  res.status(201).json(user);
});

module.exports = router;
