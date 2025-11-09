import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { issueOffersForAppointment } from "@/lib/offers";
import { acceptFirstOfferForAppointment } from "@/lib/offers";
export const runtime = "nodejs";

// Throttle cancellations to ~1 per 30s (per instance)
let lastCancellationSimAt = 0;
const DEMO_NAMES_BLOCKLIST = new Set(["Omar Almishri", "Mico Ben Issa"]);

async function maybeSimulateActivity() {
	// Keep it lightweight and probabilistic so polling feels alive
	const roll = Math.random();
	// Attempt cancellation only if at least 30s elapsed
	if (Date.now() - lastCancellationSimAt >= 30000 && roll < 0.08) {
		// Find the next scheduled appointment not belonging to demo people
		const upcomingMany = await db.appointment.findMany({
			where: { status: "SCHEDULED", startsAt: { gte: new Date() } },
			orderBy: { startsAt: "asc" },
			take: 25,
			include: { patient: true },
		});
		const upcoming = upcomingMany.find((a) => !DEMO_NAMES_BLOCKLIST.has(a.patient?.name ?? ""));
		if (upcoming) {
			lastCancellationSimAt = Date.now();
			const appt = await db.appointment.update({
				where: { id: upcoming.id },
				data: { status: "CANCELLED" },
			});
			await logEvent("APPOINTMENT_CANCELLED", {
				appointmentId: appt.id,
				specialty: appt.specialty,
			});
			await logEvent("ACTIVITY_INFO", {
				message: "Sending offers to top 3 waitlist candidates…",
			});
			// Issue offers for simulation without sending SMS to demo phones
			await issueOffersForAppointment({ appointmentId: appt.id, suppressSms: true });
			// After 3-5s, accept the first active non-demo offer to close the loop
			const delay = 3000 + Math.floor(Math.random() * 2000);
			setTimeout(() => {
				acceptFirstOfferForAppointment(appt.id).catch(() => {});
			}, delay);
			return;
		}
	}
	// 20% chance to log a benign info line to keep ticker lively
	if (roll < 0.35) {
		const messages = [
			"Risk escalated on a morning slot due to weather.",
			"Pre-warming standby candidates for high-risk afternoon clinic…",
			"Utilization trending up; smoothing schedule across specialties…",
			"Scanning waitlist patterns (habit match, reliability)…",
			"Refreshing travel-time estimates from candidate home locations…",
		];
		const message = messages[Math.floor(Math.random() * messages.length)];
		await logEvent("ACTIVITY_INFO", { message });
	}
}

export async function GET() {
	// Drive background simulation opportunistically on each poll
	await maybeSimulateActivity();
	const events = await db.eventLog.findMany({
		orderBy: { createdAt: "desc" },
		take: 50,
	});
	return NextResponse.json({ events });
}

export async function POST(req: Request) {
	const body = await req.json().catch(() => null) as any;
	if (!body?.kind || !body?.details) {
		return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
	}
	await db.eventLog.create({
		data: { kind: String(body.kind), details: body.details },
	});
	return NextResponse.json({ ok: true });
}

