import { Router } from 'express'
import { getCourseMessages, getPrivateMessages, getMessageContacts, markAsRead, uploadChatAttachment, uploadChatVoiceNote } from '../controllers/chat.controller.js'
import { protect } from '../middleware/auth.middleware.js'
import { uploadChatFile, uploadVoiceNote } from '../middleware/upload.middleware.js'

const router = Router()

router.use(protect)
router.get('/contacts',          getMessageContacts)
router.get('/course/:courseId',  getCourseMessages)
router.get('/private/:courseId/:targetId', getPrivateMessages)
router.post('/mark-read/:roomId', markAsRead)
router.post('/upload', uploadChatFile, uploadChatAttachment)
router.post('/upload-voice', uploadVoiceNote, uploadChatVoiceNote)

export default router