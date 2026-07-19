import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    strengths: { type: "array", items: { type: "string" } },
    issues: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          line: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
          title: { type: "string" }, explanation: { type: "string" },
          fix: { type: "string" }, patchedCode: { type: "string" },
        },
        required: ["severity", "line", "title", "explanation", "fix", "patchedCode"],
      },
    },
  },
  required: ["summary", "score", "strengths", "issues"],
} as const;

type Issue = {
  severity: "critical" | "high" | "medium" | "low";
  line: number | null;
  title: string;
  explanation: string;
  fix: string;
  patchedCode: string;
};

type ChunkReview = { summary: string; score: number; strengths: string[]; issues: Issue[] };
const LINES_PER_CHUNK = 150;
const MAX_CHUNKS = 40;

function containsSecret(value: string) {
  return /(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code: string = typeof body.code === "string" ? body.code : "";
    const language: string = typeof body.language === "string" ? body.language.slice(0, 40) : "Unknown";
    if (code.length < 5 || code.length > 500_000) return NextResponse.json({ error: "โค้ดต้องยาว 5–500,000 ตัวอักษร" }, { status: 400 });
    if (containsSecret(code)) return NextResponse.json({ error: "พบ secret ที่อาจรั่วไหล. ลบหรือแทนด้วย placeholder ก่อน review" }, { status: 400 });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Server ยังไม่มี OPENAI_API_KEY. สร้าง .env.local จาก .env.example ก่อน" }, { status: 500 });

    const allLines = code.split("\n");
    const chunkCount = Math.ceil(allLines.length / LINES_PER_CHUNK);
    if (chunkCount > MAX_CHUNKS) return NextResponse.json({ error: `โค้ดมี ${allLines.length.toLocaleString()} บรรทัด. รองรับสูงสุด ${(LINES_PER_CHUNK * MAX_CHUNKS).toLocaleString()} บรรทัดต่อครั้ง` }, { status: 400 });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const reviews: ChunkReview[] = [];
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
      const firstLine = chunkIndex * LINES_PER_CHUNK;
      const numberedCode = allLines.slice(firstLine, firstLine + LINES_PER_CHUNK)
        .map((line, index) => `${firstLine + index + 1}: ${line}`).join("\n");
      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
        instructions: "You are a strict senior code reviewer. Review every supplied line, not only the first or last lines. Find only real, actionable issues. Check correctness, security, performance, maintainability, error handling, and language conventions. Be concise. Do not claim tests were run. Return Thai explanations unless code comments request another language. The code has original line numbers before each colon; use those exact numbers in the line field.",
        input: `Review chunk ${chunkIndex + 1} of ${chunkCount} from a ${language} file. Every line in this chunk must be considered.\n\n${numberedCode}`,
        text: { format: { type: "json_schema", name: "code_review", strict: true, schema } },
      });
      if (!response.output_text) throw new Error(`Model returned no review text for chunk ${chunkIndex + 1}`);
      reviews.push(JSON.parse(response.output_text) as ChunkReview);
    }

    const uniqueIssues = new Map<string, Issue>();
    for (const issue of reviews.flatMap((review) => review.issues)) {
      uniqueIssues.set(`${issue.line}|${issue.title}`, issue);
    }
    const issues = [...uniqueIssues.values()].sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));
    const score = Math.round(reviews.reduce((total, review) => total + review.score, 0) / reviews.length);
    const strengths = [...new Set(reviews.flatMap((review) => review.strengths))].slice(0, 6);
    return NextResponse.json({
      summary: `ตรวจครบ ${allLines.length.toLocaleString()} บรรทัด จาก ${chunkCount} ชุด พบ ${issues.length} ประเด็น`,
      score,
      strengths,
      issues,
    });
  } catch (error) {
    console.error("Review request failed", error);
    return NextResponse.json({ error: "Review ไม่สำเร็จ. ตรวจ API key, model และลองใหม่" }, { status: 500 });
  }
}
