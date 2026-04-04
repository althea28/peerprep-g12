import type { CandidateMatch, MatchCriteria } from '../types/matchingEvents.js';
import { createLogger } from '../utils/logger.js';
import { createClient, type RedisClientType } from 'redis';

interface PendingConfirmationState {
	proposedMatch: CandidateMatch;
	acceptedUserIds: Set<string>;
}

interface WaitingUser {
	userId: string;
	criteria: MatchCriteria;
	queuedAt: number;
	rejectedCandidates: string[];
}

interface SerializedPendingConfirmationState {
	proposedMatch: CandidateMatch;
	acceptedUserIds: string[];
}

export interface UserMatchingStatus {
	userId: string;
	strikeCount: number;
	isBanned: boolean;
	isActivelyMatching: boolean;
}

export class RedisService {
	private readonly logger = createLogger('RedisService');
	private readonly client: RedisClientType;
	private readonly keyPrefix = 'matching';
	private readonly strikeTtlSeconds = 60 * 60;
	private readonly banTtlSeconds = 60 * 60;
	private readonly minimumCompatibilityScore = 3;
	private readonly difficultyRank: Record<MatchCriteria['difficulty'], number> = {
		easy: 1,
		medium: 2,
		hard: 3
	};

	constructor() {
        this.client = createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });

		this.client.on('error', (err) => this.logger.error('Redis client error', { error: err.message }));
        this.client.on('ready', () => this.logger.info('Redis connection is ready.'));
    }
	
	async connect(): Promise<void> {
		if (!this.client.isOpen) {
			await this.client.connect();
			await this.client.ping();
			this.logger.info('Connected to Redis service');
		}
	}

	private buildWaitingUserKey(userId: string): string {
		return `${this.keyPrefix}:waiting:user:${userId}`;
	}

	private buildTopicQueueKey(criteria: MatchCriteria): string {
		return `${this.keyPrefix}:queue:topic:${criteria.topic}`;
	}

	private buildBannedUserKey(userId: string): string {
		return `${this.keyPrefix}:banned:user:${userId}`;
	}

	private buildStrikeKey(userId: string): string {
		return `${this.keyPrefix}:strike:user:${userId}`;
	}

	// 'pending' keys refer to pending imperfect match confirmations
	private buildPendingByUserKey(userId: string): string {
		return `${this.keyPrefix}:pending:user:${userId}`;
	}

	private buildPendingStateKey(matchId: string): string {
		return `${this.keyPrefix}:pending:state:${matchId}`;
	}

	private buildPendingMatchId(match: CandidateMatch): string {
		const [a, b] = [match.userAId, match.userBId].sort();
		return `${a}:${b}`;
	}

	private parseWaitingUser(value: string | null): WaitingUser | null {
		if (!value) {
			return null;
		}

		try {
			const parsed = JSON.parse(value) as Partial<WaitingUser>;
			if (!parsed.userId || !parsed.criteria || typeof parsed.queuedAt !== 'number') {
				return null;
			}

			return {
				userId: parsed.userId,
				criteria: parsed.criteria,
				queuedAt: parsed.queuedAt,
				rejectedCandidates: Array.isArray(parsed.rejectedCandidates)
					? parsed.rejectedCandidates
					: []
			};
		} catch (error) {
			this.logger.error('Failed to parse waiting user payload', {
				error: error instanceof Error ? error.message : String(error),
				value
			});
			return null;
		}
	}

	private parsePendingState(value: string | null): PendingConfirmationState | null {
		if (!value) {
			return null;
		}

		try {
			const parsed = JSON.parse(value) as SerializedPendingConfirmationState;
			return {
				proposedMatch: parsed.proposedMatch,
				acceptedUserIds: new Set(parsed.acceptedUserIds)
			};
		} catch (error) {
			this.logger.error('Failed to parse pending confirmation payload', {
				error: error instanceof Error ? error.message : String(error),
				value
			});
			return null;
		}
	}

	private async savePendingState(matchId: string, state: PendingConfirmationState): Promise<void> {
		const serializable: SerializedPendingConfirmationState = {
			proposedMatch: state.proposedMatch,
			acceptedUserIds: Array.from(state.acceptedUserIds)
		};

		await this.client.set(this.buildPendingStateKey(matchId), JSON.stringify(serializable), { EX: 30 });
	}

	async enqueueUser(userId: string, criteria: MatchCriteria): Promise<void> {
		const waitingUserKey = this.buildWaitingUserKey(userId);

		// Check if user is already enqueued to prevent duplicates
		const existing = await this.client.get(waitingUserKey);
		if (existing) {
			this.logger.warn('User already queued, enqueue skipped', { userId, topic: criteria.topic });
			return;
		}

		const waitingUser: WaitingUser = {
			userId,
			criteria: {
				...criteria,
				rejectedCandidates: []
			},
			queuedAt: Date.now(),
			rejectedCandidates: []
		};

		const queueKey = this.buildTopicQueueKey(criteria);

		// Create user entry and add to topic queue concurrently
		await this.client.multi()
			.set(waitingUserKey, JSON.stringify(waitingUser))
			.zAdd(queueKey, { score: waitingUser.queuedAt, value: userId })
			.exec();
		const queueSize = await this.client.zCard(queueKey);

		this.logger.info('User enqueued', {
			userId,
			queueKey,
			queueSize,
			criteria
		});
	}

	async requeueUserWithSameWaitingTime(
		userId: string,
		criteria: MatchCriteria,
		queuedAt: number,
		rejectedCandidates: string[]
	): Promise<void> {
		const waitingUser: WaitingUser = {
			userId,
			criteria: {
				...criteria,
				rejectedCandidates: Array.from(new Set(rejectedCandidates))
			},
			queuedAt,
			rejectedCandidates: Array.from(new Set(rejectedCandidates))
		};

		const queueKey = this.buildTopicQueueKey(criteria);

		await this.client.multi()
			.set(this.buildWaitingUserKey(userId), JSON.stringify(waitingUser))
			.zAdd(queueKey, { score: queuedAt, value: userId })
			.exec();

		this.logger.info('User re-enqueued with preserved waiting time', {
			userId,
			queueKey,
			queuedAt,
			rejectedCandidatesCount: waitingUser.rejectedCandidates.length
		});
	}

	async removeUserFromQueue(userId: string): Promise<void> {
		const waitingUserKey = this.buildWaitingUserKey(userId);
		const waitingUser = this.parseWaitingUser(await this.client.get(waitingUserKey));
		if (!waitingUser) {
			this.logger.debug('removeUserFromQueue aborted: user not found in queue', { userId });
			return;
		}

		const queueKey = this.buildTopicQueueKey(waitingUser.criteria);

		// Remove user from topic queue and delete user entry concurrently
		await this.client.multi()
			.zRem(queueKey, userId)
			.del(waitingUserKey)
			.exec();
		const remainingQueueSize = await this.client.zCard(queueKey);

		this.logger.info('User removed from queue', {
			userId,
			queueKey,
			remainingQueueSize
		});
	}

	async banUser(userId: string): Promise<void> {
		const bannedUserKey = this.buildBannedUserKey(userId);
		const strikeKey = this.buildStrikeKey(userId);
		const pendingState = await this.getPendingConfirmationByUser(userId);

		// Ban user for 1 hour and clear their strike
		await this.client.multi()
			.set(bannedUserKey, 'true', { EX: this.banTtlSeconds })
			.del(strikeKey)
			.exec();
		await this.removeUserFromQueue(userId);

		this.logger.info('User banned', {
			userId,
			bannedUserKey,
			banTtlSeconds: this.banTtlSeconds,
			hadPendingConfirmation: Boolean(pendingState)
		});
	}

	async isUserBanned(userId: string): Promise<boolean> {
		return (await this.client.get(this.buildBannedUserKey(userId))) !== null;
	}

	async getUserStrikeCount(userId: string): Promise<number> {
		const strikeCount = Number(await this.client.get(this.buildStrikeKey(userId)) ?? 0);
		return Number.isFinite(strikeCount) && strikeCount > 0 ? strikeCount : 0;
	}

	async getUserMatchingStatus(userId: string): Promise<UserMatchingStatus> {
		const [strikeCount, isBanned, waitingUser, pendingState] = await Promise.all([
			this.getUserStrikeCount(userId),
			this.isUserBanned(userId),
			this.client.get(this.buildWaitingUserKey(userId)),
			this.getPendingConfirmationByUser(userId)
		]);

		const inTopicQueue = waitingUser !== null;
		const hasPendingConfirmation = pendingState !== null;

		return {
			userId,
			strikeCount,
			isBanned,
			isActivelyMatching: inTopicQueue || hasPendingConfirmation
		};
	}

	async recordEarlyTermination(userId: string): Promise<{ outcome: 'strike_recorded' | 'ban_triggered' | 'already_banned'; strikeCount?: number }> {
		if (await this.isUserBanned(userId)) {
			this.logger.debug('Early termination ignored because user is already banned', { userId });
			return { outcome: 'already_banned' };
		}

		// Create or increment strike count and set TTL so strike expires one hour after most recent strike
		const strikeKey = this.buildStrikeKey(userId);
		const transaction = await this.client
			.multi()
			.incr(strikeKey)
			.expire(strikeKey, this.strikeTtlSeconds)
			.exec();
		const strikeCount = Number(transaction?.[0] ?? 0);

		if (strikeCount < 5) {
			this.logger.info('Early termination strike recorded', {
				userId,
				strikeKey,
				strikeTtlSeconds: this.strikeTtlSeconds,
				strikeCount
			});
			return { outcome: 'strike_recorded', strikeCount };
		}

		// On 5th strike, user banned for an hour and strike history cleared for fresh start post-ban
		await this.banUser(userId);
		this.logger.info('Early termination allowance exceeded, user banned', { userId, strikeKey, strikeCount });
		return { outcome: 'ban_triggered', strikeCount };
	}

	// Check if user is currently in queue
	async isUserQueued(userId: string): Promise<boolean> {
		const waitingUser = this.parseWaitingUser(await this.client.get(this.buildWaitingUserKey(userId)));
		return waitingUser !== null;
	}

	// Check if user has pending imperfect match confirmation
	async hasPendingConfirmationState(userId: string): Promise<boolean> {
		const pending = await this.getPendingConfirmationByUser(userId);
		return pending !== null;
	}

	async findBestCandidate(requestingUserId: string): Promise<CandidateMatch | null> {
		// Turn text back into WaitingUser typescript interface
		const requester = this.parseWaitingUser(await this.client.get(this.buildWaitingUserKey(requestingUserId)));
		if (!requester) {
			this.logger.debug('findBestCandidate aborted: user is not queued', { requestingUserId });
			return null;
		}

		const queueKey = this.buildTopicQueueKey(requester.criteria);

		// Fetch 50 users from queue (over-fetching to give some buffer)
		// Double check user's own id is not taken for the 20 candidate ids
		// Fetch all candidate payloads
		const queuedUserIds = await this.client.zRange(queueKey, 0, 49);
		const candidateIds = queuedUserIds.filter((userId) => userId !== requestingUserId).slice(0, 20);
		const candidatePayloads = candidateIds.length > 0
			? await this.client.mGet(candidateIds.map((id) => this.buildWaitingUserKey(id)))
			: [];
		const candidatePool = candidatePayloads
			.map((value) => this.parseWaitingUser(value))
			.filter((candidate): candidate is WaitingUser => candidate !== null);

		// Can consider using this to notify users of low activity
		if (candidatePool.length === 0) {
			const totalQueueSize = await this.client.zCard(queueKey);
			this.logger.debug('No candidate to match with yet', {
				requestingUserId,
				queueKey,
				totalQueueSize
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
		// Loop through candidates and calculate compatibility score
		for (const candidate of candidatePool) {
			// Skip candidate if either side has candidate in rejected list (previously unsuccessfully matched)
			const requesterRejectedCandidate = requester.rejectedCandidates.includes(candidate.userId);
			const candidateRejectedRequester = candidate.rejectedCandidates.includes(requestingUserId);
			if (requesterRejectedCandidate || candidateRejectedRequester) {
				this.logger.debug('Skipping candidate due to prior rejection', {
					requestingUserId,
					candidateUserId: candidate.userId,
					requesterRejectedCandidate,
					candidateRejectedRequester
				});
				continue;
			}

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

			// Check if candidate has a higher score, then if tie check if candidate has longer waiting time
			const hasHigherScore = score > bestScore;
			const tieButOlder = score === bestScore && candidate.queuedAt < bestCandidate.queuedAt;
			const perfectTie = score === bestScore && candidate.queuedAt === bestCandidate.queuedAt;
			const breakPerfectTieWithCoinFlip = perfectTie && Math.random() > 0.5;
			if (hasHigherScore || tieButOlder || breakPerfectTieWithCoinFlip) {
				bestCandidate = candidate;
				bestScore = score;
			}
		}

		if (!bestCandidate) {
			this.logger.warn('No best candidate selected after scoring loop', { requestingUserId });
			return null;
		}

		// If best candidate does not meet minimum compatibility score of 3, skip matching for now
		if (bestScore < this.minimumCompatibilityScore) {
			this.logger.info('No candidate met minimum compatibility score', {
				requestingUserId,
				queueKey,
				bestScore,
				minimumCompatibilityScore: this.minimumCompatibilityScore
			});
			return null;
		}

		// If match found, remove both users from queue and delete their user entries concurrenntly
		await this.client.multi()
			.zRem(queueKey, [requestingUserId, bestCandidate.userId])
			.del([this.buildWaitingUserKey(requestingUserId), this.buildWaitingUserKey(bestCandidate.userId)])
			.exec();
		const remainingQueueSize = await this.client.zCard(queueKey);

		this.logger.info('Users matched and dequeued', {
			requestingUserId,
			matchedUserId: bestCandidate.userId,
			queueKey,
			remainingQueueSize,
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
		return languageMatch * 2 + difficultyMatch;
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
		const matchId = this.buildPendingMatchId(match);

		// Save pending confirmation state and index by both user ids concurrently
		await this.client.multi()
			.set(this.buildPendingByUserKey(match.userAId), matchId)
			.set(this.buildPendingByUserKey(match.userBId), matchId)
			.set(this.buildPendingStateKey(matchId), JSON.stringify({
				proposedMatch: state.proposedMatch,
				acceptedUserIds: []
			}))
			.exec();

		this.logger.info('Pending imperfect confirmation saved', {
			userAId: match.userAId,
			userBId: match.userBId,
			matchId,
			resolvedCriteria: match.resolvedCriteria
		});
	}

	async getPendingConfirmationByUser(userId: string): Promise<PendingConfirmationState | null> {
		const matchId = await this.client.get(this.buildPendingByUserKey(userId));
		if (!matchId) {
			return null;
		}

		return this.parsePendingState(await this.client.get(this.buildPendingStateKey(matchId)));
	}

	async setUserConfirmation(userId: string, accepted: boolean): Promise<void> {
		const matchId = await this.client.get(this.buildPendingByUserKey(userId));
		if (!matchId) {
			this.logger.warn('Confirmation received without pending match id', { userId, accepted });
			return;
		}
		
		// Ignore if no pending state found
		const state = this.parsePendingState(await this.client.get(this.buildPendingStateKey(matchId)));
		if (!state) {
			this.logger.warn('Confirmation received without pending state', { userId, accepted });
			return;
		}

		if (!accepted) {
			state.acceptedUserIds.delete(userId);
			await this.savePendingState(matchId, state);
			this.logger.info('User declined imperfect confirmation', {
				userId,
				acceptedUserCount: state.acceptedUserIds.size
			});
			return;
		}

		state.acceptedUserIds.add(userId);
		await this.savePendingState(matchId, state);
		this.logger.info('User accepted imperfect confirmation', {
			userId,
			acceptedUserCount: state.acceptedUserIds.size
		});
	}

	async clearPendingConfirmation(match: CandidateMatch): Promise<void> {
		const matchId = this.buildPendingMatchId(match);
		await this.client.multi()
			.del(this.buildPendingByUserKey(match.userAId))
			.del(this.buildPendingByUserKey(match.userBId))
			.del(this.buildPendingStateKey(matchId))
			.exec();
		this.logger.info('Pending imperfect confirmation cleared', {
			userAId: match.userAId,
			userBId: match.userBId,
			matchId
		});
	}
}
