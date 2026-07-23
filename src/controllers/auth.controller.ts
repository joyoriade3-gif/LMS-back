import type { Request, Response, NextFunction } from 'express'
import userModel from '../models/user.model.js'
import { CourseModel } from '../models/course.model.js'
import { ApiError } from '../middleware/error.middleware.js'
import { sendResponse } from '../utils/response.utils.js'
import { hashPassword, comparePassword, hashOTP, compareOTP, generateOTP } from '../utils/hash.utils.js'
import { signAccessToken, signRefreshToken, signResetToken, verifyResetToken } from '../utils/jwt.utils.js'
import { sendOTPEmail, sendWelcomeEmail } from '../services/email.service.js'
import { toPublicUrl, saveBase64File } from '../services/local-storage.service.js'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
 
class AuthController {
 
  // ── INSTRUCTOR REGISTER ──────────────────────────────────────────────────
  registerInstructor = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        fullName, email, password, confirmPassword,
      } = req.body
 
      if (!fullName || !email || !password || !confirmPassword)
        throw new ApiError('Full name, email and password are required', 400)
 
      if (password !== confirmPassword)
        throw new ApiError('Passwords do not match', 400)
 
      if (password.length < 8)
        throw new ApiError('Password must be at least 8 characters', 400)
 
      const existing = await userModel.findOne({ email })
      if (existing) throw new ApiError('An account with this email already exists', 400)
 
      const hashedPassword = await hashPassword(password)
 
      const user = await userModel.create({
        fullName, 
        email,
        password: hashedPassword,
        role: 'instructor',
        isPaid: true,
      })
 
      try { await sendWelcomeEmail(email, fullName, 'instructor') } catch {}
 
      const accessToken  = signAccessToken({ id: String(user._id), role: user.role, email: user.email })
      const refreshToken = signRefreshToken({ id: String(user._id), role: user.role, email: user.email })
 
      sendResponse(res, 201, true, 'Instructor account created successfully', { user, accessToken, refreshToken })
    } catch (err) { next(err) }
  }
 
  // ── STUDENT REGISTER ─────────────────────────────────────────────────────
  registerStudent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fullName, email, phone, password, confirmPassword, country, dateOfBirth } = req.body
 
      if (!fullName || !email || !password || !confirmPassword)
        throw new ApiError('Full name, email and password are required', 400)
 
      if (password !== confirmPassword)
        throw new ApiError('Passwords do not match', 400)
 
      if (password.length < 8)
        throw new ApiError('Password must be at least 8 characters', 400)
 
      const existing = await userModel.findOne({ email })
      if (existing) throw new ApiError('An account with this email already exists', 400)
 
      const files = req.files as Record<string, Express.Multer.File[]> | undefined
      let profilePicture = ''
      const avatarFile = files?.['avatar']?.[0]
      if (avatarFile) {
        profilePicture = toPublicUrl(avatarFile) // stays on disk, served from /uploads
      }
 
      const hashedPassword = await hashPassword(password)
      const user = await userModel.create({
        fullName, email,
        phone:          phone    || '',
        password:       hashedPassword,
        role:           'student',
        isPaid:         true,
        country:        country  || '',
        dateOfBirth:    dateOfBirth ? new Date(dateOfBirth) : undefined,
        profilePicture,
        avatar:         profilePicture,
        img:            profilePicture,
      })
 
      try { await sendWelcomeEmail(email, fullName, 'student') } catch {}
 
      const accessToken  = signAccessToken({ id: String(user._id), role: user.role, email: user.email })
      const refreshToken = signRefreshToken({ id: String(user._id), role: user.role, email: user.email })
 
      sendResponse(res, 201, true, 'Student account created successfully', { user, accessToken, refreshToken })
    } catch (err) { next(err) }
  }
 
  // ── LOGIN (shared) ───────────────────────────────────────────────────────
  // NOTE: login only reads the user and issues tokens.
  // It does NOT call user.save(), so updatedAt and profileLastUpdated
  // are never touched here.
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, role } = req.body
      if (!email || !password || !role) throw new ApiError('Email, password and role are required', 400)
 
      const user = await userModel.findOne({ email, role }).select('+password')
      if (!user) throw new ApiError('Invalid email or password', 401)
 
      const isMatch = await comparePassword(password, user.password)
      if (!isMatch) throw new ApiError('Invalid email or password', 401)
 
      const accessToken  = signAccessToken({ id: String(user._id), role: user.role, email: user.email })
      const refreshToken = signRefreshToken({ id: String(user._id), role: user.role, email: user.email })
 
      sendResponse(res, 200, true, 'Login successful', { user, accessToken, refreshToken })
    } catch (err) { next(err) }
  }
 
  // ── FORGOT PASSWORD ──────────────────────────────────────────────────────
  // NOTE: this calls user.save() which updates MongoDB's built-in `updatedAt`.
  // That is fine because we never show `updatedAt` to users — we only show
  // `profileLastUpdated` which is untouched here.
  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body
      if (!email) throw new ApiError('Email is required', 400)
 
      const user = await userModel.findOne({ email })
      if (!user) { sendResponse(res, 200, true, 'If this email exists, a reset code has been sent'); return }
 
      const otp       = generateOTP()
      const hashedOTP = await hashOTP(otp)
      user.resetOTP       = hashedOTP
      user.resetOTPExpiry = new Date(Date.now() + 10 * 60 * 1000)
      await user.save()
 
      await sendOTPEmail(email, user.fullName, otp)
      sendResponse(res, 200, true, 'If this email exists, a reset code has been sent')
    } catch (err) { next(err) }
  }
 
  // ── VERIFY OTP ────────────────────────────────────────────────────────────
  verifyOTP = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, otp } = req.body
      if (!email || !otp) throw new ApiError('Email and OTP are required', 400)
 
      const user = await userModel.findOne({ email })
      if (!user || !user.resetOTP || !user.resetOTPExpiry)
        throw new ApiError('Invalid or expired code', 400)
 
      if (user.resetOTPExpiry < new Date())
        throw new ApiError('Reset code has expired', 400)
 
      const isMatch = await compareOTP(otp, user.resetOTP)
      if (!isMatch) throw new ApiError('Invalid reset code', 400)
 
      user.resetOTP       = ''
      user.resetOTPExpiry = new Date(0)
      await user.save()
 
      const resetToken = signResetToken({ id: String(user._id), email: user.email, purpose: 'reset' })
      sendResponse(res, 200, true, 'OTP verified successfully', { resetToken })
    } catch (err) { next(err) }
  }
 
  // ── RESET PASSWORD ────────────────────────────────────────────────────────
  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { resetToken, newPassword } = req.body
      if (!resetToken || !newPassword) throw new ApiError('Reset token and new password are required', 400)
      if (newPassword.length < 8) throw new ApiError('Password must be at least 8 characters', 400)
 
      const decoded = verifyResetToken(resetToken)
      if (decoded.purpose !== 'reset') throw new ApiError('Invalid reset token', 400)
 
      const user = await userModel.findById(decoded.id)
      if (!user) throw new ApiError('User not found', 404)
 
      user.password = await hashPassword(newPassword)
      await user.save()
      sendResponse(res, 200, true, 'Password reset successfully')
    } catch (err) { next(err) }
  }
 
  // ── GET PROFILE ───────────────────────────────────────────────────────────
  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await userModel.findById(req.user?.id).populate('courses').populate('enrolledCourses')
      if (!user) throw new ApiError('User not found', 404)
      sendResponse(res, 200, true, 'Profile fetched successfully', user)
    } catch (err) { next(err) }
  }
 
  // ── UPDATE PROFILE ────────────────────────────────────────────────────────
  // This is the ONLY place profileLastUpdated is written.
  // Every time the instructor intentionally saves their profile, this timestamp
  // is set. It is never touched by login, OTP, or password reset.
  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id
      if (!userId) throw new ApiError('Unauthorized', 401)
 
      const user = await userModel.findById(userId)
      if (!user) throw new ApiError('User not found', 404)
 
      const allowedFields = [
        'fullName', 'phone', 'gender', 'dateOfBirth',
        'address', 'country', 'state', 'city',
        'jobTitle', 'expertise', 'yearsOfExperience', 'workplace', 'bio',
        'subject', 'specialty', 'teachingLevel', 'languagesSpoken',
        'highestQualification', 'institution', 'fieldOfStudy', 'graduationYear',
        'certificationName', 'certificationOrg',
        'nationality'
      ]
 
      const updateData: any = {}
      for (const field of allowedFields) {
        if (req.body[field] !== undefined && req.body[field] !== null) {
          if (field === 'dateOfBirth' && req.body[field]) {
            updateData[field] = new Date(req.body[field])
          } else {
            updateData[field] = req.body[field]
          }
        }
      }
 
      const files = req.files as Record<string, Express.Multer.File[]> | undefined
 
      const uploadFile = (field: string): string | undefined => {
        const f = files?.[field]?.[0]
        if (!f) return undefined
        return toPublicUrl(f)
      }
 
      const avatarUrl = uploadFile('avatar')
      if (avatarUrl) { 
        updateData.avatar = avatarUrl
        updateData.img = avatarUrl
        updateData.profilePicture = avatarUrl
      }
 
      const cvUrl = uploadFile('cv')
      if (cvUrl) updateData.cvUrl = cvUrl
 
      const certUrl = uploadFile('certification')
      if (certUrl) updateData.certificationUrl = certUrl
 
      if (req.body.imageStream) {
        try {
          const url = saveBase64File(req.body.imageStream, 'avatars')
          updateData.avatar = url
          updateData.img = url
          updateData.profilePicture = url
        } catch (err) {
          console.error('Failed to upload base64 avatar:', err)
        }
      }
 
      // Strip empty / null values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === '' || updateData[key] === null || updateData[key] === undefined) {
          delete updateData[key]
        }
      })
 
      // ── KEY FIX: set profileLastUpdated to right now ──────────────────────
      // This is the dedicated "profile was intentionally updated" timestamp.
      // It is completely separate from MongoDB's auto-managed `updatedAt`.
      // Login, OTP verification, and password reset never write this field,
      // so showing it to users will always reflect a real profile save action.
      updateData.profileLastUpdated = new Date()
 
      const updatedUser = await userModel.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { 
          new: true,
          runValidators: true,
          context: 'query'
        }
      )
      .populate('courses')
      .populate('enrolledCourses')
 
      if (!updatedUser) {
        throw new ApiError('User not found after update', 404)
      }
 
      const userResponse = updatedUser.toObject()
      const { 
        password, 
        __v, 
        resetOTP, 
        resetOTPExpiry,
        ...safeUser 
      } = userResponse
 
      sendResponse(res, 200, true, 'Profile updated successfully', safeUser)
    } catch (err) { 
      console.error('Update profile error:', err)
      next(err) 
    }
  }
 
  // ── GET CV / VIEW CV ──────────────────────────────────────────────────────
  getCV = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      const instructor = await userModel.findById(id);
      if (!instructor) throw new ApiError('Instructor not found', 404);
      if (!instructor.cvUrl) throw new ApiError('CV not found for this instructor', 404);
      
      // CVs are served straight from local disk now — no Cloudinary URL
      // rewriting needed, the stored URL is already the real, viewable link.
      return res.redirect(instructor.cvUrl);
      
    } catch (err) { 
      console.error('❌ Get CV error:', err);
      next(err); 
    }
  }

  // ── DOWNLOAD CV ────────────────────────────────────────────────────────────
  downloadCV = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      const instructor = await userModel.findById(id);
      if (!instructor) throw new ApiError('Instructor not found', 404);
      if (!instructor.cvUrl) throw new ApiError('CV not found', 404);

      // Stream the real file back with a Content-Disposition: attachment
      // header, so the browser downloads the actual uploaded CV instead of
      // just opening it — this is the local-disk equivalent of Cloudinary's
      // `?fl_attachment=1` trick, which only worked for Cloudinary URLs.
      const idx = instructor.cvUrl.indexOf('/uploads/');
      if (idx === -1) throw new ApiError('CV file location is invalid', 500);
      const relativePath = instructor.cvUrl.slice(idx + 1); // "uploads/documents/xxx.pdf"
      const absolutePath = path.join(process.cwd(), relativePath);
      if (!fs.existsSync(absolutePath)) throw new ApiError('CV file no longer exists on disk', 404);

      const downloadName = `${instructor.fullName?.replace(/\s+/g, '_') || 'instructor'}-CV${path.extname(absolutePath)}`;
      return res.download(absolutePath, downloadName);
      
    } catch (err) { 
      console.error('❌ Download CV error:', err);
      next(err); 
    }
  }
 
  // ── GET INSTRUCTOR BY ID ─────────────────────────────────────────────────
  getInstructorById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params
      
      const instructor = await userModel
        .findById(id)
        .select([
          'fullName', 'email', 'avatar', 'img', 'role',
          'subject', 'specialty',
          'bio', 'jobTitle', 'expertise', 'yearsOfExperience', 'workplace',
          'highestQualification', 'institution', 'fieldOfStudy', 'graduationYear',
          'certificationName', 'certificationOrg', 'certificationUrl',
          'teachingLevel', 'languagesSpoken', 'cvUrl',
          'phone', 'gender', 'dateOfBirth', 'nationality',
          'address', 'country', 'state', 'city',
          'courses',
          'profileLastUpdated',   // ← include so frontend can display it
        ])
        .populate('courses', 'title subject')
 
      if (!instructor) throw new ApiError('Instructor not found', 404)
      if (instructor.role !== 'instructor') throw new ApiError('User is not an instructor', 400)
 
      const instructorObject = instructor.toObject()
      const { 
        password, 
        __v, 
        resetOTP, 
        resetOTPExpiry,
        ...safeInstructor 
      } = instructorObject
 
      sendResponse(res, 200, true, 'Instructor details fetched successfully', { instructor: safeInstructor })
    } catch (err) { next(err) }
  }
 
  // ── GET LIVE INSTRUCTORS ──────────────────────────────────────────────────
  getLiveInstructors = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const instructors = await userModel
        .find({ role: 'instructor', isPaid: true })
        .select([
          'fullName', 'avatar', 'img', 'role', 'email',
          'subject', 'specialty', 'bio',
          'jobTitle', 'expertise', 'courses'
        ])
        .populate('courses', 'title subject')
        .sort({ createdAt: -1 })
 
      sendResponse(res, 200, true, 'Instructors fetched', { instructors })
    } catch (err) { next(err) }
  } 
}
 
export default new AuthController()