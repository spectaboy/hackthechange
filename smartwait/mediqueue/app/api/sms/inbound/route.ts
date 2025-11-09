import { NextResponse } from "next/server";
import { acceptOfferForPatientPhone, declineOfferForPatientPhone, cancelAppointmentForPatientPhone } from "@/lib/offers";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
	try {
		// Twilio sends x-www-form-urlencoded
		const text = await req.text();
		const params = new URLSearchParams(text);
		const from = params.get("From") || params.get("from") || "";
		const rawBody = (params.get("Body") || params.get("body") || "");
		const body = rawBody.trim().toUpperCase();
		// Take the first token only to be permissive (ignore trailing text)
		const token = body.split(/\s+/)[0];
		// Strip punctuation/symbols around the token except multiplication sign used as X variant
		const simpleToken = token.replace(/[^\p{L}\p{N}×]/gu, "");
	
		if (!from) return NextResponse.json({ ok: false }, { status: 400 });
	
		// Log inbound for debugging/demo visibility - show exact body received
		console.log("[SMS_INBOUND]", { from, rawBody, normalizedBody: body, token, simpleToken });
		await logEvent("SMS_INBOUND", { from, body, token: simpleToken, bodyLength: body.length, bodyChars: body.split('').map(c => c.charCodeAt(0)) });
	
		if (/^(1|Y|YES|ACCEPT)$/.test(simpleToken)) {
			console.log("[SMS_FLOW] accept branch for", from);
			const res = await acceptOfferForPatientPhone(from);
			return NextResponse.json({ ok: res.ok, message: res.message });
		}
		if (/^(N|NO)$/.test(simpleToken)) {
			console.log("[SMS_FLOW] decline branch for", from);
			const res = await declineOfferForPatientPhone(from);
			return NextResponse.json({ ok: res.ok, message: res.message });
		}
		if (/^(C|CONFIRM)$/.test(simpleToken)) {
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
			simpleToken === "X" ||
			simpleToken.startsWith("CANC") ||
			/^(CANCEL|CANCELED|CANCELLED|CNCL|CXL|STOP|END|QUIT|UNSUBSCRIBE|REMOVE|X|×)$/i.test(token) ||
			/^(CANCEL|CANCELED|CANCELLED|CNCL|CXL|STOP|END|QUIT|UNSUBSCRIBE|REMOVE|X|×)$/i.test(simpleToken);
		if (isCancelToken) {
			console.log("[SMS_FLOW] cancel branch for", from);
			await logEvent("SMS_CANCEL_DEBUG", { step: "cancel_token_match", token, simpleToken });
			const res = await cancelAppointmentForPatientPhone(from);
			console.log("[SMS_FLOW] cancel result", res);
			return NextResponse.json({ ok: res.ok, message: res.message });
		}
		if (/^READY$/.test(simpleToken)) {
			// Mark latest waitlist entry warmed
			const last10 = from.replace(/\D/g, "").slice(-10);
			const patient = await db.patient.findFirst({ where: { phone: { contains: last10 } } });
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
	} catch (err) {
		console.error("[SMS_INBOUND_ERROR]", err);
		try {
			await logEvent("SMS_INBOUND_ERROR", { error: (err as Error)?.message ?? String(err) });
		} catch {}
		// Respond 200 so Twilio doesn't retry, but include error flag so you can see it in Monitor
		return NextResponse.json({ ok: false, error: "server_error" });
	}
}


