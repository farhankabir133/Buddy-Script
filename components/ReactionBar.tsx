'use client';

import { Heart, MessageCircle, Share2 } from 'lucide-react';

type ReactionBarProps = {
  likeCount: number;
  commentCount: number;
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  shareCopied: boolean;
};

export default function ReactionBar({
  likeCount,
  commentCount,
  liked,
  onLike,
  onComment,
  onShare,
  shareCopied,
}: ReactionBarProps) {
  return (
    <>
      <div className="_feed_inner_timeline_total_reacts _padd_r24 _padd_l24 _mar_b26">
        <div className="_feed_inner_timeline_total_reacts_txt">
          <p className="_feed_inner_timeline_total_reacts_para1">
            <span>{likeCount}</span> Like{likeCount === 1 ? '' : 's'}
          </p>
          <p className="_feed_inner_timeline_total_reacts_para2">
            <span>{commentCount}</span> Comment{commentCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="_feed_inner_timeline_reaction">
        <button
          className={`_feed_inner_timeline_reaction_emoji _feed_reaction ${liked ? '_feed_reaction_active' : ''}`}
          onClick={onLike}
          type="button"
        >
          <span className="_feed_inner_timeline_reaction_link">
            <span className="_feed_reaction_icon" aria-hidden="true">
              <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
            </span>
            <span>{liked ? 'Liked' : 'Like'}</span>
          </span>
        </button>
        <button
          className="_feed_inner_timeline_reaction_comment _feed_reaction"
          type="button"
          onClick={onComment}
        >
          <span className="_feed_inner_timeline_reaction_link">
            <span className="_feed_reaction_icon" aria-hidden="true">
              <MessageCircle size={18} />
            </span>
            <span>Comment</span>
          </span>
        </button>
        <button
          className="_feed_inner_timeline_reaction_share _feed_reaction"
          type="button"
          onClick={onShare}
        >
          <span className="_feed_inner_timeline_reaction_link">
            <span className="_feed_reaction_icon" aria-hidden="true">
              <Share2 size={18} />
            </span>
            <span>{shareCopied ? 'Copied!' : 'Share'}</span>
          </span>
        </button>
      </div>
    </>
  );
}
