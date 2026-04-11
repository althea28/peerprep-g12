type PromptContextInput = {
	language: string;
	difficulty: string;
	topic: string;
	questionId: string;
	codeContent: string;
	userPrompt: string;
};

export function buildPrompt(input: PromptContextInput): string {
	void input.language;
	void input.difficulty;
	void input.topic;
	void input.questionId;
	void input.codeContent;

	// Placeholder until full prompt crafting strategy is implemented
	return input.userPrompt;
}
