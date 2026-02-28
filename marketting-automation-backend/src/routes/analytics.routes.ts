import { Router } from 'express';
import { getDashboardMetrics, getPostAnalytics } from '../controllers/analytics.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.use(authenticate);

router.get('/dashboard', getDashboardMetrics);
router.get('/posts/:id', getPostAnalytics);

export default router;
