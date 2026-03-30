import type { CandidateMatch, MatchCriteria } from '../types/matchingEvents.js';
import { createLogger } from '../utils/logger.js';

interface PendingConfirmationState {
	proposedMatch: CandidateMatch;
	acceptedUserIds: Set<string>;
}

interface WaitingUser {
	userId: string;
	criteria: MatchCriteria;
	queuedAt: number;
}

export class RedisService {
	private readonly logger = createLogger('RedisService');
	private readonly waitingByUserId = new Map<string, WaitingUser>();
	private readonly topicQueues = new Map<string, WaitingUser[]>();
	private readonly pendingConfirmationByUser = new Map<string, PendingConfirmationState>();
	private readonly difficultyRank: Record<MatchCriteria['difficulty'], number> = {
		easy: 1,
		medium: 2,
		hard: 3
	};

	async connect(): Promise<void> {
		// replace with real Redis client
		this.logger.info('Initialized Redis service');
	}

	private buildTopicQueueKey(criteria: MatchCriteria): string {
		return `topic:${criteria.topic}`;
	}

	async enqueueUser(userId: string, criteria: MatchCriteria): Promise<void> {
		if (this.waitingByUserId.has(userId)) {
			this.logger.warn('User already queued, enqueue skipped', { userId, topic: criteria.topic });
			return;
		}

		const waitingUser: WaitingUser = {
			userId,
			criteria,
			queuedAt: Date.now()
		};

		const queueKey = this.buildTopicQueueKey(criteria);
		const queue = this.topicQueues.get(queueKey) ?? [];
		queue.push(waitingUser);

		// Longest waiting time first 
		queue.sort((a, b) => a.queuedAt - b.queuedAt);

		this.topicQueues.set(queueKey, queue);
		this.waitingByUserId.set(userId, waitingUser);
		this.logger.info('User enqueued', {
			userId,
			queueKey,
			queueSize: queue.length,
			criteria
		});
	}

	async removeUserFromQueue(userId: string): Promise<void> {
		const waitingUser = this.waitingByUserId.get(userId);
		if (!waitingUser) {
			this.logger.debug('removeUserFromQueue aborted: user not found in queue', { userId });
			return;
		}

		const queueKey = this.buildTopicQueueKey(waitingUser.criteria);
		const queue = this.topicQueues.get(queueKey);
		if (queue) {
			this.topicQueues.set(
				queueKey,
				queue.filter((entry) => entry.userId !== userId)
			);
		}

		this.waitingByUserId.delete(userId);
		this.logger.info('User removed from queue', {
			userId,
			queueKey,
			remainingQueueSize: this.topicQueues.get(queueKey)?.length ?? 0
		});
	}

