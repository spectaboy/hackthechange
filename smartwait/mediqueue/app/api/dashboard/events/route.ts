import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { issueOffersForAppointment, acceptFirstOfferForAppointment, acceptOfferForPatientPhone } from "@/lib/offers";
import { sendSms } from "@/lib/twilio";
export const runtime = "nodejs";

// Throttle cancellations to ~1 per 30s (per instance) with an initial 30s delay
let lastCancellationSimAt = Date.now();
const DEMO_NAMES_BLOCKLIST = new Set(["Omar Almishri", "Mico Ben Issa"]);

async function maybeSimulateActivity() {
	// Keep it lightweight and probabilistic so polling feels alive
	const roll = Math.random();
	// Orchestrated demo timeline triggered by seed
	try {
		const state = await db.eventLog.findFirst({
			where: { kind: "DEMO_ORCH_STATE" },
			orderBy: { createdAt: "desc" },
		});
		const details = (state?.details as any) || null;
		if (details?.appointmentId && details?.t0) {
			const t0 = new Date(details.t0).getTime();
			const now = Date.now();
			const since = now - t0;
			const steps = details.steps || {};
			// Step 1: +20s send confirmation to demo phone 1
			if (!steps.sentConfirm && since >= 20000) {
				try {
					const appt = await db.appointment.findUnique({
						where: { id: details.appointmentId },
						include: { patient: true },
					});
					if (appt?.startsAt) {
						const to = process.env.DEMO_PHONE || appt?.patient?.phone;
						if (to) {
							const timeStr = new Date(appt.startsAt).toLocaleString();
							await sendSms(
								to,
								`Mediqueue: Confirm your appointment A-DEM1 at ${timeStr}. Reply C to confirm or X to cancel.`
							);
						}
					}
				} catch {}
				await db.eventLog.create({
					data: { kind: "DEMO_ORCH_STATE", details: { ...details, steps: { ...steps, sentConfirm: true } } },
				});
				return;
			}
			// Step 2: +30s cancel appointment
			if (!steps.cancelled && since >= 30000) {
				try {
					const appt = await db.appointment.update({
						where: { id: details.appointmentId },
						data: { status: "CANCELLED", patientId: null },
					});
					await logEvent("APPOINTMENT_CANCELLED", { appointmentId: appt.id });
				} catch {}
				await db.eventLog.create({
					data: { kind: "DEMO_ORCH_STATE", details: { ...details, steps: { ...steps, cancelled: true } } },
				});
				return;
			}
			// Step 3: +32s send offers
			if (!steps.offersSent && since >= 32000) {
				try {
					await logEvent("ACTIVITY_INFO", { message: "Sending offers to top 3 waitlist candidates…" });
					await issueOffersForAppointment({ appointmentId: details.appointmentId });
				} catch {}
				await db.eventLog.create({
					data: { kind: "DEMO_ORCH_STATE", details: { ...details, steps: { ...steps, offersSent: true } } },
				});
				return;
			}
			// Step 4: +42s accept offer as demo phone 2 (Mico)
			if (!steps.filled && since >= 42000) {
				try {
					const phone2 = process.env.DEMO_PHONE_2;
					if (phone2) {
						await acceptOfferForPatientPhone(phone2);
					} else {
						await acceptFirstOfferForAppointment(details.appointmentId);
					}
				} catch {}
				await db.eventLog.create({
					data: { kind: "DEMO_ORCH_STATE", details: { ...details, steps: { ...steps, filled: true } } },
				});
				return;
			}
		}
	} catch {}
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

