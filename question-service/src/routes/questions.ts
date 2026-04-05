import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import {
    getAllQuestions,
    getQuestionByNumber,
    createQuestion,
    editQuestion,
    archiveQuestion,
    restoreQuestion,
    deleteQuestion,
    getQuestionById,
} from '../controllers/questionController';

const router = Router();

router.get('/', requireAuth, requireAdmin, getAllQuestions);
router.get("/id/:questionId", requireAuth, getQuestionById);
router.get('/:questionNumber', requireAuth, requireAdmin, getQuestionByNumber);
router.post('/', requireAuth, requireAdmin, createQuestion);
router.patch('/:questionNumber', requireAuth, requireAdmin, editQuestion);
router.patch('/:questionNumber/archive', requireAuth, requireAdmin, archiveQuestion);
router.patch('/:questionNumber/restore', requireAuth, requireAdmin, restoreQuestion);
router.delete('/:questionNumber', requireAuth, requireAdmin, deleteQuestion);

export default router;