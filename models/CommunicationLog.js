// models/CommunicationLog.js
const mongoose = require("mongoose");

const communicationLogSchema = new mongoose.Schema({
  customerId: mongoose.Schema.Types.ObjectId,
  customerName: String,
  customerEmail: String,
  campaignId: mongoose.Schema.Types.ObjectId,
  message: String,
  status: { type: String, enum: ["SENT", "FAILED", "PENDING"], default: "PENDING" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("CommunicationLog", communicationLogSchema);
