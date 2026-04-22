const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");

const authRoutes = require("./routes/auth");
const insightRoutes = require("./routes/insight");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/insight", insightRoutes);

app.get("/", (req, res) => {
  res.send("Futuris backend running");
});

// ================= CHAT ROUTE =================
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  if (!userMessage || !userMessage.trim()) {
    return res.status(400).json({
      reply: "Please send a valid message."
    });
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are Futuris AI, a helpful, warm, concise future-assistant inside the Futuris app. Give supportive, clear, natural answers."
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply =
      response?.data?.choices?.[0]?.message?.content ||
      "I’m here, but I couldn’t generate a response right now.";

    res.json({ reply });
  } catch (error) {
    console.error(
      "Chat route error:",
      error.response?.data || error.message
    );

    res.status(500).json({
      reply: "I’m here, but I couldn’t generate a response right now."
    });
  }
});

const PORT = process.env.PORT || 8080;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");

    app.listen(PORT, () => {
      console.log("Server running on port " + PORT);
    });
  })
  .catch((err) => {
    console.log("MongoDB connection error:", err.message);
  });
