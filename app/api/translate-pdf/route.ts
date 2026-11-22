import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function fetchFast(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return await res.text();
  } catch {
    return '';
  }
}

async function runDailySync() {
  const [newsRes, arxivRes] = await Promise.all([
    fetchFast('https://news.google.com/rss/search?q=military+AI+OR+defense+AI&hl=en-US&gl=US&ceid=US:en'),
    fetchFast('https://export.arxiv.org/api/query?search_query=all:military+OR+all:swarm&sortBy=submittedDate&max_results=2')
  ]);

  const prompt = `
국방 AI 브리핑 JSON 배열(총 3개: NEWS 1개, PAPER 1개, GLOSSARY 1개)만 짧게 출력하세요.
형식: [{"item_type":"NEWS"|"PAPER"|"GLOSSARY","category":"분류","org":"기관","title":"한글제목","oneliner":"1줄요약","body":["핵심요약 2문장","시사점 1문장"],"source":"출처"}]
[News] ${newsRes.slice(0, 800)}
[arXiv] ${arxivRes.slice(0, 800)}
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0.2 }
  });

  const rawText = (response.text || '[]').replace(/```json|```/g, '').trim();
  const items = JSON.parse(rawText);

  if (Array.isArray(items) && items.length > 0) {
    const { error } = await supabase.from('daily_items').insert(items);
    if (error) throw new Error(error.message);
  }

  return items.length;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const count = await runDailySync();
    return NextResponse.json({ status: 'ok', inserted: count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const count = await runDailySync();
    return NextResponse.json({ status: 'ok', inserted: count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
