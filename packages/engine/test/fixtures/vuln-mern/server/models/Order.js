const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [{ sku: String, qty: Number }],
  total: Number,
  paymentDetails: { cardNumber: String, cvv: String },
  customerId: String,
});

module.exports = mongoose.model('Order', orderSchema);
