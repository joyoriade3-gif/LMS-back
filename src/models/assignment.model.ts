import mongoose, { Schema, Document, Model } from 'mongoose'
 
export interface ISubmission {
  student: mongoose.Types.ObjectId
  answer: string
  submittedAt: Date
}
 
const submissionSchema = new Schema<ISubmission>(
  {
    student:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    answer:      { type: String, required: true, trim: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)
 
export interface IAssignmentDocument extends Document {
  title: string
  description: string
  dueDate: Date // acts as the closing time — submissions blocked after this
  course: mongoose.Types.ObjectId
  instructor: mongoose.Types.ObjectId
  submissions: ISubmission[]
  createdAt: Date
  updatedAt: Date
}
 
const assignmentSchema = new Schema<IAssignmentDocument>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    instructor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // One submission per student — enforced in the controller (upsert by student id).
    submissions: { type: [submissionSchema], default: [] },
  },
  { timestamps: true }
)
 
assignmentSchema.index({ course: 1 })
assignmentSchema.index({ instructor: 1 })
 
export const AssignmentModel: Model<IAssignmentDocument> =
  mongoose.models.Assignment || mongoose.model<IAssignmentDocument>('Assignment', assignmentSchema)
 