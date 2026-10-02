import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/session';
import { readPageToken, fetchRecentPosts, fetchPostsDetailed } from '@/lib/ads/pages';
import { assessPosts } from '@/lib/ads/post-fitness';

export const runtime = 'nodejs';

/**
 * Bài viết gần nhất của một Page, để người dùng chọn bài cần đẩy.
 *
 * readPageToken đã kèm điều kiện owner_id nên Page không thuộc người gọi sẽ
 * không có token và dừng ngay tại đây.
 */
export async function GET(req: Request, ctx: { params: Promise<{ pageId: string }> }) {
  const user = await requireUser();
  const { pageId } = await ctx.params;
  // ?fitness=1 lấy thêm đánh giá mức phù hợp với từng mục tiêu. Mặc định không
  // lấy vì tốn hơn hẳn, mà luồng chỉ chọn bài thì không cần.
  const withFitness = new URL(req.url).searchParams.get('fitness') === '1';

  const token = await readPageToken(user.id, pageId);
  if (!token) {
    return NextResponse.json(
      { error: 'Không có token của Page này. Vào Kết nối bấm Nạp lại danh sách Page.' },
      { status: 404 },
    );
  }

  try {
    if (withFitness) {
      const detailed = await fetchPostsDetailed(token, pageId, 25);
      const { posts, medianEngagement, note } = assessPosts(detailed);
      return NextResponse.json({ posts, medianEngagement, note });
    }
    const posts = await fetchRecentPosts(token, pageId, 25);
    return NextResponse.json({ posts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Không đọc được bài viết' }, { status: 502 },
    );
  }
}
