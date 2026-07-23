import type { Request, Response, NextFunction } from 'express'
import { MessageModel } from '../models/chat.model.js'
import { EnrollmentModel } from '../models/enrollment.model.js'
import { CourseModel } from '../models/course.model.js'
import { ApiError } from '../middleware/error.middleware.js'
import { sendResponse } from '../utils/response.utils.js'
import { toPublicUrl } from '../services/local-storage.service.js'

const buildPrivateRoomId = (courseId: string, userIdA: string, userIdB: string) =>
  `dm_${courseId}_${[userIdA, userIdB].sort().join('_')}`

// ─── POST /chat/upload — file attachment (image/video/pdf/doc), max 10MB ──
// ─── POST /chat/upload-voice — voice note (audio), max 10MB ───────────────
// Both just save to local disk (see upload.middleware.ts) and hand back a
// public URL + a resolved attachmentType the socket "send_message" event
// expects. This is what was missing — the frontend already knew how to
// call the socket with an attachmentUrl, there was just nothing to produce
// one, which is why uploads silently never worked.
function resolveAttachmentType(mimetype: string): 'image' | 'video' | 'audio' | 'raw' {
  if (mimetype.startsWith('image/')) return 'image'
  if (mimetype.startsWith('video/')) return 'video'
  if (mimetype.startsWith('audio/')) return 'audio'
  return 'raw'
}

export const uploadChatAttachment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file
    if (!file) throw new ApiError('No file received', 400)
    sendResponse(res, 200, true, 'File uploaded', {
      url: toPublicUrl(file),
      attachmentType: resolveAttachmentType(file.mimetype),
      fileName: file.originalname,
      fileSize: file.size,
    })
  } catch (err) { next(err) }
}

export const uploadChatVoiceNote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file
    if (!file) throw new ApiError('No voice note received', 400)
    sendResponse(res, 200, true, 'Voice note uploaded', {
      url: toPublicUrl(file),
      attachmentType: 'audio' as const,
      fileSize: file.size,
    })
  } catch (err) { next(err) }
}

async function getRoomSummary(roomId: string, currentUserId: string) {
  const last = await MessageModel.findOne({ roomId }).sort({ createdAt: -1 }).lean()
  const unreadCount = await MessageModel.countDocuments({
    roomId,
    sender: { $ne: currentUserId },
    readBy: { $ne: currentUserId },
  })
  return {
    lastMessage: last ? (last.message || (last.attachmentType ? `Sent a ${last.attachmentType}` : '')) : '',
    lastMessageAt: last?.createdAt || null,
    lastSenderId: last?.sender ? String(last.sender) : null,
    unreadCount,
  }
}

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

export const getPrivateMessages = async (
  req: Request<{ courseId: string; targetId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id!
    const { courseId, targetId } = req.params

    const course = await CourseModel.findById(courseId).lean()
    if (!course) throw new ApiError('Course not found', 404)

    const courseInstructorId = course.instructor?.toString()
    const isInstructor = courseInstructorId === userId
    const isEnrolled   = course.enrolledStudents?.some((id: any) => id.toString() === userId)
    if (!isInstructor && !isEnrolled) throw new ApiError('Access denied', 403)

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

export const getMessageContacts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id!
    const role   = req.user?.role

    if (role === 'instructor') {
      const myCourses = await CourseModel.find({ instructor: userId }).select('_id title subject').lean()
      const courseIds = myCourses.map(c => c._id)

      const enrollments = await EnrollmentModel.find({ course: { $in: courseIds }, status: 'active' })
        .populate('student', 'fullName avatar email')
        .populate('course', 'title')
        .lean()

      const studentsByCourse: Record<string, any> = {}
      for (const enr of enrollments as any[]) {
        const cId = enr.course?._id?.toString()
        if (!studentsByCourse[cId]) studentsByCourse[cId] = { course: enr.course, students: [] }
        studentsByCourse[cId].students.push(enr.student)
      }

      // Enrich group channels with last message + unread
      const coursesWithSummary = await Promise.all(
        myCourses.map(async (c: any) => ({ ...c, ...(await getRoomSummary(String(c._id), userId)) }))
      )

      // Enrich each student DM with last message + unread
      for (const group of Object.values(studentsByCourse) as any[]) {
        group.students = await Promise.all(
          group.students.map(async (s: any) => {
            const roomId = buildPrivateRoomId(String(group.course._id), userId, String(s._id))
            const summary = await getRoomSummary(roomId, userId)
            return { ...s, roomId, ...summary }
          })
        )
      }

      sendResponse(res, 200, true, 'Contacts fetched', {
        courses: coursesWithSummary,
        studentsByCourse: Object.values(studentsByCourse),
      })
    } else {
      const enrollments = await EnrollmentModel.find({ student: userId, status: 'active' })
        .populate({ path: 'course', select: 'title subject instructor', populate: { path: 'instructor', select: 'fullName avatar email' } })
        .lean()

      const contacts = await Promise.all(
        (enrollments as any[])
          .filter(enr => enr.course?.instructor)
          .map(async (enr) => {
            const roomId = buildPrivateRoomId(String(enr.course._id), userId, String(enr.course.instructor._id))
            const summary = await getRoomSummary(roomId, userId)
            return {
              courseId:    enr.course?._id,
              courseTitle: enr.course?.title,
              instructor:  enr.course?.instructor,
              roomId,
              ...summary,
            }
          })
      )

      // Group channels for each course the student is actively enrolled in
      // — this was missing entirely before, which is why the group side of
      // chat never showed up for students, only instructor DMs.
      const groupCourses = (enrollments as any[])
        .filter(enr => enr.course)
        .map((enr: any) => enr.course)

      const groupsWithSummary = await Promise.all(
        groupCourses.map(async (c: any) => ({ ...c, ...(await getRoomSummary(String(c._id), userId)) }))
      )

      sendResponse(res, 200, true, 'Contacts fetched', { contacts, courses: groupsWithSummary })
    }
  } catch (err) { next(err) }
}

export const markAsRead = async (req: Request<{ roomId: string }>, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id
    const { roomId } = req.params
    await MessageModel.updateMany(
      { roomId, sender: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    )
    sendResponse(res, 200, true, 'Marked as read', {})
  } catch (err) { next(err) }
}