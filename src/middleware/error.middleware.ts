import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env.js'
import { sendResponse } from '../utils/response.utils.js'

export class ApiError extends Error {
    public statusCode: number

    constructor(message: string, statusCode: number) {
        super(message)
        this.statusCode = statusCode
        this.name = 'ApiError'
    }
}

export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    let statusCode = 500
    let message = 'Something went wrong, please try again'

    if (err instanceof ApiError) {
        statusCode = err.statusCode
        message = err.message
    } else if ((err as any).code === 11000) {
        // MongoDB duplicate key — means email already exists
        statusCode = 409
        message = 'An account with this email already exists'
    } else if (err.name === 'ValidationError') {
        statusCode = 400
        message = err.message
    } else if (err.name === 'CastError') {
        statusCode = 400
        message = 'Invalid ID format'
    } else if (err.name === 'JsonWebTokenError') {
        statusCode = 401
        message = 'Invalid token, please login again'
    } else if (err.name === 'TokenExpiredError') {
        statusCode = 401
        message = 'Token expired, please login again'
    }

    if (env.isDev) {
        console.error('Error:', err)
    }

    sendResponse(res, statusCode, false, message)
}