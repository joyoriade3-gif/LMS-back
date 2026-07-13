import { Router } from 'express'
import { getCourseMessages, getPrivateMessages, getMessageContacts } from '../controllers/chat.controller.js'
import { protect } from '../middleware/auth.middleware.js'
 
const router = Router()
 
router.use(protect)
router.get('/contacts',                      getMessageContacts)
router.get('/course/:courseId',               getCourseMessages)
router.get('/private/:courseId/:targetId',    getPrivateMessages)
 
export default router