import mongoose, { Schema, Document, Model, Types } from 'mongoose'
 
export type UserRole = 'student' | 'instructor'
 
export interface IUserDocument extends Document {
  // ── Core ──────────────────────────────────────────
  fullName:  string
  email:     string
  phone?:    string
  password:  string
  role:      UserRole
  isVerified: boolean
  isPaid:    boolean
 
  // ── Instructor profile fields ──────────────────────
  gender?:       string
  dateOfBirth?:  Date
  nationality?:  string
  address?:      string
  country?:      string
  state?:        string
  city?:         string
  jobTitle?:     string
  expertise?:    string
  yearsOfExperience?: number
  workplace?:    string
  bio?:          string
  highestQualification?: string
  institution?:  string
  fieldOfStudy?: string
  graduationYear?: number
  certificationName?: string
  certificationOrg?:  string
  certificationUrl?:  string
  teachingLevel?: string
  languagesSpoken?: string[]
  cvUrl?:        string
  govIdUrl?:     string
  academicCertUrl?: string
 
  // ── Instructor public profile ──────────────────────
  subject?:      string
  specialty?:    string
  accent?:       string
  avatar?:       string
  img?:          string
  portfolioUrl?:  string
  linkedinUrl?:   string
  githubUrl?:     string
  skills?:       string[]
 
  // ── Student fields ─────────────────────────────────
  profilePicture?: string
 
  // ── Shared ─────────────────────────────────────────
  courses:           Types.ObjectId[]
  enrolledCourses:   Types.ObjectId[]
 
  // ── Reset / OTP ────────────────────────────────────
  resetOTP?:       string
  resetOTPExpiry?: Date
  paystackReference?: string
 
  // ── Profile tracking ───────────────────────────────
  // Only set when instructor intentionally saves profile update.
  // Never touched by login, OTP, or password reset flows.
  profileLastUpdated?: Date
 
  createdAt: Date
  updatedAt: Date
}
 
const userSchema = new Schema<IUserDocument>(
  {
    fullName:  { type: String, required: true,  trim: true },
    email:     { type: String, required: true,  unique: true, trim: true, lowercase: true },
    phone:     { type: String, trim: true },
    password:  { type: String, required: true,  minlength: 8, select: false },
    role:      { type: String, enum: ['student','instructor'], required: true },
    isVerified:{ type: Boolean, default: false },
    isPaid:    { type: Boolean, default: false },
 
    // Instructor profile fields
    gender:         { type: String, trim: true },
    dateOfBirth:    { type: Date },
    nationality:    { type: String, trim: true },
    address:        { type: String, trim: true },
    country:        { type: String, trim: true },
    state:          { type: String, trim: true },
    city:           { type: String, trim: true },
    jobTitle:       { type: String, trim: true },
    expertise:      { type: String, trim: true },
    yearsOfExperience: { type: Number },
    workplace:      { type: String, trim: true },
    bio:            { type: String, trim: true },
    highestQualification: { type: String, trim: true },
    institution:    { type: String, trim: true },
    fieldOfStudy:   { type: String, trim: true },
    graduationYear: { type: Number },
    certificationName: { type: String, trim: true },
    certificationOrg:  { type: String, trim: true },
    certificationUrl:  { type: String, trim: true },
    teachingLevel:  { type: String, trim: true },
    languagesSpoken: { 
      type: Schema.Types.Mixed,  
      default: '' 
    },
    cvUrl:          { type: String, trim: true },
    govIdUrl:       { type: String, trim: true },
    academicCertUrl:{ type: String, trim: true },
 
    // Instructor public profile
    subject:    { type: String, default: 'General Educator' },
    specialty:  { type: String, default: 'Core Curriculum Specialist' },
    accent:     { type: String, default: '#dbeafe' },
    avatar:     { type: String, default: '' },
    img:        { type: String, default: '' },
    portfolioUrl: { type: String, trim: true },
    linkedinUrl:  { type: String, trim: true },
    githubUrl:    { type: String, trim: true },
    skills:       { type: [String], default: [] },
 
    // Student
    profilePicture: { type: String, default: '' },
 
    // Shared
    courses:         [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    enrolledCourses: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
 
    // Reset / OTP
    resetOTP:       { type: String, default: '' },
    resetOTPExpiry: { type: Date,   default: null },
    paystackReference: { type: String, default: '' },
 
    // Profile tracking — only written in updateProfile, never on login/OTP/reset
    profileLastUpdated: { type: Date, default: null },
  },
  { timestamps: true }
)
 
userSchema.set('toJSON', {
  transform: (_doc, ret: any) => {
    delete ret.password
    delete ret.resetOTP
    delete ret.resetOTPExpiry
    return ret
  },
})
 
const userModel: Model<IUserDocument> =
  mongoose.models.User ||
  mongoose.model<IUserDocument>('User', userSchema)
 
export default userModel