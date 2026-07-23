import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { Request } from 'express'
import { ApiError } from './error.middleware.js'

// Ensure upload directories exist
const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'uploads/'

    if (['avatar', 'thumbnail', 'quizImages', 'questionImages'].includes(file.fieldname)) {
      folder += 'images/'
    } else if (['cv', 'certification', 'document', 'documents', 'pdfFile'].includes(file.fieldname)) {
      folder += 'documents/'
    } else if (['video', 'videos', 'videoFile'].includes(file.fieldname)) {
      folder += 'videos/'
    } else if (['chatFile'].includes(file.fieldname)) {
      folder += 'chat/'
    } else if (['voiceNote'].includes(file.fieldname)) {
      folder += 'voice-notes/'
    } else if (['submissionFile', 'materialFile'].includes(file.fieldname)) {
      folder += 'submissions/'
    } else {
      folder += 'misc/'
    }

    ensureDir(folder)
    cb(null, folder)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = path.extname(file.originalname)
    const baseName = path.basename(file.originalname, ext)
    const safeName = baseName.replace(/[^a-zA-Z0-9]/g, '-')
    cb(null, `${file.fieldname}-${safeName}-${uniqueSuffix}${ext}`)
  }
})

// File filter
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Images
  if (['avatar', 'thumbnail', 'quizImages', 'questionImages'].includes(file.fieldname)) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new ApiError('Only images are allowed', 400))
    }
    return cb(null, true)
  }

  // Videos
  if (['video', 'videos', 'videoFile'].includes(file.fieldname)) {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new ApiError('Only video files allowed', 400))
    }
    return cb(null, true)
  }

  // Documents
  if (['cv', 'certification', 'document', 'documents', 'pdfFile'].includes(file.fieldname)) {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png'
    ]
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new ApiError('Only PDF, DOC, DOCX, TXT, JPG, PNG allowed', 400))
    }
    return cb(null, true)
  }

  // Voice notes — audio only
  if (file.fieldname === 'voiceNote') {
    if (!file.mimetype.startsWith('audio/')) {
      return cb(new ApiError('Only audio files are allowed for voice notes', 400))
    }
    return cb(null, true)
  }

  // Chat attachments / assignment files — image, video, audio, pdf, or doc
  if (['chatFile', 'submissionFile', 'materialFile'].includes(file.fieldname)) {
    const allowedPrefixes = ['image/', 'video/', 'audio/']
    const allowedExact = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]
    const ok = allowedPrefixes.some((p) => file.mimetype.startsWith(p)) || allowedExact.includes(file.mimetype)
    if (!ok) {
      return cb(new ApiError('Unsupported file type', 400))
    }
    return cb(null, true)
  }

  cb(null, true)
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

// For instructor profile updates
export const uploadInstructorDocs = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
}).fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'cv', maxCount: 1 },
  { name: 'certification', maxCount: 1 },
])

// For course creation/update (thumbnail + course video)
export const uploadCourseMaterials = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB — covers the ">1GB video" requirement
}).fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'videos', maxCount: 5 },
  { name: 'document', maxCount: 1 },
  { name: 'documents', maxCount: 5 },
])

// For the "upload material" (lesson builder) flow used by MaterialsPage.jsx —
// this is what was missing "videoFile", "pdfFile", and "quizImages", causing
// multer to reject the request with "Unexpected field" -> a bare 500.
export const uploadLessonMaterials = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB, same reasoning as above
}).fields([
  { name: 'videoFile', maxCount: 1 },
  { name: 'pdfFile', maxCount: 1 },
  { name: 'quizImages', maxCount: 20 },
])

// For student registration
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
})

// For chat: a single attachment (image/video/audio/pdf/doc), capped at 10MB
// as you specified — anything larger is rejected by multer before it ever
// touches disk.
export const uploadChatFile = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('chatFile')

// For chat: a single voice note (audio only), also capped at 10MB.
export const uploadVoiceNote = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('voiceNote')

// For assignments: the instructor's attached material (video/pdf/image/doc)
// plus optional per-question images, all in the same create request — same
// pattern as course quiz images.
export const uploadAssignmentMaterial = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 },
}).fields([
  { name: 'materialFile', maxCount: 1 },
  { name: 'questionImages', maxCount: 20 },
])

export const uploadSubmissionFile = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 },
}).single('submissionFile')

// Utility exports for custom uploads
export const uploadSingle = (fieldName: string) => {
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
  }).single(fieldName)
}

export const uploadMultiple = (fields: { name: string; maxCount: number }[]) => {
  return multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 200 * 1024 * 1024 }
  }).fields(fields)
}