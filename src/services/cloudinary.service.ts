import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import path from 'path'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// ─── Base64 upload ───────────────────────────────────────────────────────────
export async function uploadBase64ToCloudinary(
  base64Data: string,
  resourceType: 'video' | 'image' | 'raw',
  folder: string
): Promise<string> {
  const result = await cloudinary.uploader.upload(base64Data, {
    resource_type: resourceType,
    folder: `pathshala/${folder}`,
    access_mode: 'public',
  })
  return result.secure_url
}

// ─── Local file upload ───────────────────────────────────────────────────────
export async function uploadLocalFileToCloudinary(
  filePath: string,
  resourceType: 'video' | 'image' | 'raw',
  folder: string
): Promise<string> {
  // ── Guard: make sure the file actually exists before we touch it. ──────
  // If the dev server restarted mid-write (e.g. nodemon watching the
  // uploads folder) or the file was otherwise removed, fail with a clean,
  // catchable error instead of letting Cloudinary's SDK open a dead
  // filehandle and throw an unhandled stream 'error' event that crashes
  // the whole Node process.
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Upload failed: source file not found on disk (${filePath}). ` +
      `This usually means the dev server restarted while the file was still being written.`
    )
  }

  try {
    let result

    const ext = path.extname(filePath).toLowerCase()
    const isPdf = ext === '.pdf'

    if (resourceType === 'video') {
      result = await new Promise<any>((resolve, reject) => {
        // Re-check right before the call — belt and braces against a
        // restart happening between the existsSync check above and now.
        if (!fs.existsSync(filePath)) {
          reject(new Error(`Upload failed: source file disappeared before upload (${filePath})`))
          return
        }
        cloudinary.uploader.upload_large(
          filePath,
          {
            resource_type: 'video',
            folder: `pathshala/${folder}`,
            chunk_size: 6000000,
            access_mode: 'public',
          },
          (error, uploadResult) => {
            if (error) reject(error)
            else resolve(uploadResult)
          }
        )
      })
    } else if (isPdf) {
      result = await cloudinary.uploader.upload(filePath, {
        resource_type: 'image',
        format: 'pdf',
        folder: `pathshala/${folder}`,
        access_mode: 'public',
      })
    } else {
      result = await cloudinary.uploader.upload(filePath, {
        resource_type: resourceType,
        folder: `pathshala/${folder}`,
        access_mode: 'public',
      })
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    return result.secure_url
  } catch (error) {
    console.error('Cloudinary upload error:', error)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    throw error
  }
}

// ─── Delete from Cloudinary ──────────────────────────────────────────────────
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId)
  } catch (error) {
    console.error('Cloudinary delete error:', error)
  }
}

export default cloudinary
