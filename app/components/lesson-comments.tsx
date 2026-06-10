import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { MessageSquare, Reply, Send, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { UserAvatar } from "~/components/user-avatar";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import {
  MAX_COMMENT_LENGTH,
  type CommentNode,
  type CommentReply,
} from "~/lib/comments";

const LOAD_MORE_STEP = 20;

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function RoleBadge({ role }: { role: UserRole }) {
  if (role === UserRole.Instructor) {
    return (
      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
        Instructor
      </span>
    );
  }
  if (role === UserRole.Admin) {
    return (
      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
        Admin
      </span>
    );
  }
  return null;
}

function DeleteButton({ commentId }: { commentId: number }) {
  const fetcher = useFetcher();
  const deleting = fetcher.state !== "idle";

  return (
    <fetcher.Form
      method="post"
      onSubmit={(e) => {
        if (!confirm("Delete this comment?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="delete-comment" />
      <input type="hidden" name="commentId" value={commentId} />
      <button
        type="submit"
        disabled={deleting}
        aria-label="Delete comment"
        className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    </fetcher.Form>
  );
}

function CommentBody({
  body,
  deleted,
}: {
  body: string;
  deleted: boolean;
}) {
  return (
    <p
      className={cn(
        "mt-1 whitespace-pre-wrap break-words text-sm",
        deleted && "italic text-muted-foreground"
      )}
    >
      {body}
    </p>
  );
}

function ReplyRow({
  reply,
  currentUserId,
  canModerate,
}: {
  reply: CommentReply;
  currentUserId: number | null;
  canModerate: boolean;
}) {
  const canDelete =
    !reply.deleted &&
    currentUserId !== null &&
    (currentUserId === reply.author.id || canModerate);

  return (
    <div className="flex gap-3">
      <UserAvatar
        name={reply.author.name}
        avatarUrl={reply.author.avatarUrl}
        className="size-7"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{reply.author.name}</span>
          <RoleBadge role={reply.author.role} />
          <span className="text-xs text-muted-foreground">
            {timeAgo(reply.createdAt)}
          </span>
          {canDelete && (
            <div className="ml-auto">
              <DeleteButton commentId={reply.id} />
            </div>
          )}
        </div>
        <CommentBody body={reply.body} deleted={reply.deleted} />
      </div>
    </div>
  );
}

function CommentForm({
  parentId,
  placeholder,
  autoFocus,
  onDone,
}: {
  parentId?: number;
  placeholder: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = fetcher.state !== "idle";
  const error = fetcher.data?.commentError as string | undefined;
  const success = fetcher.data?.commentSuccess as boolean | undefined;

  useEffect(() => {
    if (success) {
      formRef.current?.reset();
      onDone?.();
    }
  }, [success, onDone]);

  return (
    <fetcher.Form ref={formRef} method="post" className="flex flex-col gap-2">
      <input type="hidden" name="intent" value="add-comment" />
      {parentId !== undefined && (
        <input type="hidden" name="parentId" value={parentId} />
      )}
      <Textarea
        name="body"
        placeholder={placeholder}
        maxLength={MAX_COMMENT_LENGTH}
        rows={parentId === undefined ? 3 : 2}
        autoFocus={autoFocus}
        required
        className="resize-y"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          <Send className="mr-1.5 size-3.5" />
          {submitting ? "Posting..." : parentId === undefined ? "Comment" : "Reply"}
        </Button>
        {onDone && (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </fetcher.Form>
  );
}

function CommentThread({
  comment,
  currentUserId,
  canComment,
  canModerate,
}: {
  comment: CommentNode;
  currentUserId: number | null;
  canComment: boolean;
  canModerate: boolean;
}) {
  const [replying, setReplying] = useState(false);

  const canDelete =
    !comment.deleted &&
    currentUserId !== null &&
    (currentUserId === comment.author.id || canModerate);

  return (
    <div className="border-b border-border pb-4 last:border-b-0">
      <div className="flex gap-3">
        <UserAvatar
          name={comment.author.name}
          avatarUrl={comment.author.avatarUrl}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.author.name}</span>
            <RoleBadge role={comment.author.role} />
            <span className="text-xs text-muted-foreground">
              {timeAgo(comment.createdAt)}
            </span>
            {canDelete && (
              <div className="ml-auto">
                <DeleteButton commentId={comment.id} />
              </div>
            )}
          </div>
          <CommentBody body={comment.body} deleted={comment.deleted} />

          {canComment && !comment.deleted && !replying && (
            <button
              type="button"
              onClick={() => setReplying(true)}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Reply className="size-3.5" />
              Reply
            </button>
          )}
        </div>
      </div>

      {(comment.replies.length > 0 || replying) && (
        <div className="ml-11 mt-3 space-y-3 border-l border-border pl-4">
          {comment.replies.map((reply) => (
            <ReplyRow
              key={reply.id}
              reply={reply}
              currentUserId={currentUserId}
              canModerate={canModerate}
            />
          ))}
          {replying && (
            <CommentForm
              parentId={comment.id}
              placeholder={`Reply to ${comment.author.name}...`}
              autoFocus
              onDone={() => setReplying(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function LessonComments({
  courseSlug,
  lessonId,
  comments,
  commentCount,
  hasMore,
  commentLimit,
  currentUserId,
  canComment,
  canModerate,
}: {
  courseSlug: string;
  lessonId: number;
  comments: CommentNode[];
  commentCount: number;
  hasMore: boolean;
  commentLimit: number;
  currentUserId: number | null;
  canComment: boolean;
  canModerate: boolean;
}) {
  return (
    <section className="mb-8 mt-10">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Comments ({commentCount})</h2>
      </div>

      {canComment ? (
        <div className="mb-6">
          <CommentForm placeholder="Ask a question or share your thoughts..." />
        </div>
      ) : (
        <p className="mb-6 text-sm text-muted-foreground">
          {currentUserId
            ? "Enroll in this course to join the discussion."
            : "Sign in and enroll to join the discussion."}
        </p>
      )}

      {comments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No comments yet — be the first to start the discussion.
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              currentUserId={currentUserId}
              canComment={canComment}
              canModerate={canModerate}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-4 text-center">
          <Link
            to={`/courses/${courseSlug}/lessons/${lessonId}?comments=${
              commentLimit + LOAD_MORE_STEP
            }`}
            preventScrollReset
          >
            <Button variant="outline" size="sm">
              Load more comments
            </Button>
          </Link>
        </div>
      )}
    </section>
  );
}
