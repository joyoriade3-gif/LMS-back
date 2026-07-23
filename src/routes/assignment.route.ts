import { Router } from 'express'
import assignmentController from '../controllers/assignment.controller.js'
import { protect, restrictTo } from '../middleware/auth.middleware.js'
import { uploadAssignmentMaterial, uploadSubmissionFile } from '../middleware/upload.middleware.js'

const router = Router()

// Instructor
router.post('/', protect, restrictTo('instructor'), uploadAssignmentMaterial, assignmentController.create)
router.get('/my-assignments', protect, restrictTo('instructor'), assignmentController.getMyAssignments)
router.get('/:id/submissions', protect, restrictTo('instructor'), assignmentController.getSubmissions)

// Student
router.get('/student', protect, restrictTo('student'), assignmentController.getStudentAssignments)
router.post('/:id/submit', protect, restrictTo('student'), uploadSubmissionFile, assignmentController.submit)

export default router