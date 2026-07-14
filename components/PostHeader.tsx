'use client';

import Link from 'next/link';
import Avatar from './Avatar';
import { Lock, Globe } from 'lucide-react';

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

type PostHeaderProps = {
  post: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    created_at: string;
    is_private: boolean;
  };
  currentUser: { id: string; first_name: string | null; last_name: string | null } | null;
};

export default function PostHeader({ post, currentUser }: PostHeaderProps) {
  const author =
    currentUser && post.user_id === currentUser.id
      ? 'You'
      : formatName(post.first_name, post.last_name);
  const authorName = formatName(post.first_name, post.last_name);

  return (
    <div className="_feed_inner_timeline_post_top">
      <div className="_feed_inner_timeline_post_box">
        <div className="_feed_inner_timeline_post_box_image">
          <Link href={`/profile/${post.user_id}`} aria-label={authorName}>
            <Avatar
              size="md"
              src={post.avatar_url}
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
              {post.is_private ? <Lock size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} /> : <Globe size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />}
              {post.is_private ? 'Private' : 'Public'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
