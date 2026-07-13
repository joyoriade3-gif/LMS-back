import type { Request, Response, NextFunction } from 'express'
import { AssignmentModel } from '../models/assignment.model.js'
import { CourseModel } from '../models/course.model.js'
import { EnrollmentModel } from '../models/enrollment.model.js'
import userModel from '../models/user.model.js'
import { ApiError } from '../middleware/error.middleware.js'
import { sendResponse } from '../utils/response.utils.js'
 
class AssignmentController {
 
  // Instructor creates an assignment for one of their own (currently claimed) courses.
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, description, dueDate, courseId } = req.body
 
      if (!title || !description || !dueDate || !courseId) {
        throw new ApiError('All fields are required', 400)
      }
 
      const course = await CourseModel.findById(courseId)
      if (!course) throw new ApiError('Course not found', 404)
      if (course.instructor?.toString() !== req.user?.id) {
        throw new ApiError('You can only create assignments for courses you own', 403)
      }
 
      const assignment = await AssignmentModel.create({
        title,
        description,
        dueDate: new Date(dueDate), // acts as the closing time
        course: courseId,
        instructor: req.user?.id,
      })
 
      const populated = await assignment.populate('course', 'title subject')
      sendResponse(res, 201, true, 'Assignment created successfully', populated)
    } catch (err) {
      next(err)
    }
  }
 
  // Instructor gets their own assignments, each annotated with
  // submitted / not-submitted counts.
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
        }
      })
 
      sendResponse(res, 200, true, 'Assignments fetched', { assignments: annotated })
    } catch (err) {
      next(err)
    }
  }
 
  // Instructor views the full submitted / not-submitted breakdown for one assignment.
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
        submitted: (assignment as any).submissions || [],
        notSubmitted,
      })
    } catch (err) {
      next(err)
    }
  }
 
  // Student submits an answer. Blocked once dueDate has passed.
  // One submission per student — resubmitting before the deadline overwrites it.
  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      const { answer } = req.body
      const studentId = req.user?.id
 
      if (!answer || !answer.trim()) throw new ApiError('An answer is required', 400)
 
      const assignment = await AssignmentModel.findById(id)
      if (!assignment) throw new ApiError('Assignment not found', 404)
 
      if (new Date(assignment.dueDate) < new Date()) {
        throw new ApiError('The deadline for this assignment has passed. Submissions are closed.', 400)
      }
 
      const course = await CourseModel.findById(assignment.course).lean()
      const isEnrolled = course?.enrolledStudents?.some((sid: any) => sid.toString() === studentId)
      if (!isEnrolled) throw new ApiError('You are not enrolled in this course', 403)
 
      const existingIdx = assignment.submissions.findIndex(
        (s: any) => s.student.toString() === studentId
      )
 
      if (existingIdx >= 0) {
        assignment.submissions[existingIdx].answer = answer.trim()
        assignment.submissions[existingIdx].submittedAt = new Date()
      } else {
        assignment.submissions.push({
          student: studentId as any,
          answer: answer.trim(),
          submittedAt: new Date(),
        })
      }
 
      await assignment.save()
      sendResponse(res, 200, true, 'Assignment submitted successfully', { submitted: true })
    } catch (err) {
      next(err)
    }
  }
 
  // Student gets assignments for their enrolled courses, with their own
  // submission status attached.
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
          isSubmitted: !!mySubmission,
          submittedAt: mySubmission?.submittedAt || null,
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
 