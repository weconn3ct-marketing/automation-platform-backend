import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/helpers';
import {
    facebookOAuth,
    instagramOAuth,
    linkedinOAuth,
    generateOAuthState,
    getOAuthHandler,
} from '../services/oauth.service';

// Store OAuth states in memory (in production, use Redis with expiration)
const oauthStates = new Map<string, { platform: string; userId: string; expiresAt: Date }>();

// Cleanup expired states every 10 minutes
setInterval(() => {
    const now = new Date();
    for (const [state, data] of oauthStates.entries()) {
        if (data.expiresAt < now) {
            oauthStates.delete(state);
        }
    }
}, 10 * 60 * 1000);

/**
 * POST /api/oauth/authorize/:platform
 * Initiate OAuth flow for a platform
 */
export async function initiateOAuth(req: Request, res: Response): Promise<void> {
    try {
        const { platform } = req.params;
        const userId = req.user!.userId;

        // Validate platform
        if (!['facebook', 'instagram', 'linkedin'].includes(platform)) {
            sendError(res, 'ValidationError', 'Invalid platform', 400);
            return;
        }

        // Check if required OAuth credentials are configured
        const oauthConfig = config.oauth[platform as 'facebook' | 'instagram' | 'linkedin'];
        if (!oauthConfig) {
            sendError(res, 'ConfigError', `OAuth configuration missing for ${platform}`, 500);
            return;
        }

        // Validate platform-specific required credentials
        if (platform === 'facebook') {
            if (!config.oauth.facebook.appId || !config.oauth.facebook.appSecret) {
                sendError(res, 'ConfigError', 'Facebook OAuth credentials not configured', 500);
                return;
            }
        } else if (platform === 'instagram') {
            if (!config.oauth.instagram.appId || !config.oauth.instagram.appSecret) {
                sendError(res, 'ConfigError', 'Instagram OAuth credentials not configured', 500);
                return;
            }
        } else if (platform === 'linkedin') {
            if (!config.oauth.linkedin.clientId || !config.oauth.linkedin.clientSecret) {
                sendError(res, 'ConfigError', 'LinkedIn OAuth credentials not configured', 500);
                return;
            }
        }

        // Generate state token for CSRF protection
        const state = generateOAuthState();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        oauthStates.set(state, { platform, userId, expiresAt });

        // Get OAuth handler
        const handler = getOAuthHandler(platform as 'facebook' | 'instagram' | 'linkedin');

        // Get auth URL
        const authUrl = handler.getAuthUrl(state);

        sendSuccess(
            res,
            { authUrl, state },
            'OAuth flow initiated',
            200
        );
    } catch (error) {
        console.error('[initiateOAuth]', error);
        sendError(res, 'InternalError', 'Failed to initiate OAuth flow', 500);
    }
}

/**
 * GET /api/oauth/callback/:platform
 * Handle OAuth callback from platforms
 */
