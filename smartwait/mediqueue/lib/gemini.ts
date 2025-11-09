import { logEvent } from "./events";

export type GeminiOutput = {
	score: number;
	level: "LOW" | "MEDIUM" | "HIGH" | string;
	summary: string;
	factors: Array<{ id?: string; label?: string; name?: string; contribution: number; value?: unknown }>;
};

async function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

export async function runGeminiRisk(input: Record<string, unknown>): Promise<GeminiOutput> {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		return {
			score: 0.35,
			level: "MEDIUM",
			summary: "Gemini key missing; using safe default.",
			factors: [{ id: "fallback", label: "No GEMINI_API_KEY", contribution: 0.35 }],
		};
	}

	const url =
		"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
		encodeURIComponent(apiKey);

	const system = [
		"You are Mediqueue’s Risk Engine. Input is one appointment+patient JSON.",
		"Output STRICT JSON only (no markdown) with keys described below.",
		"Compute risk_score in [0,1] and risk_band with thresholds: LOW<0.20, MED 0.20–0.50, HIGH>0.50.",
		"Return: top_factors (positive contributors), mitigators (negative), analysis_text (2–3 sentences, specific),",
		'recommendations (prewarm/offer/reminder per policy), full factors array with missing flags, audit, and missing_fields_to_add.',
		"If a value is missing, mark missing=true and propose a Postgres column in missing_fields_to_add.",
		"Use heuristic priors exactly as described when no model score is available.",
		"Return ONLY the JSON object with keys: appointment_id, risk_score, risk_band, top_factors, mitigators, analysis_text, recommendations, factors, audit, missing_fields_to_add.",
	].join(" ");

	const body = {
		systemInstruction: {
			role: "system",
			parts: [{ text: system }],
		},
		generationConfig: {
			temperature: 0.2,
			topP: 0.8,
			maxOutputTokens: 512,
			response_mime_type: "application/json",
		},
		contents: [
			{
				role: "user",
				parts: [
					{
						text: JSON.stringify(input),
					},
				],
			},
		],
	};

	// 1–3s UX delay
	await sleep(1000 + Math.floor(Math.random() * 2000));

	let resp: Response;
	try {
		resp = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	} catch (e) {
		await logEvent("AI_DEBUG", { engine: "gemini", step: "fetch_error", error: String(e) });
		throw e;
	}
	if (!resp.ok) {
		const txt = await resp.text().catch(() => "");
		await logEvent("AI_DEBUG", { engine: "gemini", step: "http_error", status: resp.status, body: txt.slice(0, 500) });
		throw new Error(`Gemini error ${resp.status}: ${txt}`);
	}

	let result: any;
	try {
		result = await resp.json();
	} catch (e) {
		const t = await resp.text().catch(() => "");
		try {
			result = JSON.parse(t);
		} catch {
			await logEvent("AI_DEBUG", { engine: "gemini", step: "parse_json_fail", textSample: (t || "").slice(0, 500) });
			return {
				score: 0.3,
				level: "MEDIUM",
				summary: "Gemini returned non-JSON; default used.",
				factors: [{ id: "gemini_non_json", label: "Non‑JSON response", contribution: 0.3 }],
			};
		}
	}

	const text: string =
		result?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? "").join("") ??
		result?.candidates?.[0]?.content?.parts?.[0]?.text ??
		"";

	let parsed: any = null;
	try {
		// Strip code fences or prose; grab the first JSON object in the text
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		const jsonSlice = start >= 0 && end > start ? text.slice(start, end + 1) : text;
		parsed = JSON.parse(jsonSlice.replace(/```json|```/g, "").trim());
	} catch {
		// Some models may already return structured JSON as object
		parsed = result;
	}

	// Map from the prescribed schema
	const score = Number(parsed?.risk_score ?? parsed?.score ?? 0.3);
	const band = String(parsed?.risk_band ?? parsed?.level ?? "MED");
	const summary = String(parsed?.analysis_text ?? parsed?.summary ?? "AI analysis completed.");
	const top = Array.isArray(parsed?.top_factors) ? parsed.top_factors : [];
	const mit = Array.isArray(parsed?.mitigators) ? parsed.mitigators : [];
	const allFactors =
		Array.isArray(parsed?.factors) && parsed.factors.length > 0
			? parsed.factors.map((f: any) => ({
					id: f?.name ?? f?.label,
					label: f?.label ?? f?.name,
					contribution: Number(f?.contribution ?? 0),
			  }))
			: [...top, ...mit];

	await logEvent("AI_DEBUG", {
		engine: "gemini",
		step: "mapped_output",
		score,
		band,
		topCount: top.length,
		allCount: Array.isArray(allFactors) ? allFactors.length : 0,
	});

	const out: GeminiOutput = {
		score,
		level: band === "HIGH" ? "HIGH" : band === "LOW" ? "LOW" : band === "MED" ? "MEDIUM" : band,
		summary,
		factors: allFactors,
	};
	return out;
}


