import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function runDailySync() {
  const [newsRes, arxivRes, openAlexRes] = await Promise.all([
    fetch('https://news.google.com/rss/search?q=military+AI+OR+defense+AI+OR+CJADC2+OR+drone+swarm&hl=en-US&gl=US&ceid=US:en')
      .then(r => r.text())
      .catch(() => ''),
    fetch('http://export.arxiv.org/api/query?search_query=all:military+OR+all:swarm+OR+all:command+and+control&sortBy=submittedDate&max_results=5')
      .then(r => r.text())
      .catch(() => ''),
    fetch('https://api.openalex.org/works?search=military+AI+command+control&sort=publication_date:desc&per-page=5')
      .then(r => r.json())
      .catch(() => ({ results: [] }))
  ]);

  const prompt = `
당신은 국방 AI 및 지휘결심체계(C2) 전문 인텔리전스 에이전트입니다.
아래 수집된 최신 뉴스(Google News RSS), arXiv, OpenAlex 원시 데이터를 바탕으로 한글 브리핑 JSON 배열을 생성하세요.
반드시 순수 JSON 배열만 출력하고, 각 객체는 아래 필드를 정확히 포함해야 합니다:
{
  "item_type": "NEWS" | "PAPER" | "GLOSSARY",
  "category": "분류명 (예: AI 지휘결심체계, 최신 AI 기술, 학술논문, 핵심용어)",
  "org": "기관명 또는 매체명 · 발행일",
  "title": "한글 번역 제목",
  "oneliner": "핵심 1줄 요약",
  "body": ["문단1 (상세 내용)", "문단2 (기술/전술적 맥락)", "문단3 (시사점)"],
  "source": "출처 및 근거 (매체명, 저자, arXiv ID 또는 DOI)"
}

생성 개수:
- NEWS 4개 (수집된 최신 국방·AI 뉴스 한글 완역 및 시사점)
- PAPER 4개 (수집된 arXiv/OpenAlex 논문 초록·방법론·시사점 한글 완역)
- GLOSSARY 4개 (위 기사와 논문에 등장하는 핵심 정책·기술 용어 해설)

[원시 데이터]
News RSS: ${newsRes.slice(0, 6000)}
arXiv: ${arxivRes.slice(0, 6000)}
OpenAlex: ${JSON.stringify(openAlexRes.results?.slice(0, 5) || []).slice(0, 4000)}
`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
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

// 매일 아침 7시 Vercel 자동 실행용
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

// 웹사이트 화면 '🔄 지금 최신화' 버튼 수동 실행용
export async function POST() {
  try {
    const count = await runDailySync();
    return NextResponse.json({ status: 'ok', inserted: count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
