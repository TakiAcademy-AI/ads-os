// Bài viết nào chạy được với mục tiêu nào.
//
// Hàm thuần, không gọi API. Đầu vào là dữ liệu bài viết đã lấy từ Graph API.
//
// ─── VÌ SAO KHÔNG DÙNG is_eligible_for_promotion CỦA FACEBOOK ────────────────
//
// Nghe thì đúng là trường cần dùng, nhưng nó KHÔNG đáng tin. Đã kiểm trên tài
// khoản thật: 0/90 bài qua 6 Page đều trả về false — kể cả ảnh và status chữ,
// không riêng Reel. Quyết định hơn nữa, những bài ĐANG CHẠY trong quảng cáo
// thật ở TAKI 002 và TAKI 001 cũng trả về false.
//
// Nếu chặn theo trường đó thì tính năng này sẽ báo "không có bài nào chạy được"
// cho mọi Page, trong khi người dùng vẫn boost bài bằng tay bình thường. Nên
// cố ý bỏ qua. Đừng thêm lại mà không kiểm lại trên tài khoản thật.
//
// ─── MỨC TIN CẬY CỦA TỪNG LUẬT ───────────────────────────────────────────────
//
// Mỗi luật dưới đây ghi rõ nó dựa vào đâu. Có ba mức:
//   [thực tế]   — suy ra từ tham số Facebook bắt buộc, chắc chắn.
//   [đã gặp]    — đã gặp lỗi thật một lần khi chạy, nhưng mới một ca.
//   [kinh nghiệm] — phỏng đoán theo cách chạy ads, KHÔNG phải luật của Facebook.

import { AD_OBJECTIVES, OBJECTIVE, type AdObjective } from './objectives';

/** Bài viết kèm đủ trường để đánh giá. Khớp với fetchPostsDetailed(). */
export interface PostDetail {
  id: string;
  message: string;
  createdTime: string;
  permalink: string | null;
  /** added_video | added_photos | mobile_status_update | shared_story … */
  statusType: string | null;
  mediaType: string | null;
  /** Link trong attachment, đã bỏ lớp che của Facebook. */
  attachmentUrl: string | null;
  reactions: number;
  comments: number;
  shares: number;
}

export type Verdict = 'good' | 'ok' | 'warn' | 'blocked';

export interface ObjectiveFitness {
  objective: AdObjective;
  verdict: Verdict;
  reason: string;
}

export interface PostFitness {
  /** Tổng tương tác thật — dùng để sắp thứ tự, không phải để chấm điểm. */
  engagement: number;
  /** Phần bình luận trong tổng tương tác. Nhiều người hỏi = ý định nhắn tin. */
  commentShare: number;
  kind: 'reel' | 'video' | 'photo' | 'link' | 'text';
  externalLink: string | null;
  byObjective: Record<AdObjective, ObjectiveFitness>;
}

/** Link trỏ ra ngoài Facebook mới là nơi quảng cáo chuyển đổi có thể đến. */
export function externalLinkOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    // fb.com, facebook.com, m.facebook.com… đều là nội bộ Facebook. Reel và
    // ảnh đều có attachment url trỏ về facebook.com nên phải loại ra.
    if (/(^|\.)(facebook\.com|fb\.com|fb\.watch|instagram\.com)$/.test(h)) return null;
    return url;
  } catch {
    return null;
  }
}

