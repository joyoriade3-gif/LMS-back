import axios from 'axios'
import { env } from '../config/env.js'

const PAYSTACK_BASE_URL = 'https://api.paystack.co'

// Reusable axios instance with auth header
const paystackClient = axios.create({
    baseURL: PAYSTACK_BASE_URL,
    headers: {
        Authorization: `Bearer ${env.paystack.secretKey}`,
        'Content-Type': 'application/json'
    }
})

// Initialize payment — returns payment URL to redirect instructor to
export async function initializePayment(
    email: string,
    fullName: string,
    userId: string
): Promise<{ paymentUrl: string; reference: string }> {
    const response = await paystackClient.post('/transaction/initialize', {
        email,
        amount: env.paystack.instructorFee,  // 1000000 kobo = ₦10,000
        currency: 'NGN',
        metadata: {
            userId,
            fullName,
            role: 'instructor'
        },
        callback_url: `${process.env.FRONTEND_URL}/payment/verify`
    })

    const { authorization_url, reference } = response.data.data

    return {
        paymentUrl: authorization_url,
        reference
    }
}

// Verify payment — called after Paystack redirects back
export async function verifyPayment(
    reference: string
): Promise<{ success: boolean; reference: string }> {
    const response = await paystackClient.get(
        `/transaction/verify/${reference}`
    )

    const { status, reference: ref } = response.data.data

    return {
        success: status === 'success',
        reference: ref
    }
}