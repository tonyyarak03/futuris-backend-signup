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
    const title = `${capitalizeCategory(normalizedCategory)} Insight`;

    const systemPrompt = `
You are Futuris, an intelligent mobile-app insight generator.

You generate:
1. One short personalized insight for the requested category
2. Exactly two follow-up questions based on that insight
3. Short supporting fields for advice, energy, focus, and confidence

Rules:
- Keep the tone mystical, polished, personal, and app-friendly.
- Do not mention that you are an AI.
- Do not mention hidden reasoning.
- Do not use the user's name inside the "insight".
- The insight must be 2 to 4 sentences max.
- The follow-up questions must clearly relate to the insight.
- The two questions must be different from each other.
- If the context includes a previous insight and a selected follow-up question, answer that direction with a fresh new insight.
- Avoid repeating the previous insight wording.
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

Behavior context:
- quiz summary: ${safeText(quizSummary)}
- recent chat summary: ${safeText(recentChatSummary)}
- detected keywords: ${safeText(keywordsSummary)}
- local scores: ${safeText(scoresSummary)}
- local prediction summary: ${safeText(localPrediction)}

Generate a strong Futuris insight for the requested category.
Then generate exactly two follow-up questions.
`.trim();

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "futuris_insight_response",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: {
                    type: "string"
                  },
                  insight: {
                    type: "string"
                  },
                  questions: {
                    type: "array",
                    items: {
                      type: "string"
                    },
                    minItems: 2,
                    maxItems: 2
                  },
                  advice: {
                    type: "string"
                  },
                  energy: {
                    type: "string"
                  },
                  focus: {
                    type: "string"
                  },
                  confidence: {
                    type: "integer"
                  }
                },
                required: [
                  "title",
                  "insight",
                  "questions",
                  "advice",
                  "energy",
                  "focus",
                  "confidence"
                ]
              }
            }
          },
          temperature: 0.8,
          max_tokens: 500
        })
      }
    );

    const rawData = await openAiResponse.json();

    if (!openAiResponse.ok) {
      console.error("Insight OpenAI API error:", JSON.stringify(rawData, null, 2));
      return res.status(500).json({
        success: false,
        message: rawData?.error?.message || "OpenAI request failed"
      });
    }

    const content =
      rawData?.choices?.[0]?.message?.content?.trim() || "";

    if (!content) {
      console.error("Insight OpenAI empty content:", JSON.stringify(rawData, null, 2));
      return res.status(500).json({
        success: false,
        message: "OpenAI returned empty content"
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error("Insight JSON parse error:", content);
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

    return res.json({
      success: true,
      title: safeResponseText(parsed.title, title),
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

function capitalizeCategory(text) {
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

module.exports = router;
