'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import Avatar from './Avatar';
import PostCard, { type PostType } from './PostCard';
import ProfileEditModal from './ProfileEditModal';
import { MapPin, CalendarDays } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

type ProfileData = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
  created_at: string | null;
  post_count: number;
  is_self: boolean;
};

type Tab = 'posts' | 'about' | 'photos';

function formatJoinDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function ProfileView({ userId }: { userId: string }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [posts, setPosts] = useState<PostType[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(true);

  const [tab, setTab] = useState<Tab>('posts');
  const [editOpen, setEditOpen] = useState(false);
  const fetchedProfile = useRef(false);

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, { credentials: 'include' });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setProfile(data.user);
    } finally {
      setProfileLoading(false);
    }
  }, [userId]);

  const loadPosts = useCallback(
    async (pageCursor: string | null = null) => {
      setLoadingPosts(true);
      try {
        const url = `/api/posts?user_id=${encodeURIComponent(userId)}${
          pageCursor ? `&cursor=${encodeURIComponent(pageCursor)}` : ''
        }`;
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const incoming: PostType[] = data.posts ?? [];
        setPosts((prev) => (pageCursor ? [...prev, ...incoming] : incoming));
        setCursor(data.nextCursor ?? null);
      } finally {
        setLoadingPosts(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (fetchedProfile.current) return;
    fetchedProfile.current = true;
    loadProfile();
    loadPosts();
  }, [loadProfile, loadPosts]);

  const name = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Buddy Member' : '...';
  const photoPosts = posts.filter((p) => p.image_url);

  const viewer = user ? { id: user.id, first_name: user.first_name, last_name: user.last_name } : null;

  return (
    <div className="_layout _layout_main_wrapper">
      <div className="_main_layout">
        <nav className="navbar navbar-expand-lg navbar-light _header_nav _padd_t10">
          <div className="container _custom_container">
            <div className="_logo_wrap">
              <a className="navbar-brand" href="/feed">
                <img src="/assets/images/logo.svg" alt="Buddy Script" className="_nav_logo" />
              </a>
            </div>
            <div className="_header_nav_profile">
              <a href="/profile" className="_header_nav_profile_image" aria-label="Your profile">
                <Avatar size="sm" src={user?.avatar_url ?? null} firstName={user?.first_name ?? null} lastName={user?.last_name ?? null} />
              </a>
              <div className="_header_nav_dropdown">
                <p className="_header_nav_para">{user ? `${user.first_name} ${user.last_name}` : 'Guest'}</p>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </nav>

        <div className="container _custom_container">
          <div className="_profile_page">
            {notFound ? (
              <div className="_profile_notfound _b_radious6 _feed_inner_area">
                <h3>Profile not found</h3>
                <p>This account may not exist or is unavailable.</p>
                <a href="/feed" className="_profile_back_btn">Back to feed</a>
              </div>
            ) : profileLoading && !profile ? (
              <div className="_profile_skeleton _b_radious6">
                <div className="_skeleton _profile_skeleton_cover" />
                <div className="_skeleton _profile_skeleton_avatar" />
                <div className="_skeleton _skeleton_line _w40 _profile_skeleton_name" />
              </div>
            ) : profile ? (
              <>
                <div className="_profile_card _b_radious6 _feed_inner_area">
                  <div className="_profile_cover">
                    {profile.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={profile.cover_url} alt="" className="_profile_cover_img" />
                    ) : (
                      <div className="_profile_cover_placeholder" />
                    )}
                    {profile.is_self && (
                      <button
                        type="button"
                        className="_profile_cover_edit"
                        onClick={() => setEditOpen(true)}
                      >
                        Edit cover
                      </button>
                    )}
                  </div>

                  <div className="_profile_identity">
                    <div className="_profile_avatar_wrap">
                      <Avatar size="xl" src={profile.avatar_url} firstName={profile.first_name} lastName={profile.last_name} className="_profile_avatar" />
                    </div>
                    <div className="_profile_identity_txt">
                      <h1 className="_profile_name">{name}</h1>
                      {profile.headline && <p className="_profile_headline">{profile.headline}</p>}
                      <p className="_profile_meta">
                        {profile.location && <span>{profile.location} · </span>}
                        <span>{profile.post_count} post{profile.post_count === 1 ? '' : 's'}</span>
                      </p>
                    </div>
                    <div className="_profile_actions">
                      {profile.is_self ? (
                        <button type="button" className="_profile_edit_btn" onClick={() => setEditOpen(true)}>
                          Edit Profile
                        </button>
                      ) : (
                        <button type="button" className="_profile_addfriend_btn" disabled>
                          Add Friend
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="_profile_tabs">
                    <button
                      type="button"
                      className={`_profile_tab ${tab === 'posts' ? '_profile_tab_active' : ''}`}
                      onClick={() => setTab('posts')}
                    >
                      Posts
                    </button>
                    <button
                      type="button"
                      className={`_profile_tab ${tab === 'about' ? '_profile_tab_active' : ''}`}
                      onClick={() => setTab('about')}
                    >
                      About
                    </button>
                    <button
                      type="button"
                      className={`_profile_tab ${tab === 'photos' ? '_profile_tab_active' : ''}`}
                      onClick={() => setTab('photos')}
                    >
                      Photos
                    </button>
                  </div>
                </div>

                {tab === 'posts' && (
                  <div className="_profile_posts">
                    {loadingPosts && posts.length === 0 ? (
                      Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _mar_b16">
                          <div className="_skeleton _skeleton_block" />
                        </div>
                      ))
                    ) : posts.length === 0 ? (
                      <p className="_feed_inner_timeline_post_title">No posts yet.</p>
                    ) : (
                      posts.map((post) => <PostCard key={post.id} post={post} currentUser={viewer} />)
                    )}
                    {cursor && (
                      <button type="button" className="_feed_inner_text_area_btn_link" onClick={() => loadPosts(cursor)} disabled={loadingPosts}>
                        {loadingPosts ? 'Loading...' : 'Load more'}
                      </button>
                    )}
                  </div>
                )}

                {tab === 'about' && (
                  <div className="_profile_about _b_radious6 _feed_inner_area">
                    <h3 className="_profile_about_title">Intro</h3>
                    {profile.bio && <p className="_profile_about_bio">{profile.bio}</p>}
                    <ul className="_profile_about_list">
                      {profile.location && (
                        <li className="_profile_about_item">
                          <MapPin size={16} color="var(--color3)" />
                          Lives in {profile.location}
                        </li>
                      )}
                      <li className="_profile_about_item">
                        <CalendarDays size={16} color="var(--color3)" />
                        Joined {formatJoinDate(profile.created_at)}
                      </li>
                    </ul>
                    {!profile.bio && !profile.location && (
                      <p className="_profile_about_empty">This member hasn&apos;t added an intro yet.</p>
                    )}
                  </div>
                )}

                {tab === 'photos' && (
                  <div className="_profile_photos _b_radious6 _feed_inner_area">
                    <h3 className="_profile_about_title">Photos</h3>
                    {photoPosts.length === 0 ? (
                      <p className="_profile_about_empty">No photos yet.</p>
                    ) : (
                      <div className="_profile_photos_grid">
                        {photoPosts.map((p) => (
                          <a key={p.id} href={`/feed?post=${p.id}`} className="_profile_photo">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.image_url as string} alt="" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {profile?.is_self && (
        <ProfileEditModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          profile={profile}
          onSaved={(updated) =>
            setProfile((prev) => (prev ? { ...prev, ...updated } : prev))
          }
        />
      )}
    </div>
  );
}
