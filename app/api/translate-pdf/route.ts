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
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    return await res.text();
  } catch {
    return '';
  }
}

async function generateWithFallback(prompt: string) {
  const models = ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.8-pro'];
  let lastError: any;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.2 }
      });
      if (response.text) return response.text;
    } catch (err: any) {
      lastError = err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

async function runDailySync() {
  const [newsRes, arxivRes] = await Promise.all([
    fetchFast('https://news.google.com/rss/search?q=military+AI+OR+defense+AI&hl=en-US&gl=US&ceid=US:en'),
    fetchFast('https://export.arxiv.org/api/query?search_query=all:military+OR+all:swarm&sortBy=submittedDate&max_results=2')
  ]);

  const prompt = `
국방 AI 전문 에이전트로서 아래 원시 데이터를 바탕으로 한글 브리핑 JSON 배열(총 3개)만 간결하게 출력하세요.
필수 형식:
[{"item_type":"NEWS"|"PAPER"|"GLOSSARY","category":"분류","org":"기관·날짜","title":"한글 제목","oneliner":"1줄 요약","body":["핵심 요약 2~3문장","국방 시사점 1~2문장"],"source":"출처"}]

반드시 NEWS 1개, PAPER 1개, GLOSSARY 1개 총 3개만 빠르게 작성하세요.
[News] ${newsRes.slice(0, 1500)}
[arXiv] ${arxivRes.slice(0, 1500)}
`;

  const text = await generateWithFallback(prompt);
  const rawText = text.replace(/```json|```/g, '').trim();
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
