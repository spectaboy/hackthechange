import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeNoShowRisk } from "@/lib/risk";
import { rankCandidates } from "@/lib/match";
import { sendSms } from "@/lib/twilio";
import { logEvent } from "@/lib/events";

export async function POST() {
	const upcoming = await db.appointment.findMany({
		where: { startsAt: { gt: new Date() }, status: "SCHEDULED" },
		orderBy: { startsAt: "asc" },
		include: { patient: true },
		take: 20,
	});

	let notified = 0;
	for (const a of upcoming) {
		const p = a.patient ?? {
			pastNoShows: 0,
			pastCancels: 0,
			avgConfirmDelayDays: 1,
		};
		const risk = computeNoShowRisk({
			appointment: a,
			patient: p as any,
		});
		if (risk < 0.55) continue;

		const waitlist = await db.waitlistEntry.findMany({
			where: { specialty: a.specialty },
			include: { patient: true },
		});
		const ranked = rankCandidates({
			waitlist,
			clinicLat: a.clinicLat ?? undefined,
			clinicLng: a.clinicLng ?? undefined,
			startsAt: a.startsAt,
		}).slice(0, 3);

		for (const r of ranked) {
			await db.waitlistEntry.update({
				where: { id: r.entry.id },
				data: { warmed: true, priority: r.entry.priority + 1 },
			});
			await sendSms(
				r.entry.patient.phone,
				`SmartWait standby for ${a.specialty} in next 48h. Reply READY if available.`
			);
			await logEvent("standby.prep_sent", {
				appointmentId: a.id,
				patientId: r.entry.patientId,
			});
			notified++;
		}
	}

	return NextResponse.json({ ok: true, notified });
}


