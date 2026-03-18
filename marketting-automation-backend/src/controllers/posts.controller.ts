import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, safeJsonParse, toJsonString } from '../lib/helpers';
import { createNotification } from '../lib/notifications';
import type { CreatePostInput, UpdatePostInput, Platform } from '../types';

const VALID_PLATFORMS: Platform[] = ['instagram', 'linkedin', 'facebook', 'instagram-feed', 'instagram-reels'];
const VALID_CONTENT_TYPES = ['text', 'article', 'carousel', 'video', 'image'] as const;
const VALID_TONE_STYLES = ['professional', 'casual', 'friendly', 'formal', 'creative', 'humorous'] as const;
const VALID_POST_STATUSES = ['draft', 'scheduled', 'published', 'failed', 'review'] as const;
const MIN_TOPIC_LENGTH = 3;
const SCHEDULE_BUFFER_MS = 60 * 1000;

function parseScheduledAt(rawValue: unknown): Date | null {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return null;

    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    return parsed;
}

function hasOnlyValidPlatforms(platforms: unknown): platforms is Platform[] {
    if (!Array.isArray(platforms) || platforms.length === 0) {
        return false;
    }

    return platforms.every((platform) =>
        typeof platform === 'string' && VALID_PLATFORMS.includes(platform as Platform)
    );
}

function validateCreatePostInput(input: CreatePostInput): string | null {
    if (typeof input.topic !== 'string' || input.topic.trim().length < MIN_TOPIC_LENGTH) {
        return `topic must be at least ${MIN_TOPIC_LENGTH} characters`;
    }

    if (!hasOnlyValidPlatforms(input.platforms)) {
        return 'platforms must include at least one valid platform';
    }

    if (!VALID_CONTENT_TYPES.includes(input.contentType)) {
        return 'contentType is invalid';
    }

    if (!VALID_TONE_STYLES.includes(input.tone)) {
        return 'tone is invalid';
    }

    if (input.scheduledAt !== undefined) {
        const parsedDate = parseScheduledAt(input.scheduledAt);
        if (!parsedDate) {
            return 'scheduledAt must be a valid datetime';
        }

        if (parsedDate.getTime() <= Date.now() + SCHEDULE_BUFFER_MS) {
            return 'scheduledAt must be at least 1 minute in the future';
        }
    }

    return null;
}

function validateUpdatePostInput(input: UpdatePostInput, existing: { scheduledAt: Date | null }): string | null {
    if (input.topic !== undefined) {
        if (typeof input.topic !== 'string' || input.topic.trim().length < MIN_TOPIC_LENGTH) {
            return `topic must be at least ${MIN_TOPIC_LENGTH} characters`;
        }
    }

    if (input.platforms !== undefined && !hasOnlyValidPlatforms(input.platforms)) {
        return 'platforms must include at least one valid platform';
    }

    if (input.status !== undefined && !VALID_POST_STATUSES.includes(input.status)) {
        return 'status is invalid';
    }

    if (input.scheduledAt !== undefined && typeof input.scheduledAt === 'string' && input.scheduledAt.trim() !== '') {
        const parsedDate = parseScheduledAt(input.scheduledAt);
        if (!parsedDate) {
            return 'scheduledAt must be a valid datetime';
        }

        if (parsedDate.getTime() <= Date.now() + SCHEDULE_BUFFER_MS) {
            return 'scheduledAt must be at least 1 minute in the future';
        }
    }

    if (input.status === 'scheduled') {
        const effectiveDate = input.scheduledAt !== undefined
            ? parseScheduledAt(input.scheduledAt)
            : existing.scheduledAt;

        if (!effectiveDate) {
            return 'scheduled posts must include a valid future scheduledAt datetime';
        }

        if (effectiveDate.getTime() <= Date.now() + SCHEDULE_BUFFER_MS) {
            return 'scheduledAt must be at least 1 minute in the future';
        }
    }

    return null;
}

// ─── Content Generation ───────────────────────────────────────────────────────

