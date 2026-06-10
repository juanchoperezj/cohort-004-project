import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import { lessonComments, users, type UserRole } from "~/db/schema";
import {
  MAX_COMMENT_LENGTH,
  type CommentAuthor,
  type CommentReply,
  type CommentNode,
  type CommentsPage,
} from "~/lib/comments";

// ─── Lesson Comment Service ───
// Single-level threaded comments on a lesson. Top-level comments may have
// replies; replies never have replies of their own.
//
// Authorization (who may post / who may delete) is enforced by the route, which
// has the enrollment + course-instructor context. This service owns data
// integrity (body validation, parent rules) and the tombstone-vs-hard-delete
// logic. Uses positional parameters (project convention).

const DELETED_BODY = "[deleted]";

type CommentRow = {
  id: number;
  parentId: number | null;
  body: string;
  deletedAt: string | null;
  createdAt: string;
  authorId: number;
  authorName: string;
  authorAvatarUrl: string | null;
  authorRole: UserRole;
};

const commentColumns = {
  id: lessonComments.id,
  parentId: lessonComments.parentId,
  body: lessonComments.body,
  deletedAt: lessonComments.deletedAt,
  createdAt: lessonComments.createdAt,
  authorId: users.id,
  authorName: users.name,
  authorAvatarUrl: users.avatarUrl,
  authorRole: sql<UserRole>`${users.role}`,
};

function toAuthor(row: CommentRow): CommentAuthor {
  return {
    id: row.authorId,
    name: row.authorName,
    avatarUrl: row.authorAvatarUrl,
    role: row.authorRole,
  };
}

// A tombstoned comment's original text is never sent to the client.
function publicBody(row: CommentRow): string {
  return row.deletedAt ? DELETED_BODY : row.body;
}

/**
 * Returns a page of top-level comments (newest-first) for a lesson, each with
 * its replies (oldest-first). `limit` bounds only the top-level comments;
 * replies are always loaded in full for the comments on the page.
 */
export function getCommentsPage(lessonId: number, limit: number): CommentsPage {
  // Fetch limit + 1 to detect whether more top-level comments exist.
  const topLevel = db
    .select(commentColumns)
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(
      and(eq(lessonComments.lessonId, lessonId), isNull(lessonComments.parentId))
    )
    // Secondary sort on id keeps ordering deterministic when createdAt ties.
    .orderBy(desc(lessonComments.createdAt), desc(lessonComments.id))
    .limit(limit + 1)
    .all() as CommentRow[];

  const hasMore = topLevel.length > limit;
  const pageRows = hasMore ? topLevel.slice(0, limit) : topLevel;
  const parentIds = pageRows.map((row) => row.id);

  const replyRows =
    parentIds.length === 0
      ? []
      : (db
          .select(commentColumns)
          .from(lessonComments)
          .innerJoin(users, eq(lessonComments.userId, users.id))
          .where(inArray(lessonComments.parentId, parentIds))
          .orderBy(asc(lessonComments.createdAt), asc(lessonComments.id))
          .all() as CommentRow[]);

  const repliesByParent = new Map<number, CommentReply[]>();
  for (const row of replyRows) {
    const list = repliesByParent.get(row.parentId!) ?? [];
    list.push({
      id: row.id,
      parentId: row.parentId!,
      body: publicBody(row),
      deleted: row.deletedAt !== null,
      createdAt: row.createdAt,
      author: toAuthor(row),
    });
    repliesByParent.set(row.parentId!, list);
  }

  const comments: CommentNode[] = pageRows.map((row) => ({
    id: row.id,
    body: publicBody(row),
    deleted: row.deletedAt !== null,
    createdAt: row.createdAt,
    author: toAuthor(row),
    replies: repliesByParent.get(row.id) ?? [],
  }));

  return { comments, hasMore };
}

/** Total number of comments on a lesson (top-level + replies, including tombstones). */
export function getCommentCount(lessonId: number): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(eq(lessonComments.lessonId, lessonId))
    .get();

  return result?.count ?? 0;
}

export function getCommentById(id: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, id))
    .get();
}

/**
 * Adds a comment or reply. Validates the body and, for replies, that the parent
 * is a non-deleted top-level comment on the same lesson. Caller is responsible
 * for authorization (enrollment / instructor).
 */
export function addComment(
  userId: number,
  lessonId: number,
  body: string,
  parentId: number | null
) {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comment cannot exceed ${MAX_COMMENT_LENGTH} characters`);
  }

  if (parentId !== null) {
    const parent = getCommentById(parentId);
    if (!parent || parent.lessonId !== lessonId) {
      throw new Error("Parent comment not found on this lesson");
    }
    if (parent.parentId !== null) {
      throw new Error("Cannot reply to a reply");
    }
    if (parent.deletedAt !== null) {
      throw new Error("Cannot reply to a deleted comment");
    }
  }

  return db
    .insert(lessonComments)
    .values({ userId, lessonId, parentId, body: trimmed })
    .returning()
    .get();
}

/**
 * Deletes a comment. A comment that has replies is tombstoned (kept, body
 * scrubbed, deletedAt set) so the replies stay readable; a comment with no
 * replies is hard-deleted. Caller is responsible for authorization.
 * Returns how the deletion was applied.
 */
export function deleteComment(commentId: number): "tombstoned" | "removed" {
  const replyCount = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(eq(lessonComments.parentId, commentId))
    .get();

  if ((replyCount?.count ?? 0) > 0) {
    db.update(lessonComments)
      .set({ deletedAt: new Date().toISOString(), body: DELETED_BODY })
      .where(eq(lessonComments.id, commentId))
      .run();
    return "tombstoned";
  }

  db.delete(lessonComments).where(eq(lessonComments.id, commentId)).run();
  return "removed";
}
