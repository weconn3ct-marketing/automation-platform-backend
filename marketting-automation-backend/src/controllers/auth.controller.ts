import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    getRefreshTokenExpiry,
} from '../lib/jwt';
import { sendSuccess, sendError } from '../lib/helpers';
import type { LoginCredentials, SignupCredentials } from '../types';

const SALT_ROUNDS = 12;

/**
 * POST /api/auth/signup
 * Register a new user and return tokens
 */
export async function signup(req: Request, res: Response): Promise<void> {
    try {
        const { email, password, firstName, lastName } = req.body as SignupCredentials;

        // Validate required fields
        if (!email || !password || !firstName || !lastName) {
            sendError(res, 'ValidationError', 'email, password, firstName, and lastName are required', 400);
            return;
        }

        if (password.length < 8) {
            sendError(res, 'ValidationError', 'Password must be at least 8 characters', 400);
            return;
        }

        // Check if user already exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            sendError(res, 'ConflictError', 'An account with this email already exists', 409);
            return;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName,
                lastName,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Generate tokens
        const accessToken = generateAccessToken({ userId: user.id, email: user.email });
        const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

        // Store refresh token in DB
        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: getRefreshTokenExpiry(),
            },
        });

        sendSuccess(res, { user, token: accessToken, refreshToken }, 'Account created successfully', 201);
    } catch (error) {
        console.error('[signup]', error);
        sendError(res, 'InternalError', 'Failed to create account', 500);
    }
}

/**
 * POST /api/auth/login
 * Authenticate user and return tokens
 */
export async function login(req: Request, res: Response): Promise<void> {
    try {
        const { email, password } = req.body as LoginCredentials;

        if (!email || !password) {
            sendError(res, 'ValidationError', 'email and password are required', 400);
            return;
        }

        // Find user
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            sendError(res, 'InvalidCredentials', 'Invalid email or password', 401);
            return;
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            sendError(res, 'InvalidCredentials', 'Invalid email or password', 401);
            return;
        }

        // Generate tokens
        const accessToken = generateAccessToken({ userId: user.id, email: user.email });
        const refreshToken = generateRefreshToken({ userId: user.id, email: user.email });

        // Store refresh token
        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt: getRefreshTokenExpiry(),
            },
        });

        const { password: _pwd, ...userPublic } = user;
        sendSuccess(res, { user: userPublic, token: accessToken, refreshToken }, 'Login successful');
    } catch (error) {
        console.error('[login]', error);
        sendError(res, 'InternalError', 'Login failed', 500);
    }
}

/**
 * POST /api/auth/refresh
 * Exchange a valid refresh token for a new access token
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
    try {
        const { refreshToken: token } = req.body as { refreshToken: string };

        if (!token) {
            sendError(res, 'ValidationError', 'refreshToken is required', 400);
            return;
        }

        // Verify JWT signature
        let payload;
        try {
            payload = verifyRefreshToken(token);
        } catch {
            sendError(res, 'InvalidToken', 'Invalid or expired refresh token', 401);
            return;
        }

        // Check DB
        const stored = await prisma.refreshToken.findUnique({ where: { token } });
        if (!stored || stored.expiresAt < new Date()) {
            sendError(res, 'InvalidToken', 'Refresh token is invalid or expired', 401);
            return;
        }

        // Rotate: delete old, issue new
        await prisma.refreshToken.delete({ where: { token } });

        const newAccessToken = generateAccessToken({ userId: payload.userId, email: payload.email });
        const newRefreshToken = generateRefreshToken({ userId: payload.userId, email: payload.email });

        await prisma.refreshToken.create({
            data: {
                token: newRefreshToken,
                userId: payload.userId,
                expiresAt: getRefreshTokenExpiry(),
            },
        });

        sendSuccess(res, { token: newAccessToken, refreshToken: newRefreshToken }, 'Token refreshed');
    } catch (error) {
        console.error('[refreshToken]', error);
        sendError(res, 'InternalError', 'Failed to refresh token', 500);
    }
}

/**
 * POST /api/auth/logout
 * Revoke the provided refresh token
 */
export async function logout(req: Request, res: Response): Promise<void> {
    try {
        const { refreshToken: token } = req.body as { refreshToken?: string };

        if (token) {
            await prisma.refreshToken.deleteMany({ where: { token } });
        }

        sendSuccess(res, null, 'Logged out successfully');
    } catch (error) {
        console.error('[logout]', error);
        sendError(res, 'InternalError', 'Logout failed', 500);
    }
}

/**
 * GET /api/auth/me  (protected)
 * Return the currently authenticated user
 */
export async function getMe(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user!.userId;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            sendError(res, 'NotFound', 'User not found', 404);
            return;
        }

        sendSuccess(res, user);
    } catch (error) {
        console.error('[getMe]', error);
        sendError(res, 'InternalError', 'Failed to get user', 500);
    }
}
