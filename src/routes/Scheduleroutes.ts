import { Router } from 'express';
import {
  getSchedule,
  getDaySchedule,
  getStudentSchedule,
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
router.get('/student', restrictTo('student'), getStudentSchedule);
 
export default router;
 