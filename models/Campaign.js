const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema({
  name: String,
  rules: Array,
  logic: String,
  audienceSize: Number,
  sent: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  createdBy: { type: String, required: true }, // added field
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Campaign", campaignSchema);
