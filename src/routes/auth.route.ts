import { Router } from 'express'
import authController from '../controllers/auth.controller.js'
import { protect } from '../middleware/auth.middleware.js'
import { uploadInstructorDocs, upload } from '../middleware/upload.middleware.js'

const router = Router()

// ✅ Updated: Removed uploadInstructorDocs from register (no files needed now)
router.post('/register/instructor', authController.registerInstructor)
router.post('/register/student',    upload.single('avatar'), authController.registerStudent)
router.post('/login',               authController.login)
router.post('/forgot-password',     authController.forgotPassword)
router.post('/verify-otp',          authController.verifyOTP)
router.post('/reset-password',      authController.resetPassword)
router.get ('/profile',             protect, authController.getProfile)

// ✅ Updated: Keep uploadInstructorDocs for profile updates (now where all fields go)
router.patch('/update-profile',     protect, uploadInstructorDocs, authController.updateProfile)

// ✅ NEW ROUTE: Get single instructor by ID (for profile detail view)
router.get ('/instructors/:id',     authController.getInstructorById)

// ✅ Existing: Get all live instructors
router.get ('/live-instructors',    authController.getLiveInstructors)

// ✅ CV routes - View and Download
router.get('/instructors/:id/cv', authController.getCV)        // View in browser
router.get('/instructors/:id/cv/download', authController.downloadCV)  // Download

export default router