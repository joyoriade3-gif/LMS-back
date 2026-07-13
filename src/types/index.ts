export type UserRole = 'student' | 'instructor'

export type JwtExpiry = '1h' | '3h' | '7d' | '15m'

export interface ApiResponse<T = unknown> {
    success: boolean
    message: string
    data?: T
}

export interface JwtPayload {
    id: string
    role: UserRole
    email: string
}

export interface ResetTokenPayload {
    id: string
    email: string
    purpose: 'reset'
}