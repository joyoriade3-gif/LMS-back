// src/models/pending-course.model.ts
import mongoose, { Schema, model, type Model } from 'mongoose';

export interface IPendingCourse extends Document {
  instructor: mongoose.Types.ObjectId;
  courseData: {
    title: string;
    description: string;
    category: string;
    level: string;
    price: number;
    paymentAccountName: string;
    paymentAccountNo: string;
    paymentBankName: string;
    objectives: string[];
    requirements: string[];
    whatYouLearn: string[];
    whoIsItFor: string[];
    topics: any[];
    hours: number;
    videoUrl: string;
    accent: string;
    badge: string;
    img?: string;
  };
  paymentReference: string;
  status: 'pending' | 'paid' | 'failed';
  createdAt: Date;
}

const pendingCourseSchema = new Schema<IPendingCourse>(
  {
    instructor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    courseData: {
      title: { type: String, required: true, trim: true },
      description: { type: String, required: true, trim: true },
      category: { type: String, default: '' },
      level: { type: String, default: 'Beginner' },
      price: { type: Number, default: 0 },
      paymentAccountName: { type: String, default: '' },
      paymentAccountNo: { type: String, default: '' },
      paymentBankName: { type: String, default: '' },
      objectives: { type: [String], default: [] },
      requirements: { type: [String], default: [] },
      whatYouLearn: { type: [String], default: [] },
      whoIsItFor: { type: [String], default: [] },
      topics: { type: [Schema.Types.Mixed], default: [] },
      hours: { type: Number, default: 0 },
      videoUrl: { type: String, default: '' },
      accent: { type: String, default: '#6366F1' },
      badge: { type: String, default: null },
      img: { type: String, default: '' },
    },
    paymentReference: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 3600,
    },
  },
  { timestamps: true }
);

// Indexes
pendingCourseSchema.index({ instructor: 1, status: 1 });

export const PendingCourseModel: Model<IPendingCourse> =
  mongoose.models.PendingCourse || model('PendingCourse', pendingCourseSchema);