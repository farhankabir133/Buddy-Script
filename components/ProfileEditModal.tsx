'use client';

import { useCallback, useRef, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import Avatar from './Avatar';

type Profile = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  cover_url?: string | null;
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
};

type ProfileEditModalProps = {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  onSaved?: (user: {
    id?: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    cover_url: string | null;
    headline: string | null;
    bio: string | null;
    location: string | null;
  }) => void;
};

function compressImageFile(file: File): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280;
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
              resolve(new File([blob], jpgName, { type: 'image/jpeg', lastModified: Date.now() }));
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

export default function ProfileEditModal({ open, onClose, profile, onSaved }: ProfileEditModalProps) {
  const { user, updateUser } = useAuth();
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [location, setLocation] = useState(profile.location ?? '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(profile.cover_url ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string) => setToast({ message, key: Date.now() }), []);
  const hideToast = useCallback(() => setToast(null), []);

  if (!open) return null;

  const upload = async (file: File, kind: 'avatar' | 'cover'): Promise<string> => {
    const optimized = await compressImageFile(file);
    const formData = new FormData();
    formData.append('file', optimized);
    formData.append('bucket', 'avatars');
    formData.append('kind', kind);
    const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: formData });
    if (!res.ok) {
      let message = 'Upload failed';
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    const data = await res.json();
    return data.url as string;
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    try {
      const url = await upload(file, 'avatar');
      setAvatarPreview(url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not upload avatar');
    }
  };

  const handleCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    try {
      const url = await upload(file, 'cover');
      setCoverPreview(url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not upload cover');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          first_name: firstName.trim() || undefined,
          last_name: lastName.trim() || undefined,
          avatar_url: avatarPreview ?? undefined,
          cover_url: coverPreview ?? undefined,
          headline: headline.trim() || undefined,
          bio: bio.trim() || undefined,
          location: location.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not save profile');
      }
      const data = await res.json();
      updateUser({
        first_name: data.user.first_name,
        last_name: data.user.last_name,
        avatar_url: data.user.avatar_url,
        cover_url: data.user.cover_url,
        headline: data.user.headline,
        bio: data.user.bio,
        location: data.user.location,
      });
      onSaved?.({
        id: data.user.id,
        first_name: data.user.first_name,
        last_name: data.user.last_name,
        avatar_url: data.user.avatar_url,
        cover_url: data.user.cover_url,
        headline: data.user.headline,
        bio: data.user.bio,
        location: data.user.location,
      });
      showToast('Profile updated');
      setTimeout(onClose, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="_modal_overlay" role="dialog" aria-modal="true" aria-label="Edit profile">
      <div className="_modal _profile_edit_modal">
        <div className="_modal_header">
          <h3 className="_modal_title">Edit Profile</h3>
          <button type="button" className="_modal_close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="_profile_edit_cover_preview">
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPreview} alt="Cover preview" className="_profile_edit_cover_img" />
          ) : (
            <div className="_profile_edit_cover_placeholder">No cover photo</div>
          )}
          <button type="button" className="_profile_edit_cover_btn" onClick={() => coverInputRef.current?.click()}>
            Change cover
          </button>
          <input ref={coverInputRef} type="file" accept="image/*" className="_hidden_input" onChange={handleCoverChange} />
        </div>

        <div className="_profile_edit_avatar_row">
          <Avatar size="xl" src={avatarPreview} firstName={user?.first_name ?? null} lastName={user?.last_name ?? null} className="_profile_edit_avatar" />
          <button type="button" className="_profile_edit_avatar_btn" onClick={() => avatarInputRef.current?.click()}>
            Change avatar
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="_hidden_input" onChange={handleAvatarChange} />
        </div>

        <div className="_profile_edit_fields">
          <label className="_field_label">
            First name
            <input
              className="form-control"
              maxLength={50}
              placeholder="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </label>
          <label className="_field_label">
            Last name
            <input
              className="form-control"
              maxLength={50}
              placeholder="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </label>
          <label className="_field_label">
            Headline
            <input
              className="form-control"
              maxLength={120}
              placeholder="e.g. Software Engineer at Acme"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
            />
          </label>
          <label className="_field_label">
            Bio
            <textarea
              className="form-control"
              maxLength={500}
              rows={3}
              placeholder="Tell people a little about yourself"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </label>
          <label className="_field_label">
            Location
            <input
              className="form-control"
              maxLength={120}
              placeholder="e.g. San Francisco, CA"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
        </div>

        {error && <p className="_field_error">{error}</p>}

        <div className="_modal_footer">
          <button type="button" className="_modal_cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="_modal_save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {toast && (
        <div className="_toast" role="alert" key={toast.key} onClick={hideToast}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
