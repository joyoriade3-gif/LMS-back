import mongoose, { Document, Schema } from 'mongoose';
 
export interface ISchedule extends Document {
  instructor: mongoose.Types.ObjectId;
  course: mongoose.Types.ObjectId; // which course this session belongs to
  title: string;
  description?: string;
  type: 'webinar' | 'workshop' | 'lecture' | 'meeting' | 'office_hours' | 'other';
  date: Date;
  startTime: string;
  endTime: string;
  meetLink?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}
 
const ScheduleSchema = new Schema<ISchedule>(
  {
    instructor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Every schedule item now belongs to a specific course, so only
    // students enrolled in THAT course see it.
    course: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: ['webinar', 'workshop', 'lecture', 'meeting', 'office_hours', 'other'],
      default: 'other',
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    startTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    endTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    meetLink: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      default: 'blue',
    },
  },
  { timestamps: true }
);
 
ScheduleSchema.index({ instructor: 1, date: 1 });
ScheduleSchema.index({ course: 1, date: 1 });
 
export default mongoose.model<ISchedule>('Schedule', ScheduleSchema);
 