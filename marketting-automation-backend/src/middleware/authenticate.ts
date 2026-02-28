import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { sendError } from '../lib/helpers';

/**
 * Middleware: Require a valid Bearer JWT access token.
 * Attaches `req.user = { userId, email }` on success.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            sendError(res, 'Unauthorized', 'No token provided', 401);
            return;
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyAccessToken(token);

        req.user = {
            userId: payload.userId,
            email: payload.email,
        };

        next();
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
        sendError(res, 'Unauthorized', 'Authentication failed', 401);
    }
}
