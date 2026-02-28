export type Platform = 'instagram' | 'linkedin' | 'facebook' | 'instagram-feed' | 'instagram-reels';
export type ConnectionStatus = 'connected' | 'disconnected' | 'error' | 'pending';
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'review';
export type ContentType = 'text' | 'article' | 'carousel' | 'video' | 'image';
export type ToneStyle = 'professional' | 'casual' | 'friendly' | 'formal' | 'creative' | 'humorous';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
    userId: string;
    email: string;
    iat?: number;
    exp?: number;
}

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface SignupCredentials {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface UserPublic {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    avatar?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Connection ───────────────────────────────────────────────────────────────

export interface CreateConnectionInput {
    platform: Platform;
    accountName?: string;
    accountId?: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    facebookPageId?: string;
    businessAccountId?: string;
    appId?: string;
    appSecret?: string;
    organizationId?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export interface CreatePostInput {
    topic: string;
    platforms: Platform[];
    contentType: ContentType;
    tone: ToneStyle;
    imagePrompt?: string;
    scheduledAt?: string;
    title?: string;
    content?: string;
}

export interface UpdatePostInput {
    title?: string;
    content?: string;
    platforms?: Platform[];
    status?: PostStatus;
    scheduledAt?: string;
    imageUrls?: string[];
    videoUrl?: string;
    tone?: ToneStyle;
    topic?: string;
    imagePrompt?: string;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
    success: boolean;
    data: T;
    message?: string;
}

export interface ApiError {
    success: false;
    error: string;
    message: string;
    statusCode: number;
}

export interface PaginationQuery {
    page?: string;
    limit?: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
    scheduledPosts: number;
    pendingApprovals: number;
    totalReach: string;
    engagementRate: string;
    publishedPosts: number;
    connectedAccounts: number;
}

// ─── Express augmentation ─────────────────────────────────────────────────────
declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
                email: string;
            };
        }
    }
}
