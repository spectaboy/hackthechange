import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeNoShowRisk } from "@/lib/risk";

export async function GET() {
	const [scheduled, cancelled, filled, offersSent, warmedCount, upcoming] =
		await Promise.all([
			db.appointment.count({ where: { status: "SCHEDULED" } }),
			db.appointment.count({ where: { status: "CANCELLED" } }),
			db.appointment.count({ where: { status: "FILLED" } }),
			db.offer.count({ where: { status: "SENT" } }),
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
		const risk = computeNoShowRisk({
			appointment: a,
			patient: p as any,
		});
		if (risk >= 0.55) highRisk++;
	}

	return NextResponse.json({
		scheduled,
		cancelled,
		filled,
		offersSent,
		warmedCount,
		highRisk,
	});
}


