import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseReviews } from "~/db/schema";

// ─── Review Service ───
// Handles course star ratings (1–5). One rating per user per course, editable.
// Uses positional parameters (project convention).

export type CourseRatingStats = {
  average: number | null;
  count: number;
};

export function getUserReview(userId: number, courseId: number) {
  return db
    .select()
    .from(courseReviews)
    .where(
      and(
        eq(courseReviews.userId, userId),
        eq(courseReviews.courseId, courseId)
      )
    )
    .get();
}

export function upsertReview(userId: number, courseId: number, rating: number) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be an integer between 1 and 5");
  }

  const existing = getUserReview(userId, courseId);

  if (existing) {
    return db
      .update(courseReviews)
      .set({ rating, updatedAt: new Date().toISOString() })
      .where(eq(courseReviews.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(courseReviews)
    .values({ userId, courseId, rating })
    .returning()
    .get();
}

export function getCourseRatingStats(courseId: number): CourseRatingStats {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseReviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  return {
    average: result?.average ?? null,
    count: result?.count ?? 0,
  };
}

export function getRatingStatsForCourses(
  courseIds: number[]
): Map<number, CourseRatingStats> {
  const stats = new Map<number, CourseRatingStats>();

  if (courseIds.length === 0) return stats;

  const rows = db
    .select({
      courseId: courseReviews.courseId,
      average: sql<number | null>`avg(${courseReviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseReviews)
    .where(inArray(courseReviews.courseId, courseIds))
    .groupBy(courseReviews.courseId)
    .all();

  for (const row of rows) {
    stats.set(row.courseId, {
      average: row.average ?? null,
      count: row.count,
    });
  }

  return stats;
}
