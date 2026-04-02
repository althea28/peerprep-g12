import type { Request, Response } from 'express';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MatchingController');

export const banUser = async (req: Request, res: Response): Promise<void> => {
    try {
        // Interservice security check to ensure malicious user cannot ban othersby calling the endpoint directly
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
            logger.error('Missing userId in user ban request body');
            res.status(400).json({ error: `Missing required field: userId` });
            return;
        }

        const { userId } = req.body
        
        // TBD: Await ban operation from Redis service

        logger.info(`User ${userId} banned successfully.`);
        res.status(200).json({ message: `User ${userId} banned successfully.` });
    } catch (err: any) {
        logger.error(`Error occurred while banning user: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
};