	async findBestCandidate(requestingUserId: string): Promise<CandidateMatch | null> {
		const requester = this.waitingByUserId.get(requestingUserId);
		if (!requester) {
			this.logger.debug('findBestCandidate aborted: user is not queued', { requestingUserId });
			return null;
		}

		const queueKey = this.buildTopicQueueKey(requester.criteria);
		const queue = this.topicQueues.get(queueKey) ?? [];
		const candidatePool = queue
			.filter((entry) => entry.userId !== requestingUserId)
			.slice(0, 20);

		if (candidatePool.length === 0) {
			this.logger.debug('No candidate to match with yet', {
				requestingUserId,
				queueKey,
				totalQueueSize: queue.length
			});
			return null;
		}
		this.logger.info('Evaluating candidate pool', {
			requestingUserId,
			queueKey,
			candidatePoolSize: candidatePool.length
		});

		let bestCandidate: WaitingUser | null = null;
		let bestScore = -1;

		for (const candidate of candidatePool) {
			const score = this.calculateCompatibilityScore(requester.criteria, candidate.criteria);
			this.logger.debug('Compatibility score calculated', {
				requestingUserId,
				candidateUserId: candidate.userId,
				score,
				candidateQueuedAt: candidate.queuedAt,
				candidateCriteria: candidate.criteria
			});
			if (!bestCandidate) {
				bestCandidate = candidate;
				bestScore = score;
				continue;
			}

			const hasHigherScore = score > bestScore;
			const tieButOlder = score === bestScore && candidate.queuedAt < bestCandidate.queuedAt;
			if (hasHigherScore || tieButOlder) {
				bestCandidate = candidate;
				bestScore = score;
			}
		}

		if (!bestCandidate) {
			this.logger.warn('No best candidate selected after scoring loop', { requestingUserId });
			return null;
		}

		// Remove both users from queue immediately after matched
		const matchedUserIds = new Set([requestingUserId, bestCandidate.userId]);
		this.topicQueues.set(
			queueKey,
			queue.filter((entry) => !matchedUserIds.has(entry.userId))
		);
		this.waitingByUserId.delete(requestingUserId);
		this.waitingByUserId.delete(bestCandidate.userId);
		this.logger.info('Users matched and dequeued', {
			requestingUserId,
			matchedUserId: bestCandidate.userId,
			queueKey,
			remainingQueueSize: this.topicQueues.get(queueKey)?.length ?? 0,
			isPerfect:
				requester.criteria.language === bestCandidate.criteria.language &&
				requester.criteria.difficulty === bestCandidate.criteria.difficulty
		});

		return {
			userAId: requester.userId,
			userBId: bestCandidate.userId,
			isPerfect:
				requester.criteria.language === bestCandidate.criteria.language &&
				requester.criteria.difficulty === bestCandidate.criteria.difficulty,
			criteriaA: requester.criteria,
			criteriaB: bestCandidate.criteria,
			queuedAtUserA: requester.queuedAt,
			queuedAtUserB: bestCandidate.queuedAt
		};
	}

	private calculateCompatibilityScore(a: MatchCriteria, b: MatchCriteria): number {
		const languageMatch = a.language === b.language ? 1 : 0;
		const difficultyMatch = this.getDifficultyUtility(a.difficulty, b.difficulty);
		return languageMatch * 5 + difficultyMatch;
	}

	private getDifficultyUtility(a: MatchCriteria['difficulty'], b: MatchCriteria['difficulty']): number {
		const distance = Math.abs(this.difficultyRank[a] - this.difficultyRank[b]);
		if (distance === 0) {
			return 3;
		}
		if (distance === 1) {
			return 2;
		}
		return 1;
	}

	async savePendingConfirmation(match: CandidateMatch): Promise<void> {
		const state: PendingConfirmationState = {
			proposedMatch: match,
			acceptedUserIds: new Set<string>()
		};

		this.pendingConfirmationByUser.set(match.userAId, state);
		this.pendingConfirmationByUser.set(match.userBId, state);
		this.logger.info('Pending imperfect confirmation saved', {
			userAId: match.userAId,
			userBId: match.userBId,
			resolvedCriteria: match.resolvedCriteria
		});
	}

	async getPendingConfirmationByUser(userId: string): Promise<PendingConfirmationState | null> {
		return this.pendingConfirmationByUser.get(userId) ?? null;
	}

	async setUserConfirmation(userId: string, accepted: boolean): Promise<void> {
		const state = this.pendingConfirmationByUser.get(userId);
		if (!state) {
			this.logger.warn('Confirmation received without pending state', { userId, accepted });
			return;
		}

		if (!accepted) {
			state.acceptedUserIds.delete(userId);
			this.logger.info('User declined imperfect confirmation', {
				userId,
				acceptedUserCount: state.acceptedUserIds.size
			});
			return;
		}

		state.acceptedUserIds.add(userId);
		this.logger.info('User accepted imperfect confirmation', {
			userId,
			acceptedUserCount: state.acceptedUserIds.size
		});
	}

	async clearPendingConfirmation(match: CandidateMatch): Promise<void> {
		this.pendingConfirmationByUser.delete(match.userAId);
		this.pendingConfirmationByUser.delete(match.userBId);
		this.logger.info('Pending imperfect confirmation cleared', {
			userAId: match.userAId,
			userBId: match.userBId
		});
	}
}
