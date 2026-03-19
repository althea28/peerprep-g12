import type { Server, Socket } from 'socket.io';
import {
	ActionFlowStatus,
	DifficultyLevel,
	MatchResponseStatus,
	ProgrammingLanguage,
	WebSocketEventType,
	type CancelRequestPayload,
	type CandidateMatch,
	type ConfirmRequestPayload,
	type MatchRequestPayload,
	type MatchResponsePayload
} from '../types/matchingEvents.js';
import { RedisService } from './redisService.js';
import { QuestionService } from './questionService.js';

const PERFECT_MATCH_TIMEOUT_MS = 30_000;
const IMPERFECT_CONFIRMATION_TIMEOUT_MS = 30_000;
const DIFFICULTY_RANK: Record<DifficultyLevel, number> = {
	[DifficultyLevel.EASY]: 1,
	[DifficultyLevel.MEDIUM]: 2,
	[DifficultyLevel.HARD]: 3
};

interface ActiveMatchContext {
	socketId: string;
	userId: string;
	perfectMatchTimer?: NodeJS.Timeout;
	confirmationTimer?: NodeJS.Timeout;
	proposedImperfectMatch?: CandidateMatch;
}

export class MatchingService {
	private activeContextsByUserId = new Map<string, ActiveMatchContext>();

	constructor(
		private readonly io: Server,
		private readonly redisService: RedisService,
		private readonly questionService: QuestionService,
		private readonly collaborationServiceBaseUrl: string
	) {}

	async handleMatchRequest(socket: Socket, payload: MatchRequestPayload): Promise<void> {
		const { userId, criteria } = payload;

		// Validate difficulty and language
		const validDifficulties = Object.values(DifficultyLevel);
		const validLanguages = Object.values(ProgrammingLanguage);

		if (!validDifficulties.includes(criteria.difficulty)) {
			this.emitMatchResponse(socket, {
				status: MatchResponseStatus.UNSUCCESSFUL_MATCH,
				flowStatus: ActionFlowStatus.TERMINATED,
				message: 'Invalid difficulty level.'
			});
			return;
		}

		if (!validLanguages.includes(criteria.language)) {
			this.emitMatchResponse(socket, {
				status: MatchResponseStatus.UNSUCCESSFUL_MATCH,
				flowStatus: ActionFlowStatus.TERMINATED,
				message: 'Invalid programming language.'
			});
			return;
		}

		// Validate topic against Question Service
		const isValidTopic = await this.questionService.validateTopic(criteria.topic);

		if (!isValidTopic) {
			this.emitMatchResponse(socket, {
				status: MatchResponseStatus.UNSUCCESSFUL_MATCH,
				flowStatus: ActionFlowStatus.TERMINATED,
				message: 'Invalid topic.'
			});
			return;
		}

		await this.redisService.enqueueUser(userId, criteria);
		this.setOrResetContext(socket.id, userId);

		this.emitMatchResponse(socket, {
			status: MatchResponseStatus.QUEUED,
			flowStatus: ActionFlowStatus.WAITING_PERFECT_MATCH,
			timeoutSeconds: PERFECT_MATCH_TIMEOUT_MS / 1000,
			message: 'Searching for a perfect match.'
		});

		this.startPerfectMatchTimer(socket, userId);

		// Placeholder: Replace this with a loop based matching logic.
		const candidate = await this.redisService.findBestCandidate(userId);
		if (!candidate) {
			return;
		}

		if (candidate.isPerfect) {
			await this.completePerfectMatch(socket, candidate);
			return;
		}

		await this.startImperfectMatchConfirmation(socket, userId, candidate);
	}

	async handleCancelRequest(socket: Socket, payload: CancelRequestPayload): Promise<void> {
		const { userId } = payload;
		const context = this.activeContextsByUserId.get(userId);

		if (context?.perfectMatchTimer) {
			clearTimeout(context.perfectMatchTimer);
		}
		if (context?.confirmationTimer) {
			clearTimeout(context.confirmationTimer);
		}

		await this.redisService.removeUserFromQueue(userId);

		if (context?.proposedImperfectMatch) {
			await this.redisService.clearPendingConfirmation(context.proposedImperfectMatch);
		}

		this.activeContextsByUserId.delete(userId);
		socket.emit(WebSocketEventType.CANCEL_RESPONSE, {
			status: MatchResponseStatus.CANCELLED,
			flowStatus: ActionFlowStatus.TERMINATED,
			message: 'Matching cancelled by user.'
		});
	}

