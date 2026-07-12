'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';

export type Likers = Array<{ user_id: string; first_name: string | null; last_name: string | null }>;

export type PostType = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  is_private: boolean;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  like_count: number;
  comment_count: number;
  liked: boolean;
  likers: Likers;
};

export type CommentType = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  author: string;
  liked: boolean;
  like_count: number;
  likers: Likers;
};

type LikeState = Record<
  string,
  { liked: boolean; count: number; likers: Likers }
>;

interface CommentPageData {
  items: CommentType[];
  nextCursor: string | null;
  isFetchingNext: boolean;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatName(first: string | null, last: string | null): string {
  const name = `${first || ''} ${last || ''}`.trim();
  return name || 'Buddy Member';
}

function LikedBy({
  likers,
  count,
  expanded,
  onToggle,
}: {
  likers: Likers;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  const names = likers.slice(0, 2).map((l) => formatName(l.first_name, l.last_name)).filter(Boolean);
  let text: string;
  if (names.length === 0) {
    text = `${count} like${count > 1 ? 's' : ''}`;
  } else if (count <= 2) {
    text = `Liked by ${names.join(' and ')}`;
  } else {
    text = `Liked by ${names.join(', ')} and ${count - 2} others`;
  }
  return (
    <div className="_liked_by_wrap">
      <button type="button" className="_liked_by_toggle" onClick={onToggle}>
        {text}
      </button>
      {expanded && (
        <div className="_liked_by_list">
          {likers.map((liker) => (
            <span key={liker.user_id} className="_liked_by_item">
              {formatName(liker.first_name, liker.last_name)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type CurrentUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export default function PostCard({
  post,
  currentUser,
}: {
  post: PostType;
  currentUser: CurrentUser | null;
}) {
  const [likeState, setLikeState] = useState<LikeState>({
    [post.id]: { liked: post.liked, count: post.like_count, likers: post.likers },
  });
  const [commentPaginationState, setCommentPaginationState] = useState<Record<string, CommentPageData>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [likersExpanded, setLikersExpanded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const showToast = useCallback((message: string) => {
    setToast({ message, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadPostComments = useCallback(
    async (postId: string, loadMore = false) => {
      const currentTree =
        commentPaginationState[postId] || { items: [], nextCursor: null, isFetchingNext: false };
      if (loadMore && !currentTree.nextCursor) return;

      const requestUrl = `/api/comments?post_id=${postId}${
        loadMore && currentTree.nextCursor ? `&cursor=${encodeURIComponent(currentTree.nextCursor)}` : ''
      }`;

      try {
        setCommentPaginationState((prev) => ({
          ...prev,
          [postId]: { ...currentTree, isFetchingNext: loadMore },
        }));
        const response = await fetch(requestUrl, { credentials: 'include' });
        if (!response.ok) throw new Error('Server returned error response.');
        const payload = await response.json();

        setCommentPaginationState((prev) => ({
          ...prev,
          [postId]: {
            items: loadMore ? [...currentTree.items, ...payload.comments] : payload.comments,
            nextCursor: payload.nextCursor,
            isFetchingNext: false,
          },
        }));
        setLikeState((prev) => {
          const next = { ...prev };
          for (const c of payload.comments) {
            next[c.id] = { liked: c.liked, count: c.like_count, likers: c.likers };
          }
          return next;
        });
      } catch {
        showToast('Could not load comments. Please check your network connection.');
        setCommentPaginationState((prev) => ({
          ...prev,
          [postId]: { ...currentTree, isFetchingNext: false },
        }));
      }
    },
    [commentPaginationState, showToast]
  );

  useEffect(() => {
    loadPostComments(post.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const handleLike = async (targetType: 'post' | 'comment', targetId: string) => {
    const previous = likeState[targetId] || { liked: false, count: 0, likers: [] };
    setLikeState((prev) => ({
      ...prev,
      [targetId]: {
        liked: !previous.liked,
        count: previous.count + (previous.liked ? -1 : 1),
        likers: previous.likers,
      },
    }));
    try {
      const res = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target_type: targetType, target_id: targetId }),
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      setLikeState((prev) => ({
        ...prev,
        [targetId]: { liked: data.liked, count: data.count, likers: data.likers },
      }));
    } catch {
      setLikeState((prev) => ({ ...prev, [targetId]: previous }));
      showToast('Could not update like. Please try again.');
    }
  };

  const handleComment = async (postId: string) => {
    const content = (commentDraft[postId] || '').trim();
    if (!content) return;
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ post_id: postId, content }),
      });
      if (res.ok) {
        const data = await res.json();
        const authorName = currentUser ? formatName(currentUser.first_name, currentUser.last_name) : 'You';
        setCommentPaginationState((prev) => ({
          ...prev,
          [postId]: {
            items: [
              ...(prev[postId]?.items || []),
              {
                id: data.comment.id,
                post_id: postId,
                user_id: data.comment.user_id,
                parent_id: data.comment.parent_id,
                content: data.comment.content,
                author: data.comment.author || authorName,
                liked: false,
                like_count: 0,
                likers: [],
              },
            ],
            nextCursor: prev[postId]?.nextCursor ?? null,
            isFetchingNext: false,
          },
        }));
        setCommentDraft((prev) => ({ ...prev, [postId]: '' }));
      }
    } catch {
      // ignore
    }
  };

  const handleReply = async (postId: string, parentId: string) => {
    const content = (replyDraft[parentId] || '').trim();
    if (!content) return;
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ post_id: postId, content, parent_id: parentId }),
      });
      if (res.ok) {
        const data = await res.json();
        const authorName = currentUser ? formatName(currentUser.first_name, currentUser.last_name) : 'You';
        setCommentPaginationState((prev) => ({
          ...prev,
          [postId]: {
            items: [
              ...(prev[postId]?.items || []),
              {
                id: data.comment.id,
                post_id: postId,
                user_id: data.comment.user_id,
                parent_id: parentId,
                content: data.comment.content,
                author: data.comment.author || authorName,
                liked: false,
                like_count: 0,
                likers: [],
              },
            ],
            nextCursor: prev[postId]?.nextCursor ?? null,
            isFetchingNext: false,
          },
        }));
        setReplyDraft((prev) => ({ ...prev, [parentId]: '' }));
        setReplyingTo(null);
      }
    } catch {
      // ignore
    }
  };

  const toggleLikers = (targetId: string) => {
    setLikersExpanded((prev) => ({ ...prev, [targetId]: !prev[targetId] }));
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/feed?post=${post.id}` : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Buddy Script', text: post.content.slice(0, 80), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // user dismissed share sheet or clipboard blocked
    }
  };

  const renderComment = (comment: CommentType, postId: string, isReply = false) => {
    const like = likeState[comment.id] || { liked: false, count: 0, likers: [] };
    const postComments = commentPaginationState[postId]?.items || [];
    const replies = postComments.filter((c) => c.parent_id === comment.id);

    return (
      <div key={comment.id} className={isReply ? '_comment_reply' : '_comment_main'}>
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
              className={`_comment_like_btn ${like.liked ? '_comment_like_active' : ''}`}
              onClick={() => handleLike('comment', comment.id)}
            >
              {like.liked ? 'Liked' : 'Like'}
            </button>
            {!isReply && (
              <button
                type="button"
                className="_comment_reply_btn"
                onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              >
                Reply
              </button>
            )}
            <LikedBy
              likers={like.likers}
              count={like.count}
              expanded={!!likersExpanded[comment.id]}
              onToggle={() => toggleLikers(comment.id)}
            />
          </div>
          {replyingTo === comment.id && (
            <div className="_comment_reply_form">
              <textarea
                className="form-control _comment_textarea"
                placeholder="Write a reply"
                value={replyDraft[comment.id] || ''}
                onChange={(e) => setReplyDraft((prev) => ({ ...prev, [comment.id]: e.target.value }))}
              />
              <div className="_comment_reply_form_actions">
                <button
                  type="button"
                  className="_comment_reply_submit"
                  onClick={() => handleReply(postId, comment.id)}
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
          {replies.length > 0 && (
            <div className="_comment_replies">
              {replies.map((reply) => renderComment(reply, postId, true))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const like = likeState[post.id] || { liked: false, count: 0, likers: [] };
  const author =
    currentUser && post.user_id === currentUser.id
      ? 'You'
      : formatName(post.first_name, post.last_name);
  const authorName = formatName(post.first_name, post.last_name);

  return (
    <div className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _mar_b16">
      <div className="_feed_inner_timeline_content _padd_r24 _padd_l24">
        <div className="_feed_inner_timeline_post_top">
          <div className="_feed_inner_timeline_post_box">
            <div className="_feed_inner_timeline_post_box_image">
              <Link href={`/profile/${post.user_id}`} aria-label={authorName}>
                <Avatar
                  size="md"
                  src={null}
                  firstName={post.first_name}
                  lastName={post.last_name}
                />
              </Link>
            </div>
            <div className="_feed_inner_timeline_post_box_txt">
              <Link href={`/profile/${post.user_id}`} className="_feed_inner_timeline_post_box_title_link">
                <h4 className="_feed_inner_timeline_post_box_title">{author}</h4>
              </Link>
              <p className="_feed_inner_timeline_post_box_para">
                {timeAgo(post.created_at)} ·{' '}
                <span className="_post_visibility" title={post.is_private ? 'Only you can see this' : 'Anyone can see this'}>
                  {post.is_private ? 'Private' : 'Public'}
                </span>
              </p>
            </div>
          </div>
        </div>
        <h4 className="_feed_inner_timeline_post_title">{post.content}</h4>
        {post.image_url && (
          <div className="_feed_inner_timeline_image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.image_url} alt="" className="_time_img" />
          </div>
        )}
      </div>

      <div className="_feed_inner_timeline_total_reacts _padd_r24 _padd_l24 _mar_b26">
        <div className="_feed_inner_timeline_total_reacts_txt">
          <p className="_feed_inner_timeline_total_reacts_para1">
            <span>{like.count}</span> Like{like.count === 1 ? '' : 's'}
          </p>
          <p className="_feed_inner_timeline_total_reacts_para2">
            <span>{post.comment_count}</span> Comment{post.comment_count === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="_feed_inner_timeline_reaction">
        <button
          className={`_feed_inner_timeline_reaction_emoji _feed_reaction ${like.liked ? '_feed_reaction_active' : ''}`}
          onClick={() => handleLike('post', post.id)}
          type="button"
        >
          <span className="_feed_inner_timeline_reaction_link">
            <span className="_feed_reaction_icon" aria-hidden="true">
              {like.liked ? '👍' : '🤍'}
            </span>
            <span>{like.liked ? 'Liked' : 'Like'}</span>
          </span>
        </button>
        <button
          className="_feed_inner_timeline_reaction_comment _feed_reaction"
          type="button"
          onClick={() => {
            loadPostComments(post.id, false);
            const el = document.getElementById(`comment-${post.id}`);
            el?.focus();
          }}
        >
          <span className="_feed_inner_timeline_reaction_link">
            <span className="_feed_reaction_icon" aria-hidden="true">💬</span>
            <span>Comment</span>
          </span>
        </button>
        <button
          className="_feed_inner_timeline_reaction_share _feed_reaction"
          type="button"
          onClick={handleShare}
        >
          <span className="_feed_inner_timeline_reaction_link">
            <span className="_feed_reaction_icon" aria-hidden="true">↗</span>
            <span>{shareCopied ? 'Copied!' : 'Share'}</span>
          </span>
        </button>
      </div>

      <LikedBy
        likers={like.likers}
        count={like.count}
        expanded={!!likersExpanded[post.id]}
        onToggle={() => toggleLikers(post.id)}
      />

      <div className="_feed_inner_timeline_cooment_area">
        <div className="_feed_inner_comment_box">
          <div className="_feed_inner_comment_box_content">
            <div className="_feed_inner_comment_box_content_image">
              <Avatar
                size="sm"
                src={currentUser ? null : null}
                firstName={currentUser?.first_name ?? null}
                lastName={currentUser?.last_name ?? null}
              />
            </div>
            <div className="_feed_inner_comment_box_content_txt">
              <textarea
                id={`comment-${post.id}`}
                className="form-control _comment_textarea"
                placeholder="Write a comment"
                value={commentDraft[post.id] || ''}
                onFocus={() => {
                  loadPostComments(post.id, false);
                }}
                onChange={(e) => setCommentDraft((prev) => ({ ...prev, [post.id]: e.target.value }))}
              />
            </div>
          </div>
          <div className="_feed_inner_comment_box_icon">
            <button
              type="button"
              className="_feed_inner_comment_box_icon_btn"
              onClick={() => handleComment(post.id)}
            >
              Comment
            </button>
          </div>
        </div>
      </div>

      <div className="_timline_comment_main">
        {commentPaginationState[post.id]?.items.map((c) => renderComment(c, post.id, c.parent_id !== null))}

        {commentPaginationState[post.id]?.nextCursor && (
          <div className="_previous_comment text-center my-2">
            <button
              type="button"
              className="_previous_comment_txt btn btn-link btn-sm text-decoration-none"
              disabled={commentPaginationState[post.id].isFetchingNext}
              onClick={() => loadPostComments(post.id, true)}
            >
              {commentPaginationState[post.id].isFetchingNext ? 'Loading...' : 'View previous comments'}
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="_toast _toast_inline" role="alert" key={toast.key}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