export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
    try {
        const { platform } = req.params;
        const { code, state, error: platformError } = req.query as Record<string, string>;

        // Check for platform errors
        if (platformError) {
            console.error(`[handleOAuthCallback] ${platform} error:`, platformError);
            const frontendUrl = new URL(`${process.env.FRONTEND_URL}/auth/oauth-error`);
            frontendUrl.searchParams.set('platform', platform);
            frontendUrl.searchParams.set('error', platformError);
            frontendUrl.searchParams.set('error_description', `OAuth provider returned error: ${platformError}`);
            res.redirect(frontendUrl.toString());
            return;
        }

        // Validate required parameters
        if (!code || !state) {
            console.error('[handleOAuthCallback] Missing code or state');
            const frontendUrl = new URL(`${process.env.FRONTEND_URL}/auth/oauth-error`);
            frontendUrl.searchParams.set('platform', platform);
            frontendUrl.searchParams.set('error', 'invalid_request');
            frontendUrl.searchParams.set('error_description', 'Missing authorization code or state');
            res.redirect(frontendUrl.toString());
            return;
        }

        // Verify state token
        const stateData = oauthStates.get(state);
        if (!stateData || stateData.platform !== platform) {
            console.error('[handleOAuthCallback] Invalid or mismatched state');
            const frontendUrl = new URL(`${process.env.FRONTEND_URL}/auth/oauth-error`);
            frontendUrl.searchParams.set('platform', platform);
            frontendUrl.searchParams.set('error', 'invalid_state');
            frontendUrl.searchParams.set('error_description', 'CSRF validation failed: invalid or expired state token');
            res.redirect(frontendUrl.toString());
            return;
        }

        // Delete state (one-time use)
        oauthStates.delete(state);

        const userId = stateData.userId;

        // Get OAuth handler
        const handler = getOAuthHandler(platform as 'facebook' | 'instagram' | 'linkedin');

        // Exchange code for token
        let tokenResponse: any;
        try {
            tokenResponse = await handler.exchangeCodeForToken(code);
        } catch (error) {
            console.error('[handleOAuthCallback] Token exchange failed:', error);
            const frontendUrl = new URL(`${process.env.FRONTEND_URL}/auth/oauth-error`);
            frontendUrl.searchParams.set('platform', platform);
            frontendUrl.searchParams.set('error', 'token_exchange_failed');
            frontendUrl.searchParams.set('error_description', `Failed to exchange authorization code: ${error instanceof Error ? error.message : 'Unknown error'}`);
            res.redirect(frontendUrl.toString());
            return;
        }

        // Get user info
        let userInfo: any;
        try {
            userInfo = await handler.getUserInfo(tokenResponse.access_token);
        } catch (error) {
            console.error('[handleOAuthCallback] Failed to get user info:', error);
            const frontendUrl = new URL(`${process.env.FRONTEND_URL}/auth/oauth-error`);
            frontendUrl.searchParams.set('platform', platform);
            frontendUrl.searchParams.set('error', 'user_info_failed');
            frontendUrl.searchParams.set('error_description', `Failed to fetch account information: ${error instanceof Error ? error.message : 'Unknown error'}`);
            res.redirect(frontendUrl.toString());
            return;
        }

        // Platform-specific handling
        let accountId = userInfo.id;
        let accountName = userInfo.name || userInfo.email || 'Connected Account';
        let accessToken = tokenResponse.access_token;
        let refreshToken = tokenResponse.refresh_token;
        let expiresAt = null as Date | null;

        // Calculate expiration time
        if (tokenResponse.expires_in) {
            expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
        }

        // For Facebook, get the first page if available
        if (platform === 'facebook') {
            try {
                const pages = await facebookOAuth.getUserPages(accessToken);
                if (pages.data && pages.data.length > 0) {
                    accountId = pages.data[0].id;
                    accountName = pages.data[0].name;
                    accessToken = pages.data[0].access_token;
                }
            } catch (error) {
                console.error('[handleOAuthCallback] Failed to get Facebook pages:', error);
                // Continue with user account, not page
            }
        }

        // Store connection in database
        const connection = await prisma.connection.upsert({
            where: {
                userId_platform: { userId, platform },
            },
            create: {
                userId,
                platform,
                status: 'connected',
                accountName,
                accountId,
                accessToken,
                refreshToken: refreshToken || null,
                expiresAt,
                connectedAt: new Date(),
                lastSync: new Date(),
                metadata: JSON.stringify({
                    oauthProvider: platform,
                    fullUserInfo: userInfo,
                    tokenExchangeTime: new Date().toISOString(),
                }),
            },
            update: {
                status: 'connected',
                accountName,
                accountId,
                accessToken,
                refreshToken: refreshToken || undefined,
                expiresAt,
                connectedAt: new Date(),
                lastSync: new Date(),
                errorMessage: null,
                metadata: JSON.stringify({
                    oauthProvider: platform,
                    fullUserInfo: userInfo,
                    tokenExchangeTime: new Date().toISOString(),
                }),
            },
        });

        // Redirect to success page with connection ID
        const redirectUrl = new URL(`${process.env.FRONTEND_URL}/auth/oauth-success`);
        redirectUrl.searchParams.set('platform', platform);
        redirectUrl.searchParams.set('connectionId', connection.id);
        redirectUrl.searchParams.set('accountName', accountName);

        res.redirect(redirectUrl.toString());
    } catch (error) {
        console.error('[handleOAuthCallback]', error);
        const frontendUrl = new URL(`${process.env.FRONTEND_URL}/auth/oauth-error`);
        frontendUrl.searchParams.set('platform', 'unknown');
        frontendUrl.searchParams.set('error', 'internal_error');
        frontendUrl.searchParams.set('error_description', `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        res.redirect(frontendUrl.toString());
    }
}

/**
 * POST /api/oauth/refresh/:connectionId
 * Manually refresh OAuth token for a connection
 */
export async function refreshOAuthToken(req: Request, res: Response): Promise<void> {
    try {
        const { connectionId } = req.params;
        const userId = req.user!.userId;

        const connection = await prisma.connection.findFirst({
            where: { id: connectionId, userId },
        });

        if (!connection) {
            sendError(res, 'NotFound', 'Connection not found', 404);
            return;
        }

        // Facebook tokens are long-lived and don't need refresh
        if (connection.platform === 'facebook') {
            sendSuccess(res, { accessToken: connection.accessToken, message: 'Facebook tokens are long-lived and do not require refresh' }, 'Token is still valid');
            return;
        }

        if (!connection.refreshToken) {
            sendError(res, 'ValidationError', 'No refresh token available for this connection', 400);
            return;
        }

        // Get OAuth handler
        const handler = getOAuthHandler(connection.platform as 'facebook' | 'instagram' | 'linkedin');

        // Refresh token
        let tokenResponse: any;
        try {
            const refreshTokenResponse = await (handler as any).refreshToken(connection.refreshToken);
            tokenResponse = refreshTokenResponse;
        } catch (error) {
            console.error('[refreshOAuthToken] Token refresh failed:', error);
            await prisma.connection.update({
                where: { id: connectionId },
                data: {
                    status: 'error',
                    errorMessage: 'Failed to refresh token',
                },
            });
            sendError(res, 'InternalError', 'Failed to refresh token', 500);
            return;
        }

        // Calculate new expiration
        let expiresAt = null;
        if (tokenResponse.expires_in) {
            expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
        }

        // Update connection with new tokens
        const updated = await prisma.connection.update({
            where: { id: connectionId },
            data: {
                accessToken: tokenResponse.access_token,
                refreshToken: tokenResponse.refresh_token || connection.refreshToken,
                expiresAt,
                status: 'connected',
                errorMessage: null,
                lastSync: new Date(),
            },
        });

        sendSuccess(res, { accessToken: updated.accessToken, expiresAt: updated.expiresAt }, 'Token refreshed');
    } catch (error) {
        console.error('[refreshOAuthToken]', error);
        sendError(res, 'InternalError', 'Failed to refresh token', 500);
    }
}
