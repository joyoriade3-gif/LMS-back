import dotenv from 'dotenv'
dotenv.config()

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing environment variable: ${key}`)
  return value
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback
}

export const env = {
  port: Number(optional('PORT', '5000')),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',

  mongoUri: required('MONGODB_URI'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '1h'),

  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtRefreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  jwtResetSecret: required('JWT_RESET_SECRET'),
  jwtResetExpiresIn: optional('JWT_RESET_EXPIRES_IN', '15m'),

  email: {
    host: optional('EMAIL_HOST', 'smtp.gmail.com'),
    port: Number(optional('EMAIL_PORT', '587')),
    user: required('EMAIL_USER'),
    pass: required('EMAIL_PASS'),
    from: required('EMAIL_FROM'),
  },

  // ─── Payment config intentionally removed ────────────────────────────────
  // Paystack integration is disabled. See PAYMENT_UPGRADE_GUIDE.md to re-add.
} as const
