'use client';

import { useAuth } from '@/app/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProfileView from '@/components/ProfileView';

export default function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <ProtectedRoute>
      <ProfileView userId={user.id} />
    </ProtectedRoute>
  );
}
