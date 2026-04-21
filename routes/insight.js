const express = require("express");
const router = express.Router();

router.post("/generate", async (req, res) => {
  try {
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
            .map(
              (item) =>
                `Question ${item.questionId}: ${item.selectedOptionText}`
            )
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

    const systemPrompt = `
You are Futuris, an intelligent prediction-style insight generator for a mobile app.

Your task:
- Generate ONE personalized insight for the requested category.
- Generate EXACTLY TWO short follow-up questions based on that insight.
- The follow-up questions must feel natural, useful, and connected to the exact insight you generated.
- If the request already contains a selected follow-up question or previous insight in the intent/context, generate a NEW insight that answers that direction.
- After generating the new insight, still generate EXACTLY TWO fresh follow-up questions for the next step.

Rules:
- Return ONLY valid JSON.
- Do not wrap JSON in markdown.
- Do not include any extra text before or after JSON.
- Do not mention that you are an AI.
- Do not mention hidden reasoning.
- Do not use the user's name inside the insight text.
- Write the insight in 2 to 4 sentences max.
- Keep the style mystical-professional, personal, clean, and app-friendly.
- Avoid repetition from any provided previous insight.
- Make the 2 follow-up questions different from each other.
- Questions should be one sentence each.
- Questions must not be yes/no-only style all the time; vary them naturally.
- Do not output empty fields.

Required JSON shape:
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
Futuris user profile:
- userId: ${safeText(userId)}
- firstName: ${safeText(firstName)}
- lastName: ${safeText(lastName)}
- username: ${safeText(username)}
- email: ${safeText(email)}
- gender: ${safeText(gender)}
- dateOfBirth: ${safeText(dateOfBirth)}
- zodiac: ${safeText(zodiac)}
- requested category: ${safeText(normalizedCategory)}
- lifeFocus: ${safeText(lifeFocus)}
- state: ${safeText(state)}
- intent: ${safeText(intent)}

Behavior context:
- quiz summary: ${safeText(quizSummary)}
- recent chat summary: ${safeText(recentChatSummary)}
- detected keywords: ${safeText(keywordsSummary)}
- local score summary: ${safeText(scoresSummary)}
- local prediction summary: ${safeText(localPrediction)}

Important:
- Base the response on the requested category.
- If intent contains a previous insight and selected follow-up question, answer that direction with a NEW insight.
- Then generate EXACTLY TWO new follow-up questions for the next step.
- Keep the output personal but do not use the user's name inside the insight.
- Make sure the questions clearly relate to the generated insight.
`.trim();

    const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.4",
        input: `${systemPrompt}\n\n${userPrompt}`
      })
    });

    const rawData = await openAiResponse.json();

    if (!openAiResponse.ok) {
      console.error("OpenAI API error:", rawData);
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
      console.error("OpenAI empty output:", rawData);
      return res.status(500).json({
        success: false,
        message: "OpenAI returned empty output"
      });
    }

    const parsed = parseJsonSafely(rawText);

    if (!parsed) {
      console.error("Failed to parse OpenAI JSON:", rawText);
      return res.status(500).json({
        success: false,
        message: "OpenAI output could not be parsed as JSON"
      });
    }

    const questions = sanitizeQuestions(parsed.questions);

    if (!parsed.insight || questions.length < 2) {
      return res.status(500).json({
        success: false,
        message: "OpenAI output was missing the required insight/questions"
      });
    }

    return res.json({
      success: true,
      title: safeResponseText(parsed.title, `${capitalize(normalizedCategory)} Insight`),
      insight: safeResponseText(parsed.insight, ""),
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
      return "life path";
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

function sanitizeQuestions(value) {
  if (!Array.isArray(value)) return [];

  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  const unique = [...new Set(cleaned)];

  return unique.slice(0, 2);
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

function capitalize(text) {
  if (!text || typeof text !== "string") return "Futuris";
  return text.charAt(0).toUpperCase() + text.slice(1);
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
