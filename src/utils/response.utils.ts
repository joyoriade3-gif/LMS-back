import { type Response } from 'express'
import type { ApiResponse } from '../types/index.js'

export function sendResponse<T>(
    res: Response,
    statusCode: number,
    success: boolean,
    message: string,
    data?: T
): Response {
    const body: ApiResponse<T> = { success, message }
    if (data !== undefined) body.data = data
    return res.status(statusCode).json(body)
}