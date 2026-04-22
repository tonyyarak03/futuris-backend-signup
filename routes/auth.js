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

// ================= HELPERS =================
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

async function sendResetPasswordEmail(toEmail, resetLink) {
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: "Futuris Password Reset",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Reset your Futuris password</h2>
        <p>We received a request to reset your password.</p>
        <p>Click the button below to continue:</p>
        <a href="${resetLink}" style="display:inline-block;padding:12px 20px;background:#8b5cf6;color:#ffffff;text-decoration:none;border-radius:8px;">
          Reset Password
        </a>
        <p style="margin-top:20px;">This link expires in 10 minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
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
      return res.status(400).json({
        message: "Please fill all fields"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Weak password"
      });
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
    return res.status(500).json({
      message: "Server error"
    });
  }
});

// ================= VERIFY EMAIL =================
router.post("/verify-email", async (req, res) => {
  try {
    console.log("VERIFY EMAIL REQUEST RECEIVED:", req.body);

    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        message: "Email and code are required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
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
    return res.status(500).json({
      message: "Server error"
    });
  }
});

// ================= RESEND VERIFICATION CODE =================
router.post("/resend-verification-code", async (req, res) => {
  try {
    console.log("RESEND VERIFICATION REQUEST RECEIVED:", req.body);

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        message: "Email is already verified"
      });
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
    return res.status(500).json({
      message: "Failed to resend verification code"
    });
  }
});

// ================= LOGIN =================
router.post("/login", async (req, res) => {
  try {
    console.log("LOGIN REQUEST RECEIVED:", req.body);

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Missing credentials"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
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
    return res.status(500).json({
      message: "Server error"
    });
  }
});

// ================= CHANGE PASSWORD (IN APP) =================
router.post("/change-password", async (req, res) => {
  try {
    console.log("CHANGE PASSWORD REQUEST RECEIVED:", req.body);

    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Email, current password, and new password are required"
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long"
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const isMatch = await bcrypt.compare(String(currentPassword), user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect"
      });
    }

    const hashedPassword = await bcrypt.hash(String(newPassword), 10);

    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      message: "Password changed successfully"
    });

  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);
    return res.status(500).json({
      message: "Server error"
    });
  }
});

// ================= FORGOT PASSWORD =================
router.post("/forgot-password", async (req, res) => {
  try {
    console.log("FORGOT PASSWORD REQUEST RECEIVED:", req.body);

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        message: "No account found with this email"
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetPasswordExpires;

    await user.save();

    const appBaseUrl =
      process.env.APP_RESET_URL_BASE || "https://futuris-backend-signup.onrender.com";

    const resetLink =
      `${appBaseUrl}/api/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;

    await sendResetPasswordEmail(normalizedEmail, resetLink);

    return res.status(200).json({
      message: "Password reset email sent successfully"
    });

  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);
    return res.status(500).json({
      message: "Failed to send reset email"
    });
  }
});

// ================= RESET PASSWORD PAGE =================
router.get("/reset-password", async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h2>Invalid reset link</h2>
            <p>Missing token or email.</p>
          </body>
        </html>
      `);
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
      resetPasswordToken: token
    });

    if (!user) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h2>Invalid reset link</h2>
            <p>This reset link is invalid.</p>
          </body>
        </html>
      `);
    }

    if (!user.resetPasswordExpires || new Date() > user.resetPasswordExpires) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h2>Reset link expired</h2>
            <p>Please request a new password reset email.</p>
          </body>
        </html>
      `);
    }

    return res.send(`
      <html>
        <head>
          <title>Reset Futuris Password</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0;padding:0;background:#0f0a1f;font-family:Arial,sans-serif;color:#fff;">
          <div style="max-width:420px;margin:60px auto;padding:28px;background:#1a1233;border-radius:18px;border:1px solid #6d4aff;">
            <h2 style="margin-top:0;text-align:center;">Set new password</h2>
            <p style="text-align:center;color:#d6ccff;">Enter your new password below.</p>

            <form method="POST" action="/api/auth/reset-password">
              <input type="hidden" name="token" value="${token}" />
              <input type="hidden" name="email" value="${normalizedEmail}" />

              <input
                type="password"
                name="password"
                placeholder="New password"
                required
                minlength="6"
                style="width:100%;padding:14px 16px;margin-top:14px;border:none;border-radius:10px;background:#2a1d4f;color:white;box-sizing:border-box;"
              />

              <button
                type="submit"
                style="width:100%;margin-top:18px;padding:14px 16px;border:none;border-radius:12px;background:#8b5cf6;color:white;font-weight:bold;cursor:pointer;"
              >
                Update Password
              </button>
            </form>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error("RESET PASSWORD PAGE ERROR:", error);
    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Server error</h2>
          <p>Something went wrong.</p>
        </body>
      </html>
    `);
  }
});

// ================= RESET PASSWORD SUBMIT =================
router.post("/reset-password", express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { token, email, password } = req.body;

    if (!token || !email || !password) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h2>Missing data</h2>
            <p>Please provide token, email, and password.</p>
          </body>
        </html>
      `);
    }

    if (String(password).length < 6) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h2>Weak password</h2>
            <p>Password must be at least 6 characters long.</p>
          </body>
        </html>
      `);
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
      resetPasswordToken: token
    });

    if (!user) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h2>Invalid reset token</h2>
            <p>This password reset request is invalid.</p>
          </body>
        </html>
      `);
    }

    if (!user.resetPasswordExpires || new Date() > user.resetPasswordExpires) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 24px;">
            <h2>Reset token expired</h2>
            <p>Please request a new password reset email.</p>
          </body>
        </html>
      `);
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);

    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    return res.send(`
      <html>
        <head>
          <title>Password Updated</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0;padding:0;background:#0f0a1f;font-family:Arial,sans-serif;color:#fff;">
          <div style="max-width:420px;margin:60px auto;padding:28px;background:#1a1233;border-radius:18px;border:1px solid #6d4aff;text-align:center;">
            <h2 style="margin-top:0;">Password updated successfully</h2>
            <p style="color:#d6ccff;">You can now return to Futuris and log in with your new password.</p>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    console.error("RESET PASSWORD SUBMIT ERROR:", error);
    return res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Server error</h2>
          <p>Something went wrong while updating the password.</p>
        </body>
      </html>
    `);
  }
});

module.exports = router;
