// Mẫu quảng cáo: nhắm đối tượng + ngân sách dùng chung.
//
// Cả hai đường tạo quảng cáo (bấm tay ở /dang-quang-cao và cấu hình Tự động
// chạy ads) đều đọc từ đây. Trước đây mỗi đường tự khai và chúng trôi xa nhau.

import { db } from '../db';
import type { Interest, GeoLocation, Placements, TargetingSpec } from '../ads/targeting';

export interface AdTemplate {
  id: string;
  name: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  dailyBudgetMicros: number;
  /** Quy ước Facebook: 1=nam, 2=nữ. Rỗng = mọi giới. */
  genders: number[];
  interests: Interest[];
  /** Tỉnh/thành. Không rỗng thì THAY THẾ countries. */
  locations: GeoLocation[];
  placements: Placements;
  advantageAudience: boolean;
  createdAt: string;
}

/** Đổi mẫu thành khối targeting để gửi lên Facebook. */
export function templateToTargeting(t: AdTemplate): TargetingSpec {
  return {
    countries: t.countries,
    locations: t.locations,
    ageMin: t.ageMin,
    ageMax: t.ageMax,
    genders: t.genders,
    interests: t.interests,
    placements: t.placements,
    advantageAudience: t.advantageAudience,
  };
}

function toTemplate(r: Record<string, unknown>): AdTemplate {
  return {
    id: r.id as string,
    name: r.name as string,
    countries: r.countries as string[],
    ageMin: Number(r.age_min),
    ageMax: Number(r.age_max),
    dailyBudgetMicros: Number(r.daily_budget_micros),
    genders: (r.genders as number[] | null) ?? [],
    interests: (r.interests as Interest[] | null) ?? [],
    locations: (r.locations as GeoLocation[] | null) ?? [],
    placements: (r.placements as Placements | null) ?? { automatic: true },
    advantageAudience: r.advantage_audience === true,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function listTemplates(ownerId: string): Promise<AdTemplate[]> {
  const { rows } = await db.query(
    `SELECT id, name, countries, age_min, age_max, daily_budget_micros, genders, interests, locations, placements, advantage_audience, created_at
     FROM ad_template WHERE owner_id = $1 ORDER BY name`,
    [ownerId],
  );
  return rows.map(toTemplate);
}

/** Null nếu không tồn tại hoặc không thuộc người gọi. */
export async function getTemplate(ownerId: string, id: string): Promise<AdTemplate | null> {
  const { rows } = await db.query(
    `SELECT id, name, countries, age_min, age_max, daily_budget_micros, genders, interests, locations, placements, advantage_audience, created_at
     FROM ad_template WHERE id = $2 AND owner_id = $1`,
    [ownerId, id],
  );
  return rows[0] ? toTemplate(rows[0]) : null;
}

export interface TemplateInput {
  name: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  dailyBudgetMicros: number;
  genders: number[];
  interests: Interest[];
  locations: GeoLocation[];
  placements: Placements;
  advantageAudience: boolean;
}

export async function createTemplate(ownerId: string, input: TemplateInput): Promise<string> {
  const { rows } = await db.query(
    `INSERT INTO ad_template
       (owner_id, name, countries, age_min, age_max, daily_budget_micros,
        genders, interests, locations, placements, advantage_audience)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11) RETURNING id`,
    [ownerId, input.name, input.countries, input.ageMin, input.ageMax, input.dailyBudgetMicros,
     input.genders, JSON.stringify(input.interests), JSON.stringify(input.locations),
     JSON.stringify(input.placements), input.advantageAudience],
  );
  return rows[0].id as string;
}

export async function updateTemplate(
  ownerId: string, id: string, input: TemplateInput,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE ad_template
     SET name=$3, countries=$4, age_min=$5, age_max=$6, daily_budget_micros=$7,
         genders=$8, interests=$9::jsonb, locations=$10::jsonb, placements=$11::jsonb,
         advantage_audience=$12, updated_at=NOW()
     WHERE id=$2 AND owner_id=$1`,
    [ownerId, id, input.name, input.countries, input.ageMin, input.ageMax, input.dailyBudgetMicros,
     input.genders, JSON.stringify(input.interests), JSON.stringify(input.locations),
     JSON.stringify(input.placements), input.advantageAudience],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Xoá mẫu.
 *
 * Cấu hình đang trỏ vào mẫu này sẽ tự quay về tham số khai sẵn trong params của
 * chính nó — post-trigger.ts xử lý trường hợp mẫu biến mất. Vì vậy xoá không
 * làm cấu hình nào chết, chỉ đổi hành vi, nên nơi gọi phải cảnh báo.
 */
export async function deleteTemplate(ownerId: string, id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'DELETE FROM ad_template WHERE id = $2 AND owner_id = $1', [ownerId, id],
  );
  return (rowCount ?? 0) > 0;
}

/** Số cấu hình Tự động chạy ads đang dùng mẫu này — để cảnh báo trước khi xoá. */
export async function templateUsage(ownerId: string, id: string): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int n FROM automation_config
     WHERE owner_id = $1 AND kind = 'post_trigger' AND params->>'templateId' = $2`,
    [ownerId, id],
  );
  return rows[0]?.n ?? 0;
}
