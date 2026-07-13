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
    
    if (file.fieldname === 'avatar' || file.fieldname === 'thumbnail') {
      folder += 'images/'
    } else if (['cv', 'certification', 'document', 'documents'].includes(file.fieldname)) {
      folder += 'documents/'
    } else if (['video', 'videos'].includes(file.fieldname)) {
      folder += 'videos/'
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
  if (['avatar', 'thumbnail'].includes(file.fieldname)) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new ApiError('Only images are allowed', 400))
    }
    return cb(null, true)
  }
  
  // Videos
  if (['video', 'videos'].includes(file.fieldname)) {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new ApiError('Only video files allowed', 400))
    }
    return cb(null, true)
  }
  
  // Documents
  if (['cv', 'certification', 'document', 'documents'].includes(file.fieldname)) {
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
  
  cb(null, true)
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

// ✅ For instructor profile updates
export const uploadInstructorDocs = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
}).fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'cv', maxCount: 1 },
  { name: 'certification', maxCount: 1 },
])

// ✅ For course materials - THIS WAS MISSING
export const uploadCourseMaterials = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB for videos
}).fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'videos', maxCount: 5 },
  { name: 'document', maxCount: 1 },
  { name: 'documents', maxCount: 5 },
])

// ✅ For student registration
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
})

// ✅ Utility exports for custom uploads
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