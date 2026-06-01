import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    jwt: {
        secret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret',
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },

    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    },

    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },

    openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
    },

    oauth: {
        facebook: {
            appId: process.env.FACEBOOK_APP_ID || '',
            appSecret: process.env.FACEBOOK_APP_SECRET || '',
            redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/api/oauth/callback/facebook',
        },
        instagram: {
            appId: process.env.INSTAGRAM_APP_ID || '',
            appSecret: process.env.INSTAGRAM_APP_SECRET || '',
            redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3000/api/oauth/callback/instagram',
        },
        linkedin: {
            clientId: process.env.LINKEDIN_CLIENT_ID || '',
            clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
            redirectUri: process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:3000/api/oauth/callback/linkedin',
        },
    },

    supabase: {
        url: process.env.SUPABASE_URL || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
} as const;

export default config;
