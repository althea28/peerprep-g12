import { Router } from 'express';
import type { RedisService } from '../services/redisService.js';
import type { MatchingService } from '../services/matchingService.js';
import { createEarlyTerminationHandler, createGetUserStatusHandler } from '../controllers/matchingController.js';

const createMatchingRoutes = (redisService: RedisService, matchingService: MatchingService) => {
	const router = Router();

	// GET /users/:userId/status - get the current matching status of a user
	// User's strike count, ban status, and whether they are currently in a match or not
	router.get('/users/:userId/status', createGetUserStatusHandler(redisService));

	// POST /internal/early-termination - record an early termination strike for a user (called by Collaboration Service)
	router.post('/internal/early-termination', createEarlyTerminationHandler((userId) => matchingService.handleEarlyTermination(userId)));
	
	return router;
};

export default createMatchingRoutes;