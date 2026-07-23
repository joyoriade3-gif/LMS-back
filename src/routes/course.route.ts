import { Router } from 'express'
import {
  getCourses,
  getAllCourses,
  searchCourses,
  getCourseBySlugOrId,
  getMyInstructorCourses,
  getAllCatalogCourses,
  getStudentDashboard,
  getInstructorDashboard,
  createCourse,
  enrollInCourse,
  unenrollFromCourse,
  checkEnrollment,
  uploadCourseMaterial,
  getCourseStudents,
  getMyStudents,
  getInstructorCourseDetail,
  updateCourse,
  deleteCourse,
  accessCourse,
  releaseCourse,
} from '../controllers/course.controller.js'
import { protect, restrictTo } from '../middleware/auth.middleware.js'
import { uploadCourseMaterials, uploadLessonMaterials } from '../middleware/upload.middleware.js'

const router = Router()

// ── Public ────────────────────────────────────────────────────────────────────
router.get('/', getCourses)
router.get('/all', getAllCourses)
router.get('/search', searchCourses)

// ── Instructor ────────────────────────────────────────────────────────────────
router.get('/my-courses', protect, restrictTo('instructor'), getMyInstructorCourses)
router.get('/my-students', protect, restrictTo('instructor'), getMyStudents)
router.get('/instructor-dashboard', protect, restrictTo('instructor'), getInstructorDashboard)
router.post('/create', protect, restrictTo('instructor'), uploadCourseMaterials, createCourse)

// ── Instructor course management ──────────────────────────────────────────────
router.get('/:slugOrId/manage', protect, restrictTo('instructor'), getInstructorCourseDetail)
router.put('/:slugOrId/update', protect, restrictTo('instructor'), uploadCourseMaterials, updateCourse)
router.delete('/:slugOrId/delete', protect, restrictTo('instructor'), deleteCourse)

// ── Student ───────────────────────────────────────────────────────────────────
router.get('/catalog', protect, getAllCatalogCourses)
router.get('/student-dashboard', protect, restrictTo('student'), getStudentDashboard)

// ── Dynamic routes last ───────────────────────────────────────────────────────
router.get('/:slugOrId/enrollment', protect, checkEnrollment)
router.post('/:slugOrId/enroll', protect, restrictTo('student'), enrollInCourse)
router.post('/:slugOrId/unenroll', protect, restrictTo('student'), unenrollFromCourse)
router.post('/:slugOrId/access', protect, restrictTo('instructor'), accessCourse)
router.post('/:slugOrId/release', protect, restrictTo('instructor'), releaseCourse)
// Fixed: was using uploadCourseMaterials (which doesn't accept videoFile/pdfFile/
// quizImages), causing multer to reject the request as "Unexpected field" -> 500.
router.post('/:slugOrId/upload-material', protect, restrictTo('instructor'),  (req, res, next) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    next();
  }, uploadLessonMaterials, uploadCourseMaterial)
router.get('/:courseId/students', protect, restrictTo('instructor'), getCourseStudents)
router.get('/:slugOrId', getCourseBySlugOrId)

export default router