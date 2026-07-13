import { Request, Response, NextFunction } from 'express';
import Schedule from '../models/schedule.model.js';
import { CourseModel } from '../models/course.model.js';
import { EnrollmentModel } from '../models/enrollment.model.js';
 
const ok  = (res: Response, data: unknown, msg = 'Success') =>
  res.status(200).json({ success: true, message: msg, data });
 
const created = (res: Response, data: unknown, msg = 'Created') =>
  res.status(201).json({ success: true, message: msg, data });
 
const fail = (res: Response, status: number, msg: string) =>
  res.status(status).json({ success: false, message: msg });
 
// ── GET /api/v1/schedule?year=2025&month=5 (instructor's own schedules) ──────
export const getSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = (req as any).user?.id || (req as any).user?._id;
    if (!instructorId) return fail(res, 401, 'Unauthorized');
 
    const year  = parseInt(req.query.year  as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string);
 
    let start: Date, end: Date;
    if (!isNaN(month)) {
      start = new Date(Date.UTC(year, month, 1));
      end   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
    } else {
      start = new Date(Date.UTC(year, 0, 1));
      end   = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    }
 
    const schedules = await Schedule.find({
      instructor: instructorId,
      date: { $gte: start, $lte: end },
    })
      .populate('course', 'title subject')
      .sort({ date: 1, startTime: 1 });
 
    return ok(res, { schedules });
  } catch (err) {
    next(err);
  }
};
 
// ── GET /api/v1/schedule/day?date=2025-07-04 ────────────────────────────────
export const getDaySchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = (req as any).user?.id || (req as any).user?._id;
    if (!instructorId) return fail(res, 401, 'Unauthorized');
 
    const dateStr = req.query.date as string;
    if (!dateStr) return fail(res, 400, 'date query param required (YYYY-MM-DD)');
 
    const d     = new Date(dateStr);
    const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));
    const end   = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59));
 
    const schedules = await Schedule.find({
      instructor: instructorId,
      date: { $gte: start, $lte: end },
    })
      .populate('course', 'title subject')
      .sort({ startTime: 1 });
 
    return ok(res, { schedules });
  } catch (err) {
    next(err);
  }
};
 
// ── GET /api/v1/schedule/student?year=2025&month=5 ───────────────────────────
// Returns schedule items ONLY for courses the requesting student is
// currently enrolled in.
export const getStudentSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const studentId = (req as any).user?.id;
    if (!studentId) return fail(res, 401, 'Unauthorized');
 
    const year  = parseInt(req.query.year  as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string);
 
    let start: Date, end: Date;
    if (!isNaN(month)) {
      start = new Date(Date.UTC(year, month, 1));
      end   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
    } else {
      start = new Date(Date.UTC(year, 0, 1));
      end   = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    }
 
    const enrollments = await EnrollmentModel.find({ student: studentId, status: 'active' }).select('course');
    const courseIds = enrollments.map(e => e.course);
 
    const schedules = await Schedule.find({
      course: { $in: courseIds },
      date: { $gte: start, $lte: end },
    })
      .populate('course', 'title subject')
      .populate('instructor', 'fullName')
      .sort({ date: 1, startTime: 1 });
 
    return ok(res, { schedules });
  } catch (err) {
    next(err);
  }
};
 
// ── POST /api/v1/schedule ────────────────────────────────────────────────────
export const createSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = (req as any).user?.id || (req as any).user?._id;
    if (!instructorId) return fail(res, 401, 'Unauthorized');
 
    const { title, description, type, date, startTime, endTime, meetLink, color, courseId } = req.body;
 
    if (!title)     return fail(res, 400, 'title is required');
    if (!courseId)  return fail(res, 400, 'courseId is required — pick which course this session is for');
    if (!date)      return fail(res, 400, 'date is required');
    if (!startTime) return fail(res, 400, 'startTime is required');
    if (!endTime)   return fail(res, 400, 'endTime is required');
    if (startTime >= endTime) return fail(res, 400, 'startTime must be before endTime');
 
    const course = await CourseModel.findById(courseId);
    if (!course) return fail(res, 404, 'Course not found');
    if (course.instructor?.toString() !== instructorId) {
      return fail(res, 403, 'You can only schedule sessions for courses you own');
    }
 
    const d = new Date(date);
    const dateOnly = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
 
    const schedule = await Schedule.create({
      instructor: instructorId,
      course: courseId,
      title: title.trim(),
      description: description?.trim(),
      type: type || 'other',
      date: dateOnly,
      startTime,
      endTime,
      meetLink: meetLink?.trim(),
      color: color || 'blue',
    });
 
    const populated = await schedule.populate('course', 'title subject');
    return created(res, { schedule: populated }, 'Schedule created');
  } catch (err) {
    next(err);
  }
};
 
// ── PATCH /api/v1/schedule/:id ───────────────────────────────────────────────
export const updateSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = (req as any).user?.id || (req as any).user?._id;
    if (!instructorId) return fail(res, 401, 'Unauthorized');
 
    const schedule = await Schedule.findOne({ _id: req.params.id, instructor: instructorId });
    if (!schedule) return fail(res, 404, 'Schedule not found');
 
    if (req.body.courseId) {
      const course = await CourseModel.findById(req.body.courseId);
      if (!course) return fail(res, 404, 'Course not found');
      if (course.instructor?.toString() !== instructorId) {
        return fail(res, 403, 'You can only schedule sessions for courses you own');
      }
      (schedule as any).course = req.body.courseId;
    }
 
    const allowed = ['title', 'description', 'type', 'date', 'startTime', 'endTime', 'meetLink', 'color'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'date') {
          const d = new Date(req.body.date);
          (schedule as any).date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        } else {
          (schedule as any)[key] = req.body[key];
        }
      }
    }
 
    if (schedule.startTime >= schedule.endTime) {
      return fail(res, 400, 'startTime must be before endTime');
    }
 
    await schedule.save();
    const populated = await schedule.populate('course', 'title subject');
    return ok(res, { schedule: populated }, 'Schedule updated');
  } catch (err) {
    next(err);
  }
};
 
// ── DELETE /api/v1/schedule/:id ──────────────────────────────────────────────
export const deleteSchedule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instructorId = (req as any).user?.id || (req as any).user?._id;
    if (!instructorId) return fail(res, 401, 'Unauthorized');
 
    const schedule = await Schedule.findOneAndDelete({ _id: req.params.id, instructor: instructorId });
    if (!schedule) return fail(res, 404, 'Schedule not found');
 
    return ok(res, { id: req.params.id }, 'Schedule deleted');
  } catch (err) {
    next(err);
  }
};
 