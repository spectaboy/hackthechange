import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
import { rankCandidates } from "@/lib/match";
import crypto from "crypto";
import { runMindStudioRisk } from "@/lib/mindstudio";
import { runGeminiRisk } from "@/lib/gemini";

export async function GET(
	_req: Request,
	ctx: { params: Promise<{ id: string }> }
) {
	const { id } = await ctx.params;
	const appt = await db.appointment.findUnique({
		where: { id },
		include: { patient: true, offers: true },
	});
	if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

	// Load waitlist for this specialty with patients
	const waitlistEntries = await db.waitlistEntry.findMany({
		where: { specialty: appt.specialty },
		include: { patient: true },
	});
	const ranked = rankCandidates({
		waitlist: waitlistEntries,
		clinicLat: appt.clinicLat ?? undefined,
		clinicLng: appt.clinicLng ?? undefined,
		startsAt: appt.startsAt,
	}).slice(0, 5);

	const waitlist = ranked.map((c) => {
		const reasons: string[] = [];
		if (c.distanceKm != null) {
			if (c.distanceKm <= c.entry.radiusKm) reasons.push("within radius");
			if (c.distanceKm < Math.min(15, c.entry.radiusKm / 2)) reasons.push("close by");
		}
		if (c.canArriveMinutes != null) reasons.push("can arrive in time");
		if (c.entry.warmed) reasons.push("pre‑warmed");
		if ((c.entry.patient.pastNoShows ?? 0) === 0) reasons.push("reliable history");
		if ((c.entry.patient.pastNoShows ?? 0) >= 2) reasons.push("some no‑shows");
		return {
			patientId: c.entry.patientId,
			patientName: c.entry.patient.name,
			phone: c.entry.patient.phone,
			score: c.score,
			distanceKm: c.distanceKm,
			canArriveMinutes: c.canArriveMinutes,
			reasons,
		};
	});

	// Compute risk with AI + 5-min cache, fallback to local if API fails
	const risk = await computeRiskWithAi(appt);

	const detail = {
		appointment: {
			id: appt.id,
			specialty: appt.specialty,
			startsAt: appt.startsAt,
			durationMin: appt.durationMin,
			status: appt.status,
			patientName: appt.patient?.name ?? null,
			clinicLat: appt.clinicLat,
			clinicLng: appt.clinicLng,
			provider: getProviderName(appt.specialty, new Date(appt.startsAt)),
		},
		risk,
		waitlist,
	};

	return NextResponse.json(detail);
}

