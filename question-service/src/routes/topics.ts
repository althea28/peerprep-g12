import { Router } from 'express'; 
import { requireAuth, requireAdmin } from '../middleware/auth';
import  { getAllTopics, createTopic, deleteTopic } from '../controllers/topicController';

const router = Router(); 

router.get('/', getAllTopics); 
router.post('/', requireAuth, requireAdmin, createTopic);
router.delete('/:name', requireAuth, requireAdmin, deleteTopic);

export default router; 