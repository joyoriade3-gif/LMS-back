import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

// Create reusable transporter
const transporter = nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: false,
    auth: {
        user: env.email.user,
        pass: env.email.pass
    }
})

// Verify transporter on startup
transporter.verify((error) => {
    if (error) {
        console.error('Email service error:', error)
    } else {
        console.log('Email service ready')
    }
})

// Send OTP email
export async function sendOTPEmail(
    email: string,
    fullName: string,
    otp: string
): Promise<void> {
    await transporter.sendMail({
    from: `"LMS Platform" <${env.email.from}>`,
    to: email,
    subject: 'Your Password Reset Code',
    replyTo: env.email.from,
    headers: {
        'X-Priority': '1',
        'X-Mailer': 'LMS Platform'
    },
    html: `
        <div style="
            font-family: Arial, sans-serif;
            max-width: 480px;
            margin: 0 auto;
            background: #0a0a0a;
            border: 1px solid #1a1a1a;
            border-radius: 16px;
            padding: 40px;
            color: #ffffff;
        ">
            <h2 style="color: #ffffff; margin-bottom: 8px;">
                Password Reset
            </h2>
            <p style="color: #888888; font-size: 14px; margin-bottom: 32px;">
                Hi ${fullName}, here is your 6-digit reset code
            </p>

            <div style="
                background: #111111;
                border: 1px solid #222222;
                border-radius: 12px;
                padding: 24px;
                text-align: center;
                margin-bottom: 32px;
            ">
                <p style="
                    font-size: 40px;
                    font-weight: bold;
                    letter-spacing: 12px;
                    color: #3b82f6;
                    margin: 0;
                ">${otp}</p>
            </div>

            <p style="color: #888888; font-size: 13px; margin-bottom: 8px;">
                This code expires in <strong style="color: #ffffff;">10 minutes</strong>.
            </p>
            <p style="color: #888888; font-size: 13px;">
                If you did not request this, please ignore this email.
                Your password will not be changed.
            </p>

            <hr style="border-color: #1a1a1a; margin: 32px 0;" />

            <p style="color: #444444; font-size: 12px; text-align: center;">
                LMS Platform — This is an automated email, do not reply.
            </p>
        </div>
    `
    })
}

// Send welcome email after registration
export async function sendWelcomeEmail(
    email: string,
    fullName: string,
    role: string
): Promise<void> {
    await transporter.sendMail({
        from: `"LMS Platform" <${env.email.from}>`,
        to: email,
        subject: `Welcome to LMS Platform${role === 'instructor' ? ' — Complete Your Payment' : ''}`,
        html: `
            <div style="
                font-family: Arial, sans-serif;
                max-width: 480px;
                margin: 0 auto;
                background: #0a0a0a;
                border: 1px solid #1a1a1a;
                border-radius: 16px;
                padding: 40px;
                color: #ffffff;
            ">
                <h2 style="color: #ffffff; margin-bottom: 8px;">
                    Welcome, ${fullName}!
                </h2>

                ${role === 'instructor' ? `
                    <p style="color: #888888; font-size: 14px; margin-bottom: 16px;">
                        Your instructor account has been created.
                        Please complete your ₦10,000 payment to activate your account.
                    </p>
                    <div style="
                        background: #1a1200;
                        border: 1px solid #3a2800;
                        border-radius: 12px;
                        padding: 16px;
                        margin-bottom: 24px;
                    ">
                        <p style="color: #fbbf24; font-size: 13px; margin: 0;">
                            Your account will remain inactive until payment is confirmed.
                        </p>
                    </div>
                ` : `
                    <p style="color: #888888; font-size: 14px; margin-bottom: 16px;">
                        Your student account is ready. 
                        Start learning today!
                    </p>
                `}

                <hr style="border-color: #1a1a1a; margin: 32px 0;" />

                <p style="color: #444444; font-size: 12px; text-align: center;">
                    LMS Platform — This is an automated email, do not reply.
                </p>
            </div>
        `
    })
}