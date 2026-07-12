'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Link from 'next/link';

type Post = {
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
  likers: Array<{ user_id: string; first_name: string | null; last_name: string | null }>;
};

type Comment = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  author: string;
  liked: boolean;
  like_count: number;
  likers: Array<{ user_id: string; first_name: string | null; last_name: string | null }>;
};

type LikeState = Record<
  string,
  { liked: boolean; count: number; likers: Array<{ user_id: string; first_name: string | null; last_name: string | null }> }
>;

interface CommentPageData {
  items: Comment[];
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
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function formatName(first: string | null, last: string | null): string {
  const name = `${first || ''} ${last || ''}`.trim();
  return name || 'Buddy Member';
}

// Non-blocking, browser-side image compression. Downscales large images to a
// web-friendly width and re-encodes them as JPEG before upload. Always resolves
// (falls back to the original file) so a decode/read failure never blocks the
// composer.
function compressImageFile(file: File): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200; // Optimal web sizing parameter
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Keep the base name but normalize the extension to .jpg since we
              // re-encode as JPEG.
              const jpgName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
              resolve(
                new File([blob], jpgName, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                })
              );
            } else {
              resolve(file); // Fallback to raw file if compression fails
            }
          },
          'image/jpeg',
          0.82 // Target optimization quality metric
        );
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

