import type { Request, Response } from 'express';
import prisma from './prisma';
import { safeJsonParse, toJsonString } from './helpers';

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

export interface RealtimeNotification {
    id: string;
    userId: string;
    title: string;
    message: string;
    level: NotificationLevel;
    read: boolean;
    createdAt: string;
    metadata?: Record<string, unknown>;
}

interface NotificationInput {
    title: string;
    message: string;
    level?: NotificationLevel;
    metadata?: Record<string, unknown>;
}

const MAX_NOTIFICATIONS_PER_USER = 100;

const subscribersByUser = new Map<string, Set<Response>>();
const prismaNotification = (prisma as unknown as {
    notification: {
        findMany: (args: unknown) => Promise<any[]>;
        create: (args: unknown) => Promise<any>;
        deleteMany: (args: unknown) => Promise<unknown>;
        findFirst: (args: unknown) => Promise<any | null>;
        update: (args: unknown) => Promise<any>;
        updateMany: (args: unknown) => Promise<{ count: number }>;
    };
}).notification;

function emit(res: Response, event: string, payload: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function formatNotification(notification: {
    id: string;
    userId: string;
    title: string;
    message: string;
    level: string;
    read: boolean;
    createdAt: Date;
    metadata: string | null;
}): RealtimeNotification {
    return {
        id: notification.id,
        userId: notification.userId,
        title: notification.title,
        message: notification.message,
        level: notification.level as NotificationLevel,
        read: notification.read,
        createdAt: notification.createdAt.toISOString(),
        metadata: safeJsonParse<Record<string, unknown>>(notification.metadata ?? undefined) ?? undefined,
    };
}

function getUserSubscribers(userId: string): Set<Response> {
    if (!subscribersByUser.has(userId)) {
        subscribersByUser.set(userId, new Set<Response>());
    }

    return subscribersByUser.get(userId)!;
}

export async function listNotifications(userId: string, limit = 50): Promise<RealtimeNotification[]> {
    const rows = await prismaNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(1, limit),
    });

    return rows.map(formatNotification);
}

export async function createNotification(userId: string, input: NotificationInput): Promise<RealtimeNotification> {
    const created = await prismaNotification.create({
        data: {
            userId,
            title: input.title,
            message: input.message,
            level: input.level ?? 'info',
            metadata: input.metadata ? toJsonString(input.metadata) : null,
        },
    });

    const oldRows = await prismaNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: MAX_NOTIFICATIONS_PER_USER,
        select: { id: true },
    });

    if (oldRows.length > 0) {
        await prismaNotification.deleteMany({
            where: {
                id: { in: oldRows.map((row: { id: string }) => row.id) },
            },
        });
    }

    const notification = formatNotification(created);

    const subscribers = subscribersByUser.get(userId);
    if (subscribers && subscribers.size > 0) {
        subscribers.forEach((res) => emit(res, 'notification', notification));
    }

    return notification;
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<RealtimeNotification | null> {
    const notification = await prismaNotification.findFirst({
        where: {
            id: notificationId,
            userId,
        },
    });

    if (!notification) {
        return null;
    }

    const updated = await prismaNotification.update({
        where: { id: notificationId },
        data: { read: true },
    });

    return formatNotification(updated);
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
    const result = await prismaNotification.updateMany({
        where: {
            userId,
            read: false,
        },
        data: { read: true },
    });

    return result.count;
}

export function subscribeToNotifications(req: Request, res: Response, userId: string): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const userSubscribers = getUserSubscribers(userId);
    userSubscribers.add(res);

    emit(res, 'connected', {
        connected: true,
        timestamp: new Date().toISOString(),
    });

    const keepAliveTimer = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 25000);

    req.on('close', () => {
        clearInterval(keepAliveTimer);
        userSubscribers.delete(res);

        if (userSubscribers.size === 0) {
            subscribersByUser.delete(userId);
        }
    });
}
