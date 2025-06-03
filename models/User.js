// server/models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  picture: String,
}, { collection: "users" }); // explicitly set the collection name

module.exports = mongoose.model("User", userSchema);
