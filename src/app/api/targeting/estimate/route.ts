// Ước tính số người tiếp cận được, hiện ngay dưới phần nhắm đối tượng.
//
// Không chỉ để cho đẹp: đây là nơi duy nhất người dùng biết được mình vừa thu
// hẹp xuống còn bao nhiêu người, và cũng là lần kiểm tra targeting đầu tiên —
// endpoint này chỉ đọc nhưng Facebook soi khối targeting y như lúc tạo nhóm
// quảng cáo thật.

import { z } from 'zod';
import { requireUser } from '@/lib/session';
import { readToken } from '@/lib/ads/token';
import { estimateReach } from '@/lib/ads/targeting';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const Body = z.object({
  countries: z.array(z.string().length(2)),
  locations: z.array(z.object({
    type: z.enum(['city', 'region']), key: z.string(), name: z.string(),
  })),
  ageMin: z.number().int().min(13).max(65),
  ageMax: z.number().int().min(13).max(65),
  genders: z.array(z.number().int()).max(1),
  interests: z.array(z.object({ id: z.string(), name: z.string() })),
  placements: z.object({
    automatic: z.boolean(),
    publisherPlatforms: z.array(z.string()).optional(),
    facebookPositions: z.array(z.string()).optional(),
    instagramPositions: z.array(z.string()).optional(),
  }),
  advantageAudience: z.boolean(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 });
  }
  // Ước tính không có quốc gia lẫn tỉnh/thành thì Facebook từ chối — chặn sớm
  // để không đốt một lượt gọi API cho câu trả lời đã biết trước.
  if (parsed.data.countries.length === 0 && parsed.data.locations.length === 0) {
    return Response.json({ error: 'Chưa chọn quốc gia hoặc tỉnh/thành' }, { status: 400 });
  }

  const { rows } = await db.query(
    `SELECT id, external_id FROM ad_account
     WHERE owner_id = $1 AND platform = 'facebook' AND encrypted_token IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`,
    [user.id],
  );
  if (!rows[0]) {
    return Response.json({ error: 'Chưa kết nối tài khoản Facebook nào' }, { status: 400 });
  }
  const token = await readToken(rows[0].id);
  if (!token) return Response.json({ error: 'Không đọc được token' }, { status: 400 });

  try {
    return Response.json(await estimateReach(token, rows[0].external_id, parsed.data));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Lỗi không rõ' }, { status: 502 },
    );
  }
}
