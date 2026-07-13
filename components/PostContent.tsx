'use client';

type PostContentProps = {
  content: string;
  image_url: string | null;
};

export default function PostContent({ content, image_url }: PostContentProps) {
  return (
    <>
      <h4 className="_feed_inner_timeline_post_title">{content}</h4>
      {image_url && (
        <div className="_feed_inner_timeline_image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image_url} alt="" className="_time_img" />
        </div>
      )}
    </>
  );
}
