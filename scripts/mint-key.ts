// Tạo API key cho MCP. Key thô CHỈ hiện một lần ở đây — DB chỉ giữ SHA-256.
//
//   npx tsx scripts/mint-key.ts "Claude Code"

import 'dotenv/config';
import { db } from '../src/lib/db';
import { generateKey } from '../src/lib/mcp/auth';

async function main() {
  const name = process.argv[2] ?? 'Claude Code';
  const { rows: [user] } = await db.query<{ id: string }>(
    `SELECT id FROM app_user ORDER BY created_at LIMIT 1`);
  if (!user) throw new Error('Chưa có người dùng nào. Chạy npm run db:seed trước.');

  const { raw, hash, suffix } = generateKey();
  await db.query(
    `INSERT INTO api_key (owner_id, name, key_hash, key_suffix, scopes)
     VALUES ($1, $2, $3, $4, ARRAY['read'])`,
    [user.id, name, hash, suffix],
  );

  console.log(`\nKey "${name}" (scope: read)\n\n  ${raw}\n`);
  console.log('Lưu ngay — không xem lại được. Gắn vào Claude Code:\n');
  console.log(`  claude mcp add ads-os --transport http http://localhost:3100/api/mcp \\`);
  console.log(`    --header "Authorization: Bearer ${raw}"\n`);
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
