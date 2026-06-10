import type { UserRole } from "~/db/schema";

// Client-safe shared contract for lesson comments. Lives here (not in the
// service) so client components can import the constant and types without
// pulling in the server-only database module.

export const MAX_COMMENT_LENGTH = 2000;

export type CommentAuthor = {
  id: number;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
};

export type CommentReply = {
  id: number;
  parentId: number;
  body: string;
  deleted: boolean;
  createdAt: string;
  author: CommentAuthor;
};

export type CommentNode = {
  id: number;
  body: string;
  deleted: boolean;
  createdAt: string;
  author: CommentAuthor;
  replies: CommentReply[];
};

export type CommentsPage = {
  comments: CommentNode[];
  hasMore: boolean;
};
