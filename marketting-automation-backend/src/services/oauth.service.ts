import axios from 'axios';
import config from '../config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OAuthTokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
}

export interface OAuthUserInfo {
    id: string;
    name?: string;
    email?: string;
    picture?: string;
}

export interface OAuthResult {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
    userInfo: OAuthUserInfo;
    accountId: string;
    accountName: string;
}

// ─── Facebook OAuth ───────────────────────────────────────────────────────────

export const facebookOAuth = {
    /**
     * Get the OAuth authorization URL for Facebook
     */
    getAuthUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: config.oauth.facebook.appId,
            redirect_uri: config.oauth.facebook.redirectUri,
            scope: 'pages_manage_metadata,pages_read_engagement,pages_read_user_content,pages_manage_posts,pages_manage_engagement',
            state,
            response_type: 'code',
        });
        return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    },

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
        try {
            const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
                params: {
                    client_id: config.oauth.facebook.appId,
                    client_secret: config.oauth.facebook.appSecret,
                    code,
                    redirect_uri: config.oauth.facebook.redirectUri,
                },
            });
            return response.data;
        } catch (error) {
            console.error('[facebookOAuth.exchangeCodeForToken]', error);
            throw new Error('Failed to exchange Facebook auth code for token');
        }
    },

    /**
     * Get user pages and account information
     */
    async getUserPages(accessToken: string): Promise<any> {
        try {
            const response = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
                params: {
                    access_token: accessToken,
                    fields: 'id,name,picture,access_token',
                },
            });
            return response.data;
        } catch (error) {
            console.error('[facebookOAuth.getUserPages]', error);
            throw new Error('Failed to fetch Facebook pages');
        }
    },

    /**
     * Get user info
     */
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        try {
            const response = await axios.get('https://graph.facebook.com/v18.0/me', {
                params: {
                    access_token: accessToken,
                    fields: 'id,name,email,picture',
                },
            });
            return {
                id: response.data.id,
                name: response.data.name,
                email: response.data.email,
                picture: response.data.picture?.data?.url,
            };
        } catch (error) {
            console.error('[facebookOAuth.getUserInfo]', error);
            throw new Error('Failed to fetch Facebook user info');
        }
    },

    /**
     * Facebook tokens don't refresh - they are long-lived
     * This method is here for compatibility but doesn't actually refresh
     */
    async refreshToken(token: string): Promise<OAuthTokenResponse> {
        console.warn('[facebookOAuth.refreshToken] Facebook tokens are long-lived and cannot be refreshed');
        throw new Error('Facebook tokens cannot be refreshed. They are long-lived and do not expire.');
    },
};

// ─── Instagram OAuth ──────────────────────────────────────────────────────────

export const instagramOAuth = {
    /**
     * Get the OAuth authorization URL for Instagram (via Facebook)
     */
    getAuthUrl(state: string): string {
        const params = new URLSearchParams({
            client_id: config.oauth.instagram.appId,
            redirect_uri: config.oauth.instagram.redirectUri,
            scope: 'instagram_basic,instagram_content_publish,pages_manage_metadata',
            state,
            response_type: 'code',
        });
        return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
    },

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
        try {
            const response = await axios.post('https://graph.instagram.com/v18.0/access_token', {
                client_id: config.oauth.instagram.appId,
                client_secret: config.oauth.instagram.appSecret,
                grant_type: 'authorization_code',
                redirect_uri: config.oauth.instagram.redirectUri,
                code,
            });
            return response.data;
        } catch (error) {
            console.error('[instagramOAuth.exchangeCodeForToken]', error);
            throw new Error('Failed to exchange Instagram auth code for token');
        }
    },

    /**
     * Get Instagram Business Account
     */
    async getBusinessAccount(accessToken: string): Promise<any> {
        try {
            const response = await axios.get('https://graph.instagram.com/v18.0/me', {
                params: {
                    fields: 'id,username,name,biography,profile_picture_url,ig_id',
                    access_token: accessToken,
                },
            });
            return response.data;
        } catch (error) {
            console.error('[instagramOAuth.getBusinessAccount]', error);
            throw new Error('Failed to fetch Instagram business account');
        }
    },

    /**
     * Get user info
     */
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        try {
            const accountData = await this.getBusinessAccount(accessToken);
            return {
                id: accountData.id,
                name: accountData.username,
                picture: accountData.profile_picture_url,
            };
        } catch (error) {
            console.error('[instagramOAuth.getUserInfo]', error);
            throw new Error('Failed to fetch Instagram user info');
        }
    },

    /**
     * Refresh short-lived token to long-lived token
     */
    async refreshToken(shortLivedToken: string): Promise<OAuthTokenResponse> {
        try {
            const response = await axios.get('https://graph.instagram.com/v18.0/refresh_access_token', {
                params: {
                    grant_type: 'ig_refresh_token',
                    access_token: shortLivedToken,
                },
            });
            return response.data;
        } catch (error) {
            console.error('[instagramOAuth.refreshToken]', error);
            throw new Error('Failed to refresh Instagram token');
        }
    },
};

// ─── LinkedIn OAuth ───────────────────────────────────────────────────────────

export const linkedinOAuth = {
    /**
     * Get the OAuth authorization URL for LinkedIn
     */
    getAuthUrl(state: string): string {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: config.oauth.linkedin.clientId,
            redirect_uri: config.oauth.linkedin.redirectUri,
            scope: 'r_liteprofile,w_member_social,r_1st_connections_size',
            state,
        });
        return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
    },

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
        try {
            const response = await axios.post(
                'https://www.linkedin.com/oauth/v2/accessToken',
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: config.oauth.linkedin.redirectUri,
                    client_id: config.oauth.linkedin.clientId,
                    client_secret: config.oauth.linkedin.clientSecret,
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );
            return response.data;
        } catch (error) {
            console.error('[linkedinOAuth.exchangeCodeForToken]', error);
            throw new Error('Failed to exchange LinkedIn auth code for token');
        }
    },

    /**
     * Get user info
     */
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        try {
            const response = await axios.get('https://api.linkedin.com/v2/me', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            const emailResponse = await axios.get('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            const email = emailResponse.data?.elements?.[0]?.['handle~']?.emailAddress || undefined;

            return {
                id: response.data.id,
                name: `${response.data.localizedFirstName} ${response.data.localizedLastName}`.trim(),
                email,
            };
        } catch (error) {
            console.error('[linkedinOAuth.getUserInfo]', error);
            throw new Error('Failed to fetch LinkedIn user info');
        }
    },

    /**
     * Refresh access token
     */
    async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
        try {
            const response = await axios.post(
                'https://www.linkedin.com/oauth/v2/accessToken',
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: config.oauth.linkedin.clientId,
                    client_secret: config.oauth.linkedin.clientSecret,
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );
            return response.data;
        } catch (error) {
            console.error('[linkedinOAuth.refreshToken]', error);
            throw new Error('Failed to refresh LinkedIn token');
        }
    },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Generate OAuth state token for CSRF protection
 */
export function generateOAuthState(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Get OAuth handler for platform
 */
export function getOAuthHandler(platform: 'facebook' | 'instagram' | 'linkedin') {
    switch (platform) {
        case 'facebook':
            return facebookOAuth;
        case 'instagram':
            return instagramOAuth;
        case 'linkedin':
            return linkedinOAuth;
        default:
            throw new Error(`Unsupported platform: ${platform}`);
    }
}
