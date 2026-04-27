const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/User");

router.post("/generate", async (req, res) => {
  try {
    console.log("==== /api/insight/generate HIT ====");
    console.log("BODY:", JSON.stringify(req.body, null, 2));

    const {
      userId,
      firstName,
      lastName,
      username,
      email,
      gender,
      dateOfBirth,
      category,
      lifeFocus,
      state,
      intent,
      zodiac,
      quizAnswers = [],
      chatMessages = [],
      localScores = {},
      topKeywords = [],
      localPrediction = ""
    } = req.body;

    if (!firstName || !category) {
      return res.status(400).json({
        success: false,
        message: "firstName and category are required"
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "OPENAI_API_KEY is missing on the server"
      });
    }

    const safeQuizAnswers = Array.isArray(quizAnswers) ? quizAnswers : [];
    const safeChatMessages = Array.isArray(chatMessages) ? chatMessages : [];
    const safeTopKeywords = Array.isArray(topKeywords) ? topKeywords : [];
    const safeLocalScores =
      localScores && typeof localScores === "object" ? localScores : {};

    const recentChatSummary =
      safeChatMessages.length > 0
        ? safeChatMessages.slice(-8).join(" | ")
        : "No recent chat messages provided.";

    const quizSummary =
      safeQuizAnswers.length > 0
        ? safeQuizAnswers
            .map((item) => `Question ${item.questionId}: ${item.selectedOptionText}`)
            .join(" | ")
        : "No quiz answers provided.";

    const keywordsSummary =
      safeTopKeywords.length > 0
        ? safeTopKeywords.join(", ")
        : "No major keywords detected.";

    const scoresSummary =
      Object.keys(safeLocalScores).length > 0
        ? Object.entries(safeLocalScores)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ")
        : "No local scores detected.";

    const normalizedCategory = normalizeCategory(category);
    const prettyTitle = `${capitalizeWords(normalizedCategory)} Insight`;

    const systemPrompt = `
You are Futuris, an intelligent insight generator for a mobile app.

Your job:
- Generate one short, personalized insight for the requested category.
- Generate exactly two short follow-up questions based on that insight.
- Return only valid JSON.
- Do not wrap the JSON in markdown.
- Do not include any text before or after the JSON.
- Do not mention that you are AI.
- Do not use the user's name inside the insight.
- Keep the insight to 2 to 4 sentences.
- Keep the tone polished, mystical, and app-friendly.
- If prior insight/follow-up context is present, generate a fresh next-step insight rather than repeating the old one.

JSON format:
{
  "title": "Career Insight",
  "insight": "string",
  "questions": ["string", "string"],
  "advice": "string",
  "energy": "string",
  "focus": "string",
  "confidence": 84
}
    `.trim();

    const userPrompt = `
User profile:
- userId: ${safeText(userId)}
- firstName: ${safeText(firstName)}
- lastName: ${safeText(lastName)}
- username: ${safeText(username)}
- email: ${safeText(email)}
- gender: ${safeText(gender)}
- dateOfBirth: ${safeText(dateOfBirth)}
- zodiac: ${safeText(zodiac)}
- category: ${safeText(normalizedCategory)}
- lifeFocus: ${safeText(lifeFocus)}
- state: ${safeText(state)}
- intent: ${safeText(intent)}

Context:
- quiz summary: ${safeText(quizSummary)}
- recent chat summary: ${safeText(recentChatSummary)}
- detected keywords: ${safeText(keywordsSummary)}
- local scores: ${safeText(scoresSummary)}
- local prediction summary: ${safeText(localPrediction)}

Important:
- The response must be category-specific.
- Generate exactly two different follow-up questions.
- Questions must clearly relate to the generated insight.
    `.trim();

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }]
          }
        ]
      })
    });

    const rawData = await openAiResponse.json();

    if (!openAiResponse.ok) {
      console.error("Insight OpenAI API error:", JSON.stringify(rawData, null, 2));
      return res.status(500).json({
        success: false,
        message: rawData?.error?.message || "OpenAI request failed"
      });
    }

    const rawText =
      typeof rawData.output_text === "string" && rawData.output_text.trim()
        ? rawData.output_text.trim()
        : extractOutputText(rawData);

    if (!rawText) {
      console.error("Insight OpenAI empty output:", JSON.stringify(rawData, null, 2));
      return res.status(500).json({
        success: false,
        message: "OpenAI returned empty output"
      });
    }

    const parsed = parseJsonSafely(rawText);

    if (!parsed) {
      console.error("Insight JSON parse error:", rawText);
      return res.status(500).json({
        success: false,
        message: "OpenAI output could not be parsed as JSON"
      });
    }

    const questions = sanitizeQuestions(parsed.questions);

    if (!parsed.insight || questions.length < 2) {
      console.error("Insight missing required fields:", parsed);
      return res.status(500).json({
        success: false,
        message: "Insight response was incomplete"
      });
    }

    const finalInsight = safeResponseText(parsed.insight, "");

    if (finalInsight) {
      const saveLastTenInsights = {
        $push: {
          insights: {
            $each: [finalInsight],
            $slice: -10
          }
        }
      };

      if (mongoose.Types.ObjectId.isValid(userId)) {
        await User.findByIdAndUpdate(userId, saveLastTenInsights, { new: true });
      } else if (email) {
        await User.findOneAndUpdate({ email: email }, saveLastTenInsights, { new: true });
      }
    }

    return res.json({
      success: true,
      title: safeResponseText(parsed.title, prettyTitle),
      insight: finalInsight,
      questions,
      advice: safeResponseText(
        parsed.advice,
        "Stay observant and continue building clarity in this area."
      ),
      energy: safeResponseText(parsed.energy, "Balanced"),
      focus: safeResponseText(parsed.focus, normalizedCategory),
      confidence: sanitizeConfidence(parsed.confidence),
      source: "openai",
      message: "Insight generated successfully"
    });
  } catch (error) {
    console.error("Insight generation error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate insight"
    });
  }
});

function normalizeCategory(category) {
  if (!category || typeof category !== "string") return "general";

  const value = category.trim().toLowerCase();

  switch (value) {
    case "career":
      return "career";
    case "love":
      return "love";
    case "finance":
      return "finance";
    case "mood":
      return "mood";
    case "decisions":
      return "decisions";
    case "life_path":
    case "life path":
      return "life path";
    case "social":
      return "social";
    case "family":
      return "family";
    default:
      return value;
  }
}

function capitalizeWords(text) {
  if (!text || typeof text !== "string") return "Futuris";
  return text
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sanitizeQuestions(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0)
  )].slice(0, 2);
}

function sanitizeConfidence(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return 80;
  return Math.max(1, Math.min(100, Math.round(number)));
}

function safeText(value) {
  if (value === null || value === undefined) return "Not provided";
  const text = String(value).trim();
  return text.length > 0 ? text : "Not provided";
}

function safeResponseText(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function extractOutputText(data) {
  try {
    if (!data || !Array.isArray(data.output)) return "";

    const parts = [];

    for (const item of data.output) {
      if (!item || !Array.isArray(item.content)) continue;

      for (const content of item.content) {
        if (typeof content?.text === "string") {
          parts.push(content.text);
        }
      }
    }

    return parts.join("\n").trim();
  } catch (e) {
    return "";
  }
}

function parseJsonSafely(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (e) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch (secondError) {
      return null;
    }
  }
}

module.exports = router;
