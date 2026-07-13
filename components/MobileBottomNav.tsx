'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, User } from 'lucide-react';

const items = [
  { href: '/feed', label: 'Home', icon: Home },
  { href: '/profile', label: 'Profile', icon: User },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="_mobile_bottom_nav" aria-label="Mobile navigation">
      <div className="_mobile_bottom_nav_inner">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/feed' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`_mobile_nav_item ${isActive ? '_mobile_nav_item_active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
