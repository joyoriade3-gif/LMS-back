import type { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { CourseModel } from '../models/course.model.js'
import { EnrollmentModel } from '../models/enrollment.model.js'
import userModel from '../models/user.model.js'
import { AssignmentModel } from '../models/assignment.model.js'
import ScheduleModel from '../models/schedule.model.js'
import { ApiError } from '../middleware/error.middleware.js'
import { sendResponse } from '../utils/response.utils.js'
import { toPublicUrl } from '../services/local-storage.service.js'
import fs from 'fs'

// ─── Helpers ────────────────────────────────────────────────────────────────
const getSlugOrId = (slugOrId: string | string[]): string => {
  return Array.isArray(slugOrId) ? slugOrId[0] : slugOrId
}

const findCourse = (slugOrId: string) => {
  const isObjId = mongoose.Types.ObjectId.isValid(slugOrId)
  return CourseModel.findOne(isObjId ? { _id: slugOrId } : { slug: slugOrId.toLowerCase().trim() })
}

const cleanupFile = (path?: string) => {
  if (path && fs.existsSync(path)) fs.unlinkSync(path)
}

const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ─── GET /courses ──────────────────────────────────────────────────────────
export const getCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courses = await CourseModel.find({ isPublished: true })
      .populate('instructor', 'fullName email subject specialty avatar img')
      .sort({ createdAt: -1 })
      .lean()
    sendResponse(res, 200, true, 'Courses fetched', { courses })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/all ─────────────────────────────────────────────────────
export const getAllCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courses = await CourseModel.find()
      .populate('instructor', 'fullName email subject specialty avatar img badge badgeColor accent')
      .sort({ title: 1 })
      .lean()
    sendResponse(res, 200, true, 'All courses fetched', { courses })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/search?q= ──────────────────────────────────────────────
export const searchCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = String(req.query.q || '').trim()
    if (!query) {
      sendResponse(res, 200, true, 'No query', { courses: [] })
      return
    }
    const regex = new RegExp(escapeRegex(query), 'i')
    const courses = await CourseModel.find({
      $or: [{ title: regex }, { slug: regex }, { subject: regex }, { description: regex }, { category: regex }],
    })
      .populate('instructor', 'fullName email subject specialty')
      .sort({ title: 1 })
      .lean()
    sendResponse(res, 200, true, 'Courses fetched', { courses })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/my-courses ─────────────────────────────────────────────
export const getMyInstructorCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id
    if (!userId) throw new ApiError('Auth failed', 401)

    const courses = await CourseModel.find({ instructor: userId })
      .populate('instructor', 'fullName email subject specialty avatar img')
      .sort({ title: 1 })
      .lean()

    sendResponse(res, 200, true, 'Courses fetched', {
      courses,
      activeCoursesCount: courses.length
    })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/catalog ─────────────────────────────────────────────────
export const getAllCatalogCourses = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courses = await CourseModel.find({ isPublished: true })
      .populate('instructor', 'fullName email subject specialty avatar img badge badgeColor accent')
      .sort({ createdAt: -1 })
      .lean()
    res.status(200).json({ success: true, count: courses.length, data: { courses } })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/student-dashboard ──────────────────────────────────────
export const getStudentDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id
    if (!userId) throw new ApiError('Auth required', 401)

    const enrolledCourses = await CourseModel.find({
      enrolledStudents: new mongoose.Types.ObjectId(userId),
    })
      .populate('instructor', 'fullName email subject specialty bio badge badgeColor accent avatar img')
      .lean()

    const allPublishedCourses = await CourseModel.find({ isPublished: true, instructor: { $ne: null } })
      .populate('instructor', 'fullName email subject specialty bio badge badgeColor accent avatar img')
      .sort({ createdAt: -1 })
      .lean()

    const courseIds = enrolledCourses.map(c => c._id)

    const assignments = await AssignmentModel.find({ course: { $in: courseIds } })
      .populate('instructor', 'fullName')
      .populate('course', 'title')
      .sort({ dueDate: 1 })
      .lean()

    const formattedAssignments = assignments.map((a: any) => ({
      _id: a._id,
      title: a.title,
      description: a.description,
      dueDate: a.dueDate,
      courseTitle: a.course?.title || '',
      courseId: a.course?._id,
      instructorName: a.instructor?.fullName || 'Instructor',
      status: new Date(a.dueDate) > new Date() ? 'open' : 'closed',
    }))

    const instructorMap = new Map<string, any>()
    for (const course of enrolledCourses) {
      const inst = course.instructor as any
      if (inst?._id) instructorMap.set(inst._id.toString(), inst)
    }
    const instructors = Array.from(instructorMap.values())

    // ── Monthly stats (for the dashboard's 4th "aggregate" card + 3-lane
    // bar chart). Each lane counts a genuinely different real-world event,
    // not just "created this month":
    //   - assignments: counts this student's SUCCESSFUL SUBMISSIONS, not
    //     assignments the instructor merely posted.
    //   - schedules: counts sessions whose actual end time has already
    //     passed (date + endTime <= now), not sessions merely created.
    //   - enrollments: this student's enrollment date — already a real
    //     one-time event, so createdAt is correct here.
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    // Real end-of-session moment for a schedule doc: its `date` is stored
    // as UTC midnight of the calendar day, `endTime` is a "HH:MM" string.
    const scheduleEndMoment = (s: any) => {
      const d = new Date(s.date)
      const [h, m] = String(s.endTime || '00:00').split(':').map(Number)
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h || 0, m || 0))
    }

    const [submissionsThisMonthAgg, allSchedulesInWindow] = await Promise.all([
      AssignmentModel.aggregate([
        { $match: { course: { $in: courseIds } } },
        { $unwind: '$submissions' },
        { $match: {
            'submissions.student': new mongoose.Types.ObjectId(userId),
            'submissions.submittedAt': { $gte: monthStart },
        } },
        { $count: 'count' },
      ]),
      ScheduleModel.find({ course: { $in: courseIds }, date: { $gte: twelveMonthsAgo } })
        .select('date endTime')
        .lean(),
    ])
    const assignmentsThisMonth = submissionsThisMonthAgg[0]?.count || 0
    const schedulesThisMonth = allSchedulesInWindow.filter((s: any) => {
      const end = scheduleEndMoment(s)
      return end <= now && end >= monthStart
    }).length
    const enrollmentsThisMonth = await EnrollmentModel.countDocuments({ student: userId, createdAt: { $gte: monthStart } })

    // History: same three real events, grouped by month, going back up to
    // 12 months — this is what the Schedule tab's "history" section reads.
    const [submissionHistory, enrollmentHistory] = await Promise.all([
      AssignmentModel.aggregate([
        { $match: { course: { $in: courseIds } } },
        { $unwind: '$submissions' },
        { $match: {
            'submissions.student': new mongoose.Types.ObjectId(userId),
            'submissions.submittedAt': { $gte: twelveMonthsAgo },
        } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$submissions.submittedAt' } }, count: { $sum: 1 } } },
      ]),
      EnrollmentModel.aggregate([
        { $match: { student: new mongoose.Types.ObjectId(userId), createdAt: { $gte: twelveMonthsAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      ]),
    ])

    const aMap = new Map(submissionHistory.map((h: any) => [h._id, h.count]))
    const eMap = new Map(enrollmentHistory.map((h: any) => [h._id, h.count]))

    // Schedule history is grouped in JS since "which month it counts toward"
    // depends on the computed end moment, not a stored field Mongo can
    // $group on directly.
    const sMap = new Map<string, number>()
    allSchedulesInWindow.forEach((s: any) => {
      const end = scheduleEndMoment(s)
      if (end > now) return // hasn't actually ended yet — doesn't count anywhere
      const key = monthKey(end)
      sMap.set(key, (sMap.get(key) || 0) + 1)
    })

    const monthlyHistory = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = monthKey(d)
      monthlyHistory.push({
        month: d.toLocaleDateString('en-US', { month: 'short' }),
        year: d.getFullYear(),
        assignments: aMap.get(key) || 0,
        schedules: sMap.get(key) || 0,
        enrollments: eMap.get(key) || 0,
      })
    }

    res.status(200).json({
      success: true,
      data: {
        courses: enrolledCourses,
        allCourses: allPublishedCourses,
        instructors,
        assignments: formattedAssignments,
        stats: {
          enrolled: enrolledCourses.length,
          completed: enrolledCourses.filter((c: any) => c.isCompleted).length,
          pendingAssignments: formattedAssignments.filter((a: any) => a.status === 'open').length,
        },
        monthlyStats: {
          current: { assignments: assignmentsThisMonth, schedules: schedulesThisMonth, enrollments: enrollmentsThisMonth },
          history: monthlyHistory,
        },
      },
    })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/instructor-dashboard ────────────────────────────────────
// Every number here is computed live from real collections — nothing here
// is hardcoded or fake. `days` (7-30) controls the trend window, so the
// "Apr 25 - Apr 29" style label on the frontend always matches today's date.
export const getInstructorDashboard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id
    if (!userId) throw new ApiError('Auth required', 401)
    const instructorObjId = new mongoose.Types.ObjectId(userId)

    const days = Math.min(30, Math.max(7, parseInt(String(req.query.days || '7'), 10) || 7))

    // ── My courses ──────────────────────────────────────────────────────
    const myCourses = await CourseModel.find({ instructor: instructorObjId }).lean()
    const myCourseIds = myCourses.map((c: any) => c._id)

    const myEnrolledStudentsSet = new Set<string>()
    myCourses.forEach((c: any) => (c.enrolledStudents || []).forEach((id: any) => myEnrolledStudentsSet.add(id.toString())))

    // ── Platform-wide totals (for the 5 top cards) ──────────────────────
    const [platformCourses, platformInstructors, platformStudents] = await Promise.all([
      CourseModel.countDocuments({}),
      userModel.countDocuments({ role: 'instructor' }),
      userModel.countDocuments({ role: 'student' }),
    ])

    // ── Per-course engagement: real submissions vs (assignments × enrolled) ──
    const myAssignments = await AssignmentModel.find({ course: { $in: myCourseIds } })
      .select('course submissions')
      .lean()

    const assignmentStatsByCourse = new Map<string, { assignmentCount: number; submissionCount: number }>()
    myAssignments.forEach((a: any) => {
      const key = a.course.toString()
      const cur = assignmentStatsByCourse.get(key) || { assignmentCount: 0, submissionCount: 0 }
      cur.assignmentCount += 1
      cur.submissionCount += (a.submissions?.length || 0)
      assignmentStatsByCourse.set(key, cur)
    })

    const topCourses = myCourses
      .map((c: any) => {
        const studentCount = c.enrolledStudents?.length || 0
        const stat = assignmentStatsByCourse.get(c._id.toString())

        // Additive smoothing (+3 in the denominator) so a single early
        // submission can't spike this straight to "100%" — engagement
        // builds up gradually as real submissions accumulate over time,
        // and a course only earns a qualitative label once there's a
        // meaningful number of submissions to judge from. This never
        // reacts to material uploads — only real student submissions.
        let engagement = 0
        if (stat && stat.assignmentCount > 0 && studentCount > 0) {
          engagement = Math.min(100, Math.round((stat.submissionCount / (stat.assignmentCount * studentCount + 3)) * 100))
        }
        let engagementLabel: 'Building' | 'Low' | 'Growing' | 'Strong' = 'Building'
        if (stat && stat.submissionCount >= 3) {
          engagementLabel = engagement >= 60 ? 'Strong' : engagement >= 25 ? 'Growing' : 'Low'
        }

        return {
          _id: c._id,
          title: c.title,
          slug: c.slug,
          img: c.img,
          students: studentCount,
          engagement,       // 0-100, drives the bar's fill width only
          engagementLabel,  // what's actually shown as text — never a raw %
          status: c.isPublished ? 'Active' : 'Draft',
        }
      })
      .sort((a, b) => b.students - a.students)
      .slice(0, 5)

    // ── Top instructors platform-wide, ranked by total enrolled students ──
    const allInstructorCourses = await CourseModel.find({ instructor: { $ne: null } })
      .select('instructor enrolledStudents rating')
      .populate('instructor', 'fullName avatar img')
      .lean()

    const instructorAgg = new Map<string, { instructor: any; courseCount: number; studentSet: Set<string>; ratingSum: number; ratingCount: number }>()
    allInstructorCourses.forEach((c: any) => {
      const inst = c.instructor
      if (!inst?._id) return
      const key = inst._id.toString()
      const cur = instructorAgg.get(key) || { instructor: inst, courseCount: 0, studentSet: new Set<string>(), ratingSum: 0, ratingCount: 0 }
      cur.courseCount += 1
      ;(c.enrolledStudents || []).forEach((id: any) => cur.studentSet.add(id.toString()))
      cur.ratingSum += c.rating || 0
      cur.ratingCount += 1
      instructorAgg.set(key, cur)
    })

    const topInstructors = Array.from(instructorAgg.values())
      .map(v => ({
        _id: v.instructor._id,
        fullName: v.instructor.fullName,
        avatar: v.instructor.avatar || v.instructor.img || '',
        courseCount: v.courseCount,
        studentCount: v.studentSet.size,
        rating: v.ratingCount ? Math.round((v.ratingSum / v.ratingCount) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.studentCount - a.studentCount)
      .slice(0, 5)

    // ── Enrollment trend (Course Sale Overview) + Student Analysis (enrolled vs left) ──
    const rangeStart = new Date()
    rangeStart.setHours(0, 0, 0, 0)
    rangeStart.setDate(rangeStart.getDate() - (days - 1))

    const [enrolledByDay, droppedByDay] = await Promise.all([
      EnrollmentModel.aggregate([
        { $match: { instructor: instructorObjId, createdAt: { $gte: rangeStart } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      ]),
      EnrollmentModel.aggregate([
        { $match: { instructor: instructorObjId, status: 'dropped', droppedAt: { $gte: rangeStart } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$droppedAt' } }, count: { $sum: 1 } } },
      ]),
    ])

    const enrolledMap = new Map(enrolledByDay.map((d: any) => [d._id, d.count]))
    const droppedMap = new Map(droppedByDay.map((d: any) => [d._id, d.count]))

    const trend: { date: string; label: string; enrolled: number; left: number }[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(rangeStart)
      d.setDate(d.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      trend.push({
        date: key,
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        enrolled: enrolledMap.get(key) || 0,
        left: droppedMap.get(key) || 0,
      })
    }

    const rangeEnd = new Date(rangeStart)
    rangeEnd.setDate(rangeEnd.getDate() + days - 1)
    const rangeLabel = `${rangeStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${rangeEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

    res.status(200).json({
      success: true,
      data: {
        stats: {
          myCourseCount: myCourses.length,
          myEnrolledStudents: myEnrolledStudentsSet.size,
          platformCourses,
          platformInstructors,
          platformStudents,
        },
        topCourses,
        topInstructors,
        trend,
        rangeLabel,
        rangeDays: days,
      },
    })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/:slugOrId ──────────────────────────────────────────────
export const getCourseBySlugOrId = async (
  req: Request<{ slugOrId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const slugOrId = getSlugOrId(req.params.slugOrId)
    const course = await findCourse(slugOrId)
      .populate('instructor', 'fullName email subject specialty avatar img')
      .lean()
    if (!course) throw new ApiError('Course not found', 404)
    sendResponse(res, 200, true, 'Course fetched', { course })
  } catch (err) {
    next(err)
  }
}

// ─── POST /courses/create ─────────────────────────────────────────────────
export const createCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = req.user?.id
    if (!instructorId) throw new ApiError('Unauthorized', 401)

    const {
      title, description, category,
      whatYouLearn, whoIsItFor,
      videoUrl, badge,
    } = req.body

    if (!title || !description) {
      throw new ApiError('Title and description are required', 400)
    }

    const trimmedTitle = title.trim()

    const exactTitleRegex = new RegExp(`^${escapeRegex(trimmedTitle)}$`, 'i')
    const duplicate = await CourseModel.findOne({ title: exactTitleRegex })
    if (duplicate) {
      throw new ApiError(`A course named "${trimmedTitle}" already exists. Please choose a different title.`, 409)
    }

    let slug = trimmedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const slugExists = await CourseModel.findOne({ slug })
    if (slugExists) slug = `${slug}-${Date.now()}`

    const files = req.files as Record<string, Express.Multer.File[]> | undefined

    let img = 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500'
    const thumbFile = files?.['thumbnail']?.[0]
    if (thumbFile) {
      img = toPublicUrl(thumbFile) // stays on disk, served from /uploads
    }

    let finalVideoUrl = videoUrl || ''
    const videoFile = files?.['video']?.[0]
    if (videoFile) {
      finalVideoUrl = toPublicUrl(videoFile) // no Cloudinary quota used, supports files >1GB
    }

    const parseList = (val: any): string[] => {
      if (!val) return []
      if (Array.isArray(val)) return val
      try {
        const parsed = JSON.parse(val)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }

    const course = await CourseModel.create({
      title: trimmedTitle,
      slug,
      subject: category || 'General',
      category: category || '',
      description: description.trim(),
      img,
      videoUrl: finalVideoUrl,
      rating: 4.5,
      students: 0,
      accent: '#6366F1',
      badge: badge || null,
      isPublished: true,
      whatYouLearn: parseList(whatYouLearn).length > 0 ? parseList(whatYouLearn) : [
        'Understand core concepts and principles',
        'Apply knowledge to real-world problems',
        'Build a strong foundation for exams',
        'Learn at your own pace',
      ],
      whoIsItFor: parseList(whoIsItFor).length > 0 ? parseList(whoIsItFor) : [
        'Students who want to build a strong foundation',
        'Beginners preparing for school exams',
        'Anyone curious about the subject',
      ],
      topics: [],
      instructor: instructorId,
      enrolledStudents: [],
    })

    await userModel.findByIdAndUpdate(instructorId, { $addToSet: { courses: course._id } })

    const populated = await CourseModel.findById(course._id)
      .populate('instructor', 'fullName email subject specialty avatar img')
      .lean()

    sendResponse(res, 201, true, 'Course created successfully', { course: populated })
  } catch (err) {
    next(err)
  }
}

// ─── POST /courses/:slugOrId/enroll ──────────────────────────────────────
export const enrollInCourse = async (
  req: Request<{ slugOrId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id
    const slugOrId = getSlugOrId(req.params.slugOrId)

    const course = await findCourse(slugOrId).lean()
    if (!course) throw new ApiError('Course not found', 404)

    if (!course.instructor) {
      throw new ApiError('This course is not yet available for enrollment.', 400)
    }

    const alreadyEnrolled = course.enrolledStudents?.some(
      (id: any) => id.toString() === userId
    )
    if (alreadyEnrolled) throw new ApiError('You are already enrolled in this course', 400)

    const instructorId_raw =
      (course.instructor as any)?._id?.toString() ||
      course.instructor?.toString() ||
      null

    if (!instructorId_raw) throw new ApiError('Course has no instructor assigned', 400)

    await EnrollmentModel.create({
      student: userId,
      course: course._id,
      instructor: instructorId_raw,
      amountPaid: 0,
      paystackRef: '',
      status: 'active',
    })

    await CourseModel.findByIdAndUpdate(course._id, {
      $addToSet: { enrolledStudents: userId },
      $inc: { students: 1 },
    })

    await userModel.findByIdAndUpdate(userId, { $addToSet: { enrolledCourses: course._id } })

    sendResponse(res, 200, true, 'Enrolled successfully', { enrolled: true })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/:slugOrId/enrollment ───────────────────────────────────
export const checkEnrollment = async (
  req: Request<{ slugOrId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const slugOrId = getSlugOrId(req.params.slugOrId)
    const course = await findCourse(slugOrId).select('enrolledStudents title').lean()
    if (!course) throw new ApiError('Course not found', 404)
    const isEnrolled = course.enrolledStudents?.some((id: any) => id.toString() === req.user?.id) ?? false
    sendResponse(res, 200, true, 'Enrollment status fetched', { isEnrolled })
  } catch (err) {
    next(err)
  }
}

// ─── POST /courses/:slugOrId/unenroll ─────────────────────────────────────
// A student leaving a course. This is what feeds the "left" side of the
// instructor dashboard's Student Analysis chart with real numbers.
export const unenrollFromCourse = async (
  req: Request<{ slugOrId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id
    const slugOrId = getSlugOrId(req.params.slugOrId)

    const course = await findCourse(slugOrId).lean()
    if (!course) throw new ApiError('Course not found', 404)

    const isEnrolled = course.enrolledStudents?.some((id: any) => id.toString() === userId)
    if (!isEnrolled) throw new ApiError('You are not enrolled in this course', 400)

    await EnrollmentModel.findOneAndUpdate(
      { student: userId, course: course._id, status: 'active' },
      { status: 'dropped', droppedAt: new Date() }
    )

    await CourseModel.findByIdAndUpdate(course._id, {
      $pull: { enrolledStudents: userId },
      $inc: { students: -1 },
    })

    await userModel.findByIdAndUpdate(userId, { $pull: { enrolledCourses: course._id } })

    sendResponse(res, 200, true, 'Unenrolled successfully', { enrolled: false })
  } catch (err) {
    next(err)
  }
}

// ─── POST /courses/:slugOrId/upload-material ─────────────────────────────
// Adds a lesson (topic/subtopic) with an optional video, PDF, and a quiz.
// Each quiz question can now carry its own optional image — the frontend
// sends those files under a single "quizImages" field (multer supports
// multiple files per field name), plus a "quizImageIndexes" JSON array
// that says which question index each uploaded file belongs to, in the
// same order. That's what lets us re-attach images to the right question
// even when only some questions have one.
export const uploadCourseMaterial = async (
  req: Request<{ slugOrId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const slugOrId = getSlugOrId(req.params.slugOrId)
    const { topicTitle, emoji, subtopicTitle, quiz, notes, quizImageIndexes } = req.body

    if (!topicTitle || !subtopicTitle) {
      throw new ApiError('topicTitle and subtopicTitle are required', 400)
    }

    const course = await findCourse(slugOrId)
    if (!course) throw new ApiError('Course not found', 404)

    const files = req.files as Record<string, Express.Multer.File[]> | undefined
    let videoUrl = '', pdfUrl = ''

    if (files?.videoFile?.[0]) {
      videoUrl = toPublicUrl(files.videoFile[0])
    }

    if (files?.pdfFile?.[0]) {
      pdfUrl = toPublicUrl(files.pdfFile[0])
    }

    let parsedQuiz: any[] = []
    if (quiz) {
      try {
        parsedQuiz = typeof quiz === 'string' ? JSON.parse(quiz) : quiz
      } catch {}
    }

    // ── Attach per-question images ──────────────────────────────────────
    const quizImageFiles = files?.quizImages || []
    let indexList: number[] = []
    if (quizImageIndexes) {
      try {
        indexList = typeof quizImageIndexes === 'string' ? JSON.parse(quizImageIndexes) : quizImageIndexes
      } catch {
        indexList = []
      }
    }

    for (let i = 0; i < quizImageFiles.length; i++) {
      const file = quizImageFiles[i]
      const questionIndex = indexList[i]
      if (questionIndex === undefined || !parsedQuiz[questionIndex]) {
        cleanupFile(file.path) // orphaned upload, no matching question — safe to discard
        continue
      }
      parsedQuiz[questionIndex].img = toPublicUrl(file)
    }

    const newSubtopic: any = {
      subtopicId: `sub-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      title: subtopicTitle.trim(),
      notes: notes || '',
      quiz: parsedQuiz.map((q: any) => ({
        q: q.q.trim(),
        options: q.options.map((o: string) => o.trim()),
        answer: q.answer,
        img: q.img || '',
      })),
    }
    if (videoUrl) newSubtopic.video = videoUrl
    if (pdfUrl) newSubtopic.pdf = pdfUrl

    const targetTopic = course.topics.find(
      (t: any) => t.title.toLowerCase().trim() === topicTitle.toLowerCase().trim()
    )

    let updatedCourse
    if (targetTopic) {
      // NOTE: topics use { _id: false } in the schema, so there is no
      // topics._id to match on — match by title instead (case-insensitive,
      // same rule used to find targetTopic above).
      updatedCourse = await CourseModel.findOneAndUpdate(
        { _id: course._id, 'topics.title': targetTopic.title },
        { $push: { 'topics.$.subtopics': newSubtopic } },
        { new: true, runValidators: false }
      )
    } else {
      updatedCourse = await CourseModel.findByIdAndUpdate(
        course._id,
        { $push: { topics: { topicId: course.topics.length + 1, emoji: emoji || '🧪', title: topicTitle.trim(), subtopics: [newSubtopic] } } },
        { new: true, runValidators: false }
      )
    }

    sendResponse(res, 200, true, 'Material uploaded successfully', { course: updatedCourse })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/:courseId/students ─────────────────────────────────────
export const getCourseStudents = async (
  req: Request<{ courseId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { courseId } = req.params
    const instructorId = req.user?.id
    const course = await CourseModel.findOne({ _id: courseId, instructor: instructorId })
    if (!course) throw new ApiError('Course not found or not yours', 404)

    const enrollments = await EnrollmentModel.find({ course: courseId, status: 'active' })
      .populate('student', 'fullName email profilePicture avatar country createdAt')
      .sort({ createdAt: -1 })

    sendResponse(res, 200, true, 'Students fetched', { students: enrollments.map((e: any) => e.student) })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/my-students ─────────────────────────────────────────────
export const getMyStudents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = req.user?.id
    const myCourses = await CourseModel.find({ instructor: instructorId }).select('_id title').lean()
    const courseIds = myCourses.map(c => c._id)

    const enrollments = await EnrollmentModel.find({ course: { $in: courseIds }, status: 'active' })
      .populate('student', 'fullName email profilePicture avatar country createdAt')
      .populate('course', 'title subject')
      .sort({ createdAt: -1 })

    const grouped: Record<string, { course: any; students: any[] }> = {}
    for (const enr of enrollments as any[]) {
      const cId = enr.course?._id?.toString()
      if (!grouped[cId]) grouped[cId] = { course: enr.course, students: [] }
      grouped[cId].students.push(enr.student)
    }

    sendResponse(res, 200, true, 'Students fetched', { grouped: Object.values(grouped) })
  } catch (err) {
    next(err)
  }
}

// ─── GET /courses/:slugOrId/manage ───────────────────────────────────────
export const getInstructorCourseDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = req.user?.id
    if (!instructorId) throw new ApiError('Unauthorized', 401)

    const slugOrIdParam = req.params.slugOrId
    if (!slugOrIdParam) throw new ApiError('Course identifier is required', 400)
    const slugOrId = Array.isArray(slugOrIdParam) ? slugOrIdParam[0] : slugOrIdParam

    const course = await findCourse(slugOrId)
      .populate('instructor', 'fullName email subject specialty avatar img')
      .populate('enrolledStudents', 'fullName email avatar')
      .lean()

    if (!course) throw new ApiError('Course not found', 404)
    if (course.instructor?._id?.toString() !== instructorId) {
      throw new ApiError('You do not have permission to access this course', 403)
    }

    sendResponse(res, 200, true, 'Course details fetched', { course })
  } catch (err) {
    next(err)
  }
}

// ─── PUT /courses/:slugOrId/update ───────────────────────────────────────
export const updateCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = req.user?.id
    if (!instructorId) throw new ApiError('Unauthorized', 401)

    const slugOrIdParam = req.params.slugOrId
    if (!slugOrIdParam) throw new ApiError('Course identifier is required', 400)
    const slugOrId = Array.isArray(slugOrIdParam) ? slugOrIdParam[0] : slugOrIdParam

    const course = await findCourse(slugOrId)
    if (!course) throw new ApiError('Course not found', 404)
    if (course.instructor?.toString() !== instructorId) {
      throw new ApiError('You do not have permission to update this course', 403)
    }

    const { title, description, category, isPublished, whatYouLearn, whoIsItFor, videoUrl, badge } = req.body

    if (title && title.trim().toLowerCase() !== course.title.toLowerCase()) {
      const exactTitleRegex = new RegExp(`^${escapeRegex(title.trim())}$`, 'i')
      const duplicate = await CourseModel.findOne({ title: exactTitleRegex, _id: { $ne: course._id } })
      if (duplicate) {
        throw new ApiError(`A course named "${title.trim()}" already exists. Please choose a different title.`, 409)
      }
    }

    const parseList = (val: any): string[] | undefined => {
      if (val === undefined) return undefined
      if (Array.isArray(val)) return val
      try {
        const parsed = JSON.parse(val)
        return Array.isArray(parsed) ? parsed : undefined
      } catch {
        return undefined
      }
    }

    const updateData: any = {}
    if (title) updateData.title = title.trim()
    if (description) updateData.description = description.trim()
    if (category) { updateData.category = category; updateData.subject = category }
    if (isPublished !== undefined) updateData.isPublished = isPublished
    const parsedLearn = parseList(whatYouLearn)
    if (parsedLearn) updateData.whatYouLearn = parsedLearn
    const parsedWho = parseList(whoIsItFor)
    if (parsedWho) updateData.whoIsItFor = parsedWho
    if (badge !== undefined) updateData.badge = badge

    const files = req.files as Record<string, Express.Multer.File[]> | undefined

    const thumbFile = files?.['thumbnail']?.[0]
    if (thumbFile) {
      updateData.img = toPublicUrl(thumbFile)
    }

    const videoFile = files?.['video']?.[0]
    if (videoFile) {
      updateData.videoUrl = toPublicUrl(videoFile)
    } else if (videoUrl !== undefined) {
      updateData.videoUrl = videoUrl
    }

    const updatedCourse = await CourseModel.findByIdAndUpdate(
      course._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('instructor', 'fullName email subject specialty avatar img')

    sendResponse(res, 200, true, 'Course updated successfully', { course: updatedCourse })
  } catch (err) {
    next(err)
  }
}

// ─── DELETE /courses/:slugOrId/delete ────────────────────────────────────
export const deleteCourse = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = req.user?.id
    if (!instructorId) {
      return res.status(401).json({ success: false, message: 'Unauthorized - Please log in' })
    }

    const slugOrIdParam = req.params.slugOrId
    if (!slugOrIdParam) {
      return res.status(400).json({ success: false, message: 'Course identifier is required' })
    }
    const slugOrId = Array.isArray(slugOrIdParam) ? slugOrIdParam[0] : slugOrIdParam

    const course = await findCourse(slugOrId)
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' })
    }
    if (course.instructor?.toString() !== instructorId) {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this course' })
    }

    await userModel.findByIdAndUpdate(instructorId, { $pull: { courses: course._id } })
    await CourseModel.findByIdAndDelete(course._id)

    return res.status(200).json({ success: true, message: 'Course deleted successfully' })
  } catch (err) {
    console.error('Delete course error:', err)
    next(err)
  }
}

// ─── POST /courses/:slugOrId/access ──────────────────────────────────────
export const accessCourse = async (
  req: Request<{ slugOrId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const instructorId = req.user?.id
    if (!instructorId) throw new ApiError('Unauthorized', 401)

    const slugOrId = getSlugOrId(req.params.slugOrId)
    const course = await findCourse(slugOrId).lean()
    if (!course) throw new ApiError('Course not found', 404)

    if (course.instructor) {
      const currentOwnerId = (course.instructor as any)?._id?.toString() || course.instructor?.toString()
      if (currentOwnerId === instructorId) {
        throw new ApiError('You already own this course', 400)
      }
      throw new ApiError('This course is already claimed by another instructor', 400)
    }

    const updated = await CourseModel.findByIdAndUpdate(
      course._id,
      { $set: { instructor: instructorId } },
      { new: true }
    ).populate('instructor', 'fullName email subject specialty avatar img')

    await userModel.findByIdAndUpdate(instructorId, { $addToSet: { courses: course._id } })

    sendResponse(res, 200, true, 'Course claimed successfully', { course: updated })
  } catch (err) {
    next(err)
  }
}

// ─── POST /courses/:slugOrId/release ─────────────────────────────────────
export const releaseCourse = async (
  req: Request<{ slugOrId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const instructorId = req.user?.id
    if (!instructorId) throw new ApiError('Unauthorized', 401)

    const slugOrId = getSlugOrId(req.params.slugOrId)
    const course = await findCourse(slugOrId)
    if (!course) throw new ApiError('Course not found', 404)

    if (course.instructor?.toString() !== instructorId) {
      throw new ApiError('You do not have permission to remove this course', 403)
    }

    await CourseModel.findByIdAndUpdate(course._id, { $set: { instructor: null } })
    await userModel.findByIdAndUpdate(instructorId, { $pull: { courses: course._id } })

    sendResponse(res, 200, true, 'Course removed from your dashboard. It can now be claimed by another instructor.', {
      courseId: course._id,
    })
  } catch (err) {
    next(err)
  }
}