'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import Link from 'next/link';
import Avatar from '@/components/Avatar';
import PostCard, { type PostType } from '@/components/PostCard';

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
              const jpgName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
              resolve(
                new File([blob], jpgName, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                })
              );
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = () => resolve(file);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
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
  const [posts, setPosts] = useState<PostType[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ message, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadPosts = useCallback(
    async (pageCursor: string | null = null) => {
      setLoading(true);
      try {
        const url = pageCursor ? `/api/posts?cursor=${encodeURIComponent(pageCursor)}` : '/api/posts';
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const incoming: PostType[] = data.posts ?? [];
        setPosts((prev) => (pageCursor ? [...prev, ...incoming] : incoming));
        setCursor(data.nextCursor ?? null);
      } catch {
        // ignore network errors
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const uploadImage = async (file: File): Promise<string> => {
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
    const optimizedFile = await compressImageFile(file);
    setImageFile(optimizedFile);
    setImagePreview(URL.createObjectURL(optimizedFile));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = newPost.trim();
    if (!content || posting) return;

    const snapshot = { content, isPrivate, imageFile, imagePreview };
    const tempId = `temp-${Date.now()}`;
    const optimisticPost: PostType = {
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

    setPosts((prev) => [optimisticPost, ...prev]);
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
      setPosts((prev) => prev.map((p) => (p.id === tempId ? data.post : p)));
    } catch {
      setPosts((prev) => prev.filter((p) => p.id !== tempId));
      setNewPost(snapshot.content);
      setIsPrivate(snapshot.isPrivate);
      setImageFile(snapshot.imageFile);
      setImagePreview(snapshot.imagePreview);
      showToast('Could not publish your post. Please try again.');
    } finally {
      setPosting(false);
    }
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
              <form className="_header_form_grp" role="search">
                <svg className="_header_form_svg" xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 17 17">
                  <circle cx="7" cy="7" r="6" stroke="#666" />
                  <path stroke="#666" strokeLinecap="round" d="M16 16l-3-3" />
                </svg>
                <input className="form-control me-2 _inpt1" type="search" placeholder="Search" aria-label="Search" />
              </form>
            </div>
            <div className="_header_nav_profile">
              <Link href="/profile" className="_header_nav_profile_image" aria-label="Your profile">
                <Avatar size="sm" src={user?.avatar_url ?? null} firstName={user?.first_name ?? null} lastName={user?.last_name ?? null} />
              </Link>
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
                    <div className="_profile_mini_card _b_radious6 _feed_inner_area">
                      <Link href="/profile" className="_profile_mini_link">
                        <Avatar size="lg" src={user?.avatar_url ?? null} firstName={user?.first_name ?? null} lastName={user?.last_name ?? null} />
                        <h4 className="_profile_mini_name">{user ? `${user.first_name} ${user.last_name}` : 'Guest'}</h4>
                        <p className="_profile_mini_sub">View your profile</p>
                      </Link>
                    </div>
                  </div>
                  <div className="_layout_left_sidebar_inner">
                    <div className="_left_inner_area_explore _padd_t24 _padd_b6 _padd_r24 _padd_l24 _b_radious6 _feed_inner_area">
                      <h4 className="_left_inner_area_explore_title _title5 _mar_b24">Shortcuts</h4>
                      <ul className="_left_inner_area_explore_list">
                        <li className="_left_inner_area_explore_item">
                          <Link href="/feed" className="_left_inner_area_explore_link">Feed</Link>
                        </li>
                        <li className="_left_inner_area_explore_item">
                          <Link href="/profile" className="_left_inner_area_explore_link">Your Profile</Link>
                        </li>
                        <li className="_left_inner_area_explore_item">
                          <a href="#0" className="_left_inner_area_explore_link">Bookmarks</a>
                        </li>
                        <li className="_left_inner_area_explore_item">
                          <a href="#0" className="_left_inner_area_explore_link">Settings</a>
                        </li>
                      </ul>
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
                          <Avatar size="md" src={user?.avatar_url ?? null} firstName={user?.first_name ?? null} lastName={user?.last_name ?? null} />
                        </div>
                        <div className="form-floating _feed_inner_text_area_box_form">
                          <textarea
                            className="form-control _textarea"
                            placeholder={`What's on your mind, ${user?.first_name || 'there'}?`}
                            value={newPost}
                            onChange={(e) => setNewPost(e.target.value)}
                          />
                        </div>
                      </div>
                      {imagePreview && (
                        <div className="_post_image_preview _mar_t12">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
                            <span>{imageFile ? 'Change Image' : 'Add Photo'}</span>
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
                    posts.map((post) => (
                      <PostCard key={post.id} post={post} currentUser={user ? { id: user.id, first_name: user.first_name, last_name: user.last_name } : null} />
                    ))
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
