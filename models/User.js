const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  dateOfBirth: String,
  gender: String,

  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,

  insights: [String],

  isVerified: {
    type: Boolean,
    default: false
  },

  verificationCode: {
    type: String,
    default: ""
  },

  verificationCodeExpiresAt: {
    type: Date,
    default: null
  },

  resetPasswordToken: {
    type: String,
    default: null
  },

  resetPasswordExpires: {
    type: Date,
    default: null
  }
});

module.exports = mongoose.model("User", userSchema);
