function generateInsights(user) {
  let insights = [];

  // Always give at least 1 insight
  insights.push("Your journey is entering a new phase of self-discovery");

  if (user.lifeFocus === "Career") {
    insights.push("Career decisions will play a key role in your near future");
  }

  if (user.lifeFocus === "Love") {
    insights.push("Emotional connections may influence your next steps");
  }

  if (user.state === "Lost") {
    insights.push("You may be searching for clarity and direction");
  }

  if (user.state === "Stressed") {
    insights.push("You may need balance and time to recharge");
  }

  if (user.intent === "Direction") {
    insights.push("A major decision could shape your upcoming phase");
  }

  return insights;
}

module.exports = generateInsights;