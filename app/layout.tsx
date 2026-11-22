export const metadata = {
  title: 'AI·국방 전용 인텔리전스 포털',
  description: '매일 자동 수집·번역되는 나만의 AI·국방 데일리 신문 및 PDF 서재',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: '#090e1a', color: '#f8fafc' }}>
        {children}
      </body>
    </html>
  );
}

