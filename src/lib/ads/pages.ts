// Page Facebook và bài viết trên Page.
//
// Bài viết KHÔNG đọc được bằng token người dùng — mỗi Page có token riêng, lấy
// kèm khi liệt kê /me/accounts. Đây là chỗ hay sai nhất: gọi
// /<page_id>/published_posts bằng user token thì Facebook trả mảng rỗng chứ
// không báo lỗi, rất giống "Page không có bài nào".

import { db } from '../db';

const GRAPH = 'https://graph.facebook.com';
const VERSION = process.env.FB_API_VERSION || 'v23.0';
const TIMEOUT_MS = 20_000;

function key(): string {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error('Thiếu ENCRYPTION_KEY');
  return k;
}

export interface FbPage {
  pageId: string;
  name: string;
  token?: string;
}

/**
 * Liệt kê Page người dùng quản lý, kèm token của từng Page.
 *
 * Trả mảng rỗng khi thiếu scope pages_show_list — nơi gọi phải phân biệt
 * "không có Page" với "không được cấp quyền đọc Page".
 */
export async function fetchPages(userToken: string): Promise<FbPage[]> {
  const out: FbPage[] = [];
  let url: string | null =
    `${GRAPH}/${VERSION}/me/accounts?fields=id,name,access_token&limit=100`;

  // Người dùng có thể quản lý hàng trăm Page — phải đi hết phân trang.
  while (url && out.length < 500) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${userToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id: string; name: string; access_token?: string }[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(json.error?.message ?? `Facebook trả HTTP ${res.status}`);

    for (const p of json.data ?? []) {
      out.push({ pageId: p.id, name: p.name, token: p.access_token });
    }
    url = json.paging?.next ?? null;
  }
  return out;
}

/** Lưu Page vào database, token mã hoá. Giữ token cũ nếu lần này không có. */
export async function savePages(ownerId: string, pages: FbPage[]): Promise<number> {
  let n = 0;
  for (const p of pages) {
    await db.query(
      `INSERT INTO fb_page (owner_id, page_id, name, encrypted_token)
       VALUES ($1,$2,$3, CASE WHEN $4::text IS NULL THEN NULL
                              ELSE pgp_sym_encrypt($4, $5) END)
       ON CONFLICT (owner_id, page_id) DO UPDATE SET
         name = EXCLUDED.name,
         encrypted_token = COALESCE(EXCLUDED.encrypted_token, fb_page.encrypted_token),
         updated_at = NOW()`,
      [ownerId, p.pageId, p.name, p.token ?? null, key()],
    );
    n++;
  }
  return n;
}

export async function listPages(ownerId: string): Promise<{ pageId: string; name: string; hasToken: boolean }[]> {
  const { rows } = await db.query(
    `SELECT page_id, name, encrypted_token IS NOT NULL AS has_token
     FROM fb_page WHERE owner_id = $1 ORDER BY name`,
    [ownerId],
  );
  return rows.map((r) => ({ pageId: r.page_id, name: r.name, hasToken: r.has_token }));
}

export async function readPageToken(ownerId: string, pageId: string): Promise<string | null> {
  try {
    const { rows } = await db.query(
      `SELECT pgp_sym_decrypt(encrypted_token, $3) AS token
       FROM fb_page
       WHERE owner_id = $1 AND page_id = $2 AND encrypted_token IS NOT NULL`,
      [ownerId, pageId, key()],
    );
    return rows[0]?.token ?? null;
  } catch (e) {
    console.error('[pages] không giải mã được page token:', e instanceof Error ? e.message : e);
    return null;
  }
}

export interface FbPost {
  /** Dạng '<page_id>_<post_id>' — dùng thẳng làm object_story_id. */
  id: string;
  message: string;
  createdTime: string;
  permalink: string | null;
}

/** Bài đã đăng, mới nhất trước. Chỉ một trang kết quả — cron chạy liên tục nên không cần lùi xa. */
export async function fetchRecentPosts(pageToken: string, pageId: string, limit = 25): Promise<FbPost[]> {
  const url = `${GRAPH}/${VERSION}/${pageId}/published_posts`
    + `?fields=id,message,created_time,permalink_url&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${pageToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { id: string; message?: string; created_time: string; permalink_url?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `Facebook trả HTTP ${res.status}`);

  return (json.data ?? []).map((p) => ({
    id: p.id,
    message: p.message ?? '',
    createdTime: p.created_time,
    permalink: p.permalink_url ?? null,
  }));
}
