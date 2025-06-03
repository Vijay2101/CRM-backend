// server/models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  phone: {
    type: String,
    required: false,
    trim: true,
  },
  address: String,
  spend: {
    type: Number,
    default: 0,
  },
  visits: {
    type: Number,
    default: 0,
  },
  lastActive: {
    type: Date,
    default: Date.now,
  },
  addedBy: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
});

// ✅ Compound unique index: email + addedBy
customerSchema.index({ email: 1, addedBy: 1 }, { unique: true });

module.exports = mongoose.model('Customer', customerSchema);


module.exports = mongoose.model('Customer', customerSchema);
