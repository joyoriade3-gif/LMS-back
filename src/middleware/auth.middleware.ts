import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../utils/jwt.utils.js'
import { ApiError } from './error.middleware.js'
import type { JwtPayload, UserRole } from '../types/index.js'

// Extends Express Request so req.user is available in controllers
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

// Protects any route — must have valid access token
export function protect(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('No token provided, access denied', 401)
    }

    // Clean token — remove quotes or extra characters
    let token = authHeader.split(' ')[1]
    token = token.replace(/^"|"$/g, '').trim()

    // Validate token format
    if (!token || token.split('.').length !== 3) {
      console.error('Invalid token format:', token?.substring(0, 20) + '...')
      throw new ApiError('Invalid token format', 401)
    }

    const decoded = verifyAccessToken(token)
    req.user = decoded
    next()
  } catch (err: unknown) {
    // ── Fix 1: type err as unknown, then narrow it ────────────────────
    const message = err instanceof Error ? err.message : 'Authentication failed'
    console.error('Auth error:', message)

    if (
      message.includes('jwt malformed') ||
      message.includes('invalid token') ||
      message.includes('JsonWebTokenError')
    ) {
      // ── Fix 2: call next() without return to satisfy void return type
      next(new ApiError('Invalid or expired token. Please login again.', 401))
      return
    }

    if (err instanceof ApiError) {
      next(err)
      return
    }

    next(new ApiError(message, 401))
  }
}

// Restricts route to specific roles
export function restrictTo(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      // ── Fix 3: call next() then return separately ─────────────────
      next(new ApiError('You do not have permission to perform this action', 403))
      return
    }
    next()
  }
}
