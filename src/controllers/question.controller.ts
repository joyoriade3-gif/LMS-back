import type { Request, Response, NextFunction } from 'express'
import { QuestionModel } from '../models/question.model.js'
import { CourseModel } from '../models/course.model.js'
import { ApiError } from '../middleware/error.middleware.js'
import { sendResponse } from '../utils/response.utils.js'
import { emitNotificationToUser } from '../socket/notify.js'

// ─── POST /questions — student asks a question about an enrolled course ───
export const askQuestion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.id
    const { courseId, text } = req.body
    if (!courseId || !text?.trim()) throw new ApiError('Course and question text are required', 400)

    const course = await CourseModel.findById(courseId).lean()
    if (!course) throw new ApiError('Course not found', 404)

    const isEnrolled = course.enrolledStudents?.some((id: any) => id.toString() === studentId)
    if (!isEnrolled) throw new ApiError('You must be enrolled in this course to ask a question', 403)
    if (!course.instructor) throw new ApiError('This course has no assigned instructor yet', 400)

    const question = await QuestionModel.create({
      student: studentId,
      course: courseId,
      instructor: course.instructor,
      text: text.trim(),
    })

    emitNotificationToUser(String(course.instructor), {
      type: 'question',
      courseId: String(courseId),
      title: 'New question',
      message: `A student asked a question in ${course.title}`,
      createdAt: new Date(),
    })

    sendResponse(res, 201, true, 'Question submitted', { question })
  } catch (err) { next(err) }
}

// ─── GET /questions/mine — student's own questions across all their courses ──
export const getMyQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = req.user?.id
    const questions = await QuestionModel.find({ student: studentId })
      .populate('course', 'title')
      .sort({ createdAt: -1 })
      .lean()
    sendResponse(res, 200, true, 'Questions fetched', { questions })
  } catch (err) { next(err) }
}

// ─── GET /questions/instructor — every question asked across the instructor's courses ──
export const getInstructorQuestions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = req.user?.id
    const questions = await QuestionModel.find({ instructor: instructorId })
      .populate('student', 'fullName email avatar')
      .populate('course', 'title')
      .sort({ createdAt: -1 })
      .lean()
    sendResponse(res, 200, true, 'Questions fetched', { questions })
  } catch (err) { next(err) }
}

// ─── POST /questions/:id/answer — instructor answers a question ───────────
export const answerQuestion = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const instructorId = req.user?.id
    const { answer } = req.body
    if (!answer?.trim()) throw new ApiError('An answer is required', 400)

    const question = await QuestionModel.findById(req.params.id)
    if (!question) throw new ApiError('Question not found', 404)
    if (question.instructor.toString() !== instructorId) {
      throw new ApiError('You can only answer questions asked in your own courses', 403)
    }

    question.answer = answer.trim()
    question.answeredAt = new Date()
    await question.save()

    emitNotificationToUser(String(question.student), {
      type: 'question_answered',
      courseId: String(question.course),
      title: 'Your question was answered',
      message: answer.trim().slice(0, 80),
      createdAt: new Date(),
    })

    sendResponse(res, 200, true, 'Answer submitted', { question })
  } catch (err) { next(err) }
}
