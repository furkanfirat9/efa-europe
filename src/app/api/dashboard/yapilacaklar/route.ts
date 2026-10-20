import { NextResponse } from 'next/server';
import { loadTodos } from '@/lib/dashboard/todos';

export const dynamic = 'force-dynamic';

/** Dashboard "Yapılacaklar" kartı (src/lib/dashboard/todos.ts). Yalnız okur. */
export async function GET() {
  try {
    return NextResponse.json({ success: true, items: await loadTodos() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Yapılacaklar alınamadı.';
    return NextResponse.json({ success: false, error_message: message }, { status: 500 });
  }
}
