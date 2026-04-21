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
  family: 4,
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 30000,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(toEmail, firstName, code) {
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: "Verify your Futuris account",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 24px; background: #0f0a1f; color: #ffffff;">
        <div style="max-width: 520px; margin: 0 auto; background: #1a1233; border-radius: 16px; padding: 24px; border: 1px solid #6d4aff;">
          <h2 style="margin-top: 0; color: #c9b3ff;">Welcome to Futuris${firstName ? `, ${firstName}` : ""}</h2>
          <p style="font-size: 15px; line-height: 1.6; color: #e6dcff;">
            Use the verification code below to activate your account:
          </p>
          <div style="margin: 24px 0; text-align: center;">
            <span style="display: inline-block; font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #ffffff; background: #6d4aff; padding: 14px 22px; border-radius: 12px;">
              ${code}
            </span>
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: #cbbcff;">
            This code expires in 10 minutes.
          </p>
          <p style="font-size: 13px; color: #9d8dc8; margin-top: 20px;">
            If you did not create a Futuris account, you can ignore this email.
          </p>
        </div>
      </div>
    `
  });
}

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

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }]
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const verificationCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const newUser = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      dateOfBirth: dateOfBirth.trim(),
      gender: gender.trim(),
      username: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      insights: ["Welcome to Futuris"],
      isVerified: false,
      verificationCode,
      verificationCodeExpiresAt
    });

    await newUser.save();

    try {
      await sendVerificationEmail(
        normalizedEmail,
        firstName.trim(),
        verificationCode
      );
    } catch (mailError) {
      console.error("REGISTER EMAIL SEND ERROR:", mailError);

      await User.findByIdAndDelete(newUser._id);

      return res.status(500).json({
        message: "Account could not be created because verification email failed to send"
      });
    }

    return res.status(201).json({
      message: "Account created. Verification code sent to email.",
      user: {
        username: newUser.username,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        insights: newUser.insights,
        isVerified: newUser.isVerified
      }
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// ================= VERIFY EMAIL =================
router.post("/verify-email", async (req, res) => {
  try {
    console.log("VERIFY EMAIL REQUEST RECEIVED:", req.body);

    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(200).json({
        success: true,
        message: "Email already verified"
      });
    }

    if (!user.verificationCode || !user.verificationCodeExpiresAt) {
      return res.status(400).json({
        message: "No active verification code. Please resend the code."
      });
    }

    if (new Date() > user.verificationCodeExpiresAt) {
      return res.status(400).json({
        message: "Verification code expired. Please resend the code."
      });
    }

    if (user.verificationCode !== code.trim()) {
      return res.status(400).json({
        message: "Invalid verification code"
      });
    }

    user.isVerified = true;
    user.verificationCode = "";
    user.verificationCodeExpiresAt = null;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email verified successfully"
    });

  } catch (error) {
    console.error("VERIFY EMAIL ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// ================= RESEND VERIFICATION CODE =================
router.post("/resend-verification-code", async (req, res) => {
  try {
    console.log("RESEND VERIFICATION REQUEST RECEIVED:", req.body);

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    const verificationCode = generateVerificationCode();
    const verificationCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    user.verificationCode = verificationCode;
    user.verificationCodeExpiresAt = verificationCodeExpiresAt;

    await user.save();

    await sendVerificationEmail(
      user.email,
      user.firstName,
      verificationCode
    );

    return res.status(200).json({
      message: "Verification code resent successfully"
    });

  } catch (error) {
    console.error("RESEND VERIFICATION ERROR:", error);
    return res.status(500).json({ message: "Failed to resend verification code" });
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

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in",
        requiresVerification: true,
        email: user.email
      });
    }

    return res.status(200).json({
      message: "Login successful",
      user: {
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        insights: user.insights || []
      }
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ message: "Server error" });
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

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({ message: "No account found with this email" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const appBaseUrl =
      process.env.APP_RESET_URL_BASE || "https://futuris-backend-signup.onrender.com";

    const resetLink = `${appBaseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: normalizedEmail,
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
