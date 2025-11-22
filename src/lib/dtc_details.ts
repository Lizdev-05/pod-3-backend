import path from "path";
import fs from "fs/promises";
import OpenAI from "openai";
import axios from "axios";
import { type DTCStruct } from "../types/dtc_struct";

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'POD 3',
    },
});

const PARSING_PROMPT = `You are a car disagnostic trouble code expert. Diagnostic trouble code that would be sent to you, then you would make a deep research on it and return a valid JSON object:

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
- Return ONLY valid JSON, no backticks, no markdown or extra text
- Please ensure the youtubeId is actually available on YouTube and its a valid youtube video ID
- Ensure the JSON is properly formatted
- If some fields are not available, return empty strings or empty arrays
- The youtubeId must be only the ID, not the full link, this is important but if cannot find any video, return empty string
- If the youtubeId would be longer than 11 characters, return empty string
- If you don't know the answer, return an empty JSON with just the code field filled`

// path to local cache file
const DATA_FILE = path.resolve(__dirname, "..", "..", "data", "fault_codes.json");

async function readCache(): Promise<Record<DTCStruct["code"], DTCStruct>> {
    try {
        const raw = await fs.readFile(DATA_FILE, "utf8");
        return JSON.parse(raw);
    } catch (err: any) {
        if (err.code === "ENOENT") return {};
        console.error("Failed reading cache:", err);
        throw err;
    }
}

async function writeCache(db: Record<DTCStruct["code"], DTCStruct>): Promise<void> {
    const dir = path.dirname(DATA_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

async function isValidYouTubeId(id: string): Promise<boolean> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;

  try {
    await axios.get(url, { timeout: 5000 });
    return true;  // valid video
  } catch (err) {
    return false; // invalid or private video
  }
}

export async function getDtcDetails(code: string): Promise<DTCStruct> {
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
    const response = await openai.chat.completions.create({
        model: 'google/gemma-3-27b-it:free',
        messages: [
            {role: 'assistant', content: PARSING_PROMPT},
            {role: 'user', content: `Please provide detailed information about the fault code ${faultCode}.`},
        ],
        // instructions: PARSING_PROMPT,
        // input: `Please provide detailed information about the fault code ${faultCode}.`,
        // format: "json",
        max_tokens: 4000,
        temperature: 0.7,
    });

    // const result = (response as any).output_text ?? (response as any).output?.[0]?.content?.[0]?.text ?? null;
    const result = response.choices?.[0]?.message?.content ?? null;
    if (!result) {
        throw new Error("AI did not return any result");
    }
    const text = (result?.trim() ?? "").replace("```json", ' ').replace("```", ' ').trim();
    console.log("AI Response:", text);

    // parse AI JSON and save to cache
    const parsed = JSON.parse(text);

    // Validate youtubeId
    if (parsed.tutorials && parsed.tutorials.youtubeId) {
        const isValid = await isValidYouTubeId(parsed.tutorials.youtubeId);
        if (!isValid) {
            parsed.tutorials.youtubeId = "";
        }
    }

    // save to cache
    const newDb = { ...db, [faultCode]: parsed };
    await writeCache(newDb);

    return parsed;
}