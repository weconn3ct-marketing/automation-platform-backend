import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, safeJsonParse } from '../lib/helpers';
import type { CreateConnectionInput } from '../types';

/** Format DB connection to API response */
function formatConnection(conn: any) {
    return {
        ...conn,
        metadata: safeJsonParse(conn.metadata),
    };
}

/**
 * GET /api/connections
 * List all social media connections for the authenticated user
 */
export async function listConnections(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;

        const connections = await prisma.connection.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
        });

        sendSuccess(res, connections.map(formatConnection));
    } catch (error) {
        console.error('[listConnections]', error);
        sendError(res, 'InternalError', 'Failed to fetch connections', 500);
    }
}

/**
 * GET /api/connections/:id
 * Get a single connection
 */
export async function getConnection(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const connection = await prisma.connection.findFirst({ where: { id, userId } });
        if (!connection) {
            sendError(res, 'NotFound', 'Connection not found', 404);
            return;
        }

        sendSuccess(res, formatConnection(connection));
    } catch (error) {
        console.error('[getConnection]', error);
        sendError(res, 'InternalError', 'Failed to fetch connection', 500);
    }
}

/**
 * POST /api/connections
 * Create or upsert a platform connection
 */
export async function createConnection(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;
        const input = req.body as CreateConnectionInput;

        if (!input.platform) {
            sendError(res, 'ValidationError', 'platform is required', 400);
            return;
        }

        // Platform-specific validation
        if (input.platform === 'instagram') {
            if (!input.accessToken) {
                sendError(res, 'ValidationError', 'accessToken is required for Instagram', 400);
                return;
            }
        }

        if (input.platform === 'linkedin') {
            if (!input.accessToken) {
                sendError(res, 'ValidationError', 'accessToken is required for LinkedIn', 400);
                return;
            }
        }

        // Store platform-specific metadata
        const metadata = JSON.stringify({
            appId: input.appId,
            businessAccountId: input.businessAccountId,
            facebookPageId: input.facebookPageId,
            organizationId: input.organizationId,
            clientId: input.clientId,
            redirectUri: input.redirectUri,
        });

        // Upsert: one connection per user per platform
        const connection = await prisma.connection.upsert({
            where: {
                userId_platform: { userId, platform: input.platform },
            },
            create: {
                userId,
                platform: input.platform,
                status: 'connected',
                accountName: input.accountName,
                accountId: input.accountId || input.businessAccountId || input.organizationId,
                accessToken: input.accessToken,
                refreshToken: input.refreshToken,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
                connectedAt: new Date(),
                lastSync: new Date(),
                metadata,
            },
            update: {
                status: 'connected',
                accountName: input.accountName,
                accountId: input.accountId || input.businessAccountId || input.organizationId,
                accessToken: input.accessToken,
                refreshToken: input.refreshToken,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
                connectedAt: new Date(),
                lastSync: new Date(),
                errorMessage: null,
                metadata,
            },
        });

        sendSuccess(res, formatConnection(connection), 'Platform connected successfully', 201);
    } catch (error) {
        console.error('[createConnection]', error);
        sendError(res, 'InternalError', 'Failed to create connection', 500);
    }
}

/**
 * PATCH /api/connections/:id
 * Update a connection (e.g. refresh token, update status)
 */
export async function updateConnection(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const existing = await prisma.connection.findFirst({ where: { id, userId } });
        if (!existing) {
            sendError(res, 'NotFound', 'Connection not found', 404);
            return;
        }

        const { status, accountName, accessToken, errorMessage } = req.body;

        const connection = await prisma.connection.update({
            where: { id },
            data: {
                ...(status !== undefined && { status }),
                ...(accountName !== undefined && { accountName }),
                ...(accessToken !== undefined && { accessToken }),
                ...(errorMessage !== undefined && { errorMessage }),
                lastSync: new Date(),
            },
        });

        sendSuccess(res, formatConnection(connection), 'Connection updated');
    } catch (error) {
        console.error('[updateConnection]', error);
        sendError(res, 'InternalError', 'Failed to update connection', 500);
    }
}

/**
 * DELETE /api/connections/:id
 * Disconnect (delete) a platform connection
 */
export async function deleteConnection(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const existing = await prisma.connection.findFirst({ where: { id, userId } });
        if (!existing) {
            sendError(res, 'NotFound', 'Connection not found', 404);
            return;
        }

        await prisma.connection.delete({ where: { id } });
        sendSuccess(res, null, 'Account disconnected successfully');
    } catch (error) {
        console.error('[deleteConnection]', error);
        sendError(res, 'InternalError', 'Failed to delete connection', 500);
    }
}

/**
 * POST /api/connections/:id/reconnect
 * Attempt to re-validate and reconnect a failed account
 */
export async function reconnectConnection(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;

        const existing = await prisma.connection.findFirst({ where: { id, userId } });
        if (!existing) {
            sendError(res, 'NotFound', 'Connection not found', 404);
            return;
        }

        // TODO: Actually call the platform API to re-validate the token
        // For now, mark as pending and return
        const connection = await prisma.connection.update({
            where: { id },
            data: {
                status: 'pending',
                errorMessage: null,
                lastSync: new Date(),
            },
        });

        sendSuccess(res, formatConnection(connection), 'Reconnection initiated');
    } catch (error) {
        console.error('[reconnectConnection]', error);
        sendError(res, 'InternalError', 'Failed to reconnect', 500);
    }
}
