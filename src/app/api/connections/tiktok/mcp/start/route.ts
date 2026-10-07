import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { publicOrigin } from '@/lib/public-origin';
import { requireWriter, getSession } from '@/lib/session';
import { registerClient, newPkce, mcpAuthUrl } from '@/lib/ads/tiktok-mcp';

export const runtime = 'nodejs';

/** Kết nối TikTok qua MCP Server — không cần app nhà phát triển. */
export async function GET(req: Request) {
  await requireWriter();
  // Địa chỉ CÔNG KHAI — TikTok so khớp redirect_uri từng ký tự ở bước đổi mã.
  const redirectUri = `${publicOrigin(req)}/api/connections/tiktok/mcp/callback`;
  try {
    const clientId = await registerClient(redirectUri);
    const { verifier, challenge } = newPkce();
    const state = randomBytes(18).toString('base64url');
    const session = await getSession();
    session.tiktokMcp = { verifier, clientId, redirectUri, state };
    await session.save();
    return NextResponse.redirect(mcpAuthUrl(clientId, redirectUri, challenge, state));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Không bắt đầu được kết nối TikTok' }, { status: 502 });
  }
}