	async handleConfirmRequest(socket: Socket, payload: ConfirmRequestPayload): Promise<void> {
		const { userId, accepted } = payload;
		const context = this.activeContextsByUserId.get(userId);
		if (!context?.proposedImperfectMatch) {
			return;
		}

		if (!accepted) {
			await this.failImperfectMatch(context.proposedImperfectMatch, 'One user declined imperfect match.');
			return;
		}

		await this.redisService.setUserConfirmation(userId, accepted);
		const pending = await this.redisService.getPendingConfirmationByUser(userId);

		if (!pending) {
			return;
		}

		const allConfirmed =
			pending.acceptedUserIds.has(pending.proposedMatch.userAId) &&
			pending.acceptedUserIds.has(pending.proposedMatch.userBId);

		if (!allConfirmed) {
			return;
		}

		await this.finalizeConfirmedImperfectMatch(pending.proposedMatch);
		this.emitToUser(pending.proposedMatch.userAId, {
			status: MatchResponseStatus.MATCH_SUCCESS,
			flowStatus: ActionFlowStatus.COMPLETED,
			message: 'Imperfect match confirmed by both users.'
		});
		this.emitToUser(pending.proposedMatch.userBId, {
			status: MatchResponseStatus.MATCH_SUCCESS,
			flowStatus: ActionFlowStatus.COMPLETED,
			message: 'Imperfect match confirmed by both users.'
		});
	}

	handleSocketDisconnect(socketId: string): void {
		// Placeholder: Find user that owns socket and do necessary cleanup.
        // Clear active timers and Redis state. 
        // Remove in memory context and if there is another user waiting for match, notify them.
		void socketId;
	}

	private setOrResetContext(socketId: string, userId: string): void {
		const current = this.activeContextsByUserId.get(userId);
		if (current?.perfectMatchTimer) {
			clearTimeout(current.perfectMatchTimer);
		}
		if (current?.confirmationTimer) {
			clearTimeout(current.confirmationTimer);
		}

		this.activeContextsByUserId.set(userId, { socketId, userId });
	}

	private startPerfectMatchTimer(socket: Socket, userId: string): void {
		const context = this.activeContextsByUserId.get(userId);
		if (!context) {
			return;
		}

		context.perfectMatchTimer = setTimeout(async () => {
			await this.redisService.removeUserFromQueue(userId);
			this.activeContextsByUserId.delete(userId);
			this.emitMatchResponse(socket, {
				status: MatchResponseStatus.MATCH_TIMEOUT,
				flowStatus: ActionFlowStatus.TERMINATED,
				message: 'No match found within 30 seconds.'
			});
		}, PERFECT_MATCH_TIMEOUT_MS);
	}

	private async completePerfectMatch(socket: Socket, candidate: CandidateMatch): Promise<void> {
		const roomId = await this.createCollaborationRoom(candidate);
		this.activeContextsByUserId.delete(candidate.userAId);
		this.activeContextsByUserId.delete(candidate.userBId);

		this.emitMatchResponse(socket, {
			status: MatchResponseStatus.PERFECT_MATCH_FOUND,
			flowStatus: ActionFlowStatus.CREATING_COLLABORATION_ROOM,
			roomId,
			message: 'Perfect match found.'
		});

		this.emitToUser(candidate.userAId, {
			status: MatchResponseStatus.MATCH_SUCCESS,
			flowStatus: ActionFlowStatus.COMPLETED,
			roomId,
			message: 'Perfect match successful.'
		});
		this.emitToUser(candidate.userBId, {
			status: MatchResponseStatus.MATCH_SUCCESS,
			flowStatus: ActionFlowStatus.COMPLETED,
			roomId,
			message: 'Perfect match successful.'
		});
	}

	private async startImperfectMatchConfirmation(
		socket: Socket,
		userId: string,
		candidate: CandidateMatch
	): Promise<void> {
		const context = this.activeContextsByUserId.get(userId);
		if (!context) {
			return;
		}

		const resolvedCandidate = this.resolveImperfectMatchCriteria(candidate);
		context.proposedImperfectMatch = resolvedCandidate;
		await this.redisService.savePendingConfirmation(resolvedCandidate);

		this.emitMatchResponse(socket, {
			status: MatchResponseStatus.IMPERFECT_MATCH_NEEDS_CONFIRMATION,
			flowStatus: ActionFlowStatus.WAITING_IMPERFECT_CONFIRMATION,
			timeoutSeconds: IMPERFECT_CONFIRMATION_TIMEOUT_MS / 1000,
			proposedMatch: resolvedCandidate,
			message: 'Imperfect match proposed. Waiting for both confirmations.'
		});

		context.confirmationTimer = setTimeout(async () => {
			await this.failImperfectMatch(resolvedCandidate, 'Confirmation window expired.');
		}, IMPERFECT_CONFIRMATION_TIMEOUT_MS);
	}

