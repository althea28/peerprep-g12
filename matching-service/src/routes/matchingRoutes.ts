import { Router } from 'express';
import type { RedisService } from '../services/redisService.js';
import type { MatchingService } from '../services/matchingService.js';
import { createBanUserHandler } from '../controllers/matchingController.js';

const createMatchingRoutes = (redisService: RedisService, matchingService: MatchingService) => {
	const router = Router();
	router.post('/ban', createBanUserHandler(redisService, (userId) => matchingService.handleExternalBan(userId)));
	return router;
};

export default createMatchingRoutes;