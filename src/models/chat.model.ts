import mongoose, { Schema, Document, Model } from 'mongoose'

export interface IMessage extends Document {
  roomId:    string
  course:    mongoose.Types.ObjectId
  sender:    mongoose.Types.ObjectId
  message:   string
  attachmentUrl?: string
  attachmentType?: 'image' | 'video' | 'audio' | 'raw'
  isSticker?: boolean
  isGroup:   boolean
  readBy:    mongoose.Types.ObjectId[]
  createdAt: Date
}

const messageSchema = new Schema<IMessage>(
  {
    roomId:  { type: String, required: true, index: true },
    course:  { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    sender:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, default: '', trim: true },
    attachmentUrl:  { type: String, default: '' },
    attachmentType: { type: String, enum: ['image', 'video', 'audio', 'raw'] },
    isSticker: { type: Boolean, default: false },
    isGroup: { type: Boolean, default: false },
    readBy:  { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true }
)

export const MessageModel: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', messageSchema)