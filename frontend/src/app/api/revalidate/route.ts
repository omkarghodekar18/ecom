// On-demand revalidation webhook (spec Sections 7/13.9): the backend's
// `web.revalidate` worker POSTs { secret, tags } here after every admin/import
// write; each tag maps straight onto revalidateTag so ISR pages (category,
// product, cms, home, navigation) refresh immediately.
import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_TAGS = 100;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ revalidated: false, message: 'not configured' }, { status: 500 });
  }
  let body: { secret?: unknown; tags?: unknown };
  try {
    body = (await request.json()) as { secret?: unknown; tags?: unknown };
  } catch {
    return NextResponse.json({ revalidated: false, message: 'invalid JSON' }, { status: 400 });
  }
  if (typeof body.secret !== 'string' || body.secret !== secret) {
    return NextResponse.json({ revalidated: false, message: 'unauthorized' }, { status: 401 });
  }
  if (
    !Array.isArray(body.tags) ||
    body.tags.length === 0 ||
    body.tags.length > MAX_TAGS ||
    !body.tags.every((tag): tag is string => typeof tag === 'string' && tag.length > 0 && tag.length < 200)
  ) {
    return NextResponse.json({ revalidated: false, message: 'invalid tags' }, { status: 400 });
  }
  // Next 16 requires a cacheLife profile; 'max' expires the entry fully so
  // the ISR page regenerates on the next request.
  for (const tag of body.tags) {
    revalidateTag(tag, 'max');
  }
  return NextResponse.json({ revalidated: true, tags: body.tags });
}
