import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, requireWriter } from '@/lib/session';
import { listTemplates, createTemplate } from '@/lib/queries/templates';

export const runtime = 'nodejs';

export const TemplateBody = z.object({
  name: z.string().min(1).max(80),
  countries: z.array(z.string().length(2)).min(1).max(30),
  ageMin: z.number().int().min(13).max(65),
  ageMax: z.number().int().min(13).max(65),
  dailyBudgetMicros: z.number().int().positive(),
  // Quy ước Facebook: 1=nam, 2=nữ. Mảng rỗng = mọi giới. Chỉ nhận 0 hoặc 1
  // phần tử — chọn cả hai giới chính là để rỗng.
  genders: z.array(z.union([z.literal(1), z.literal(2)])).max(1).default([]),
  interests: z.array(z.object({ id: z.string(), name: z.string() })).max(50).default([]),
  locations: z.array(z.object({
    type: z.enum(['city', 'region']), key: z.string(), name: z.string(),
  })).max(50).default([]),
  placements: z.object({
    automatic: z.boolean(),
    publisherPlatforms: z.array(z.string()).optional(),
    facebookPositions: z.array(z.string()).optional(),
    instagramPositions: z.array(z.string()).optional(),
  }).default({ automatic: true }),
  advantageAudience: z.boolean().default(false),
}).refine((t) => t.ageMax >= t.ageMin, 'Tuổi tối đa phải lớn hơn hoặc bằng tuổi tối thiểu')
  // Tự chọn vị trí mà không tick nền tảng nào = quảng cáo không hiển thị ở đâu.
  .refine((t) => t.placements.automatic || (t.placements.publisherPlatforms?.length ?? 0) > 0,
    'Tự chọn vị trí thì phải chọn ít nhất một nền tảng');

export async function GET() {
  const user = await requireUser();
  return NextResponse.json({ templates: await listTemplates(user.id) });
}

export async function POST(req: Request) {
  const user = await requireWriter();
  const parsed = TemplateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' }, { status: 400 },
    );
  }
  try {
    const id = await createTemplate(user.id, parsed.data);
    return NextResponse.json({ id });
  } catch (e) {
    const msg = e instanceof Error && e.message.includes('duplicate key')
      ? 'Đã có mẫu cùng tên' : 'Không tạo được mẫu';
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
