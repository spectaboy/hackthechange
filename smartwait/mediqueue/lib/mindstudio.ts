export type MindInput = Record<string, unknown>;

export type MindOutput = {
	score: number;
	level: "LOW" | "MEDIUM" | "HIGH" | string;
	summary: string;
	factors: Array<{ id?: string; name?: string; label?: string; contribution: number; value?: unknown }>;
};

async function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

	export async function runMindStudioRisk(input: MindInput): Promise<MindOutput> {
	const API_URL = "https://api.mindstudio.ai/developer/v2/workers/run";
	const apiKey = process.env.MINDSTUDIO_API_KEY;
	const workerId = process.env.MINDSTUDIO_WORKER_ID;
	if (!apiKey || !workerId) {
		// Fallback: conservative dummy response
		return {
			score: 0.35,
			level: "MEDIUM",
			summary: "Fallback scoring used because MindStudio credentials are not set.",
			factors: [{ id: "fallback", label: "Fallback engine", contribution: 0.35 }],
		};
	}

	const payload = {
		workerId,
		variables: {
			// Send under both keys to be compatible with worker designs
			payload: JSON.stringify(input),
			gameData: JSON.stringify(input),
		},
		workflow: "Main.flow",
	};

	const headers = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${apiKey}`,
	};

	// 1–3s artificial delay for UX
	await sleep(1000 + Math.floor(Math.random() * 2000));

	const resp = await fetch(API_URL, { method: "POST", headers, body: JSON.stringify(payload) });
	if (!resp.ok) {
		const txt = await resp.text().catch(() => "");
		throw new Error(`MindStudio error ${resp.status}: ${txt}`);
	}
	let result: any;
	try {
		result = await resp.json();
	} catch {
		// Try reading as text then attempt to parse JSON inside
		const txt = await resp.text().catch(() => "");
		try {
			result = JSON.parse(txt);
		} catch {
			// If it's not JSON, return a conservative default
			return {
				score: 0.35,
				level: "MEDIUM",
				summary: "AI returned non-JSON content; using safe default.",
				factors: [{ id: "fallback", label: "Non‑JSON response", contribution: 0.35 }],
			};
		}
	}
	// The API returns a free-form object; try to extract fields defensively
	const out: MindOutput = {
		score: Number(result?.risk_score ?? result?.score ?? 0.3),
		level: String(result?.risk_band ?? result?.level ?? "MEDIUM"),
		summary: String(result?.summary ?? "AI analysis returned no summary."),
		factors: Array.isArray(result?.factors) ? result.factors : [],
	};
	return out;
}


