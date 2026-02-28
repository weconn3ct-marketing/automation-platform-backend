import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, safeJsonParse, toJsonString } from '../lib/helpers';
import type { CreatePostInput, UpdatePostInput, Platform } from '../types';

/** Build post metadata (word count, char count, hashtags) */
function buildMetadata(content: string) {
    const hashtags = content.match(/#\w+/g) ?? [];
    const mentions = content.match(/@\w+/g) ?? [];
    return {
        characterCount: content.length,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        hashtags,
        mentions,
    };
}

/** Shape a raw DB post into the API response format */
function formatPost(post: any) {
    return {
        ...post,
        platforms: safeJsonParse<Platform[]>(post.platforms) ?? [],
        imageUrls: safeJsonParse<string[]>(post.imageUrls) ?? [],
        metadata: safeJsonParse(post.metadata),
    };
}

/**
 * GET /api/posts
 * List posts for the authenticated user with optional pagination & status filter
 */
export async function listPosts(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;
        const page = parseInt(req.query.page as string || '1', 10);
        const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
        const status = req.query.status as string | undefined;
        const platform = req.query.platform as string | undefined;

        const where: any = { userId };
        if (status) where.status = status;
        // Platform filter: check if JSON array contains the platform string
        if (platform) where.platforms = { contains: platform };

        const [posts, total] = await Promise.all([
            prisma.post.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.post.count({ where }),
        ]);

        sendSuccess(res, {
            data: posts.map(formatPost),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('[listPosts]', error);
        sendError(res, 'InternalError', 'Failed to fetch posts', 500);
    }
}

/**
 * GET /api/posts/:id
 * Get a single post by ID
 */
export async function getPost(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const post = await prisma.post.findFirst({ where: { id, userId } });

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
 * Create a new post (optionally AI-generated content stub)
 */
export async function createPost(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;
        const input = req.body as CreatePostInput;

        if (!input.topic || !input.platforms || !input.contentType || !input.tone) {
            sendError(res, 'ValidationError', 'topic, platforms, contentType, and tone are required', 400);
            return;
        }

        // Generate placeholder content (replace with real AI call if desired)
        const generatedContent = input.content ||
            `📝 ${input.topic}\n\nThis is an AI-generated draft for your ${input.tone} ${input.contentType} post. Edit this content before publishing.\n\n#${input.topic.replace(/\s+/g, '')} #WeConnect`;

        const title = input.title || input.topic;
        const metadata = buildMetadata(generatedContent);

        const post = await prisma.post.create({
            data: {
                userId,
                title,
                content: generatedContent,
                platforms: toJsonString(input.platforms),
                status: input.scheduledAt ? 'scheduled' : 'draft',
                scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
                contentType: input.contentType,
                tone: input.tone,
                topic: input.topic,
                imagePrompt: input.imagePrompt,
                metadata: toJsonString(metadata),
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
 * Update a post
 */
export async function updatePost(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const input = req.body as UpdatePostInput;

        const existing = await prisma.post.findFirst({ where: { id, userId } });
        if (!existing) {
            sendError(res, 'NotFound', 'Post not found', 404);
            return;
        }

        const content = input.content ?? existing.content;
        const metadata = buildMetadata(content);

        const post = await prisma.post.update({
            where: { id },
            data: {
                ...(input.title !== undefined && { title: input.title }),
                ...(input.content !== undefined && { content: input.content }),
                ...(input.platforms !== undefined && { platforms: toJsonString(input.platforms) }),
                ...(input.status !== undefined && { status: input.status }),
                ...(input.scheduledAt !== undefined && { scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null }),
                ...(input.imageUrls !== undefined && { imageUrls: toJsonString(input.imageUrls) }),
                ...(input.videoUrl !== undefined && { videoUrl: input.videoUrl }),
                ...(input.tone !== undefined && { tone: input.tone }),
                ...(input.topic !== undefined && { topic: input.topic }),
                ...(input.imagePrompt !== undefined && { imagePrompt: input.imagePrompt }),
                metadata: toJsonString(metadata),
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
 * Delete a post
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
        sendSuccess(res, null, 'Post deleted successfully');
    } catch (error) {
        console.error('[deletePost]', error);
        sendError(res, 'InternalError', 'Failed to delete post', 500);
    }
}

/**
 * POST /api/posts/:id/publish
 * Publish a post immediately across all selected platforms
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

        // TODO: Integrate real platform publishing (Instagram Graph API, LinkedIn API, etc.)
        // For now, simulate a successful publish

        const post = await prisma.post.update({
            where: { id },
            data: {
                status: 'published',
                publishedAt: new Date(),
            },
        });

        sendSuccess(res, formatPost(post), 'Post published successfully');
    } catch (error) {
        console.error('[publishPost]', error);
        sendError(res, 'InternalError', 'Failed to publish post', 500);
    }
}
