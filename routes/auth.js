const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// ================= MAIL TRANSPORT =================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE) === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ================= REGISTER =================
router.post("/register", async (req, res) => {
  try {
    console.log("REGISTER REQUEST RECEIVED:", req.body);

    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      username,
      email,
      password
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !dateOfBirth ||
      !gender ||
      !username ||
      !email ||
      !password
    ) {
      return res.status(400).json({ message: "Please fill all fields" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Weak password" });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      dateOfBirth,
      gender,
      username,
      email,
      password: hashedPassword,
      insights: ["Welcome to Futuris"]
    });

    await newUser.save();

    res.status(201).json({
      message: "User created successfully",
      user: {
        username: newUser.username,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        insights: newUser.insights
      }
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ================= LOGIN =================
router.post("/login", async (req, res) => {
  try {
    console.log("LOGIN REQUEST RECEIVED:", req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    res.status(200).json({
      message: "Login successful",
      user: {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        insights: user.insights || []
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ================= FORGOT PASSWORD =================
router.post("/forgot-password", async (req, res) => {
  try {
    console.log("FORGOT PASSWORD REQUEST RECEIVED:", req.body);

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const appBaseUrl =
      process.env.APP_RESET_URL_BASE || "https://futuris-backend-signup.onrender.com";

    const resetLink = `${appBaseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Futuris Password Reset",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Reset your Futuris password</h2>
          <p>We received a request to reset your password.</p>
          <p>Click the button below to continue:</p>
          <a href="${resetLink}" style="display:inline-block;padding:12px 20px;background:#8b5cf6;color:#ffffff;text-decoration:none;border-radius:8px;">
            Reset Password
          </a>
          <p style="margin-top:20px;">If you did not request this, you can ignore this email.</p>
          <p style="margin-top:10px; font-size:12px; color:#666;">Token: ${resetToken}</p>
        </div>
      `
    });

    return res.status(200).json({
      message: "Password reset email sent successfully"
    });

  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);
    return res.status(500).json({ message: "Failed to send reset email" });
  }
});

module.exports = router;
