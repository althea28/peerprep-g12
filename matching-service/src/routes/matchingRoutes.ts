import { Router } from 'express';
import { banUser } from '../controllers/matchingController.js';

const router = Router();

router.post('/ban', banUser);

export default router;