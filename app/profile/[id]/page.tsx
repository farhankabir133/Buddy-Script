'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProfileView from '@/components/ProfileView';
import MobileBottomNav from '@/components/MobileBottomNav';
import SideDrawer from '@/components/SideDrawer';

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [drawerOpen, setDrawerOpen] = useState(false);
  if (!id) return null;
  return (
    <ProtectedRoute>
      <ProfileView userId={id} />
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <MobileBottomNav />
    </ProtectedRoute>
  );
}
