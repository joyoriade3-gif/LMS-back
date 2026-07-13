// src/models/enrollment.model.ts
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IEnrollment extends Document {
  student:    mongoose.Types.ObjectId
  course:     mongoose.Types.ObjectId
  instructor: mongoose.Types.ObjectId
  amountPaid: number
  paystackRef: string  // kept in schema for future payment support, always '' for now
  status: 'pending' | 'active'
  createdAt: Date
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    student:     { type: Schema.Types.ObjectId, ref: 'User',   required: true },
    course:      { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    instructor:  { type: Schema.Types.ObjectId, ref: 'User',   required: true },
    amountPaid:  { type: Number, default: 0 },
    paystackRef: { type: String, default: '' }, // kept for future payment re-integration
    status:      { type: String, enum: ['pending', 'active'], default: 'active' },
                 // ↑ default changed to 'active' since there's no payment step
  },
  { timestamps: true }
)

enrollmentSchema.index({ student: 1, course: 1 }, { unique: true })

export const EnrollmentModel: Model<IEnrollment> =
  mongoose.models.Enrollment ||
  mongoose.model<IEnrollment>('Enrollment', enrollmentSchema)
