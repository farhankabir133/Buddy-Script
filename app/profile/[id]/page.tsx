'use client';

import { useParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProfileView from '@/components/ProfileView';

export default function UserProfilePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id) return null;
  return (
    <ProtectedRoute>
      <ProfileView userId={id} />
    </ProtectedRoute>
  );
}
