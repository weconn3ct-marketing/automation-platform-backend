import { Router } from 'express';
import { signup, login, refreshToken, logout, getMe } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

// Protected routes
router.get('/me', authenticate, getMe);

export default router;
