import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../lib/helpers';
import { verifyAccessToken } from '../lib/jwt';
import {
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    subscribeToNotifications,
} from '../lib/notifications';

export async function getNotifications(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;
        const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 100);

        const notifications = await listNotifications(userId, limit);
        sendSuccess(res, notifications);
    } catch (error) {
        console.error('[getNotifications]', error);
        sendError(res, 'InternalError', 'Failed to fetch notifications', 500);
    }
}

export async function readNotification(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;

        const notification = await markNotificationRead(userId, id);
        if (!notification) {
            sendError(res, 'NotFound', 'Notification not found', 404);
            return;
        }

        sendSuccess(res, notification, 'Notification marked as read');
    } catch (error) {
        console.error('[readNotification]', error);
        sendError(res, 'InternalError', 'Failed to update notification', 500);
    }
}

export async function readAllNotifications(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;
        const updatedCount = await markAllNotificationsRead(userId);

        sendSuccess(res, { updatedCount }, 'All notifications marked as read');
    } catch (error) {
        console.error('[readAllNotifications]', error);
        sendError(res, 'InternalError', 'Failed to update notifications', 500);
    }
}

export async function streamNotifications(req: Request, res: Response): Promise<void> {
    try {
        const token = (req.query.token as string | undefined)?.trim();

        if (!token) {
            sendError(res, 'Unauthorized', 'Missing token for notifications stream', 401);
            return;
        }

        const payload = verifyAccessToken(token);
        subscribeToNotifications(req, res, payload.userId);
    } catch (error: unknown) {
        if (error instanceof Error) {
            if (error.name === 'TokenExpiredError') {
                sendError(res, 'TokenExpired', 'Access token has expired', 401);
                return;
            }
            if (error.name === 'JsonWebTokenError') {
                sendError(res, 'InvalidToken', 'Invalid access token', 401);
                return;
            }
        }

        sendError(res, 'Unauthorized', 'Failed to open notifications stream', 401);
    }
}
