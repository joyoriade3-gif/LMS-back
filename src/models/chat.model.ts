import mongoose, { Schema, Document, Model } from 'mongoose'
 
export interface IMessage extends Document {
  roomId:    string
  course:    mongoose.Types.ObjectId
  sender:    mongoose.Types.ObjectId
  message:   string
  isGroup:   boolean
  createdAt: Date
}
 
const messageSchema = new Schema<IMessage>(
  {
    roomId:  { type: String, required: true, index: true },
    // Every message — group or private — now belongs to a specific course.
    // This is what lets a student/instructor pair who share more than one
    // course keep separate, clearly-labeled conversation threads.
    course:  { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    sender:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true, trim: true },
    isGroup: { type: Boolean, default: false },
  },
  { timestamps: true }
)
 
export const MessageModel: Model<IMessage> =
  mongoose.models.Message ||
  mongoose.model<IMessage>('Message', messageSchema)
 