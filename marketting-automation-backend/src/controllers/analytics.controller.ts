import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/helpers';

/**
 * GET /api/analytics/dashboard
 * Return aggregated metrics for the authenticated user's dashboard
 */
export async function getDashboardMetrics(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;

        const [
            scheduledPosts,
            pendingApprovals,
            publishedPosts,
            connectedAccounts,
            totalAnalytics,
        ] = await Promise.all([
            prisma.post.count({ where: { userId, status: 'scheduled' } }),
            prisma.post.count({ where: { userId, status: 'review' } }),
            prisma.post.count({ where: { userId, status: 'published' } }),
            prisma.connection.count({ where: { userId, status: 'connected' } }),
            prisma.analytics.aggregate({
                where: { post: { userId } },
                _sum: { views: true, likes: true, shares: true, comments: true, impressions: true },
            }),
        ]);

        const totals = totalAnalytics._sum;
        const totalEngagement = (totals.likes ?? 0) + (totals.shares ?? 0) + (totals.comments ?? 0);
        const totalImpressions = totals.impressions ?? 0;
        const engagementRate = totalImpressions > 0
            ? ((totalEngagement / totalImpressions) * 100).toFixed(2) + '%'
            : '0%';

        const totalReach = formatReach(totals.views ?? 0);

        sendSuccess(res, {
            scheduledPosts,
            pendingApprovals,
            publishedPosts,
            connectedAccounts,
            totalReach,
            engagementRate,
        });
    } catch (error) {
        console.error('[getDashboardMetrics]', error);
        sendError(res, 'InternalError', 'Failed to fetch dashboard metrics', 500);
    }
}

/**
 * GET /api/analytics/posts/:id
 * Return performance analytics for a specific post
 */
export async function getPostAnalytics(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        // Ensure post belongs to user
        const post = await prisma.post.findFirst({ where: { id, userId } });
        if (!post) {
            sendError(res, 'NotFound', 'Post not found', 404);
            return;
        }

        const analytics = await prisma.analytics.findMany({
            where: { postId: id },
            orderBy: { recordedAt: 'asc' },
        });

        // Aggregate totals across platforms
        const totals = analytics.reduce(
            (acc, a) => ({
                views: acc.views + a.views,
                likes: acc.likes + a.likes,
                shares: acc.shares + a.shares,
                comments: acc.comments + a.comments,
                impressions: acc.impressions + a.impressions,
            }),
            { views: 0, likes: 0, shares: 0, comments: 0, impressions: 0 }
        );

        const totalEngagement = totals.likes + totals.shares + totals.comments;
        const clickThroughRate = totals.impressions > 0
            ? parseFloat(((totalEngagement / totals.impressions) * 100).toFixed(2))
            : 0;

        sendSuccess(res, {
            postId: id,
            byPlatform: analytics,
            totals: { ...totals, clickThroughRate },
        });
    } catch (error) {
        console.error('[getPostAnalytics]', error);
        sendError(res, 'InternalError', 'Failed to fetch post analytics', 500);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatReach(views: number): string {
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
    return views.toString();
}
