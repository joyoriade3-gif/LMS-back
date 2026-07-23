// src/services/local-storage.service.ts
//
// Replaces Cloudinary for large/frequent files (course videos, PDFs, quiz
// images, CVs, assignment attachments, chat files & voice notes).
//
// multer's diskStorage (see middleware/upload.middleware.ts) already writes
// the uploaded file straight to disk under /uploads/<type>/<filename> — this
// service does NOT re-upload it anywhere. It just turns that disk path into
// a stable public URL and returns it. That URL is the only thing that ever
// gets saved to MongoDB, which is what keeps the free-tier database tiny no
// matter how large the video/PDF/voice-note itself is (a 1GB+ video costs
// the database ~60 bytes: the string "/uploads/videos/....mp4").
//
// Files are served back out via the existing static route in server.ts:
//   app.use("/uploads", express.static(path.join(__dirname, "../uploads")))
// Express's static middleware already honors Range headers, which is what
// lets a <video> tag seek/scrub through a large file instead of needing the
// whole thing downloaded up front.

import path from 'path'
import fs from 'fs'

const BASE_URL = process.env.BACKEND_URL || process.env.API_URL || 'http://localhost:5000'

/**
 * Turn a multer-saved file into a permanent public URL.
 * The file is left exactly where multer put it — nothing is deleted,
 * nothing is re-uploaded.
 */
export function toPublicUrl(file: Express.Multer.File): string {
  // multer's diskStorage destination is always "uploads/<subfolder>/", and
  // file.path is the absolute path multer wrote to. We only need the part
  // from "uploads/" onward.
  const idx = file.path.replace(/\\/g, '/').indexOf('uploads/')
  const relative = idx >= 0 ? file.path.replace(/\\/g, '/').slice(idx) : `uploads/misc/${file.filename}`
  return `${BASE_URL}/${relative}`
}

/** Same idea, but for a raw disk path instead of a multer file object. */
export function pathToPublicUrl(absoluteOrRelativePath: string): string {
  const normalized = absoluteOrRelativePath.replace(/\\/g, '/')
  const idx = normalized.indexOf('uploads/')
  const relative = idx >= 0 ? normalized.slice(idx) : normalized
  return `${BASE_URL}/${relative}`
}

/** Delete a previously-stored local file, given its public URL. Safe no-op if missing. */
export function deleteLocalFileByUrl(url?: string | null): void {
  if (!url) return
  const idx = url.indexOf('/uploads/')
  if (idx === -1) return
  const relative = url.slice(idx + 1) // "uploads/videos/xxx.mp4"
  const absolute = path.join(process.cwd(), relative)
  if (fs.existsSync(absolute)) {
    try { fs.unlinkSync(absolute) } catch { /* non-fatal */ }
  }
}

/**
 * Save a base64 data URL (e.g. from an in-browser avatar cropper) straight
 * to disk instead of round-tripping it through Cloudinary. Returns the
 * public URL, same as toPublicUrl().
 */
export function saveBase64File(dataUrl: string, subfolder: string): string {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!match) throw new Error('Invalid base64 data URL')
  const [, mimetype, base64Data] = match
  const ext = mimetype.split('/')[1] || 'png'
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`
  const dir = path.join(process.cwd(), 'uploads', subfolder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const absolute = path.join(dir, filename)
  fs.writeFileSync(absolute, Buffer.from(base64Data, 'base64'))
  return pathToPublicUrl(absolute)
}