import mongoose from 'mongoose'
import { env } from '../config/env.js'

mongoose.connection.on('connected', () => {
    console.log('MongoDB connected successfully')
})
mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err)
})
mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected')
})

export async function connectDatabase(): Promise<void> {
    await mongoose.connect(env.mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
    })
}

export async function disconnectDatabase(): Promise<void> {
    await mongoose.disconnect()
}