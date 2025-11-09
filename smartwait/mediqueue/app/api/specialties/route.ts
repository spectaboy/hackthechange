import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
import { computeNoShowRisk } from "@/lib/risk";
import { getSimulatedWeatherSeverity } from "@/lib/weather";

type Scope = "day" | "week" | "month";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const scope = (searchParams.get("scope") as Scope) || "week";
	const dateParam = searchParams.get("date");
	const base = dateParam ? new Date(dateParam) : new Date();

	const range = getRange(scope, base);

	const appts = await db.appointment.findMany({
		where: {
			startsAt: { gte: range.start, lt: range.end },
		},
		include: { patient: true },
	});

	const bySpec = new Map<
		string,
		{ specialty: string; scheduled: number; cancelled: number; filled: number; offersSent: number; accepts: number; highRisk: number; utilization: number }
	>();

	// Offers in window
	const offers = await db.offer.findMany({
		where: {
			appointment: {
				startsAt: { gte: range.start, lt: range.end },
			},
		},
	});

	for (const a of appts) {
		const key = a.specialty;
		if (!bySpec.has(key)) {
			bySpec.set(key, { specialty: key, scheduled: 0, cancelled: 0, filled: 0, offersSent: 0, accepts: 0, highRisk: 0, utilization: 0 });
		}
		const agg = bySpec.get(key)!;
		if (a.status === "SCHEDULED") agg.scheduled++;
		if (a.status === "CANCELLED") agg.cancelled++;
		if (a.status === "FILLED") agg.filled++;
		const sev = getSimulatedWeatherSeverity(new Date(a.startsAt));
		const p = a.patient ?? { pastNoShows: 0, pastCancels: 0, avgConfirmDelayDays: 1 };
		const risk = computeNoShowRisk({ appointment: a, patient: p as any, weather: { extremeCold: sev >= 0.7, snowStorm: sev >= 0.7 } });
		if (risk >= 0.55) agg.highRisk++;
	}

	// Offers and accepts
	for (const o of offers) {
		const a = appts.find((x) => x.id === o.appointmentId);
		if (!a) continue;
		const agg = bySpec.get(a.specialty);
		if (!agg) continue;
		if (o.status === "SENT") agg.offersSent++;
		if (o.status === "ACCEPTED") agg.accepts++;
	}

	// Utilization proxy: filled + scheduled / total appts in window
	for (const agg of bySpec.values()) {
		const total = agg.scheduled + agg.cancelled + agg.filled;
		agg.utilization = total > 0 ? Math.round(((agg.filled + agg.scheduled) / total) * 100) : 0;
	}

	return NextResponse.json({ specialties: Array.from(bySpec.values()) });
}

function getRange(scope: Scope, base: Date) {
	const startOfDay = new Date(base.getFullYear(), base.getMonth(), base.getDate());
	if (scope === "day") {
		return { start: startOfDay, end: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) };
	}
	if (scope === "week") {
		const startOfWeek = new Date(startOfDay);
		startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 7);
		return { start: startOfWeek, end: endOfWeek };
	}
	// month
	const startOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
	const endOfMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
	return { start: startOfMonth, end: endOfMonth };
}


