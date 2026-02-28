import jwt from 'jsonwebtoken';
import config from '../config';
import type { JwtPayload } from '../types';

/**
 * Generate a short-lived access token (15m by default)
 */
export function generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);
}

/**
 * Generate a long-lived refresh token (7d by default)
 */
export function generateRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiresIn,
    } as jwt.SignOptions);
}

/**
 * Verify an access token and return the payload
 */
export function verifyAccessToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwt.secret) as JwtPayload;
}

/**
 * Verify a refresh token and return the payload
 */
export function verifyRefreshToken(token: string): JwtPayload {
    return jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
}

/**
 * Calculate refresh token expiry date
 */
export function getRefreshTokenExpiry(): Date {
    const days = 7; // Should match JWT_REFRESH_EXPIRES_IN
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
