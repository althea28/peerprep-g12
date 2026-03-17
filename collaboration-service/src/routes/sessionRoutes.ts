import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
  createSession,
  getSession,
  getActiveSession,
  endSession,
} from '../controllers/sessionController';

const router = Router();

// POST /sessions - create a new collaboration room (called by Matching Service)
router.post('/', createSession);

// GET /sessions/active - get current user's active session (called to rejoin)
router.get('/active', authenticate, getActiveSession);

// GET /sessions/:sessionId - get a specific session
router.get('/:sessionId', authenticate, getSession);

// PATCH /sessions/:sessionId/end - end a session
router.patch('/:sessionId/end', authenticate, endSession);

export default router;