'use client';

import Avatar from './Avatar';

type CommentComposerProps = {
  postId: string;
  draft: string;
  currentUser: { first_name: string | null; last_name: string | null } | null;
  onDraftChange: (postId: string, value: string) => void;
  onSubmit: (postId: string) => void;
};

export default function CommentComposer({
  postId,
  draft,
  currentUser,
  onDraftChange,
  onSubmit,
}: CommentComposerProps) {
  return (
    <div className="_feed_inner_timeline_cooment_area">
      <div className="_feed_inner_comment_box">
        <div className="_feed_inner_comment_box_content">
          <div className="_feed_inner_comment_box_content_image">
            <Avatar
              size="sm"
              src={null}
              firstName={currentUser?.first_name ?? null}
              lastName={currentUser?.last_name ?? null}
            />
          </div>
          <div className="_feed_inner_comment_box_content_txt">
            <textarea
              id={`comment-${postId}`}
              className="form-control _comment_textarea"
              placeholder="Write a comment"
              value={draft}
              onFocus={() => {
                // parent will load comments
              }}
              onChange={(e) => onDraftChange(postId, e.target.value)}
            />
          </div>
        </div>
        <div className="_feed_inner_comment_box_icon">
          <button
            type="button"
            className="_feed_inner_comment_box_icon_btn"
            onClick={() => onSubmit(postId)}
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
