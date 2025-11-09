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
		"You are a medical appointment no‑show risk engine.",
		"Return ONLY JSON (no prose) with keys:",
		'  - score (0..1), level ("LOW" | "MEDIUM" | "HIGH"), summary (<=2 sentences),',
		'  - factors: array of { id, label, contribution }.',
		"Label requirements: be descriptive and self‑contained, include the measured value, unit, and rationale.",
		'Example label: "Lead time: 63 days (>45d threshold) — memory/priority decay".',
		"Contribution sign convention: positive = raises risk; negative = lowers risk.",
		"Monotonic effects: more no‑shows/cancels/leadDays/distance/weather/severity ↑ score; higher reliability/faster confirms ↓ score.",
		"Choose level by thresholds: LOW < 0.30, MEDIUM 0.30–0.55, HIGH > 0.55.",
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
						text:
							"Compute no-show risk for this appointment payload. Respond with STRICT JSON only.\n" +
							JSON.stringify(input),
					},
				],
			},
		],
	};

	// 1–3s UX delay
	await sleep(1000 + Math.floor(Math.random() * 2000));

	const resp = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!resp.ok) {
		const txt = await resp.text().catch(() => "");
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
		parsed = JSON.parse(text);
	} catch {
		// Some models may already return structured JSON as object
		parsed = result;
	}

	const out: GeminiOutput = {
		score: Number(parsed?.score ?? 0.3),
		level: String(parsed?.level ?? "MEDIUM"),
		summary: String(parsed?.summary ?? "AI analysis completed."),
		factors: Array.isArray(parsed?.factors) ? parsed.factors : [],
	};
	return out;
}


