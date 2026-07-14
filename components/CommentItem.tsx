'use client';

import Avatar from './Avatar';
import { Heart } from 'lucide-react';
import type { ReactNode } from 'react';

const MAX_REPLY_INDENT = 4;

type CommentItemProps = {
  comment: {
    id: string;
    post_id: string;
    user_id: string;
    parent_id: string | null;
    content: string;
    author: string;
    liked: boolean;
    like_count: number;
    likers: Array<{ user_id: string; first_name: string | null; last_name: string | null }>;
    created_at: string;
  };
  isReply?: boolean;
  depth?: number;
  likeState: { liked: boolean; count: number; likers: Array<{ user_id: string; first_name: string | null; last_name: string | null }> };
  onLike: (targetId: string) => void;
  onReply: (postId: string, parentId: string) => void;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  replyDraft: string;
  setReplyDraft: (draft: Record<string, string>) => void;
  toggleLikers: (targetId: string) => void;
  children?: ReactNode;
};

export default function CommentItem({
  comment,
  isReply = false,
  depth = 1,
  likeState,
  onLike,
  onReply,
  replyingTo,
  setReplyingTo,
  replyDraft,
  setReplyDraft,
  toggleLikers,
  children,
}: CommentItemProps) {
  const handleReplySubmit = () => {
    if (!replyDraft.trim()) return;
    onReply(comment.post_id, comment.id);
  };

  const indent = isReply ? Math.min(Math.max(depth, 1), MAX_REPLY_INDENT) * 40 : 0;

  return (
    <div
      className={isReply ? '_comment_reply' : '_comment_main'}
      style={isReply ? { paddingLeft: indent } : undefined}
    >
      <div className="_comment_image">
        <Avatar size="sm" firstName={comment.author} lastName="" />
      </div>
      <div className="_comment_area">
        <div className="_comment_details">
          <h4 className="_comment_name_title">{comment.author}</h4>
          <div className="_comment_status">
            <p className="_comment_status_text">
              <span>{comment.content}</span>
            </p>
          </div>
        </div>
        <div className="_comment_actions">
          <button
            type="button"
            className={`_comment_like_btn ${likeState.liked ? '_comment_like_active' : ''}`}
            onClick={() => onLike(comment.id)}
          >
            {likeState.liked ? 'Liked' : 'Like'}
          </button>
          <button
            type="button"
            className="_comment_reply_btn"
            onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
          >
            Reply
          </button>
          <button
            type="button"
            className="_liked_by_toggle"
            onClick={() => toggleLikers(comment.id)}
            style={{ border: 0, background: 'transparent', color: 'var(--color2)', cursor: 'pointer', fontSize: '13px', padding: 0 }}
          >
            {likeState.count > 0 && (
              <>
                <Heart size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {likeState.count} like{likeState.count > 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
        {replyingTo === comment.id && (
          <div className="_comment_reply_form">
            <textarea
              className="form-control _comment_textarea"
              placeholder="Write a reply"
              value={replyDraft}
              onChange={(e) => setReplyDraft({ [comment.id]: e.target.value })}
            />
            <div className="_comment_reply_form_actions">
              <button
                type="button"
                className="_comment_reply_submit"
                onClick={handleReplySubmit}
              >
                Reply
              </button>
              <button
                type="button"
                className="_comment_reply_cancel"
                onClick={() => setReplyingTo(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
