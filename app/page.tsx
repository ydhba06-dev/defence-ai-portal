'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DefenseAIPortal() {
  const [tab, setTab] = useState<'NEWS' | 'PAPER' | 'LIBRARY' | 'GLOSSARY'>('NEWS');
  const [items, setItems] = useState<any[]>([]);
  const [library, setLibrary] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function loadData() {
    const { data: daily } = await supabase
      .from('daily_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60);
    const { data: lib } = await supabase
      .from('personal_library')
      .select('*')
      .order('created_at', { ascending: false });
    if (daily) setItems(daily);
    if (lib) setLibrary(lib);
  }

  useEffect(() => { loadData(); }, []);

  async function handleManualSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/cron/daily', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert('수집 중 오류가 발생했습니다: ' + (data.error || '알 수 없는 오류'));
      } else {
        await loadData();
        alert(`최신화 완료! 총 ${data.inserted}건의 뉴스·논문·용어가 추가되었습니다.`);
      }
    } catch (e: any) {
      alert('요청 실패: ' + e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('origin', '모바일/웹 직접 업로드');
      const res = await fetch('/api/translate-pdf', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        alert('PDF 번역 실패: ' + (err.error || '오류 발생'));
      } else {
        await loadData();
        setTab('LIBRARY');
      }
    } finally {
      setUploading(false);
    }
  }

  const list = tab === 'LIBRARY' ? library : items.filter(i => i.item_type === tab);

  return (
    <div style={{ background: '#090e1a', color: '#f8fafc', minHeight: '100vh', padding: '20px 14px', fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <header style={{ borderBottom: '2px solid #334155', paddingBottom: 14, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: '1.45rem', margin: 0 }}>AI·국방 전용 인텔리전스 포털</h1>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginTop: 6, marginBottom: 0 }}>
              매일 자동 수집(뉴스·arXiv·OpenAlex) + DBpia PDF 원클릭 완역
            </p>
          </div>
          <button
            onClick={handleManualSync}
            disabled={syncing}
            style={{
              background: syncing ? '#475569' : '#16a34a',
              color: '#fff',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 8,
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: syncing ? 'not-allowed' : 'pointer'
            }}
          >
            {syncing ? '⏳ 수집·번역 중... (약 20초)' : '🔄 지금 최신화'}
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { id: 'NEWS', label: '최신 뉴스' },
            { id: 'PAPER', label: '최신 논문' },
            { id: 'LIBRARY', label: '내 서재(PDF)' },
            { id: 'GLOSSARY', label: '핵심 용어' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id as any); setSelected(null); }}
              style={{
                padding: '12px 6px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
                background: tab === t.id ? '#2563eb' : '#151f32',
                color: '#fff', border: '1px solid #334155', fontSize: '0.9rem'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ background: '#151f32', border: '1px dashed #60a5fa', borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
              {uploading ? '⏳ Gemini가 PDF를 한글로 완역·구조화 중입니다...' : '📄 DBpia / 해외 논문 PDF 올리기 (즉시 한글 완역 및 서재 저장)'}
            </span>
            <input type="file" accept="application/pdf" onChange={handlePdfUpload} disabled={uploading} style={{ display: 'none' }} />
            <span style={{ background: '#2563eb', padding: '6px 12px', borderRadius: 6, fontSize: '0.84rem', fontWeight: 700, whiteSpace: 'nowrap' }}>파일 선택</span>
          </label>
        </div>

        {selected ? (
          <article style={{ background: '#151f32', borderRadius: 12, padding: 22, border: '1px solid #334155' }}>
            <button onClick={() => setSelected(null)} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
              ⬅️ 목록으로 돌아가기
            </button>
            <h2 style={{ fontSize: '1.3rem', lineHeight: 1.45, marginBottom: 14 }}>{selected.title}</h2>
            {tab === 'LIBRARY' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {Object.entries(selected.sections || {}).map(([k, v]: any) => (
                  <div key={k} style={{ background: '#0d1526', padding: 16, borderRadius: 8 }}>
                    <strong style={{ color: '#38bdf8', display: 'block', marginBottom: 6 }}>{k.toUpperCase()}</strong>
                    <p style={{ color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>{v}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: '#0d1526', padding: 18, borderRadius: 8, color: '#cbd5e1', lineHeight: 1.8 }}>
                {(selected.body || []).map((p: string, idx: number) => <p key={idx} style={{ marginBottom: 12 }}>{p}</p>)}
              </div>
            )}
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 14 }}>출처: {selected.source || selected.source_origin}</p>
          </article>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {list.length === 0 ? (
              <div style={{ background: '#151f32', padding: 24, borderRadius: 10, color: '#94a3b8', textAlign: 'center' }}>
                아직 저장된 항목이 없습니다. 우측 상단의 <strong>🔄 지금 최신화</strong> 버튼을 눌러보세요!
              </div>
            ) : (
              list.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelected(item)}
                  style={{
                    background: '#151f32', border: '1px solid #334155', borderLeft: '5px solid #38bdf8',
                    borderRadius: 10, padding: '20px 22px', cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 6 }}>
                    {item.category || item.source_origin} · {item.org || item.file_name}
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>{item.oneliner}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
