// src/types/course.ts

export type QuizQuestion = {
  q: string;
  options: string[];
  answer: number; // index of correct option
};

export type Subtopic = {
  subtopicId: string; // e.g. "1-1"
  title: string;
  video: string;      // YouTube watch URL
  pdf: string;
  quiz: QuizQuestion[];
};

export type Topic = {
  topicId: number;
  emoji: string;
  title: string;
  subtopics: Subtopic[];
};

export type Course = {
  _id: string;
  title: string;
  slug: string;
  subject: string;
  description: string;
  img: string;
  rating: number;
  students: number;
  accent: string;
  badge: string | null;
  isPublished: boolean;
  topics: Topic[];
  enrolledStudents: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type CoursesResponse = {
  success: boolean;
  message: string;
  data: {
    courses: Course[];
    activeCoursesCount?: number;
  };
};

export type SingleCourseResponse = {
  success: boolean;
  message: string;
  data: {
    course: Course;
  };
};

export type EnrollmentResponse = {
  success: boolean;
  message: string;
  data: {
    isEnrolled: boolean;
  };
};