import { NextResponse } from "next/server";
import { acceptOfferForPatientPhone, declineOfferForPatientPhone, cancelAppointmentForPatientPhone, issueOffersForAppointment } from "@/lib/offers";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function twimlOk(message?: string) {
	const xml = `<Response>${message ? `<Message>${message}</Message>` : ""}</Response>`;
	return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
}

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

		if (!from) return twimlOk();

		// Log inbound for debugging/demo visibility - show exact body received
		console.log("[SMS_INBOUND]", { from, rawBody, normalizedBody: body, token, simpleToken });
		await logEvent("SMS_INBOUND", { from, body, token: simpleToken, bodyLength: body.length, bodyChars: body.split('').map(c => c.charCodeAt(0)) });

		// Accept
		if (/^(1|Y|YES|ACCEPT)$/.test(simpleToken)) {
			setTimeout(() => {
				acceptOfferForPatientPhone(from).catch((e) => console.error("[ACCEPT_ASYNC_ERR]", e));
			}, 0);
			return twimlOk();
		}
		// Decline
		if (/^(N|NO)$/.test(simpleToken)) {
			setTimeout(() => {
				declineOfferForPatientPhone(from).catch((e) => console.error("[DECLINE_ASYNC_ERR]", e));
			}, 0);
			return twimlOk();
		}
		// Confirm
		if (/^(C|CONFIRM)$/.test(simpleToken)) {
			setTimeout(async () => {
				try {
					const last10 = from.replace(/\D/g, "").slice(-10);
					const patient = await db.patient.findFirst({ where: { phone: { contains: last10 } } });
					await logEvent("SMS_CANCEL_DEBUG", { step: "confirm_lookup_patient", last10, hasPatient: !!patient });
					if (patient) {
						const nextAppt = await db.appointment.findFirst({
							where: { patientId: patient.id, status: "SCHEDULED" },
							orderBy: { startsAt: "asc" },
						});
						await logEvent("SMS_CANCEL_DEBUG", { step: "confirm_lookup_appt", patientId: patient.id, foundApptId: nextAppt?.id });
						if (nextAppt) {
							await logEvent("APPOINTMENT_CONFIRMED", {
								appointmentId: nextAppt.id,
								patientId: patient.id,
								patientName: patient.name,
							});
						}
					}
				} catch (e) {
					console.error("[CONFIRM_ASYNC_ERR]", e);
				}
			}, 0);
			return twimlOk();
		}

		// DEMO flow override: first inbound after seed cancels Omar regardless of body
		try {
			const stage = await db.eventLog.findFirst({
				where: { kind: "DEMO_FLOW_STAGE" },
				orderBy: { createdAt: "desc" },
			});
			const st = (stage?.details as any)?.stage as string | undefined;
			const apptId = (stage?.details as any)?.appointmentId as string | undefined;
			if (st === "await_cancel" && apptId) {
				// Advance stage and perform cancel+offers asynchronously
				setTimeout(async () => {
					try {
						await logEvent("DEMO_FLOW_STAGE", { stage: "await_fill", appointmentId: apptId });
						// Cancel Omar's appointment by id, then issue offers to demo phones
						await db.appointment.update({ where: { id: apptId }, data: { status: "CANCELLED", patientId: null } });
						await logEvent("APPOINTMENT_CANCELLED", { appointmentId: apptId });
						await logEvent("ACTIVITY_INFO", { message: "Sending offers to top 3 waitlist candidates…" });
						await issueOffersForAppointment({ appointmentId: apptId });
					} catch (e) {
						console.error("[DEMO_CANCEL_STAGE_ERR]", e);
					}
				}, 0);
				return twimlOk();
			}
			if (st === "await_fill") {
				// Any inbound from either demo phone will count as acceptance
				setTimeout(async () => {
					try {
						await acceptOfferForPatientPhone(from);
						await logEvent("DEMO_FLOW_STAGE", { stage: "completed" });
					} catch (e) {
						console.error("[DEMO_FILL_STAGE_ERR]", e);
					}
				}, 0);
				return twimlOk();
			}
		} catch (e) {
			console.error("[DEMO_FLOW_READ_ERR]", e);
		}

		// Cancel: be permissive, accept X, CANCEL, and common synonyms/variants
		const isCancelToken =
			simpleToken === "X" ||
			simpleToken.startsWith("CANC") ||
			/^(CANCEL|CANCELED|CANCELLED|CNCL|CXL|STOP|END|QUIT|UNSUBSCRIBE|REMOVE|X|×)$/i.test(token) ||
			/^(CANCEL|CANCELED|CANCELLED|CNCL|CXL|STOP|END|QUIT|UNSUBSCRIBE|REMOVE|X|×)$/i.test(simpleToken);
		if (isCancelToken) {
			await logEvent("SMS_CANCEL_DEBUG", { step: "cancel_token_match", token, simpleToken });
			setTimeout(() => {
				cancelAppointmentForPatientPhone(from).catch((e) => console.error("[CANCEL_ASYNC_ERR]", e));
			}, 0);
			return twimlOk();
		}

		// READY
		if (/^READY$/.test(simpleToken)) {
			setTimeout(async () => {
				try {
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
				} catch (e) {
					console.error("[READY_ASYNC_ERR]", e);
				}
			}, 0);
			return twimlOk();
		}

		// Unknown
		await logEvent("sms.unknown", { from, body });
		return twimlOk();
	} catch (err) {
		console.error("[SMS_INBOUND_ERROR]", err);
		try {
			await logEvent("SMS_INBOUND_ERROR", { error: (err as Error)?.message ?? String(err) });
		} catch {}
		// Respond 200 so Twilio doesn't retry
		return twimlOk();
	}
}


