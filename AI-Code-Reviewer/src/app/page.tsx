"use client";

import { FormEvent, useMemo, useState } from "react";

type Severity = "critical" | "high" | "medium" | "low";
type Issue = { severity: Severity; line: number | null; title: string; explanation: string; fix: string; patchedCode?: string };
type Review = { summary: string; score: number; issues: Issue[]; strengths: string[] };

const sample = `async function getUser(id) {
  const query = "SELECT * FROM users WHERE id = " + id;
  const result = await db.query(query);
  return result.rows[0];
}`;

const severityText: Record<Severity, string> = {
  critical: "วิกฤต", high: "สูง", medium: "กลาง", low: "ต่ำ",
};

export default function Home() {
  const [code, setCode] = useState(sample);
  const [language, setLanguage] = useState("JavaScript");
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const lines = useMemo(() => code.split("\n").length, [code]);
  const characters = code.length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setReview(null);
    if (code.trim().length < 5) return setError("วางโค้ดอย่างน้อย 5 ตัวอักษร");
    setLoading(true);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review ไม่สำเร็จ");
      setReview(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เกิดข้อผิดพลาด");
    } finally { setLoading(false); }
  }

  return <main>
    <section className="hero">
      <p className="eyebrow">AI CODE REVIEWER</p>
      <h1>Review code.<br /><span>Ship confident</span></h1>
      <p className="intro">วางโค้ด รับข้อเสนอแนะด้าน bug, security, performance และคุณภาพโค้ด Created by Momo</p>
    </section>

    <form onSubmit={submit} className="workspace">
      <section className="editor-card">
        <div className="toolbar">
          <div><span className="live-dot" />Code input <small>{lines.toLocaleString()} lines · {characters.toLocaleString()} / 500,000 chars</small></div>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="ภาษาโปรแกรม">
            {["JavaScript", "TypeScript", "Python", "Java", "Go", "PHP", "SQL", "Other"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </div>
        <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} aria-label="โค้ดสำหรับตรวจ" />
        <div className="editor-footer">อย่าวาง API key, password หรือข้อมูลส่วนตัว</div>
      </section>
      <button className="review-button" disabled={loading}>{loading ? "AI กำลังวิเคราะห์..." : "Review code"}</button>
    </form>

    {error && <p className="error" role="alert">{error}</p>}
    {review && <section className="results" aria-live="polite">
      <div className="result-head">
        <div><p className="eyebrow">REVIEW RESULT</p><h2>{review.summary}</h2></div>
        <div className="score"><strong>{review.score}</strong><span>/100</span></div>
      </div>
      {review.strengths.length > 0 && <p className="strengths">จุดดี: {review.strengths.join(" · ")}</p>}
      {review.issues.length === 0 ? <div className="empty">ไม่พบปัญหาที่ actionable. ตรวจ test และบริบทระบบจริงก่อน merge.</div> :
        <div className="issues">{review.issues.map((issue, index) => <article className="issue" key={`${issue.title}-${index}`}>
          <div className={`badge ${issue.severity}`}>{severityText[issue.severity]}</div>
          <div className="issue-body"><h3>{issue.title}{issue.line ? <span>บรรทัด {issue.line}</span> : null}</h3><p>{issue.explanation}</p><p><b>แก้:</b> {issue.fix}</p>{issue.patchedCode && <pre>{issue.patchedCode}</pre>}</div>
        </article>)}</div>}
    </section>}
  </main>;
}
