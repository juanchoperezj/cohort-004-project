import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { lessonBookmarks, lessons, modules } from "~/db/schema";

// ─── Bookmark Service ───
// Private per-student lesson bookmarks. A bookmark persists until the student
// removes it (toggling off). Uses positional parameters (project convention).

export type ToggleBookmarkResult = { bookmarked: boolean };

export function isLessonBookmarked(
  userId: number,
  lessonId: number
): boolean {
  const row = db
    .select({ id: lessonBookmarks.id })
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, userId),
        eq(lessonBookmarks.lessonId, lessonId)
      )
    )
    .get();

  return row !== undefined;
}

/** Adds the bookmark if absent, removes it if present. */
export function toggleBookmark(
  userId: number,
  lessonId: number
): ToggleBookmarkResult {
  const existing = db
    .select({ id: lessonBookmarks.id })
    .from(lessonBookmarks)
    .where(
      and(
        eq(lessonBookmarks.userId, userId),
        eq(lessonBookmarks.lessonId, lessonId)
      )
    )
    .get();

  if (existing) {
    db.delete(lessonBookmarks).where(eq(lessonBookmarks.id, existing.id)).run();
    return { bookmarked: false };
  }

  db.insert(lessonBookmarks).values({ userId, lessonId }).run();
  return { bookmarked: true };
}

/**
 * Returns the IDs of all lessons a user has bookmarked within a course.
 * Joins bookmarks → lessons → modules to scope by course.
 */
export function getBookmarkedLessonIds(
  userId: number,
  courseId: number
): number[] {
  const rows = db
    .select({ lessonId: lessonBookmarks.lessonId })
    .from(lessonBookmarks)
    .innerJoin(lessons, eq(lessonBookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(eq(lessonBookmarks.userId, userId), eq(modules.courseId, courseId))
    )
    .all();

  return rows.map((row) => row.lessonId);
}
