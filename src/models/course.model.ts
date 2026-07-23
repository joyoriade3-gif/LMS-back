// src/models/course.model.ts
import mongoose, { Schema, model, type Model } from 'mongoose'

const quizQuestionSchema = new Schema(
  {
    q: { type: String, required: true, trim: true },
    options: [{ type: String, trim: true }],
    answer: { type: Number, required: true },
    // Optional per-question image, e.g. a diagram the question refers to.
    img: { type: String, default: '' },
  },
  { _id: false }
)

const subtopicSchema = new Schema(
  {
    subtopicId: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    video: { type: String, default: '' },
    pdf: { type: String, default: '' },
    notes: { type: String, default: '' },
    quiz: { type: [quizQuestionSchema], default: [] }
  },
  { _id: false }
)

const topicSchema = new Schema(
  {
    topicId: { type: Number, required: true },
    emoji: { type: String, default: '📚' },
    title: { type: String, required: true, trim: true },
    desc: { type: String, default: '' },
    subtopics: { type: [subtopicSchema], default: [] }
  },
  { _id: false }
)

const courseSchema = new Schema(
  {
    title:       { type: String, required: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    subject:     { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category:    { type: String, trim: true },

    img:      { type: String, default: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500' },
    videoUrl: { type: String, default: '' },

    rating:   { type: Number, default: 4.5 },
    students: { type: Number, default: 0 },

    accent:      { type: String, default: '#6366F1' },
    badge:       { type: String, default: null },
    isPublished: { type: Boolean, default: true },

    whatYouLearn: { type: [String], default: [] },
    whoIsItFor:   { type: [String], default: [] },

    topics: { type: [topicSchema], default: [] },

    instructor:       { type: Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    enrolledStudents: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
)

courseSchema.index({ title: 1 })
courseSchema.index({ subject: 1 })
courseSchema.index({ instructor: 1 })
courseSchema.index({ title: 'text', description: 'text', subject: 'text' })

export type CourseDocument = typeof courseSchema

export const CourseModel: Model<any> =
  mongoose.models.Course || model('Course', courseSchema)