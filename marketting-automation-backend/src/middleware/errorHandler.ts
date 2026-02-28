import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../lib/helpers';

/**
 * Global error handler middleware.
 * Catches any unhandled errors and returns a consistent JSON response.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
    console.error(`[Error] ${req.method} ${req.path}:`, err.message);
    console.error(err.stack);

    sendError(res, 'InternalServerError', err.message || 'Something went wrong', 500);
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
    sendError(res, 'NotFound', `Route ${req.method} ${req.path} not found`, 404);
}
