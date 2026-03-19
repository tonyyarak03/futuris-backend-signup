const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");

// ================= REGISTER =================
router.post("/register", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      username,
      email,
      password
    } = req.body;

    // Simulate hashing (optional but cleaner)
    const hashedPassword = await bcrypt.hash(password, 10);

    // TEMP RESPONSE (no database yet)
    res.json({
      message: "User registered successfully",
      user: {
        username: username,
        insights: ["Welcome to Futuris"]
      }
    });

  } catch (error) {
    res.status(500).json({ message: "Error registering user" });
  }
});

// ================= LOGIN =================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // TEMP LOGIN (since no DB)
    if (!email || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    res.json({
      message: "Login successful",
      user: {
        username: "DemoUser",
        insights: ["Welcome back to Futuris"]
      }
    });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;