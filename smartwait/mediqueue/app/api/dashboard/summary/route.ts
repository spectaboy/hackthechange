import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
import { computeNoShowRisk } from "@/lib/risk";
import { getSimulatedWeatherSeverity } from "@/lib/weather";

export async function GET() {
	const [scheduled, cancelled, filled, offersSent, offersAccepted, warmedCount, upcoming] =
		await Promise.all([
			db.appointment.count({ where: { status: "SCHEDULED" } }),
			db.appointment.count({ where: { status: "CANCELLED" } }),
			db.appointment.count({ where: { status: "FILLED" } }),
			db.offer.count({ where: { status: "SENT" } }),
			db.offer.count({ where: { status: "ACCEPTED" } }),
			db.waitlistEntry.count({ where: { warmed: true } }),
			db.appointment.findMany({
				where: { startsAt: { gt: new Date() } },
				include: { patient: true },
				orderBy: { startsAt: "asc" },
				take: 20,
			}),
		]);

	// Compute count of high-risk upcoming
	let highRisk = 0;
	for (const a of upcoming) {
		// Use dummy patient if none assigned
		const p = a.patient ?? {
			pastNoShows: 0,
			pastCancels: 0,
			avgConfirmDelayDays: 1,
		};
		const severity = getSimulatedWeatherSeverity(new Date(a.startsAt));
		const risk = computeNoShowRisk({
			appointment: a,
			patient: p as any,
			weather: { extremeCold: severity >= 0.7, snowStorm: severity >= 0.7 },
		});
		if (risk >= 0.55) highRisk++;
	}

	// Avg wait days across scheduled and filled
	const forAvg = await db.appointment.findMany({
		where: { status: { in: ["SCHEDULED", "FILLED"] } },
		select: { createdAt: true, startsAt: true },
		take: 500,
	});
	let avgWaitDays = 0;
	if (forAvg.length > 0) {
		const total = forAvg.reduce((acc, a) => acc + (a.startsAt.getTime() - a.createdAt.getTime()), 0);
		avgWaitDays = Math.max(0, total / forAvg.length / (1000 * 60 * 60 * 24));
	}

	return NextResponse.json({
		scheduled,
		cancelled,
		filled,
		offersSent,
		offersAccepted,
		avgWaitDays: Number(avgWaitDays.toFixed(1)),
		warmedCount,
		highRisk,
	});
}


