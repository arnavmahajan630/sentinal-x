const Order = require('../models/Order');

exports.getOrder = async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
};

exports.getMyOrder = async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user.id });
  if (!order) return res.status(404).json({ error: 'not found' });
  res.json(order);
};

exports.updateOrder = async (req, res) => {
  const { id } = req.params;
  const order = await Order.findByIdAndUpdate(id, req.body, { new: true });
  res.json(order);
};

exports.deleteOrder = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (order.user.toString() !== req.user.id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  await order.deleteOne();
  res.sendStatus(204);
};

exports.createOrder = async (req, res) => {
  const order = new Order({ ...req.body, user: req.user.id });
  await order.save();
  res.status(201).json(order);
};
