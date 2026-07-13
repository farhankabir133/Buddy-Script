'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, User, Bookmark, Settings, X } from 'lucide-react';

const shortcuts = [
  { href: '/feed', label: 'Feed', icon: Home },
  { href: '/profile', label: 'Your Profile', icon: User },
  { href: '#0', label: 'Bookmarks', icon: Bookmark },
  { href: '#0', label: 'Settings', icon: Settings },
];

export default function SideDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <div
        className={`_drawer_overlay ${open ? '_drawer_overlay_open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`_drawer ${open ? '_drawer_open' : ''}`} aria-label="Sidebar menu">
        <div className="_drawer_header">
          <img src="/assets/images/logo.svg" alt="Buddy Script" style={{ height: 28 }} />
          <button type="button" className="_drawer_close" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <div className="_drawer_section">
          <p className="_drawer_section_title">Menu</p>
          {shortcuts.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/feed' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`_drawer_link ${isActive ? '_drawer_link_active' : ''}`}
                onClick={onClose}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </aside>
    </>
  );
}
