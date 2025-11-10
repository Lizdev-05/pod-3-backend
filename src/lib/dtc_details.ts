import path from "path";
import fs from "fs/promises";
import OpenAI from "openai";

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Bank Statement Analyzer',
    },
});

const PARSING_PROMPT = `You are a car disagnostic trouble code expert. Diagnostic trouble code be sent to you, then would make a deep research on it and return a valid JSON object:

{
  "code": string;
  "name": string;
  "description": string;
  "affected_models": {
    brand: string; // seperate multiple brands with commas
    years: string;
    models: string;
  };
  likely_causes: string[];
  guided_steps: Array<{
    step: number;
    title: string;
    description: string;
    tools_needed: string[];
  }>;
  tutorials: {
    title: string;
    youtubeId: string;
  };
  bite_sized_insights: string[]; // optional
  sources?: string[]; // optional: reference links
}

Rules:
- Return ONLY valid JSON, no backticks, no markdown or extra text`

// path to local cache file
const DATA_FILE = path.resolve(__dirname, "..", "..", "data", "fault_codes.json");

async function readCache(): Promise<Record<string, any>> {
    try {
        const raw = await fs.readFile(DATA_FILE, "utf8");
        return JSON.parse(raw);
    } catch (err: any) {
        if (err.code === "ENOENT") return {};
        console.error("Failed reading cache:", err);
        throw err;
    }
}

async function writeCache(db: Record<string, any>) {
    const dir = path.dirname(DATA_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

export async function getDtcDetails(code: string): Promise<any> {
    const faultCode = code.trim();
    if (!faultCode) {
        throw new Error("Missing fault code");
    }

    // check cache first
    const db = await readCache();
    if (db[faultCode]) {
        console.log("Cache hit for", faultCode);
        return db[faultCode];
    }

    // not cached -> call OpenAI
    console.log("Cache miss for", faultCode, "- querying AI");
    const response = await openai.responses.create({
        model: 'google/gemma-3-27b-it:free',
        input: [
            {role: 'system', content: PARSING_PROMPT},
            {role: 'user', content: `Please provide detailed information about the fault code ${faultCode}.`},
        ],
    });

    const result = (response as any).output_text ?? (response as any).output?.[0]?.content?.[0]?.text ?? null;
    const text = (result?.trim() ?? "").replace("```json", ' ').replace("```", ' ').trim();
    console.log("AI Response:", text);

    // parse AI JSON and save to cache
    const parsed = JSON.parse(text);
    const newDb = { ...db, [faultCode]: parsed };
    await writeCache(newDb);

    return parsed;
}