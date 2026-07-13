'use client';

import { useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProfileView from '@/components/ProfileView';
import MobileBottomNav from '@/components/MobileBottomNav';
import SideDrawer from '@/components/SideDrawer';

export default function ProfilePage() {
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  if (!user) return null;
  return (
    <ProtectedRoute>
      <ProfileView userId={user.id} />
      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <MobileBottomNav />
    </ProtectedRoute>
  );
}
