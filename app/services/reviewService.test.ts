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
  getUserReview,
  upsertReview,
  getCourseRatingStats,
  getRatingStatsForCourses,
} from "./reviewService";

function createStudent(name: string, email: string) {
  return testDb
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}

describe("reviewService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("upsertReview", () => {
    it("creates a review when none exists", () => {
      const review = upsertReview(base.user.id, base.course.id, 4);

      expect(review.userId).toBe(base.user.id);
      expect(review.courseId).toBe(base.course.id);
      expect(review.rating).toBe(4);
      expect(review.createdAt).toBeDefined();
    });

    it("updates the existing review instead of creating a second one", () => {
      const first = upsertReview(base.user.id, base.course.id, 2);
      const second = upsertReview(base.user.id, base.course.id, 5);

      expect(second.id).toBe(first.id);
      expect(second.rating).toBe(5);

      const stats = getCourseRatingStats(base.course.id);
      expect(stats.count).toBe(1);
      expect(stats.average).toBe(5);
    });

    it.each([0, 6, 3.5, -1])("rejects invalid rating %s", (rating) => {
      expect(() => upsertReview(base.user.id, base.course.id, rating)).toThrow();
    });
  });

  describe("getUserReview", () => {
    it("returns the user's review when present", () => {
      upsertReview(base.user.id, base.course.id, 3);
      const review = getUserReview(base.user.id, base.course.id);
      expect(review?.rating).toBe(3);
    });

    it("returns undefined when the user has not reviewed", () => {
      expect(getUserReview(base.user.id, base.course.id)).toBeUndefined();
    });
  });

  describe("getCourseRatingStats", () => {
    it("returns null average and zero count with no reviews", () => {
      expect(getCourseRatingStats(base.course.id)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("averages ratings across multiple users", () => {
      const second = createStudent("Second", "second@example.com");
      const third = createStudent("Third", "third@example.com");

      upsertReview(base.user.id, base.course.id, 5);
      upsertReview(second.id, base.course.id, 4);
      upsertReview(third.id, base.course.id, 3);

      const stats = getCourseRatingStats(base.course.id);
      expect(stats.count).toBe(3);
      expect(stats.average).toBe(4);
    });
  });

  describe("getRatingStatsForCourses", () => {
    it("returns an empty map for no course ids", () => {
      expect(getRatingStatsForCourses([]).size).toBe(0);
    });

    it("returns stats keyed by course id, omitting courses with no reviews", () => {
      const otherCourse = testDb
        .insert(schema.courses)
        .values({
          title: "Other Course",
          slug: "other-course",
          description: "Another course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      const second = createStudent("Second", "second@example.com");
      upsertReview(base.user.id, base.course.id, 2);
      upsertReview(second.id, base.course.id, 4);

      const stats = getRatingStatsForCourses([base.course.id, otherCourse.id]);

      expect(stats.get(base.course.id)).toEqual({ average: 3, count: 2 });
      expect(stats.has(otherCourse.id)).toBe(false);
    });
  });
});
