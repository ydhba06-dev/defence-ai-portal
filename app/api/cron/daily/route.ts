import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [arxivRes, openAlexRes] = await Promise.all([
      fetch('http://export.arxiv.org/api/query?search_query=all:military+OR+all:swarm+OR+all:command+and+control&sortBy=submittedDate&max_results=5'),
      fetch('https://api.openalex.org/works?search=military+AI+command+control&sort=publication_date:desc&per-page=5')
    ]);

    const arxivXml = await arxivRes.text();
    const openAlexJson = await openAlexRes.json();

    const prompt = `
    당신은 국방 AI 및 지휘결심체계(C2) 전문 인텔리전스 에이전트입니다.
    아래 수집된 arXiv 및 OpenAlex 최신 학술 데이터를 바탕으로 한글 브리핑 JSON 배열을 생성하세요.
    각 객체는 반드시 다음 필드를 가져야 합니다:
    { "item_type": "NEWS" | "PAPER" | "GLOSSARY", "category": "분류명", "org": "기관/발행일", "title": "한글 제목", "oneliner": "1줄 요약", "body": ["문단1", "문단2", "문단3"], "source": "출처 및 arXiv/DOI 근거" }

    - PAPER 5개 (초록·방법론·시사점 포함 한글 완역)
    - GLOSSARY 5개 (핵심 정책·기술 용어 해설)
    [원시 데이터]
    arXiv: ${arxivXml.slice(0, 8000)}
    OpenAlex: ${JSON.stringify(openAlexJson.results?.slice(0, 5) || []).slice(0, 6000)}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json', temperature: 0.2 }
    });

    const items = JSON.parse(response.text || '[]');
    if (Array.isArray(items) && items.length > 0) {
      await supabase.from('daily_items').insert(items);
    }

    return NextResponse.json({ status: 'ok', inserted: items.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

