import { Router } from 'express';
import {
    listConnections,
    getConnection,
    createConnection,
    updateConnection,
    deleteConnection,
    reconnectConnection,
} from '../controllers/connections.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All connection routes require authentication
router.use(authenticate);

router.get('/', listConnections);
router.post('/', createConnection);
router.get('/:id', getConnection);
router.patch('/:id', updateConnection);
router.delete('/:id', deleteConnection);
router.post('/:id/reconnect', reconnectConnection);

export default router;
