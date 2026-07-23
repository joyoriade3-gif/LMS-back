import { Router } from 'express'
import { askQuestion, getMyQuestions, getInstructorQuestions, answerQuestion } from '../controllers/question.controller.js'
import { protect, restrictTo } from '../middleware/auth.middleware.js'

const router = Router()

router.post('/', protect, restrictTo('student'), askQuestion)
router.get('/mine', protect, restrictTo('student'), getMyQuestions)
router.get('/instructor', protect, restrictTo('instructor'), getInstructorQuestions)
router.post('/:id/answer', protect, restrictTo('instructor'), answerQuestion)

export default router
