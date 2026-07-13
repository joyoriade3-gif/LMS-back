import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import type { JwtPayload, ResetTokenPayload } from '../types/index.js'

// Access token — expires in 1h
export function signAccessToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.jwtSecret, {
        expiresIn: env.jwtExpiresIn
    } as jwt.SignOptions)
}

export function verifyAccessToken(token: string): JwtPayload {
    try {
        // ✅ CLEAN THE TOKEN - Remove quotes and trim
        const cleanToken = token.replace(/^"|"$/g, '').trim()
        
        // ✅ CHECK IF TOKEN HAS PROPER FORMAT (3 parts)
        if (cleanToken.split('.').length !== 3) {
            throw new Error('Invalid token format: token must have 3 parts')
        }
        
        return jwt.verify(cleanToken, env.jwtSecret) as JwtPayload
    } catch (error) {
        // ✅ BETTER ERROR MESSAGE
        if (error instanceof jwt.JsonWebTokenError) {
            throw new Error(`JWT Error: ${error.message}`)
        }
        throw error
    }
}

// Refresh token — expires in 7d
export function signRefreshToken(payload: JwtPayload): string {
    return jwt.sign(payload, env.jwtRefreshSecret, {
        expiresIn: env.jwtRefreshExpiresIn
    } as jwt.SignOptions)
}

export function verifyRefreshToken(token: string): JwtPayload {
    try {
        const cleanToken = token.replace(/^"|"$/g, '').trim()
        if (cleanToken.split('.').length !== 3) {
            throw new Error('Invalid token format')
        }
        return jwt.verify(cleanToken, env.jwtRefreshSecret) as JwtPayload
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            throw new Error(`JWT Error: ${error.message}`)
        }
        throw error
    }
}

// Reset token — expires in 15m, used only for password reset
export function signResetToken(payload: ResetTokenPayload): string {
    return jwt.sign(payload, env.jwtResetSecret, {
        expiresIn: env.jwtResetExpiresIn
    } as jwt.SignOptions)
}

export function verifyResetToken(token: string): ResetTokenPayload {
    try {
        const cleanToken = token.replace(/^"|"$/g, '').trim()
        return jwt.verify(cleanToken, env.jwtResetSecret) as ResetTokenPayload
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            throw new Error(`JWT Error: ${error.message}`)
        }
        throw error
    }
}