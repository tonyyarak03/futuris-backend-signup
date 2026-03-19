const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  dateOfBirth: String,
  gender: String,

  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,

  lifeFocus: String,
  state: String,
  intent: String,

  insights: [String]
});

module.exports = mongoose.model("User", userSchema);