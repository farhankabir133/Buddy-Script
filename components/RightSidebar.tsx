'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TrendingUp, Users, UserPlus } from 'lucide-react';

const trending = [
  { tag: '#NextJS', posts: '12.5K posts' },
  { tag: '#React', posts: '8.2K posts' },
  { tag: '#TypeScript', posts: '6.1K posts' },
  { tag: '#WebDev', posts: '4.8K posts' },
];

const suggested = [
  { id: '1', name: 'Sarah Chen', handle: '@sarahc', avatar: null },
  { id: '2', name: 'Alex Rivera', handle: '@arivera', avatar: null },
  { id: '3', name: 'Jordan Smith', handle: '@jsmith', avatar: null },
];

const activeFriends = [
  { id: '1', name: 'Emma Wilson', status: 'online' },
  { id: '2', name: 'Liam Johnson', status: 'online' },
  { id: '4', name: 'Olivia Brown', status: 'away' },
];

export default function RightSidebar() {
  const [following, setFollowing] = useState<Set<string>>(new Set());

  const toggleFollow = (id: string) => {
    setFollowing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside className="_layout_right_sidebar_wrap" aria-label="Right sidebar">
      {/* Trending */}
      <div className="_b_radious6 _feed_inner_area _mar_b16 _padd_r24 _padd_l24 _padd_t24">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <TrendingUp size={18} color="var(--color5)" />
          <h3 className="_title5" style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Trending</h3>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {trending.map((item) => (
            <li key={item.tag} style={{ padding: '10px 0', borderBottom: '1px solid #eef1f5' }}>
              <Link href={`/feed?trend=${encodeURIComponent(item.tag)}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color5)' }}>
                  {item.tag}
                </p>
                <p style={{ margin: 2, fontSize: 'var(--text-xs)', color: 'var(--color3)' }}>{item.posts}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Suggested */}
      <div className="_b_radious6 _feed_inner_area _mar_b16 _padd_r24 _padd_l24 _padd_t24">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Users size={18} color="var(--color5)" />
          <h3 className="_title5" style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Who to follow</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {suggested.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: '#eef4fb',
                  color: 'var(--color5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'var(--font-weight-bold)',
                  fontSize: 'var(--text-sm)',
                  flex: '0 0 auto',
                }}
              >
                {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color1)' }}>
                  {u.name}
                </p>
                <p style={{ margin: 2, fontSize: 'var(--text-xs)', color: 'var(--color3)' }}>{u.handle}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleFollow(u.id)}
                style={{
                  border: 0,
                  background: following.has(u.id) ? '#e4e6eb' : 'var(--color5)',
                  color: following.has(u.id) ? 'var(--color1)' : '#fff',
                  fontWeight: 'var(--font-weight-semibold)',
                  fontSize: 'var(--text-xs)',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  flex: '0 0 auto',
                }}
              >
                {following.has(u.id) ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Active friends */}
      <div className="_b_radious6 _feed_inner_area _mar_b16 _padd_r24 _padd_l24 _padd_t24">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <UserPlus size={18} color="var(--color5)" />
          <h3 className="_title5" style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Active friends</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeFriends.map((u) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative', flex: '0 0 auto' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#eef4fb',
                    color: 'var(--color5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'var(--font-weight-bold)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    bottom: 1,
                    right: 1,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: u.status === 'online' ? '#22c55e' : '#f59e0b',
                    border: '2px solid #fff',
                  }}
                />
              </div>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--color1)' }}>
                {u.name}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
