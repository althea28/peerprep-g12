import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
  createSession,
  getSession,
  getActiveSession,
  getActiveSessionByUserIdInternal,
  getPastSessions,
  endSession,
} from '../controllers/sessionController';

const router = Router();

// POST /sessions - create a new collaboration room (called by Matching Service)
router.post('/', createSession);

// GET /sessions/active - get current user's active session (called to rejoin)
router.get('/active', authenticate, getActiveSession);

// GET /sessions/history - get current user's past session history
router.get('/history', authenticate, getPastSessions); 

// GET /sessions/:sessionId - get a specific session
router.get('/:sessionId', authenticate, getSession);

// Internal route for Matching Service
router.get('/internal/active/:userId', getActiveSessionByUserIdInternal);

// PATCH /sessions/:sessionId/end - end a session
router.patch('/:sessionId/end', authenticate, endSession);


export default router;