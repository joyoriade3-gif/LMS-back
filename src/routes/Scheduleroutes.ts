import { Router } from 'express';
import {
  getSchedule,
  getDaySchedule,
  getStudentSchedule,
  getStudentScheduleNotifications,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from '../controllers/schedule.controller.js';
import { protect, restrictTo } from '../middleware/auth.middleware.js';

const router = Router();

router.use(protect);

// Instructor
router.get('/',      restrictTo('instructor'), getSchedule);
router.get('/day',   restrictTo('instructor'), getDaySchedule);
router.post('/',     restrictTo('instructor'), createSchedule);
router.patch('/:id', restrictTo('instructor'), updateSchedule);
router.delete('/:id', restrictTo('instructor'), deleteSchedule);

// Student — only sees schedules for courses they're enrolled in
// NOTE: this must come before any '/:id'-style catch-all if one is ever added,
// since '/student/notifications' would otherwise be swallowed by a wildcard.
router.get('/student', restrictTo('student'), getStudentSchedule);
router.get('/student/notifications', restrictTo('student'), getStudentScheduleNotifications);

export default router;
