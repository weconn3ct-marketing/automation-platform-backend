import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    getNotifications,
    readAllNotifications,
    readNotification,
    streamNotifications,
} from '../controllers/notifications.controller';

const router = Router();

router.get('/stream', streamNotifications);

router.use(authenticate);
router.get('/', getNotifications);
router.patch('/:id/read', readNotification);
router.post('/read-all', readAllNotifications);

export default router;
