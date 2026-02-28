import type { Response } from 'express';
import type { ApiError } from '../types';

/**
 * Send a standardized success response
 */
export function sendSuccess<T>(
    res: Response,
    data: T,
    message?: string,
    statusCode = 200
): Response {
    return res.status(statusCode).json({
        success: true,
        data,
        message,
    });
}

/**
 * Send a standardized error response
 */
export function sendError(
    res: Response,
    error: string,
    message: string,
    statusCode = 500
): Response {
    const body: ApiError = {
        success: false,
        error,
        message,
        statusCode,
    };
    return res.status(statusCode).json(body);
}

/**
 * Parse JSON safely, returning null if invalid
 */
export function safeJsonParse<T>(str: string | null | undefined): T | null {
    if (!str) return null;
    try {
        return JSON.parse(str) as T;
    } catch {
        return null;
    }
}

/**
 * Serialize an array to JSON string for SQLite storage
 */
export function toJsonString(val: unknown): string {
    return JSON.stringify(val);
}
