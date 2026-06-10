import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  getCommentsPage,
  getCommentCount,
  getCommentById,
  addComment,
  deleteComment,
} from "./lessonCommentService";
import { MAX_COMMENT_LENGTH } from "~/lib/comments";

function createLesson(title: string, position: number) {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: `${title} module`, position })
    .returning()
    .get();

  return testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title, position })
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

describe("lessonCommentService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    lessonId = createLesson("Lesson A", 1).id;
    otherLessonId = createLesson("Lesson B", 2).id;
  });

  describe("addComment", () => {
    it("creates a top-level comment", () => {
      const comment = addComment(base.user.id, lessonId, "Great lesson!", null);

      expect(comment.userId).toBe(base.user.id);
      expect(comment.lessonId).toBe(lessonId);
      expect(comment.parentId).toBeNull();
      expect(comment.body).toBe("Great lesson!");
      expect(comment.deletedAt).toBeNull();
      expect(comment.createdAt).toBeDefined();
    });

    it("trims the body before storing", () => {
      const comment = addComment(base.user.id, lessonId, "  spaced  ", null);
      expect(comment.body).toBe("spaced");
    });

    it("creates a reply to a top-level comment", () => {
      const parent = addComment(base.user.id, lessonId, "Question?", null);
      const reply = addComment(
        base.instructor.id,
        lessonId,
        "Answer.",
        parent.id
      );
      expect(reply.parentId).toBe(parent.id);
    });

    it.each(["", "   ", "\n\t"])("rejects empty body %p", (body) => {
      expect(() => addComment(base.user.id, lessonId, body, null)).toThrow();
    });

    it("rejects a body over the max length", () => {
      const tooLong = "a".repeat(MAX_COMMENT_LENGTH + 1);
      expect(() => addComment(base.user.id, lessonId, tooLong, null)).toThrow();
    });

    it("rejects a reply to a non-existent parent", () => {
      expect(() => addComment(base.user.id, lessonId, "hi", 9999)).toThrow();
    });

    it("rejects a reply whose parent is on a different lesson", () => {
      const parent = addComment(base.user.id, otherLessonId, "elsewhere", null);
      expect(() =>
        addComment(base.user.id, lessonId, "hi", parent.id)
      ).toThrow();
    });

    it("rejects a reply to a reply (no nesting beyond one level)", () => {
      const parent = addComment(base.user.id, lessonId, "top", null);
      const reply = addComment(base.user.id, lessonId, "mid", parent.id);
      expect(() =>
        addComment(base.user.id, lessonId, "deep", reply.id)
      ).toThrow();
    });

    it("rejects a reply to a tombstoned parent", () => {
      const parent = addComment(base.user.id, lessonId, "top", null);
      addComment(base.user.id, lessonId, "reply", parent.id);
      deleteComment(parent.id); // tombstones because it has a reply
      expect(() =>
        addComment(base.user.id, lessonId, "late reply", parent.id)
      ).toThrow();
    });
  });

  describe("getCommentsPage", () => {
    it("returns top-level comments newest-first", () => {
      const first = addComment(base.user.id, lessonId, "first", null);
      const second = addComment(base.user.id, lessonId, "second", null);

      const page = getCommentsPage(lessonId, 10);
      expect(page.comments.map((c) => c.id)).toEqual([second.id, first.id]);
      expect(page.hasMore).toBe(false);
    });

    it("nests replies oldest-first under their parent", () => {
      const parent = addComment(base.user.id, lessonId, "q", null);
      const r1 = addComment(base.instructor.id, lessonId, "a1", parent.id);
      const r2 = addComment(base.user.id, lessonId, "a2", parent.id);

      const page = getCommentsPage(lessonId, 10);
      expect(page.comments).toHaveLength(1);
      expect(page.comments[0].replies.map((r) => r.id)).toEqual([r1.id, r2.id]);
    });

    it("includes author details and role", () => {
      addComment(base.instructor.id, lessonId, "from instructor", null);
      const page = getCommentsPage(lessonId, 10);
      expect(page.comments[0].author).toMatchObject({
        id: base.instructor.id,
        name: base.instructor.name,
        role: schema.UserRole.Instructor,
      });
    });

    it("paginates top-level comments and flags hasMore", () => {
      const ids: number[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push(addComment(base.user.id, lessonId, `c${i}`, null).id);
      }

      const page = getCommentsPage(lessonId, 2);
      expect(page.comments).toHaveLength(2);
      expect(page.hasMore).toBe(true);
      // newest-first: the two most recent
      expect(page.comments.map((c) => c.id)).toEqual([ids[2], ids[1]]);
    });

    it("does not count replies toward the top-level page limit", () => {
      const parent = addComment(base.user.id, lessonId, "parent", null);
      for (let i = 0; i < 5; i++) {
        addComment(base.user.id, lessonId, `reply ${i}`, parent.id);
      }
      const page = getCommentsPage(lessonId, 2);
      expect(page.comments).toHaveLength(1);
      expect(page.hasMore).toBe(false);
      expect(page.comments[0].replies).toHaveLength(5);
    });
  });

  describe("getCommentCount", () => {
    it("counts top-level comments and replies", () => {
      const parent = addComment(base.user.id, lessonId, "parent", null);
      addComment(base.user.id, lessonId, "reply", parent.id);
      addComment(base.user.id, lessonId, "another top", null);
      expect(getCommentCount(lessonId)).toBe(3);
    });

    it("returns zero for a lesson with no comments", () => {
      expect(getCommentCount(lessonId)).toBe(0);
    });
  });

  describe("deleteComment", () => {
    it("hard-deletes a comment with no replies", () => {
      const comment = addComment(base.user.id, lessonId, "remove me", null);
      expect(deleteComment(comment.id)).toBe("removed");
      expect(getCommentById(comment.id)).toBeUndefined();
      expect(getCommentCount(lessonId)).toBe(0);
    });

    it("tombstones a comment that has replies and keeps the replies", () => {
      const parent = addComment(base.user.id, lessonId, "secret question", null);
      const reply = addComment(base.instructor.id, lessonId, "answer", parent.id);

      expect(deleteComment(parent.id)).toBe("tombstoned");

      const page = getCommentsPage(lessonId, 10);
      expect(page.comments).toHaveLength(1);
      expect(page.comments[0].deleted).toBe(true);
      expect(page.comments[0].body).toBe("[deleted]");
      expect(page.comments[0].replies.map((r) => r.id)).toEqual([reply.id]);

      // Original text is scrubbed, not just hidden.
      const stored = getCommentById(parent.id);
      expect(stored?.body).not.toContain("secret question");
    });

    it("hard-deletes a reply (a leaf) directly", () => {
      const parent = addComment(base.user.id, lessonId, "parent", null);
      const reply = addComment(base.user.id, lessonId, "reply", parent.id);
      expect(deleteComment(reply.id)).toBe("removed");
      expect(getCommentById(reply.id)).toBeUndefined();
    });
  });
});
