import { callClaude } from "./claudeService.js";

export const generateExplanation = async (type, question, code) => {
  let prompt;

  switch (type) {
    case "EXPLAIN_QUESTION":
      prompt = `Explain this coding problem simply:\n${question}`;
      break;

    case "HINT":
      prompt = `Give a hint (not solution) for this problem:\n${question}\nCode:\n${code}`;
      break;

    case "EXPLAIN_CODE":
      prompt = `Explain this code:\n${code}`;
      break;

    default:
      throw new Error("Invalid type");
  }

  return await callClaude(prompt);
};