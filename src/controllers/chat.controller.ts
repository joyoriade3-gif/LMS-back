import type { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { MessageModel } from '../models/chat.model.js'
import { EnrollmentModel } from '../models/enrollment.model.js'
import { CourseModel } from '../models/course.model.js'
import { ApiError } from '../middleware/error.middleware.js'
import { sendResponse } from '../utils/response.utils.js'
 
// Deterministic private-DM room key, always scoped to a course so a
// student/instructor pair sharing multiple courses get separate threads.
const buildPrivateRoomId = (courseId: string, userIdA: string, userIdB: string) =>
  `dm_${courseId}_${[userIdA, userIdB].sort().join('_')}`
 
// ── GET course group chat history ────────────────────────────────────────────
export const getCourseMessages = async (req: Request<{ courseId: string }>, res: Response, next: NextFunction) => {
  try {
    const { courseId } = req.params
    const userId = req.user?.id
 
    const course = await CourseModel.findById(courseId)
    if (!course) throw new ApiError('Course not found', 404)
 
    const isInstructor = course.instructor?.toString() === userId
    const isEnrolled   = course.enrolledStudents?.some((id: any) => id.toString() === userId)
    if (!isInstructor && !isEnrolled) throw new ApiError('Access denied', 403)
 
    const messages = await MessageModel.find({ course: courseId, roomId: courseId, isGroup: true })
      .populate('sender', 'fullName avatar role')
      .sort({ createdAt: 1 })
      .limit(200)
 
    sendResponse(res, 200, true, 'Messages fetched', { messages })
  } catch (err) { next(err) }
}
 
// ── GET private DM history, scoped to a course ────────────────────────────────
export const getPrivateMessages = async (
  req: Request<{ courseId: string; targetId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId   = req.user?.id!
    const { courseId, targetId } = req.params
 
    const course = await CourseModel.findById(courseId).lean()
    if (!course) throw new ApiError('Course not found', 404)
 
    const courseInstructorId = course.instructor?.toString()
    const isInstructor = courseInstructorId === userId
    const isEnrolled   = course.enrolledStudents?.some((id: any) => id.toString() === userId)
 
    if (!isInstructor && !isEnrolled) throw new ApiError('Access denied', 403)
 
    // The "other party" must actually belong to this course conversation:
    // if I'm the instructor, targetId must be one of my enrolled students;
    // if I'm a student, targetId must be this course's instructor.
    if (isInstructor) {
      const targetIsEnrolled = course.enrolledStudents?.some((id: any) => id.toString() === targetId)
      if (!targetIsEnrolled) throw new ApiError('That student is not enrolled in this course', 403)
    } else {
      if (courseInstructorId !== targetId) throw new ApiError('Invalid conversation target for this course', 403)
    }
 
    const roomId = buildPrivateRoomId(courseId, userId, targetId)
 
    const messages = await MessageModel.find({ roomId, course: courseId, isGroup: false })
      .populate('sender', 'fullName avatar role')
      .sort({ createdAt: 1 })
      .limit(200)
 
    sendResponse(res, 200, true, 'Messages fetched', { messages, roomId })
  } catch (err) { next(err) }
}
 
// ── GET: who can this user message? ─────────────────────────────────────────
export const getMessageContacts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id
    const role   = req.user?.role
 
    if (role === 'instructor') {
      const myCourses = await CourseModel.find({ instructor: userId })
        .select('_id title subject').lean()
 
      const courseIds = myCourses.map(c => c._id)
      const enrollments = await EnrollmentModel.find({ course: { $in: courseIds }, status: 'active' })
        .populate('student', 'fullName avatar email')
        .populate('course', 'title')
        .lean()
 
      const studentsByCourse: Record<string, any> = {}
      for (const enr of enrollments as any[]) {
        const cId = enr.course?._id?.toString()
        if (!studentsByCourse[cId]) {
          studentsByCourse[cId] = { course: enr.course, students: [] }
        }
        studentsByCourse[cId].students.push(enr.student)
      }
 
      sendResponse(res, 200, true, 'Contacts fetched', {
        courses: myCourses,
        studentsByCourse: Object.values(studentsByCourse),
      })
    } else {
      const enrollments = await EnrollmentModel.find({ student: userId, status: 'active' })
        .populate({ path: 'course', select: 'title subject instructor', populate: { path: 'instructor', select: 'fullName avatar email' } })
        .lean()
 
      const contacts = (enrollments as any[])
        .filter(enr => enr.course?.instructor) // only courses that currently have an instructor
        .map(enr => ({
          courseId:    enr.course?._id,
          courseTitle: enr.course?.title,
          instructor:  enr.course?.instructor,
        }))
 
      sendResponse(res, 200, true, 'Contacts fetched', { contacts })
    }
  } catch (err) { next(err) }
}
 