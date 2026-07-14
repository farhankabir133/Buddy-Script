'use client';

import { useEffect, useState } from 'react';

type PostContentProps = {
  content: string;
  image_url?: string | null;
  image_urls?: string[] | null;
};

// Show up to this many thumbnails inline; the rest collapse behind a "+N"
// overlay on the last visible tile.
const VISIBLE_LIMIT = 4;

function buildGallery(image_url?: string | null, image_urls?: string[] | null): string[] {
  if (Array.isArray(image_urls) && image_urls.length > 0) return image_urls;
  if (image_url) return [image_url];
  return [];
}

function Lightbox({ images, index, onClose }: { images: string[]; index: number; onClose: () => void }) {
  const [current, setCurrent] = useState(index);

  useEffect(() => {
    setCurrent(index);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setCurrent((c) => (c + 1) % images.length);
      if (e.key === 'ArrowLeft') setCurrent((c) => (c - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [images.length, onClose]);

  const go = (dir: number) => setCurrent((c) => (c + dir + images.length) % images.length);

  return (
    <div className="_post_lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button type="button" className="_post_lightbox_close" aria-label="Close" onClick={onClose}>
        ✕
      </button>
      {images.length > 1 && (
        <button type="button" className="_post_lightbox_nav _post_lightbox_prev" aria-label="Previous" onClick={(e) => { e.stopPropagation(); go(-1); }}>
          ‹
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[current]}
        alt={`Image ${current + 1} of ${images.length}`}
        className="_post_lightbox_img"
        onClick={(e) => e.stopPropagation()}
      />
      {images.length > 1 && (
        <button type="button" className="_post_lightbox_nav _post_lightbox_next" aria-label="Next" onClick={(e) => { e.stopPropagation(); go(1); }}>
          ›
        </button>
      )}
      {images.length > 1 && (
        <div className="_post_lightbox_count">
          {current + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

export default function PostContent({ content, image_url, image_urls }: PostContentProps) {
  const gallery = buildGallery(image_url, image_urls);
  const [lightbox, setLightbox] = useState<number | null>(null);

  return (
    <>
      <h4 className="_feed_inner_timeline_post_title">{content}</h4>
      {gallery.length > 0 && (
        <div className="_post_media">
          <div className={`_post_media_grid _count_${Math.min(gallery.length, VISIBLE_LIMIT)}`}>
            {gallery.slice(0, VISIBLE_LIMIT).map((src, i) => {
              const isLast = i === Math.min(gallery.length, VISIBLE_LIMIT) - 1;
              const overflow = gallery.length - VISIBLE_LIMIT;
              return (
                <button
                  type="button"
                  key={src + i}
                  className="_post_media_tile"
                  onClick={() => setLightbox(i)}
                  aria-label={`View image ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="_post_media_img" loading="lazy" />
                  {isLast && overflow > 0 && (
                    <span className="_post_media_more">+{overflow}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {lightbox !== null && (
        <Lightbox images={gallery} index={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  );
}
