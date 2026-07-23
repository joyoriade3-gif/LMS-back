import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { AssignmentModel, IQuestion, IOption } from '../models/assignment.model.js'
import { CourseModel } from '../models/course.model.js'
import { EnrollmentModel } from '../models/enrollment.model.js'
import userModel from '../models/user.model.js'
import { ApiError } from '../middleware/error.middleware.js'
import { sendResponse } from '../utils/response.utils.js'
import { emitNotificationToUser } from '../socket/notify.js'
import { toPublicUrl } from '../services/local-storage.service.js'

const resolveFileType = (mimetype: string): 'video' | 'pdf' | 'image' | 'doc' => {
  if (mimetype.startsWith('video/')) return 'video'
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype === 'application/pdf') return 'pdf'
  return 'doc'
}

class AssignmentController {

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, description, dueDate, courseId, materialUrl } = req.body

      if (!title || !description || !dueDate || !courseId) {
        throw new ApiError('Title, description, due date, and course are required', 400)
      }

      // Sent as multipart/form-data now (to support attached files), so
      // `questions` arrives as a JSON string rather than a parsed array.
      let questions: any[] = []
      if (req.body.questions) {
        try {
          questions = typeof req.body.questions === 'string' ? JSON.parse(req.body.questions) : req.body.questions
        } catch {
          questions = []
        }
      }

      const course = await CourseModel.findById(courseId)
      if (!course) throw new ApiError('Course not found', 404)
      if (course.instructor?.toString() !== req.user?.id) {
        throw new ApiError('You can only create assignments for courses you own', 403)
      }

      // Explicitly typed against IQuestion/IOption — this is what fixes the
      // "no overload matches" error. An inline object literal with `any`
      // fields doesn't satisfy Mongoose's subdocument array typing; a
      // properly-typed array does.
      const parsedQuestions: IQuestion[] = Array.isArray(questions)
        ? questions.map((q: any): IQuestion => {
            const type: 'mcq' | 'text' = q.type === 'mcq' ? 'mcq' : 'text'
            const options: IOption[] | undefined = type === 'mcq'
              ? (q.options || []).map((o: any): IOption => ({
                  id: o.id || randomUUID(),
                  text: o.text || '',
                }))
              : undefined

            return {
              questionId: q.questionId || randomUUID(),
              type,
              text: q.text || '',
              image: q.image || '',
              options,
              correctOptionId: type === 'mcq' ? q.correctOptionId : undefined,
            }
          })
        : []

      const files = req.files as Record<string, Express.Multer.File[]> | undefined

      // An attached video/pdf/image/doc goes straight to local disk — see
      // local-storage.service.ts — so it never touches Cloudinary and only
      // a short URL string lands in MongoDB.
      let finalMaterialUrl = materialUrl || ''
      let finalMaterialType: 'video' | 'pdf' | 'image' | 'doc' | undefined
      const materialFile = files?.materialFile?.[0]
      if (materialFile) {
        finalMaterialUrl = toPublicUrl(materialFile)
        finalMaterialType = resolveFileType(materialFile.mimetype)
      }

      // Per-question images, same "index list" pattern as course quizzes.
      const questionImageFiles = files?.questionImages || []
      let indexList: number[] = []
      if (req.body.questionImageIndexes) {
        try {
          indexList = typeof req.body.questionImageIndexes === 'string'
            ? JSON.parse(req.body.questionImageIndexes)
            : req.body.questionImageIndexes
        } catch {
          indexList = []
        }
      }
      for (let i = 0; i < questionImageFiles.length; i++) {
        const qIndex = indexList[i]
        if (qIndex === undefined || !parsedQuestions[qIndex]) continue
        parsedQuestions[qIndex].image = toPublicUrl(questionImageFiles[i])
      }

      const assignment = await AssignmentModel.create({
        title,
        description,
        dueDate: new Date(dueDate),
        course: courseId,
        instructor: req.user?.id,
        questions: parsedQuestions,
        materialUrl: finalMaterialUrl,
        materialType: finalMaterialType,
      })

      // .populate() on the doc returned by .create() was resolving to
      // `never` because `assignment` above was implicitly typed from a
      // problematic overload match. Re-fetching by _id sidesteps that
      // entirely and gives TS (and us) a clean, correctly-typed document.
      const populated = await AssignmentModel.findById(assignment._id)
        .populate('course', 'title subject enrolledStudents')

      if (!populated) throw new ApiError('Failed to load created assignment', 500)

      const enrolledIds = (populated.course as any)?.enrolledStudents || []
      for (const studentId of enrolledIds) {
        emitNotificationToUser(String(studentId), {
          type: 'assignment',
          courseId,
          title: 'New assignment posted',
          message: `${(populated.course as any).title}: ${title}`,
          createdAt: new Date(),
        })
      }

      sendResponse(res, 201, true, 'Assignment created successfully', populated)
    } catch (err) {
      next(err)
    }
  }

  getMyAssignments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assignments = await AssignmentModel
        .find({ instructor: req.user?.id })
        .populate('course', 'title subject enrolledStudents')
        .sort({ createdAt: -1 })
        .lean()

      const annotated = assignments.map((a: any) => {
        const totalEnrolled = a.course?.enrolledStudents?.length || 0
        const submittedCount = a.submissions?.length || 0
        return {
          ...a,
          submittedCount,
          notSubmittedCount: Math.max(totalEnrolled - submittedCount, 0),
          isClosed: new Date(a.dueDate) < new Date(),
          hasMcq: (a.questions || []).some((q: any) => q.type === 'mcq'),
        }
      })

      sendResponse(res, 200, true, 'Assignments fetched', { assignments: annotated })
    } catch (err) {
      next(err)
    }
  }

  getSubmissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const assignment = await AssignmentModel.findById(id)
        .populate('submissions.student', 'fullName email avatar')
        .populate('course', 'title enrolledStudents')
        .lean()

      if (!assignment) throw new ApiError('Assignment not found', 404)
      if ((assignment as any).instructor?.toString() !== req.user?.id) {
        throw new ApiError('You do not have permission to view this assignment', 403)
      }

      const course = await CourseModel.findById((assignment as any).course._id)
        .populate('enrolledStudents', 'fullName email avatar')
        .lean()

      const submittedIds = new Set(
        ((assignment as any).submissions || []).map((s: any) => s.student?._id?.toString())
      )
      const notSubmitted = (course?.enrolledStudents || []).filter(
        (s: any) => !submittedIds.has(s._id.toString())
      )

      sendResponse(res, 200, true, 'Submissions fetched', {
        assignment,
        questions: (assignment as any).questions || [],
        submitted: (assignment as any).submissions || [],
        notSubmitted,
      })
    } catch (err) {
      next(err)
    }
  }

  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const studentId = req.user?.id

      // multipart/form-data now (to support an attached file) — answers
      // arrives as a JSON string rather than a parsed array.
      let answers: any[] = []
      if (req.body.answers) {
        try {
          answers = typeof req.body.answers === 'string' ? JSON.parse(req.body.answers) : req.body.answers
        } catch {
          answers = []
        }
      }

      const hasFile = !!req.file
      if (!Array.isArray(answers) || (answers.length === 0 && !hasFile)) {
        throw new ApiError('At least one answer or an attached file is required', 400)
      }

      const assignment = await AssignmentModel.findById(id)
      if (!assignment) throw new ApiError('Assignment not found', 404)

      if (new Date(assignment.dueDate) < new Date()) {
        throw new ApiError('The deadline for this assignment has passed. Submissions are closed.', 400)
      }

      const course = await CourseModel.findById(assignment.course).lean()
      const isEnrolled = course?.enrolledStudents?.some((sid: any) => sid.toString() === studentId)
      if (!isEnrolled) throw new ApiError('You are not enrolled in this course', 403)

      const questionMap = new Map(assignment.questions.map((q: any) => [q.questionId, q]))
      let score = 0
      let maxScore = 0
      for (const q of assignment.questions) {
        if (q.type === 'mcq') maxScore += 1
      }
      for (const a of answers) {
        const q: any = questionMap.get(a.questionId)
        if (q?.type === 'mcq' && a.selectedOptionId && a.selectedOptionId === q.correctOptionId) score += 1
      }

      const submissionData: any = {
        student: studentId,
        answers,
        score,
        maxScore,
        submittedAt: new Date(),
      }
      if (req.file) {
        submissionData.fileUrl = toPublicUrl(req.file)
        submissionData.fileName = req.file.originalname
        submissionData.fileType = resolveFileType(req.file.mimetype)
      }

      const existingIdx = assignment.submissions.findIndex(
        (s: any) => s.student.toString() === studentId
      )
      if (existingIdx >= 0) assignment.submissions[existingIdx] = submissionData
      else assignment.submissions.push(submissionData)

      await assignment.save()

      emitNotificationToUser(String(assignment.instructor), {
        type: 'submission',
        courseId: String(assignment.course),
        title: 'Assignment submitted',
        message: `${assignment.title} has a new submission`,
        createdAt: new Date(),
      })

      sendResponse(res, 200, true, 'Assignment submitted successfully', { submitted: true, score, maxScore })
    } catch (err) {
      next(err)
    }
  }

  getStudentAssignments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = req.user?.id
      const student = await userModel.findById(studentId)
      if (!student) throw new ApiError('Student not found', 404)

      const enrollments = await EnrollmentModel.find({ student: studentId, status: 'active' }).select('course')
      const courseIds = enrollments.map(e => e.course)

      const assignments = await AssignmentModel
        .find({ course: { $in: courseIds } })
        .populate('course', 'title subject')
        .sort({ dueDate: 1 })
        .lean()

      const annotated = assignments.map((a: any) => {
        const mySubmission = (a.submissions || []).find((s: any) => s.student.toString() === studentId)
        const isClosed = new Date(a.dueDate) < new Date()
        return {
          _id: a._id,
          title: a.title,
          description: a.description,
          dueDate: a.dueDate,
          course: a.course,
          questions: a.questions || [],
          materialUrl: a.materialUrl || '',
          materialType: a.materialType || null,
          isSubmitted: !!mySubmission,
          submittedAt: mySubmission?.submittedAt || null,
          myAnswers: mySubmission?.answers || [],
          myFileUrl: mySubmission?.fileUrl || '',
          myFileName: mySubmission?.fileName || '',
          score: mySubmission?.score,
          maxScore: mySubmission?.maxScore,
          status: mySubmission ? 'submitted' : isClosed ? 'closed' : 'pending',
        }
      })

      sendResponse(res, 200, true, 'Assignments fetched', { assignments: annotated })
    } catch (err) {
      next(err)
    }
  }
}

export default new AssignmentController()