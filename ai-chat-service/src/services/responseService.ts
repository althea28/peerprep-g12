type GenerateAiResponseInput = {
  sessionId: string;
  userId: string;
  prompt: string;
};

export async function generateAiResponse(
  _input: GenerateAiResponseInput
): Promise<string> {
  // Placeholder implementation until external AI API integration is added.
  return "Ai response";
}
