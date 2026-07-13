import { Router } from 'express'
import assignmentController from '../controllers/assignment.controller.js'
import { protect, restrictTo } from '../middleware/auth.middleware.js'
 
const router = Router()
 
// Instructor routes
router.post('/', protect, restrictTo('instructor'), assignmentController.create)
router.get('/my-assignments', protect, restrictTo('instructor'), assignmentController.getMyAssignments)
router.get('/:id/submissions', protect, restrictTo('instructor'), assignmentController.getSubmissions)
 
// Student routes
router.get('/student', protect, restrictTo('student'), assignmentController.getStudentAssignments)
router.post('/:id/submit', protect, restrictTo('student'), assignmentController.submit)
 
export default router
 