function LikedBy({
  likers,
  count,
  expanded,
  onToggle,
}: {
  likers: Array<{ user_id: string; first_name: string | null; last_name: string | null }>;
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

function PostSkeleton() {
  return (
    <div
      className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _mar_b16"
      aria-hidden="true"
    >
      <div className="_feed_inner_timeline_content _padd_r24 _padd_l24">
        <div className="_feed_inner_timeline_post_top">
          <div className="_feed_inner_timeline_post_box">
            <div className="_feed_inner_timeline_post_box_image">
              <div className="_skeleton _skeleton_avatar" />
            </div>
            <div className="_feed_inner_timeline_post_box_txt">
              <div className="_skeleton _skeleton_line _w40" />
              <div className="_skeleton _skeleton_line _w70" />
            </div>
          </div>
        </div>
        <div className="_skeleton _skeleton_line _w90" />
        <div className="_skeleton _skeleton_line _w70" />
        <div className="_skeleton _skeleton_block" />
      </div>
    </div>
  );
}

function Feed() {
  const { user, logout } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [likeState, setLikeState] = useState<LikeState>({});
  const [commentPaginationState, setCommentPaginationState] = useState<Record<string, CommentPageData>>({});
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [likersExpanded, setLikersExpanded] = useState<Record<string, boolean>>({});

  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ message, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const seedLikes = useCallback((incoming: Post[]) => {
    setLikeState((prev) => {
      const next = { ...prev };
      for (const p of incoming) {
        next[p.id] = { liked: p.liked, count: p.like_count, likers: p.likers };
      }
      return next;
    });
  }, []);

  const loadPosts = useCallback(
    async (pageCursor: string | null = null) => {
      setLoading(true);
      try {
        const url = pageCursor ? `/api/posts?cursor=${encodeURIComponent(pageCursor)}` : '/api/posts';
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const incoming: Post[] = data.posts ?? [];
        setPosts((prev) => (pageCursor ? [...prev, ...incoming] : incoming));
        seedLikes(incoming);
        setCursor(data.nextCursor ?? null);
      } catch {
        // ignore network errors
      } finally {
        setLoading(false);
      }
    },
    [seedLikes]
  );

  const loadPostComments = useCallback(async (postId: string, loadMore = false) => {
    const currentTree = commentPaginationState[postId] || { items: [], nextCursor: null, isFetchingNext: false };

    if (loadMore && !currentTree.nextCursor) return;

    const requestUrl = `/api/comments?post_id=${postId}${
      loadMore && currentTree.nextCursor ? `&cursor=${encodeURIComponent(currentTree.nextCursor)}` : ""
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
  } catch (err) {
    if (typeof showToast === 'function') {
      showToast('Could not load comments. Please check your network connection.');
    }
    setCommentPaginationState((prev) => ({
      ...prev,
      [postId]: { ...currentTree, isFetchingNext: false },
    }));
  }
  }, [commentPaginationState, showToast]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    posts.forEach((post) => {
      if (!commentPaginationState[post.id]) {
        loadPostComments(post.id, false);
      }
    });
  }, [posts, commentPaginationState, loadPostComments]);

  const uploadImage = async (file: File): Promise<string> => {
    // Upload through our authenticated server route. The browser Supabase
    // client runs as the anon role and is blocked by Storage RLS, so the server
    // performs the upload with the service-role key after verifying the session.
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) {
      let message = 'Image upload failed';
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }
    const data = await res.json();
    return data.url as string;
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }
    // Optimize the payload on the client before it ever reaches the storage
    // bucket. compressImageFile never rejects; it falls back to the raw file.
    const optimizedFile = await compressImageFile(file);
    setImageFile(optimizedFile);
    setImagePreview(URL.createObjectURL(optimizedFile));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newPost.trim();
    if (!content || posting) return;

    // Snapshot composer state so we can restore it on failure.
    const snapshot = { content, isPrivate, imageFile, imagePreview };
    const tempId = `temp-${Date.now()}`;
    const optimisticPost: Post = {
      id: tempId,
      user_id: user?.id ?? '',
      content,
      image_url: imagePreview,
      is_private: isPrivate,
      created_at: new Date().toISOString(),
      first_name: user?.first_name ?? null,
      last_name: user?.last_name ?? null,
      like_count: 0,
      comment_count: 0,
      liked: false,
      likers: [],
    };

    // Optimistic: show the post immediately.
    setPosts((prev) => [optimisticPost, ...prev]);
    setLikeState((prev) => ({ ...prev, [tempId]: { liked: false, count: 0, likers: [] } }));
    setNewPost('');
    setIsPrivate(false);
    setImageFile(null);
    setImagePreview(null);
    setPosting(true);

    try {
      let image_url: string | undefined;
      if (snapshot.imageFile) {
        image_url = await uploadImage(snapshot.imageFile);
      }
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: snapshot.content, image_url, is_private: snapshot.isPrivate }),
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      // Replace the temporary post with the real one from the server.
      setPosts((prev) => prev.map((p) => (p.id === tempId ? data.post : p)));
      setLikeState((prev) => {
        const next = { ...prev };
        delete next[tempId];
        next[data.post.id] = { liked: data.post.liked, count: data.post.like_count, likers: data.post.likers };
        return next;
      });
    } catch {
      // Roll back: remove the temp post and restore the composer draft.
      setPosts((prev) => prev.filter((p) => p.id !== tempId));
      setLikeState((prev) => {
        const next = { ...prev };
        delete next[tempId];
        return next;
      });
      setNewPost(snapshot.content);
      setIsPrivate(snapshot.isPrivate);
      setImageFile(snapshot.imageFile);
      setImagePreview(snapshot.imagePreview);
      showToast('Could not publish your post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleLike = async (targetType: 'post' | 'comment', targetId: string) => {
    const previous = likeState[targetId] || { liked: false, count: 0, likers: [] };

    // Optimistic update: flip liked + adjust count immediately.
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
      // Roll back to the pre-update state.
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
                author: data.comment.author || 'You',
                liked: false,
                like_count: 0,
                likers: [],
              },
            ],
            nextCursor: prev[postId]?.nextCursor ?? null,
            isFetchingNext: false,
          },
        }));
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p))
        );
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
                author: data.comment.author || 'You',
                liked: false,
                like_count: 0,
                likers: [],
              },
            ],
            nextCursor: prev[postId]?.nextCursor ?? null,
            isFetchingNext: false,
          },
        }));
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, comment_count: p.comment_count + 1 } : p))
        );
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

  const renderComment = (comment: Comment, postId: string, isReply = false) => {
    const like = likeState[comment.id] || { liked: false, count: 0, likers: [] };
    const postComments = commentPaginationState[postId]?.items || [];
    const replies = postComments.filter((c) => c.parent_id === comment.id);

    return (
      <div key={comment.id} className={isReply ? '_comment_reply' : '_comment_main'}>
        <div className="_comment_image">
          <img src="/assets/images/txt_img.png" alt="" className="_comment_img1" />
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
                onChange={(e) =>
                  setReplyDraft((prev) => ({ ...prev, [comment.id]: e.target.value }))
                }
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

  return (
    <div className="_layout _layout_main_wrapper">
      <div className="_main_layout">
        <nav className="navbar navbar-expand-lg navbar-light _header_nav _padd_t10">
          <div className="container _custom_container">
            <div className="_logo_wrap">
              <Link className="navbar-brand" href="/feed">
                <img src="/assets/images/logo.svg" alt="Buddy Script" className="_nav_logo" />
              </Link>
            </div>
            <div className="_header_form ms-auto">
              <form className="_header_form_grp">
                <svg className="_header_form_svg" xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 17 17">
                  <circle cx="7" cy="7" r="6" stroke="#666" />
                  <path stroke="#666" strokeLinecap="round" d="M16 16l-3-3" />
                </svg>
                <input className="form-control me-2 _inpt1" type="search" placeholder="Search" aria-label="Search" />
              </form>
            </div>
            <div className="_header_nav_profile">
              <div className="_header_nav_profile_image">
                <img src="/assets/images/profile.png" alt="Profile" className="_nav_profile_img" />
              </div>
              <div className="_header_nav_dropdown">
                <p className="_header_nav_para">{user ? `${user.first_name} ${user.last_name}` : 'Guest'}</p>
                <button type="button" className="_header_nav_dropdown_btn" onClick={() => logout()}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" fill="none" viewBox="0 0 10 6">
                    <path fill="#112032" d="M5 5l.354.354L5 5.707l-.354-.353L5 5zm4.354-3.646l-4 4-.708-.708 4-4 .708.708zm-4.708 4l-4-4 .708-.708 4 4-.708.708z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </nav>

        <div className="container _custom_container">
          <div className="_layout_inner_wrap">
            <div className="row">
              <div className="col-xl-3 col-lg-3 col-md-12 col-sm-12">
                <div className="_layout_left_sidebar_wrap">
                  <div className="_layout_left_sidebar_inner">
                    <div className="_left_inner_area_explore _padd_t24 _padd_b6 _padd_r24 _padd_l24 _b_radious6 _feed_inner_area">
                      <h4 className="_left_inner_area_explore_title _title5 _mar_b24">Explore</h4>
                      <ul className="_left_inner_area_explore_list">
                        <li className="_left_inner_area_explore_item">
                          <a href="#0" className="_left_inner_area_explore_link">Learning</a>
                          <span className="_left_inner_area_explore_link_txt">New</span>
                        </li>
                        <li className="_left_inner_area_explore_item">
                          <a href="#0" className="_left_inner_area_explore_link">Insights</a>
                        </li>
                        <li className="_left_inner_area_explore_item">
                          <Link href="/feed" className="_left_inner_area_explore_link">Feed</Link>
                        </li>
                        <li className="_left_inner_area_explore_item">
                          <a href="#0" className="_left_inner_area_explore_link">Bookmarks</a>
                        </li>
                        <li className="_left_inner_area_explore_item">
                          <a href="#0" className="_left_inner_area_explore_link">Group</a>
                        </li>
                        <li className="_left_inner_area_explore_item">
                          <a href="#0" className="_left_inner_area_explore_link">Gaming</a>
                          <span className="_left_inner_area_explore_link_txt">New</span>
                        </li>
                        <li className="_left_inner_area_explore_item">
                          <a href="#0" className="_left_inner_area_explore_link">Settings</a>
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div className="_layout_left_sidebar_inner">
                    <div className="_left_inner_area_suggest _padd_t24 _padd_b6 _padd_r24 _padd_l24 _b_radious6 _feed_inner_area">
                      <div className="_left_inner_area_suggest_content _mar_b24">
                        <h4 className="_left_inner_area_suggest_content_title _title5">Suggested People</h4>
                        <a href="#0" className="_left_inner_area_suggest_content_txt_link">See All</a>
                      </div>
                      {['Steve Jobs', 'Ryan Roslansky', 'Dylan Field'].map((name, i) => (
                        <div className="_left_inner_area_suggest_info" key={name}>
                          <div className="_left_inner_area_suggest_info_box">
                            <div className="_left_inner_area_suggest_info_image">
                              <img src={`/assets/images/people${i + 1}.png`} alt={name} className="_info_img" />
                            </div>
                            <div className="_left_inner_area_suggest_info_txt">
                              <h4 className="_left_inner_area_suggest_info_title">{name}</h4>
                              <p className="_left_inner_area_suggest_info_para">Suggested for you</p>
                            </div>
                          </div>
                          <div className="_left_inner_area_suggest_info_link">
                            <a href="#0" className="_info_link">Connect</a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12">
                <div className="_layout_middle_wrap">
                  <div className="_feed_inner_text_area _b_radious6 _padd_b24 _padd_t24 _padd_r24 _padd_l24 _mar_b16">
                    <form onSubmit={handleCreate}>
                      <div className="_feed_inner_text_area_box">
                        <div className="_feed_inner_text_area_box_image">
                          <img src="/assets/images/txt_img.png" alt="" className="_txt_img" />
                        </div>
                        <div className="form-floating _feed_inner_text_area_box_form">
                          <textarea
                            className="form-control _textarea"
                            placeholder="Write something ..."
                            value={newPost}
                            onChange={(e) => setNewPost(e.target.value)}
                          />
                        </div>
                      </div>
                      {imagePreview && (
                        <div className="_post_image_preview _mar_t12">
                          <img src={imagePreview} alt="Preview" className="_preview_img" />
                          <button
                            type="button"
                            className="_preview_remove"
                            onClick={() => {
                              setImageFile(null);
                              setImagePreview(null);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      <div className="_feed_inner_text_area_bottom">
                        <div className="_feed_inner_text_area_btn">
                          <label className="_feed_inner_text_area_btn_link _upload_btn">
                            <span>{imageFile ? 'Change Image' : 'Add Image'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="_hidden_input"
                              onChange={handleImageSelect}
                            />
                          </label>
                          <div className="_privacy_segment" role="group" aria-label="Post visibility">
                            <button
                              type="button"
                              className={`_privacy_option ${!isPrivate ? '_privacy_option_active' : ''}`}
                              onClick={() => setIsPrivate(false)}
                              aria-pressed={!isPrivate}
                            >
                              Public
                            </button>
                            <button
                              type="button"
                              className={`_privacy_option ${isPrivate ? '_privacy_option_active' : ''}`}
                              onClick={() => setIsPrivate(true)}
                              aria-pressed={isPrivate}
                            >
                              Private
                            </button>
                          </div>
                          <button type="submit" className="_feed_inner_text_area_btn_link" disabled={posting}>
                            <span>{posting ? 'Posting...' : 'Post'}</span>
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>

                  {loading && posts.length === 0 ? (
                    <>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <PostSkeleton key={i} />
                      ))}
                    </>
                  ) : posts.length === 0 ? (
                    <p className="_feed_inner_timeline_post_title">No posts yet. Be the first to post!</p>
                  ) : (
                    posts.map((post) => {
                      const like = likeState[post.id] || { liked: false, count: 0, likers: [] };
                      const author = user && post.user_id === user.id ? 'You' : formatName(post.first_name, post.last_name);
                      return (
                        <div className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _mar_b16" key={post.id}>
                          <div className="_feed_inner_timeline_content _padd_r24 _padd_l24">
                            <div className="_feed_inner_timeline_post_top">
                              <div className="_feed_inner_timeline_post_box">
                                <div className="_feed_inner_timeline_post_box_image">
                                  <img src="/assets/images/post_img.png" alt="" className="_post_img" />
                                </div>
                                <div className="_feed_inner_timeline_post_box_txt">
                                  <h4 className="_feed_inner_timeline_post_box_title">{author}</h4>
                                  <p className="_feed_inner_timeline_post_box_para">
                                    {timeAgo(post.created_at)} . <a href="#0">{post.is_private ? 'Private' : 'Public'}</a>
                                  </p>
                                </div>
                              </div>
                            </div>
                            <h4 className="_feed_inner_timeline_post_title">{post.content}</h4>
                            {post.image_url && (
                              <div className="_feed_inner_timeline_image">
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
                                <span>Comment</span>
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
                                   <img src="/assets/images/comment_img.png" alt="" className="_comment_img" />
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
                                     onChange={(e) =>
                                       setCommentDraft((prev) => ({ ...prev, [post.id]: e.target.value }))
                                     }
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
                             {commentPaginationState[post.id]?.items.map((c) =>
                               renderComment(c, post.id, c.parent_id !== null)
                             )}

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
                         </div>
                      );
                    })
                  )}

                  {cursor && (
                    <button
                      type="button"
                      className="_feed_inner_text_area_btn_link"
                      onClick={() => loadPosts(cursor)}
                      disabled={loading}
                    >
                      {loading ? 'Loading...' : 'Load more'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="_toast_wrap">
        {toast && (
          <div className="_toast" role="alert" key={toast.key}>
            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FeedPage() {
  return (
    <ProtectedRoute>
      <Feed />
    </ProtectedRoute>
  );
}
