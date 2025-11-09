import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
import { rankCandidates } from "@/lib/match";

export async function GET(
	_req: Request,
	ctx: { params: Promise<{ id: string }> }
) {
	const { id } = await ctx.params;
	const appt = await db.appointment.findUnique({
		where: { id },
		include: { patient: true },
	});
	if (!appt) return NextResponse.json({ error: "Not found" }, { status: 404 });

	// Load waitlist for this specialty with patients
	const waitlist = await db.waitlistEntry.findMany({
		where: { specialty: appt.specialty },
		include: { patient: true },
	});
	const ranked = rankCandidates({
		waitlist,
		clinicLat: appt.clinicLat ?? undefined,
		clinicLng: appt.clinicLng ?? undefined,
		startsAt: appt.startsAt,
	});

	// Add simple reason badges
	const withReasons = ranked.slice(0, 10).map((c) => {
		const reasons: string[] = [];
		if (c.distanceKm != null) {
			if (c.distanceKm <= c.entry.radiusKm) reasons.push("within radius");
			if (c.distanceKm < (c.entry.radiusKm / 2)) reasons.push("close by");
		}
		if (c.canArriveMinutes != null) reasons.push("can arrive in time");
		if (c.entry.warmed) reasons.push("pre-warmed");
		if ((c.entry.patient.pastNoShows ?? 0) === 0) reasons.push("reliable history");
		if ((c.entry.patient.pastNoShows ?? 0) >= 2) reasons.push("some no-shows");
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

	return NextResponse.json({ appointment: appt, ranked: withReasons });
}