async function computeRiskWithAi(appointment: {
	id: string;
	startsAt: Date;
	createdAt: Date;
	durationMin: number;
	specialty: string;
	clinicLat: number | null;
	clinicLng: number | null;
	severity?: string | null;
	feeRequired?: boolean | null;
	patient: {
		name: string;
		ageYears?: number | null;
		pastNoShows: number;
		pastCancels: number;
		avgConfirmDelayDays: number | null;
		confirmReliability?: number | null;
		homeLat?: number | null;
		homeLng?: number | null;
	} | null;
}) {
	// Build input features
	const startsAt = new Date(appointment.startsAt);
	const createdAt = new Date(appointment.createdAt);
	const leadDays = Math.max(
		0,
		Math.round((startsAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
	);
	const weekdayIdx = startsAt.getDay();
	const weekday = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][weekdayIdx];
	const hour = startsAt.getHours();
	const hourBin = hour < 9 ? "early_am" : hour < 12 ? "am" : hour < 16 ? "pm" : "late_pm";

	let distanceKm: number | null = null;
	if (
		appointment.clinicLat != null &&
		appointment.clinicLng != null &&
		appointment.patient?.homeLat != null &&
		appointment.patient?.homeLng != null
	) {
		distanceKm = haversineKm(
			appointment.patient.homeLat,
			appointment.patient.homeLng,
			appointment.clinicLat,
			appointment.clinicLng
		);
	}

	// Weather proxy (reuse local simulated)
	const wx = { wx_temp_c_at_appt: 0, wx_feelslike_c_at_appt: 0, wx_snow_mm_next6h: 0, wx_wind_kph_at_appt: 5 };

	const payload = {
		patient: {
			ageYears: appointment.patient?.ageYears ?? null,
			pastNoShows: appointment.patient?.pastNoShows ?? 0,
			pastCancels: appointment.patient?.pastCancels ?? 0,
			confirmReliability: appointment.patient?.confirmReliability ?? null,
			avgConfirmDelayDays: appointment.patient?.avgConfirmDelayDays ?? null,
		},
		appointment: {
			appointmentId: appointment.id,
			specialty: appointment.specialty,
			severity: appointment.severity ?? "consult",
			leadDays,
			weekday,
			hour,
			hourBin,
			distanceKm,
			feeRequired: !!appointment.feeRequired,
		},
		context: {
			...wx,
		},
	};
	const inputStr = JSON.stringify(payload);
	const hash = crypto.createHash("sha256").update(inputStr).digest("hex");

	// 5-min cache in AiAnalysis
	let cached: any = null;
	try {
		cached = await db.aiAnalysis.findUnique({ where: { appointmentId: appointment.id } });
	} catch {
		// Table may not exist yet; skip cache
	}
	if (cached && cached.inputHash === hash && Date.now() - new Date(cached.updatedAt).getTime() < 5 * 60 * 1000) {
		return {
			score: cached.score,
			level: (cached.level as any) as "LOW" | "MEDIUM" | "HIGH",
			factors: (cached.factors as any[]) as { id: string; label: string; contribution: number }[],
			summary: cached.summary,
		};
	}

	try {
		// Prefer Gemini when configured; otherwise fall back to MindStudio
		const useGemini = !!process.env.GEMINI_API_KEY;
		const out = useGemini ? await runGeminiRisk(payload) : await runMindStudioRisk(payload);
		let factors = (out.factors ?? []).map((f: any, idx: number) => ({
			id: String(f.id ?? f.name ?? idx),
			label: String(f.label ?? f.name ?? "factor"),
			contribution: Number(f.contribution ?? 0),
		}));
		const level =
			out.level === "HIGH" ? "HIGH" : out.level === "LOW" ? "LOW" : "MEDIUM";
		// Prepend a descriptive total line that includes the summary
		const totalLabel = `Total risk ${Number(out.score ?? 0).toFixed(2)} — ${String(out.summary ?? "").trim()}`;
		// Add concise contributor/mitigator summaries for readability
		const positives = factors.filter((f) => f.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 3);
		const negatives = factors.filter((f) => f.contribution < 0).sort((a, b) => a.contribution - b.contribution).slice(0, 3);
		const contribLine =
			positives.length > 0
				? `Top contributors: ${positives.map((f) => `${f.label} (${f.contribution >= 0 ? "+" : ""}${f.contribution.toFixed(2)})`).join(", ")}`
				: "Top contributors: none significant";
		const mitigatorLine =
			negatives.length > 0
				? `Mitigators: ${negatives.map((f) => `${f.label} (${f.contribution.toFixed(2)})`).join(", ")}`
				: "Mitigators: none significant";
		factors = [
			{ id: "total", label: totalLabel, contribution: Number(out.score ?? 0) },
			{ id: "contributors", label: contribLine, contribution: positives.reduce((s, f) => s + f.contribution, 0) },
			{ id: "mitigators", label: mitigatorLine, contribution: negatives.reduce((s, f) => s + f.contribution, 0) },
			...factors,
		];
		// Persist
		try {
			await db.aiAnalysis.upsert({
				where: { appointmentId: appointment.id },
				create: {
					appointmentId: appointment.id,
					score: out.score ?? 0,
					level,
					summary: out.summary ?? "",
					factors: factors as any,
					inputHash: hash,
				},
				update: { score: out.score ?? 0, level, summary: out.summary ?? "", factors: factors as any, inputHash: hash },
			});
		} catch {
			// Ignore if table missing
		}
		return { score: out.score ?? 0, level, factors, summary: out.summary ?? "" };
	} catch (e) {
		// Fallback to local deterministic scorer
		return computeRiskDetail(appointment as any);
	}
}

function computeRiskDetail(appointment: {
	startsAt: Date;
	createdAt: Date;
	durationMin: number;
	specialty: string;
	clinicLat: number | null;
	clinicLng: number | null;
	patient: {
		pastNoShows: number;
		pastCancels: number;
		avgConfirmDelayDays: number | null;
		homeLat?: number | null;
		homeLng?: number | null;
	} | null;
}) {
	const startsAt = new Date(appointment.startsAt);
	const createdAt = new Date(appointment.createdAt);
	const leadDays = Math.max(
		0,
		Math.round((startsAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
	);
	const weekday = startsAt.getDay();
	const hour = startsAt.getHours();
	const p =
		appointment.patient ?? ({ pastNoShows: 0, pastCancels: 0, avgConfirmDelayDays: 1 } as any);

	let score = 0;
	const factors: { id: string; label: string; contribution: number }[] = [];
	const add = (id: string, label: string, c: number) => {
		if (c === 0) return;
		score += c;
		factors.push({ id, label, contribution: c });
	};

	add("baseline", "Baseline system risk", 0.2);
	if (appointment.durationMin >= 60) add("long_visit", "Long consultation (≥60 min)", 0.1);
	if (weekday === 1 || weekday === 5) add("weekday_edge", "Monday/Friday volatility", 0.05);
	if (hour <= 9 || hour >= 16) add("day_edge", "Early/late hour", 0.05);

	const s = appointment.specialty.toLowerCase();
	if (s.includes("mental")) add("specialty", "Mental health trend", 0.1);
	else if (s.includes("derma")) add("specialty", "Lower-urgency specialty", 0.05);
	else if (s.includes("surgery") || s.includes("onco")) add("specialty", "High acuity specialty", -0.1);

	add("noshow_hist", `Prior no‑shows (${p.pastNoShows})`, Math.min(0.24, Math.max(0, p.pastNoShows) * 0.08));
	add("cancel_hist", `Short‑notice cancels (${p.pastCancels})`, Math.min(0.15, Math.max(0, p.pastCancels) * 0.05));
	if ((p.avgConfirmDelayDays ?? 0) > 2) add("confirm_delay", "Slow to confirm", 0.1);
	if (leadDays > 45) add("lead_time", `Long lead time (${leadDays} days)`, 0.15);

	let distanceKm: number | null = null;
	if (
		appointment.clinicLat != null &&
		appointment.clinicLng != null &&
		appointment.patient?.homeLat != null &&
		appointment.patient?.homeLng != null
	) {
		distanceKm = haversineKm(
			appointment.patient.homeLat,
			appointment.patient.homeLng,
			appointment.clinicLat,
			appointment.clinicLng
		);
		if (distanceKm > 30) add("distance", `Long travel distance (${distanceKm.toFixed(0)} km)`, 0.05);
	}

	const finalScore = Math.max(0, Math.min(1, score));
	const level = finalScore >= 0.55 ? "HIGH" : finalScore >= 0.3 ? "MEDIUM" : "LOW";
	const top = [...factors]
		.filter((f) => f.contribution > 0)
		.sort((a, b) => b.contribution - a.contribution)
		.slice(0, 2)
		.map((f) => f.label.replace(/ \(.+?\)/, ""));
	const summary =
		top.length > 0 ? `${level} risk due to ${top.join(" & ").toLowerCase()}.` : `${level} risk overall.`;

	// Put a descriptive total line at the top for UI without layout changes
	const ordered = factors.sort((a, b) => b.contribution - a.contribution);
	const positives = ordered.filter((f) => f.contribution > 0).slice(0, 3);
	const negatives = ordered.filter((f) => f.contribution < 0).slice(0, 3);
	const contribLine =
		positives.length > 0
			? `Top contributors: ${positives.map((f) => `${f.label} (${f.contribution >= 0 ? "+" : ""}${f.contribution.toFixed(2)})`).join(", ")}`
			: "Top contributors: none significant";
	const mitigatorLine =
		negatives.length > 0
			? `Mitigators: ${negatives.map((f) => `${f.label} (${f.contribution.toFixed(2)})`).join(", ")}`
			: "Mitigators: none significant";
	const totalFirst = [
		{ id: "total", label: `Total risk ${finalScore.toFixed(2)} — ${summary}`, contribution: finalScore },
		{ id: "contributors", label: contribLine, contribution: positives.reduce((s, f) => s + f.contribution, 0) },
		{ id: "mitigators", label: mitigatorLine, contribution: negatives.reduce((s, f) => s + f.contribution, 0) },
		...ordered,
	];
	return { score: finalScore, level, factors: totalFirst, summary };
}

function haversineKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
) {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const R = 6371; // km
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function getProviderName(specialty: string, startsAt: Date): string {
	const providersBySpecialty: Record<string, string[]> = {
		Cardiology: ["Dr. Aiden Singh", "Dr. Lena Park", "Dr. Priya Patel"],
		Dermatology: ["Dr. Maria Chen", "Dr. Omar Rahman"],
		"Mental Health": ["Dr. Zoe Hart", "Dr. Gabriel Munro"],
		"Orthopedic Surgery": ["Dr. Ibrahim Kassim", "Dr. Chloe Bennett"],
		Neurology: ["Dr. Eva Laurent", "Dr. Malik Farah"],
		Oncology: ["Dr. Rafael Costa", "Dr. Naomi Okafor"],
		Ophthalmology: ["Dr. Clara Ibarra", "Dr. Henry Lewis"],
	};
	const list = providersBySpecialty[specialty] ?? ["Dr. Alex Morgan"];
	const index = startsAt.getHours() % list.length;
	return list[index];
}

