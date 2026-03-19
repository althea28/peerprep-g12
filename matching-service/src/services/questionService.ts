/**
 * Fetches and validates list of valid topics.
 */

import { Topic } from '../types/matchingEvents.js';

export class QuestionService {
	constructor(private readonly questionServiceBaseUrl?: string) {}

	async connect(): Promise<void> {
		// Placeholder: Verify connection to Question Service on startup.
		// Fetch valid topics from REST API.
		if (this.questionServiceBaseUrl) {
			console.log(`Using Question Service at ${this.questionServiceBaseUrl}`);
		} else {
			console.log('Using enum topics');
		}
	}

	async getValidTopics(): Promise<string[]> {
		// Placeholder: GET /topics from question-service
		// For now, return enum values
		return Object.values(Topic);
	}

	async validateTopic(topic: string): Promise<boolean> {
		// Placeholder: Check if topic exists in Question Service
		const validTopics = await this.getValidTopics();
		return validTopics.includes(topic);
	}
}
