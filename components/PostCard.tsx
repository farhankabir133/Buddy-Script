'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import PostHeader from './PostHeader';
import PostContent from './PostContent';
import ReactionBar from './ReactionBar';
import CommentComposer from './CommentComposer';
import CommentItem from './CommentItem';

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
  const names = likers.slice(0, 2).map((l) => `${l.first_name || ''} ${l.last_name || ''}`.trim()).filter(Boolean);
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
              {`${liker.first_name || ''} ${liker.last_name || ''}`.trim() || 'Buddy Member'}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export type Likers = Array<{ user_id: string; first_name: string | null; last_name: string | null }>;

export type PostType = {
  id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  image_urls?: string[] | null;
  is_private: boolean;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
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
  created_at: string;
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
    const tempId = `temp-comment-${Date.now()}`;
    const optimisticComment: CommentType = {
      id: tempId,
      post_id: postId,
      user_id: currentUser?.id ?? '',
      parent_id: null,
      content,
      author: currentUser ? `${currentUser.first_name} ${currentUser.last_name}`.trim() || 'You' : 'You',
      liked: false,
      like_count: 0,
      likers: [],
      created_at: new Date().toISOString(),
    };
    setCommentPaginationState((prev) => ({
      ...prev,
      [postId]: {
        items: [...(prev[postId]?.items || []), optimisticComment],
        nextCursor: prev[postId]?.nextCursor ?? null,
        isFetchingNext: false,
      },
    }));
    setCommentDraft((prev) => ({ ...prev, [postId]: '' }));
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ post_id: postId, content }),
      });
      if (res.ok) {
        const data = await res.json();
        setCommentPaginationState((prev) => ({
          ...prev,
          [postId]: {
            ...prev[postId],
            items: prev[postId]?.items.map((c) => (c.id === tempId ? { ...data.comment, liked: false, like_count: 0, likers: [] } : c)) || [],
          },
        }));
      } else {
        throw new Error('Failed to post comment');
      }
    } catch {
      setCommentPaginationState((prev) => ({
        ...prev,
        [postId]: {
          ...prev[postId],
          items: (prev[postId]?.items || []).filter((c) => c.id !== tempId),
        },
      }));
      setCommentDraft((prev) => ({ ...prev, [postId]: content }));
      showToast('Could not post your comment. Please try again.');
    }
  };

  const handleReply = async (postId: string, parentId: string) => {
    const content = (replyDraft[parentId] || '').trim();
    if (!content) return;
    const tempId = `temp-reply-${Date.now()}`;
    const optimisticReply: CommentType = {
      id: tempId,
      post_id: postId,
      user_id: currentUser?.id ?? '',
      parent_id: parentId,
      content,
      author: currentUser ? `${currentUser.first_name} ${currentUser.last_name}`.trim() || 'You' : 'You',
      liked: false,
      like_count: 0,
      likers: [],
      created_at: new Date().toISOString(),
    };
    setCommentPaginationState((prev) => ({
      ...prev,
      [postId]: {
        items: [...(prev[postId]?.items || []), optimisticReply],
        nextCursor: prev[postId]?.nextCursor ?? null,
        isFetchingNext: false,
      },
    }));
    setReplyDraft((prev) => ({ ...prev, [parentId]: '' }));
    setReplyingTo(null);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ post_id: postId, content, parent_id: parentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setCommentPaginationState((prev) => ({
          ...prev,
          [postId]: {
            ...prev[postId],
            items: prev[postId]?.items.map((c) => (c.id === tempId ? { ...data.comment, liked: false, like_count: 0, likers: [] } : c)) || [],
          },
        }));
      } else {
        throw new Error('Failed to post reply');
      }
    } catch {
      setCommentPaginationState((prev) => ({
        ...prev,
        [postId]: {
          ...prev[postId],
          items: (prev[postId]?.items || []).filter((c) => c.id !== tempId),
        },
      }));
      setReplyDraft((prev) => ({ ...prev, [parentId]: content }));
      setReplyingTo(parentId);
      showToast('Could not post your reply. Please try again.');
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

  const like = likeState[post.id] || { liked: false, count: 0, likers: [] };

  const postComments = commentPaginationState[post.id]?.items || [];

  const renderComments = (parentId: string | null, depth: number): ReactNode => {
    const children = postComments
      .filter((c) => c.parent_id === parentId)
      .sort((a, b) =>
        a.created_at === b.created_at
          ? a.id.localeCompare(b.id)
          : a.created_at.localeCompare(b.created_at)
      );
    return children.map((c) => (
      <CommentItem
        key={c.id}
        comment={c}
        isReply={parentId !== null}
        depth={parentId !== null ? depth : undefined}
        likeState={likeState[c.id] || { liked: false, count: 0, likers: [] }}
        onLike={(targetId) => handleLike('comment', targetId)}
        onReply={handleReply}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        replyDraft={replyDraft[c.id] || ''}
        setReplyDraft={(patch) => setReplyDraft((prev) => ({ ...prev, ...patch }))}
        toggleLikers={toggleLikers}
      >
        {renderComments(c.id, depth + 1)}
      </CommentItem>
    ));
  };

  return (
    <div className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _mar_b16">
      <div className="_feed_inner_timeline_content _padd_r24 _padd_l24">
        <PostHeader post={post} currentUser={currentUser} />
        <PostContent content={post.content} image_url={post.image_url} image_urls={post.image_urls} />
      </div>

      <ReactionBar
        likeCount={like.count}
        commentCount={post.comment_count}
        liked={like.liked}
        onLike={() => handleLike('post', post.id)}
        onComment={() => loadPostComments(post.id, false)}
        onShare={handleShare}
        shareCopied={shareCopied}
      />

      <LikedBy
        likers={like.likers}
        count={like.count}
        expanded={!!likersExpanded[post.id]}
        onToggle={() => toggleLikers(post.id)}
      />

      <CommentComposer
        postId={post.id}
        draft={commentDraft[post.id] || ''}
        currentUser={currentUser}
        onDraftChange={(postId, value) => setCommentDraft((prev) => ({ ...prev, [postId]: value }))}
        onSubmit={handleComment}
      />

      <div className="_timline_comment_main">
        {renderComments(null, 0)}

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
