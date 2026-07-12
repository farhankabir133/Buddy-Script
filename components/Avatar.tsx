'use client';

import { useState } from 'react';

type Size = 'sm' | 'md' | 'lg' | 'xl';

type AvatarProps = {
  src?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size?: Size;
  className?: string;
  alt?: string;
};

// Deterministic, pleasant avatar background colors (FB/LinkedIn-style). The
// same name always maps to the same hue so fallback avatars are stable.
const PALETTE = [
  '#1877f2', // FB blue
  '#e1306c', // pink/red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#0ea5e9', // sky
  '#ef4444', // red
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1', // indigo
];

function colorForName(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initialsFor(first?: string | null, last?: string | null): string {
  const f = (first || '').trim();
  const l = (last || '').trim();
  const firstInitial = f ? f[0] : '';
  const lastInitial = l ? l[0] : '';
  const fallback = !firstInitial && !lastInitial ? '?' : '';
  return (firstInitial + lastInitial + fallback).toUpperCase() || '?';
}

const SIZE_PX: Record<Size, number> = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 144,
};

export default function Avatar({
  src,
  firstName,
  lastName,
  size = 'md',
  className = '',
  alt,
}: AvatarProps) {
  const [errored, setErrored] = useState(false);
  const dimension = SIZE_PX[size];
  const showImage = !!src && !errored;
  const name = `${firstName || ''} ${lastName || ''}`.trim() || 'User';
  const initials = initialsFor(firstName, lastName);
  const bg = colorForName(name);
  const fontPx = Math.round(dimension * (size === 'xl' ? 0.4 : 0.42));

  return (
    <span
      className={`_avatar _avatar_${size} ${className}`}
      style={{
        width: dimension,
        height: dimension,
        background: showImage ? 'transparent' : bg,
        fontSize: fontPx,
      }}
      aria-label={alt || name}
      role="img"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt={alt || name}
          className="_avatar_img"
          onError={() => setErrored(true)}
        />
      ) : (
        <span className="_avatar_initials">{initials}</span>
      )}
    </span>
  );
}