function kindOf(p: PostDetail): PostFitness['kind'] {
  const url = p.attachmentUrl ?? '';
  if (/\/reel\//.test(url)) return 'reel';
  if (p.statusType === 'added_video' || p.mediaType === 'video') return 'video';
  if (externalLinkOf(p.attachmentUrl)) return 'link';
  if (p.statusType === 'added_photos' || p.mediaType === 'photo') return 'photo';
  return 'text';
}

/**
 * Dữ liệu các hàm fit* cần.
 *
 * `median` là mức tương tác điển hình của CHÍNH Page đó. Ngưỡng tuyệt đối kiểu
 * "trên 20 tương tác là tốt" không dùng được: Page của người dùng này mỗi bài
 * chỉ 0–4 tương tác, nên mọi bài đều rơi vào cùng một nhóm và tính năng không
 * nói lên điều gì. So với chính Page thì tự co giãn theo Page to hay nhỏ.
 */
type FitInput = Omit<PostFitness, 'byObjective'> & { comments: number; median: number };

function fitMessages(f: FitInput): ObjectiveFitness {
  // [đã gặp] Chạy thật trên TAKI 002: Reel + đích MESSENGER bị Facebook từ chối
  // ở bước tạo quảng cáo với 100/1487891 "nội dung không tương thích với mục
  // tiêu". Mới một ca nên để mức cảnh báo, không chặn.
  if (f.kind === 'reel') {
    return {
      objective: 'messages', verdict: 'warn',
      reason: 'Reel từng bị Facebook từ chối với đích Messenger (mã 100/1487891). '
        + 'Ảnh hoặc bài chữ an toàn hơn cho mục tiêu này.',
    };
  }
  // [kinh nghiệm] Bài đang có nhiều người vào bình luận hỏi là bài đã tự sinh
  // ra ý định nhắn tin — đổ tiền vào đó thường rẻ hơn bài chỉ có nhiều react.
  if (f.comments >= 2 && f.commentShare >= 0.25) {
    return {
      objective: 'messages', verdict: 'good',
      reason: `${f.comments} bình luận trên ${f.engagement} tương tác — đã có người `
        + 'chủ động hỏi, mục tiêu Tin nhắn thường rẻ hơn ở loại bài này.',
    };
  }
  return {
    objective: 'messages', verdict: 'ok',
    reason: 'Chạy được. Chưa thấy dấu hiệu người xem muốn hỏi nên chưa chắc rẻ.',
  };
}

function fitSales(f: FitInput): ObjectiveFitness {
  // [thực tế] Mục tiêu Chuyển đổi gửi destination_type = WEBSITE. Không có link
  // ra ngoài thì quảng cáo không có nơi nào để đưa người xem tới, và pixel cũng
  // không có trang nào để ghi nhận sự kiện.
  if (!f.externalLink) {
    return {
      objective: 'sales', verdict: 'blocked',
      reason: 'Bài không có link ra ngoài Facebook. Quảng cáo chuyển đổi cần một '
        + 'trang đích để đưa người xem tới và để pixel ghi nhận.',
    };
  }
  return {
    objective: 'sales', verdict: 'good',
    reason: `Có trang đích: ${f.externalLink.slice(0, 60)}`,
  };
}

function fitEngagement(f: FitInput): ObjectiveFitness {
  // [kinh nghiệm] Bài nổi trội so với mức thường của chính Page thì đã tự
  // chứng minh có sức hút — đổ tiền vào đó thường giữ được lợi thế. Đòi gấp
  // đôi mức giữa VÀ ít nhất 3 tương tác để một bài 2 tương tác trên Page chết
  // không bị gọi là "phù hợp".
  if (f.median > 0 && f.engagement >= Math.max(3, f.median * 2)) {
    return {
      objective: 'engagement', verdict: 'good',
      reason: `${f.engagement} tương tác — cao hơn hẳn mức thường của Page này `
        + `(${f.median}). Bài đã tự có sức hút.`,
    };
  }
  if (f.engagement === 0) {
    return {
      objective: 'engagement', verdict: 'warn',
      reason: 'Chưa có tương tác tự nhiên nào. Đổ tiền vào bài không ai phản ứng '
        + 'thường chỉ mua được lượt hiển thị.',
    };
  }
  return {
    objective: 'engagement', verdict: 'ok',
    reason: `${f.engagement} tương tác tự nhiên.`,
  };
}

export function assessPost(p: PostDetail, median = 0): PostFitness {
  const engagement = p.reactions + p.comments + p.shares;
  const base: FitInput = {
    engagement,
    commentShare: engagement > 0 ? p.comments / engagement : 0,
    kind: kindOf(p),
    externalLink: externalLinkOf(p.attachmentUrl),
    comments: p.comments,
    median,
  };

  return {
    engagement: base.engagement,
    commentShare: base.commentShare,
    kind: base.kind,
    externalLink: base.externalLink,
    byObjective: {
      messages: fitMessages(base),
      engagement: fitEngagement(base),
      sales: fitSales(base),
    },
  };
}

/** Mục tiêu phù hợp nhất cho bài này, hoặc null nếu không có cái nào hơn 'ok'. */
export function bestObjective(f: PostFitness): AdObjective | null {
  const good = AD_OBJECTIVES.filter((o) => f.byObjective[o].verdict === 'good');
  if (!good.length) return null;
  // Thứ tự ưu tiên khi nhiều mục tiêu cùng tốt: Chuyển đổi đo được doanh thu,
  // Tin nhắn đo được hội thoại, Tương tác không đo được gì ra tiền.
  for (const o of ['sales', 'messages', 'engagement'] as AdObjective[]) {
    if (good.includes(o)) return o;
  }
  return null;
}

function medianOf(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  // noUncheckedIndexedAccess bật nên phải khai rõ: đã chặn mảng rỗng ở trên.
  const mid = s[m] ?? 0;
  return s.length % 2 ? mid : Math.round(((s[m - 1] ?? 0) + mid) / 2);
}

export interface PageAssessment {
  posts: (PostDetail & { fitness: PostFitness; best: AdObjective | null })[];
  /** Mức tương tác điển hình của Page, để giao diện nói rõ đang so với cái gì. */
  medianEngagement: number;
  /** Lời cảnh báo ở cấp Page, hoặc null. */
  note: string | null;
}

/**
 * Đánh giá cả loạt bài của một Page cùng lúc.
 *
 * Phải xét theo loạt chứ không từng bài rời: mức "cao" chỉ có nghĩa khi so với
 * mức thường của chính Page đó.
 */
export function assessPosts(posts: PostDetail[]): PageAssessment {
  const median = medianOf(posts.map((p) => p.reactions + p.comments + p.shares));

  const out = posts.map((p) => {
    const fitness = assessPost(p, median);
    return { ...p, fitness, best: bestObjective(fitness) };
  });

  // Thà nói thẳng là không xếp hạng được còn hơn đưa ra thứ tự trông như có cơ
  // sở. Page tương tác một chữ số thì chênh lệch giữa các bài là nhiễu.
  let note: string | null = null;
  if (posts.length === 0) {
    note = null;
  } else if (median < 3) {
    note = `Tương tác tự nhiên của Page này rất thấp (mức giữa ${median}/bài). `
      + 'Chênh lệch giữa các bài ở mức này phần lớn là nhiễu, nên thứ tự bên dưới '
      + 'chỉ nên dùng để tham khảo.';
  }
  if (posts.length && posts.every((p) => !externalLinkOf(p.attachmentUrl))) {
    const extra = 'Không bài nào có link ra ngoài Facebook, nên mục tiêu Chuyển đổi '
      + 'không chạy được với bài nào. Muốn chạy Chuyển đổi thì bài phải có link '
      + 'trang đích đã gắn pixel.';
    note = note ? `${note} ${extra}` : extra;
  }

  return { posts: out, medianEngagement: median, note };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  good: 'Phù hợp',
  ok: 'Chạy được',
  warn: 'Cân nhắc',
  blocked: 'Không chạy được',
};

export const OBJECTIVE_LABEL_SHORT: Record<AdObjective, string> =
  Object.fromEntries(
    AD_OBJECTIVES.map((o) => [o, OBJECTIVE[o].label]),
  ) as Record<AdObjective, string>;
