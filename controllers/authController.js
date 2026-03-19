const User = require("../models/User");
const bcrypt = require("bcrypt");
const generateInsights = require("../utils/insights");

exports.register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      dateOfBirth,
      gender,
      username,
      email,
      password,
      lifeFocus,
      state,
      intent
    } = req.body;

    // VALIDATION
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Weak password" });
    }

    // CHECK EXISTING USER
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // HASH PASSWORD
    const hashedPassword = await bcrypt.hash(password, 10);

    // CREATE USER
    const newUser = new User({
      firstName,
      lastName,
      dateOfBirth,
      gender,
      username,
      email,
      password: hashedPassword,
      lifeFocus,
      state,
      intent
    });

    // GENERATE INSIGHTS
    newUser.insights = generateInsights(newUser);

    await newUser.save();

    res.status(201).json({
      message: "User created successfully",
      user: {
        username: newUser.username,
        insights: newUser.insights
      }
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};