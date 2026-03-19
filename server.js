const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/auth"); // 👈 KEEP THIS HERE

const app = express(); // 👈 MUST BE BEFORE app.use

app.use(cors());
app.use(express.json());

// ROUTES
app.use("/api/auth", authRoutes);

// DB
mongoose.connect("mongodb://127.0.0.1:27017/futuris");

// TEST ROUTE
app.get("/", (req, res) => {
  res.send("Futuris backend running");
});

// START
app.listen(5000, () => {
  console.log("Server running on port 5000");
});