import { NextResponse } from "next/server";
import { acceptOfferForPatientPhone, declineOfferForPatientPhone, cancelAppointmentForPatientPhone } from "@/lib/offers";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
	// Twilio sends x-www-form-urlencoded
	const text = await req.text();
	const params = new URLSearchParams(text);
	const from = params.get("From") || params.get("from") || "";
	const rawBody = (params.get("Body") || params.get("body") || "");
	const body = rawBody.trim().toUpperCase();
	// Take the first token only to be permissive (ignore trailing text)
	const token = body.split(/\s+/)[0];

	if (!from) return NextResponse.json({ ok: false }, { status: 400 });

	// Log inbound for debugging/demo visibility - show exact body received
	console.log("[SMS_INBOUND]", { from, rawBody, normalizedBody: body, token });
	await logEvent("SMS_INBOUND", { from, body, token, bodyLength: body.length, bodyChars: body.split('').map(c => c.charCodeAt(0)) });

	if (/^(1|Y|YES|ACCEPT)$/.test(token)) {
		console.log("[SMS_FLOW] accept branch for", from);
		const res = await acceptOfferForPatientPhone(from);
		return NextResponse.json({ ok: res.ok, message: res.message });
	}
	if (/^(N|NO)$/.test(token)) {
		console.log("[SMS_FLOW] decline branch for", from);
		const res = await declineOfferForPatientPhone(from);
		return NextResponse.json({ ok: res.ok, message: res.message });
	}
	if (/^(C|CONFIRM)$/.test(token)) {
		// Mark next scheduled appt as confirmed (log only for demo)
		const last10 = from.replace(/\D/g, "").slice(-10);
		console.log("[SMS_FLOW] confirm branch for", { from, last10 });
		const patient = await db.patient.findFirst({ where: { phone: { contains: last10 } } });
		await logEvent("SMS_CANCEL_DEBUG", { step: "confirm_lookup_patient", last10, hasPatient: !!patient });
		if (patient) {
			const nextAppt = await db.appointment.findFirst({
				where: { patientId: patient.id, status: "SCHEDULED" },
				orderBy: { startsAt: "asc" },
			});
			console.log("[SMS_FLOW] confirm found appt", { patientId: patient.id, nextApptId: nextAppt?.id });
			await logEvent("SMS_CANCEL_DEBUG", { step: "confirm_lookup_appt", patientId: patient.id, foundApptId: nextAppt?.id });
			if (nextAppt) {
				await logEvent("APPOINTMENT_CONFIRMED", {
					appointmentId: nextAppt.id,
					patientId: patient.id,
					patientName: patient.name,
				});
				return NextResponse.json({ ok: true, message: "Confirmed" });
			}
		}
		return NextResponse.json({ ok: false, message: "No upcoming appointment" });
	}
	// Cancel: be permissive, accept X, CANCEL, and common synonyms/variants
	const isCancelToken =
		token === "X" ||
		token.startsWith("CANC") ||
		/^(CANCEL|CANCELED|CANCELLED|CNCL|CXL|STOP|END|QUIT|UNSUBSCRIBE|REMOVE|X|x|×)$/.test(token);
	if (isCancelToken) {
		console.log("[SMS_FLOW] cancel branch for", from);
		const res = await cancelAppointmentForPatientPhone(from);
		console.log("[SMS_FLOW] cancel result", res);
		return NextResponse.json({ ok: res.ok, message: res.message });
	}
	if (/^READY$/.test(token)) {
		// Mark latest waitlist entry warmed
		const patient = await db.patient.findFirst({ where: { phone: from } });
		if (patient) {
			const entry = await db.waitlistEntry.findFirst({
				where: { patientId: patient.id },
				orderBy: { createdAt: "desc" },
			});
			if (entry) {
				await db.waitlistEntry.update({
					where: { id: entry.id },
					data: { warmed: true, priority: entry.priority + 1 },
				});
				await logEvent("waitlist.ready", {
					patientId: patient.id,
					waitlistEntryId: entry.id,
				});
			}
		}
		return NextResponse.json({ ok: true });
	}

	// Unknown
	console.log("[SMS_FLOW] unknown branch hit", { from, body });
	await logEvent("sms.unknown", { from, body });
	return NextResponse.json({ ok: true });
}


