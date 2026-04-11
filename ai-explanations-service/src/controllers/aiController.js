import { generateExplanation } from "../services/explanationService.js";

const requestCount = new Map();
const MAX_REQUESTS = 10;

export const handleExplain = async (req, res) => {
  const { type, question, code, sessionId } = req.body;

  if (!type || !sessionId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const allowedTypes = ["EXPLAIN_QUESTION", "HINT", "EXPLAIN_CODE"];
  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ message: "Invalid type" });
  }

  const currentCount = requestCount.get(sessionId) || 0;

  if (currentCount >= MAX_REQUESTS) {
    return res.status(403).json({ message: "Limit reached" });
  }

  requestCount.set(sessionId, currentCount + 1);

  try {
    const result = await generateExplanation(type, question, code);

    res.json({
      response: result,
      remainingRequests: MAX_REQUESTS - (currentCount + 1),
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};