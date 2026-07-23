// src/models/assignment.model.ts — proposed replacement
import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IOption {
  id: string
  text: string // can contain simple HTML from the rich-text editor
}

export interface IQuestion {
  questionId: string
  type: 'mcq' | 'text'
  text: string        // rich-text HTML (bold/italic/lists), rendered with dangerouslySetInnerHTML on read
  image?: string       // Cloudinary URL, optional
  options?: IOption[]  // only for type 'mcq', 2-8 entries
  correctOptionId?: string // only for type 'mcq'
}

export interface IAnswer {
  questionId: string
  selectedOptionId?: string // for mcq
  answerText?: string       // for free text
}

export interface ISubmission {
  student: mongoose.Types.ObjectId
  answers: IAnswer[]
  fileUrl?: string        // Cloudinary is bypassed — local disk URL, stored as a short string
  fileName?: string
  fileType?: 'video' | 'pdf' | 'image' | 'doc'
  score?: number       // auto-computed from mcq questions at submit time
  maxScore?: number
  submittedAt: Date
}

export interface IAssignmentDocument extends Document {
  title: string
  description: string
  dueDate: Date
  course: mongoose.Types.ObjectId
  instructor: mongoose.Types.ObjectId
  questions: IQuestion[]
  materialUrl?: string   // Cloudinary URL for attached video/pdf/doc/image
  materialType?: 'video' | 'pdf' | 'doc' | 'image'
  submissions: ISubmission[]
  createdAt: Date
  updatedAt: Date
}

const optionSchema = new Schema<IOption>({
  id: { type: String, required: true },
  text: { type: String, required: true },
}, { _id: false })

const questionSchema = new Schema<IQuestion>({
  questionId: { type: String, required: true },
  type: { type: String, enum: ['mcq', 'text'], default: 'text' },
  text: { type: String, required: true },
  image: { type: String, default: '' },
  options: { type: [optionSchema], default: undefined },
  correctOptionId: { type: String },
}, { _id: false })

const answerSchema = new Schema<IAnswer>({
  questionId: { type: String, required: true },
  selectedOptionId: { type: String },
  answerText: { type: String },
}, { _id: false })

const submissionSchema = new Schema<ISubmission>({
  student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  answers: { type: [answerSchema], default: [] },
  fileUrl: { type: String, default: '' },
  fileName: { type: String, default: '' },
  fileType: { type: String, enum: ['video', 'pdf', 'image', 'doc'] },
  score: { type: Number },
  maxScore: { type: Number },
  submittedAt: { type: Date, default: Date.now },
}, { _id: false })

const assignmentSchema = new Schema<IAssignmentDocument>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    instructor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    questions: { type: [questionSchema], default: [] },
    materialUrl: { type: String, default: '' },
    materialType: { type: String, enum: ['video', 'pdf', 'doc', 'image'] },
    submissions: { type: [submissionSchema], default: [] },
  },
  { timestamps: true }
)

assignmentSchema.index({ course: 1 })
assignmentSchema.index({ instructor: 1 })

export const AssignmentModel: Model<IAssignmentDocument> =
  mongoose.models.Assignment || mongoose.model<IAssignmentDocument>('Assignment', assignmentSchema)