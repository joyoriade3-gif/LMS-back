import bcrypt from 'bcryptjs'

// Password hashing
export async function hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12)
    return bcrypt.hash(password, salt)
}

export async function comparePassword(
    password: string,
    hashedPassword: string
): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword)
}

// OTP hashing — same bcrypt, different function names for clarity
export async function hashOTP(otp: string): Promise<string> {
    const salt = await bcrypt.genSalt(10)
    return bcrypt.hash(otp, salt)
}

export async function compareOTP(
    otp: string,
    hashedOTP: string
): Promise<boolean> {
    return bcrypt.compare(otp, hashedOTP)
}

// Generate random 6 digit OTP
export function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}