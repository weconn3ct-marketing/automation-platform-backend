import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
    initiateOAuth,
    handleOAuthCallback,
    refreshOAuthToken,
} from '../controllers/oauth.controller';

const router = Router();

/**
 * POST /api/oauth/authorize/:platform
 * Initiate OAuth flow for Facebook, Instagram, or LinkedIn
 * Requires authentication
 */
router.post('/authorize/:platform', authenticate, initiateOAuth);

/**
 * GET /api/oauth/callback/:platform
 * OAuth callback endpoint (public)
 * Receives authorization code from OAuth provider
 */
router.get('/callback/:platform', handleOAuthCallback);

/**
 * POST /api/oauth/refresh/:connectionId
 * Manually refresh an OAuth token
 * Requires authentication
 */
router.post('/refresh/:connectionId', authenticate, refreshOAuthToken);

export default router;