const TONE_OPENERS: Record<string, string> = {
    professional: 'In today\'s competitive landscape,',
    casual:       'Hey everyone! 👋',
    friendly:     'Exciting news!',
    formal:       'We are pleased to share',
    creative:     'Imagine a world where',
    humorous:     'Plot twist:',
};

const CONTENT_TYPE_CTAS: Record<string, string> = {
    text:      '',
    article:   '\n\nRead the full breakdown in the comments 👇',
    carousel:  '\n\n👉 Swipe through to see all the details!',
    image:     '\n\n📸 Double tap if this resonates with you!',
    video:     '\n\n▶️ Watch until the end — it\'s worth it!',
};

/**
 * Generate platform/tone-specific draft content when none is supplied.
 */
function generateContent(input: CreatePostInput): string {
    if (input.content) return input.content;

    const { topic, tone, contentType, platforms } = input;
    const opener   = TONE_OPENERS[tone]        ?? TONE_OPENERS.professional;
    const cta      = CONTENT_TYPE_CTAS[contentType] ?? '';
    const hashtag  = '#' + topic.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
    const primary  = (platforms[0] ?? 'instagram').replace(/-.*/, ''); // strip -feed / -reels

    if (primary === 'linkedin') {
        return (
            `${opener} ${topic}.\n\n` +
            `Here's what you need to know:\n` +
            `• The landscape is evolving fast\n` +
            `• Early adopters gain the biggest edge\n` +
            `• Action taken today compounds tomorrow\n\n` +
            `What's your take on ${topic}? Drop your thoughts below.${cta}\n\n` +
            `${hashtag} #WeConnect #LinkedIn`
        );
    }

    if (primary === 'facebook') {
        return (
            `${opener} ${topic}! 🚀\n\n` +
            `We've been deep-diving into this topic and the findings are fascinating. ` +
            `The key takeaway? Small, consistent actions around ${topic} lead to outsized results.\n\n` +
            `Share this with someone who needs to see it.${cta}\n\n` +
            `${hashtag} #WeConnect #Facebook`
        );
    }

    // instagram-feed, instagram-reels, instagram
    return (
        `${opener} ${topic} ✨\n\n` +
        `The secret that top creators don't tell you about ${topic}? ` +
        `Consistency + authenticity = growth that lasts.${cta}\n\n` +
        `${hashtag} #Trending #WeConnect #Instagram`
    );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** Build post metadata (word count, char count, hashtags, mentions) */
function buildMetadata(content: string) {
    const hashtags = content.match(/#\w+/g) ?? [];
    const mentions = content.match(/@\w+/g) ?? [];
    return {
        characterCount: content.length,
        wordCount:      content.split(/\s+/).filter(Boolean).length,
        hashtags,
        mentions,
    };
}

/**
 * Shape a raw DB post (optionally with analytics rows) into the API response.
 * Aggregates analytics into a single `engagement` summary when present.
 */
function formatPost(post: any) {
    const rows: any[] = post.analytics ?? [];

    const engagement = rows.length > 0
        ? {
            likes:       rows.reduce((s: number, a: any) => s + a.likes,       0),
            comments:    rows.reduce((s: number, a: any) => s + a.comments,    0),
            shares:      rows.reduce((s: number, a: any) => s + a.shares,      0),
            views:       rows.reduce((s: number, a: any) => s + a.views,       0),
            impressions: rows.reduce((s: number, a: any) => s + a.impressions, 0),
          }
        : null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { analytics: _raw, ...rest } = post;

    return {
        ...rest,
        platforms: safeJsonParse<Platform[]>(post.platforms) ?? [],
        imageUrls: safeJsonParse<string[]>(post.imageUrls)   ?? [],
        metadata:  safeJsonParse(post.metadata),
        engagement,
    };
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /api/posts
 * List posts for the authenticated user with optional pagination & status filter.
 * Each post includes aggregated engagement totals from analytics records.
 */
export async function listPosts(req: Request, res: Response): Promise<void> {
    try {
        const userId   = req.user!.userId;
        const page     = parseInt(req.query.page   as string || '1',  10);
        const limit    = Math.min(parseInt(req.query.limit  as string || '20', 10), 100);
        const status   = req.query.status   as string | undefined;
        const platform = req.query.platform as string | undefined;

        const where: any = { userId };
        if (status)   where.status    = status;
        if (platform) where.platforms = { contains: platform };

        const [posts, total] = await Promise.all([
            prisma.post.findMany({
                where,
                include:  { analytics: true },
                orderBy:  { createdAt: 'desc' },
                skip:     (page - 1) * limit,
                take:     limit,
            }),
            prisma.post.count({ where }),
        ]);

        sendSuccess(res, {
            data:       posts.map(formatPost),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('[listPosts]', error);
        sendError(res, 'InternalError', 'Failed to fetch posts', 500);
    }
}

/**
 * GET /api/posts/:id
 * Get a single post including its aggregated engagement totals.
 */
export async function getPost(req: Request, res: Response): Promise<void> {
    try {
        const { id }  = req.params;
        const userId  = req.user!.userId;

        const post = await prisma.post.findFirst({
            where:   { id, userId },
            include: { analytics: true },
        });

        if (!post) {
            sendError(res, 'NotFound', 'Post not found', 404);
            return;
        }

        sendSuccess(res, formatPost(post));
    } catch (error) {
        console.error('[getPost]', error);
        sendError(res, 'InternalError', 'Failed to fetch post', 500);
    }
}

/**
 * POST /api/posts
 * Create a new post with platform/tone-aware draft content.
 */
export async function createPost(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;
        const input  = req.body as CreatePostInput;

        const validationError = validateCreatePostInput(input);
        if (validationError) {
            sendError(res, 'ValidationError', validationError, 400);
            return;
        }

        const normalizedTopic = input.topic.trim();
        const normalizedImagePrompt = input.imagePrompt?.trim() || undefined;
        const scheduledAt = parseScheduledAt(input.scheduledAt);

        const generatedContent = generateContent({ ...input, topic: normalizedTopic });
        const title            = (input.title?.trim() || normalizedTopic);
        const metadata         = buildMetadata(generatedContent);

        const post = await prisma.post.create({
            data: {
                userId,
                title,
                content:     generatedContent,
                platforms:   toJsonString(input.platforms),
                status:      scheduledAt ? 'scheduled' : 'draft',
                scheduledAt,
                contentType: input.contentType,
                tone:        input.tone,
                topic:       normalizedTopic,
                imagePrompt: normalizedImagePrompt,
                metadata:    toJsonString(metadata),
            },
            include: { analytics: true },
        });

        await createNotification(userId, {
            level: scheduledAt ? 'info' : 'success',
            title: scheduledAt ? 'Post scheduled' : 'Post created',
            message: scheduledAt
                ? `"${post.title}" is scheduled for ${scheduledAt.toLocaleString()}`
                : `"${post.title}" was created successfully`,
            metadata: {
                postId: post.id,
                status: post.status,
            },
        });

        sendSuccess(res, formatPost(post), 'Post created successfully', 201);
    } catch (error) {
        console.error('[createPost]', error);
        sendError(res, 'InternalError', 'Failed to create post', 500);
    }
}

/**
 * PUT /api/posts/:id
 * Update a post.
 */
export async function updatePost(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const input  = req.body as UpdatePostInput;

        const existing = await prisma.post.findFirst({ where: { id, userId } });
        if (!existing) {
            sendError(res, 'NotFound', 'Post not found', 404);
            return;
        }

        const validationError = validateUpdatePostInput(input, existing);
        if (validationError) {
            sendError(res, 'ValidationError', validationError, 400);
            return;
        }

        const normalizedTitle = input.title?.trim();
        const normalizedTopic = input.topic?.trim();
        const normalizedContent = input.content?.trim();
        const normalizedImagePrompt = input.imagePrompt?.trim();
        const scheduledAt = input.scheduledAt !== undefined
            ? parseScheduledAt(input.scheduledAt)
            : undefined;

        const content  = normalizedContent ?? existing.content;
        const metadata = buildMetadata(content);

        const post = await prisma.post.update({
            where: { id },
            data:  {
                ...(input.title       !== undefined && { title:       normalizedTitle || existing.title }),
                ...(input.content     !== undefined && { content }),
                ...(input.platforms   !== undefined && { platforms:   toJsonString(input.platforms) }),
                ...(input.status      !== undefined && { status:      input.status }),
                ...(input.scheduledAt !== undefined && { scheduledAt }),
                ...(input.imageUrls   !== undefined && { imageUrls:   toJsonString(input.imageUrls) }),
                ...(input.videoUrl    !== undefined && { videoUrl:    input.videoUrl }),
                ...(input.tone        !== undefined && { tone:        input.tone }),
                ...(input.topic       !== undefined && { topic:       normalizedTopic || existing.topic }),
                ...(input.imagePrompt !== undefined && { imagePrompt: normalizedImagePrompt || null }),
                metadata: toJsonString(metadata),
            },
            include: { analytics: true },
        });

        const effectiveScheduledAt = scheduledAt ?? post.scheduledAt;
        const isScheduledUpdate = input.status === 'scheduled' || input.scheduledAt !== undefined;

        await createNotification(userId, {
            level: isScheduledUpdate ? 'info' : 'success',
            title: isScheduledUpdate ? 'Schedule updated' : 'Post updated',
            message: isScheduledUpdate && effectiveScheduledAt
                ? `"${post.title}" is scheduled for ${effectiveScheduledAt.toLocaleString()}`
                : `"${post.title}" was updated successfully`,
            metadata: {
                postId: post.id,
                status: post.status,
            },
        });

        sendSuccess(res, formatPost(post), 'Post updated successfully');
    } catch (error) {
        console.error('[updatePost]', error);
        sendError(res, 'InternalError', 'Failed to update post', 500);
    }
}

/**
 * DELETE /api/posts/:id
 * Delete a post (cascades to analytics).
 */
export async function deletePost(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const existing = await prisma.post.findFirst({ where: { id, userId } });
        if (!existing) {
            sendError(res, 'NotFound', 'Post not found', 404);
            return;
        }

        await prisma.post.delete({ where: { id } });

        await createNotification(userId, {
            level: 'warning',
            title: 'Post deleted',
            message: `"${existing.title}" was deleted`,
            metadata: {
                postId: existing.id,
            },
        });

        sendSuccess(res, null, 'Post deleted successfully');
    } catch (error) {
        console.error('[deletePost]', error);
        sendError(res, 'InternalError', 'Failed to delete post', 500);
    }
}

/**
 * POST /api/posts/:id/publish
 * Mark a post as published and seed analytics records for each target platform.
 */
export async function publishPost(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const existing = await prisma.post.findFirst({ where: { id, userId } });
        if (!existing) {
            sendError(res, 'NotFound', 'Post not found', 404);
            return;
        }

        if (existing.status === 'published') {
            sendError(res, 'ConflictError', 'Post is already published', 409);
            return;
        }

        // Mark as published
        const post = await prisma.post.update({
            where: { id },
            data:  { status: 'published', publishedAt: new Date() },
        });

        // Seed analytics records for each platform
        const platforms = safeJsonParse<string[]>(existing.platforms) ?? [];
        if (platforms.length > 0) {
            await prisma.analytics.createMany({
                data: platforms.map((platform) => ({
                    postId:          id,
                    platform,
                    views:           randomInt(300,  2000),
                    likes:           randomInt(20,   500),
                    shares:          randomInt(5,    150),
                    comments:        randomInt(2,    80),
                    impressions:     randomInt(500,  5000),
                    clickThroughRate: parseFloat((Math.random() * 5 + 1).toFixed(2)),
                    recordedAt:      new Date(),
                })),
            });
        }

        // Re-fetch with fresh analytics
        const postWithAnalytics = await prisma.post.findFirst({
            where:   { id },
            include: { analytics: true },
        });

        await createNotification(userId, {
            level: 'success',
            title: 'Post published',
            message: `"${post.title}" was published successfully`,
            metadata: {
                postId: post.id,
                status: post.status,
            },
        });

        sendSuccess(res, formatPost(postWithAnalytics), 'Post published successfully');
    } catch (error) {
        console.error('[publishPost]', error);
        sendError(res, 'InternalError', 'Failed to publish post', 500);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
