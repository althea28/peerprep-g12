import { Router } from "express";
import { sendPrompt } from "../controllers/aiChatController";

const router = Router();

// POST /sessions/:sessionId/chat - send a prompt in ai chat and receive response from ai agent
router.post('/sessions/:sessionId/chat', sendPrompt);

export default router;