	private resolveImperfectMatchCriteria(candidate: CandidateMatch): CandidateMatch {
		const longerWaitingUserId = this.getLongerWaitingUserId(candidate);
		const lowerDifficulty = this.getLowerDifficulty(candidate.criteriaA.difficulty, candidate.criteriaB.difficulty);
		const resolvedLanguage =
			longerWaitingUserId === candidate.userAId
				? candidate.criteriaA.language
				: candidate.criteriaB.language;

		const resolvedTopic =
			longerWaitingUserId === candidate.userAId ? candidate.criteriaA.topic : candidate.criteriaB.topic;

		return {
			...candidate,
			resolvedCriteria: {
				topic: resolvedTopic,
				difficulty: lowerDifficulty,
				language: resolvedLanguage
			}
		};
	}

    // Get the user who has a longer waiting time
	private getLongerWaitingUserId(candidate: CandidateMatch): string {
		if (
			typeof candidate.queuedAtUserA === 'number' &&
			typeof candidate.queuedAtUserB === 'number'
		) {
			return candidate.queuedAtUserA <= candidate.queuedAtUserB ? candidate.userAId : candidate.userBId;
		}

		// Placeholder until Redis set up.
		return candidate.userAId;
	}

	private getLowerDifficulty(a: DifficultyLevel, b: DifficultyLevel): DifficultyLevel {
		return DIFFICULTY_RANK[a] <= DIFFICULTY_RANK[b] ? a : b;
	}

	private async failImperfectMatch(candidate: CandidateMatch, reason: string): Promise<void> {
		await this.redisService.clearPendingConfirmation(candidate);

		this.activeContextsByUserId.delete(candidate.userAId);
		this.activeContextsByUserId.delete(candidate.userBId);

		this.emitToUser(candidate.userAId, {
			status: MatchResponseStatus.UNSUCCESSFUL_MATCH,
			flowStatus: ActionFlowStatus.TERMINATED,
			message: reason
		});
		this.emitToUser(candidate.userBId, {
			status: MatchResponseStatus.UNSUCCESSFUL_MATCH,
			flowStatus: ActionFlowStatus.TERMINATED,
			message: reason
		});
	}

	private async finalizeConfirmedImperfectMatch(candidate: CandidateMatch): Promise<void> {
		const roomId = await this.createCollaborationRoom(candidate);
		await this.redisService.clearPendingConfirmation(candidate);

		this.activeContextsByUserId.delete(candidate.userAId);
		this.activeContextsByUserId.delete(candidate.userBId);

		this.emitToUser(candidate.userAId, {
			status: MatchResponseStatus.MATCH_SUCCESS,
			flowStatus: ActionFlowStatus.COMPLETED,
			roomId,
			message: 'Imperfect match confirmed and room created.'
		});
		this.emitToUser(candidate.userBId, {
			status: MatchResponseStatus.MATCH_SUCCESS,
			flowStatus: ActionFlowStatus.COMPLETED,
			roomId,
			message: 'Imperfect match confirmed and room created.'
		});
	}

	private async createCollaborationRoom(candidate: CandidateMatch): Promise<string> {
		const response = await fetch(`${this.collaborationServiceBaseUrl}/rooms`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				userAId: candidate.userAId,
				userBId: candidate.userBId,
				resolvedCriteria: candidate.resolvedCriteria
			})
		});

		// Placeholder: Add retries, idempotency keys, and response validation.
		const body = (await response.json()) as { room_id?: string };
		return body.room_id ?? 'placeholder-room-id';
	}

	private emitMatchResponse(socket: Socket, payload: MatchResponsePayload): void {
		socket.emit(WebSocketEventType.MATCH_RESPONSE, payload);
	}

	private emitToUser(userId: string, payload: MatchResponsePayload): void {
		const context = this.activeContextsByUserId.get(userId);
		if (!context) {
			return;
		}

		this.io.to(context.socketId).emit(WebSocketEventType.MATCH_RESPONSE, payload);
	}
}
