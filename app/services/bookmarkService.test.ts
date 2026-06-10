import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  toggleBookmark,
  isLessonBookmarked,
  getBookmarkedLessonIds,
} from "./bookmarkService";

function createLesson(title: string, position: number, courseId: number) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: `${title} module`, position })
    .returning()
    .get();

  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title, position })
    .returning()
    .get();
}

function createCourse(slug: string) {
  return testDb
    .insert(schema.courses)
    .values({
      title: slug,
      slug,
      description: "x",
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get();
}

function createStudent(name: string, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

describe("bookmarkService", () => {
  let lessonId: number;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lessonId = createLesson("Lesson A", 1, base.course.id).id;
  });

  describe("toggleBookmark", () => {
    it("adds a bookmark when none exists", () => {
      expect(toggleBookmark(base.user.id, lessonId)).toEqual({
        bookmarked: true,
      });
      expect(isLessonBookmarked(base.user.id, lessonId)).toBe(true);
    });

    it("removes the bookmark when toggled again", () => {
      toggleBookmark(base.user.id, lessonId);
      expect(toggleBookmark(base.user.id, lessonId)).toEqual({
        bookmarked: false,
      });
      expect(isLessonBookmarked(base.user.id, lessonId)).toBe(false);
    });

    it("does not create duplicate rows across toggles", () => {
      toggleBookmark(base.user.id, lessonId);
      toggleBookmark(base.user.id, lessonId);
      toggleBookmark(base.user.id, lessonId);
      expect(getBookmarkedLessonIds(base.user.id, base.course.id)).toEqual([
        lessonId,
      ]);
    });
  });

  describe("isLessonBookmarked", () => {
    it("returns false when not bookmarked", () => {
      expect(isLessonBookmarked(base.user.id, lessonId)).toBe(false);
    });
  });

  describe("getBookmarkedLessonIds", () => {
    it("returns only the user's bookmarks within the course", () => {
      const lessonB = createLesson("Lesson B", 2, base.course.id);
      const otherCourse = createCourse("other-course");
      const otherLesson = createLesson("Other", 1, otherCourse.id);
      const otherStudent = createStudent("Other", "other@example.com");

      toggleBookmark(base.user.id, lessonId);
      toggleBookmark(base.user.id, lessonB.id);
      // Same user, different course — should be excluded.
      toggleBookmark(base.user.id, otherLesson.id);
      // Different user, same lesson — should be excluded.
      toggleBookmark(otherStudent.id, lessonId);

      const ids = getBookmarkedLessonIds(base.user.id, base.course.id);
      expect(ids.sort()).toEqual([lessonId, lessonB.id].sort());
    });

    it("returns an empty array when the user has no bookmarks", () => {
      expect(getBookmarkedLessonIds(base.user.id, base.course.id)).toEqual([]);
    });
  });
});
