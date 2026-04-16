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

    let generatedInsight = "";
    let advice = "";
    let energy = "Balanced";
    let focus = category;
    let confidence = 78;
    let title = `${capitalize(category)} Insight`;

    if (category.toLowerCase() === "career") {
      generatedInsight =
        `${firstName}, your recent energy suggests that your career and study path is becoming more focused. ` +
        `The signals around ${keywordsSummary.toLowerCase()} show that you are in a phase where discipline, consistency, and smart timing matter more than speed. ` +
        `Your current momentum suggests that a useful opportunity may grow if you stay steady and avoid doubting your progress too early.`;
      advice =
        "Stay consistent this week and put extra energy into one important goal instead of dividing yourself too much.";
      energy = "Focused";
      confidence = 84;
    } else if (category.toLowerCase() === "love") {
      generatedInsight =
        `${firstName}, your emotional field shows strong sensitivity at the moment. ` +
        `The patterns in your recent words suggest that love is affecting your thoughts more deeply than usual. ` +
        `This period may bring emotional clarity, especially if you stop forcing answers and let actions reveal true intentions.`;
      advice =
        "Pay attention to emotional consistency, not only beautiful words.";
      energy = "Emotional";
      confidence = 83;
    } else if (category.toLowerCase() === "finance") {
      generatedInsight =
        `${firstName}, your financial energy suggests a period of caution mixed with potential improvement. ` +
        `Your recent signals show that practical decisions will have more impact than lucky timing. ` +
        `A small change in habits may create a more stable rhythm very soon.`;
      advice =
        "Focus on control and planning before making any unnecessary spending decisions.";
      energy = "Grounded";
      confidence = 80;
    } else if (category.toLowerCase() === "mood") {
      generatedInsight =
        `${firstName}, your inner rhythm appears heavy but meaningful. ` +
        `Your recent emotional signals suggest that your mind is processing many things at once, and this can feel draining. ` +
        `Still, this phase may help you understand what truly deserves your energy and what needs to be released.`;
      advice =
        "Protect your peace and reduce pressure from things that are not urgent.";
      energy = "Sensitive";
      confidence = 82;
    } else if (category.toLowerCase() === "decisions") {
      generatedInsight =
        `${firstName}, you seem to be standing at a turning point where hesitation and instinct are both active. ` +
        `Your recent patterns suggest that clarity may come once you stop trying to control every possible outcome. ` +
        `A better decision is likely to appear when you simplify the situation and trust what feels steady, not only exciting.`;
      advice =
        "Choose what gives long-term peace, not only short-term relief.";
      energy = "Reflective";
      confidence = 81;
    } else if (category.toLowerCase() === "life_path") {
      generatedInsight =
        `${firstName}, your life path signals suggest that you are entering a phase of deeper self-understanding. ` +
        `The themes around purpose, growth, and identity are becoming stronger, which means your direction is slowly clarifying. ` +
        `This is less about immediate answers and more about noticing which path keeps calling you back.`;
      advice =
        "Notice what keeps returning to your mind. It may be pointing toward your next real step.";
      energy = "Awakening";
      confidence = 85;
    } else {
      generatedInsight =
        `${firstName}, your recent signals suggest that this area of your life is active and evolving. ` +
        `There is movement beneath the surface, and your current choices may shape the next phase more than you realize.`;
      advice =
        "Move with awareness and keep observing the patterns around you.";
      energy = "Balanced";
      confidence = 76;
    }

    if (localPrediction && localPrediction.trim() !== "") {
      generatedInsight += ` Your previous pattern also suggested: ${localPrediction}`;
    }

    return res.json({
      success: true,
      title,
      insight: generatedInsight,
      advice,
      energy,
      focus,
      confidence,
      source: "dynamic-local-server",
      message: "Insight generated successfully"
    });
  } catch (error) {
    console.error("Insight generation error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate insight"
    });
  }
});

function capitalize(text) {
  if (!text || typeof text !== "string") return "Futuris";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

module.exports = router;
