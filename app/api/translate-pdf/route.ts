import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const origin = (formData.get('origin') as string) || '직접 업로드';

    if (!file) {
      return NextResponse.json({ error: 'PDF 파일이 없습니다.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64Pdf = Buffer.from(arrayBuffer).toString('base64');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: { mimeType: 'application/pdf', data: base64Pdf }
        },
        `이 학술 논문 PDF를 읽고 완벽한 한국어로 구조화하여 JSON으로 반환하세요.
        필수 JSON 형식:
        {
          "title": "한글 번역 논문 제목",
          "oneliner": "핵심 기여 1줄 요약",
          "sections": {
            "abstract": "초록 한글 완역",
            "intro": "서론 및 문제 정의 요약",
            "method": "핵심 아키텍처·알고리즘·수식 해설",
            "results": "실험 설계 및 주요 정량 결과 요약",
            "conclusion": "결론 및 국방/전술적 시사점"
          }
        }`
      ],
      config: { responseMimeType: 'application/json', temperature: 0.2 }
    });

    const parsed = JSON.parse(response.text || '{}');

    const { data, error } = await supabase
      .from('personal_library')
      .insert({
        file_name: file.name,
        title: parsed.title || file.name,
        oneliner: parsed.oneliner || 'PDF 분석 완료',
        sections: parsed.sections || {},
        source_origin: origin
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ status: 'ok', item: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
