import type { Request, Response } from 'express';
import { createLogger } from '../utils/logger.js';
import type { EarlyTerminationDecision } from '../services/matchingService.js';
import type { RedisService } from '../services/redisService.js';

const logger = createLogger('MatchingController');

export const createEarlyTerminationHandler = (
    onEarlyTermination: (userId: string) => Promise<EarlyTerminationDecision>
) => {
	return async (req: Request, res: Response): Promise<void> => {
		try {
            // Interservice security check to ensure malicious user cannot ban others by calling the endpoint directly
			const expectedKey = process.env.INTERNAL_SERVICE_SECRET;
			const apiKey = req.headers['x-internal-service-secret'];

			if (!expectedKey) {
				logger.error('INTERNAL_SERVICE_SECRET is not set in environment variables');
				res.status(500).json({ error: 'Internal server error' });
				return;
			}

            if (apiKey !== process.env.INTERNAL_SERVICE_SECRET) {
                logger.error('Incorrect API key provided');
                res.status(403).json({ error: 'Incorrect key, request forbidden' });
                return;
            }

            if (!req.body.userId) {
                logger.error('Missing userId in early termination request body');
                res.status(400).json({ error: 'Missing required field: userId' });
                return;
            }

            const { userId } = req.body as { userId: string };
            const decision = await onEarlyTermination(userId);

            if (decision.outcome === 'ban_triggered') {
                logger.info(`User ${userId} received a fifth early termination strike and was banned.`);
                res.status(200).json({
                    message: `User ${userId} received a fifth strike and was banned.`,
                    ...decision
                });
                return;
            }

            if (decision.outcome === 'strike_recorded') {
                logger.info(`Recorded early termination strike for user ${userId}.`);
                res.status(200).json({
                    message: `Recorded early termination strike ${decision.strikeCount ?? 0} for user ${userId}.`,
                    ...decision
                });
                return;
            }

            logger.debug(`User ${userId} is already banned.`);
            res.status(200).json({ message: `User ${userId} is already banned.`, ...decision });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`Error occurred while handling early termination: ${message}`);
            res.status(500).json({ error: message });
        }
    };
};

export const createGetUserStatusHandler = (redisService: RedisService) => {
    return async (req: Request, res: Response): Promise<void> => {
        try {
            const rawUserId = req.params.userId;
            const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
            if (!userId) {
                res.status(400).json({ error: 'Missing required parameter: userId' });
                return;
            }

            const status = await redisService.getUserMatchingStatus(userId);
            res.status(200).json(status);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`Error occurred while retrieving user status: ${message}`);
            res.status(500).json({ error: message });
        }
    };
};
