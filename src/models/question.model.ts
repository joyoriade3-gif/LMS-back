import mongoose, { Schema } from 'mongoose'

export interface IQuestion {
  student: mongoose.Types.ObjectId
  course: mongoose.Types.ObjectId
  instructor: mongoose.Types.ObjectId
  text: string
  answer?: string
  answeredAt?: Date
  createdAt: Date
}

const questionSchema = new Schema<IQuestion>(
  {
    student:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course:     { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    instructor: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text:       { type: String, required: true, trim: true },
    answer:     { type: String, default: '' },
    answeredAt: { type: Date, default: null },
  },
  { timestamps: true }
)

export const QuestionModel = mongoose.model<IQuestion>('Question', questionSchema)
