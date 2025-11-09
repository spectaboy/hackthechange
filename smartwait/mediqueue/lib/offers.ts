import { db } from "./db";
import { rankCandidates } from "./match";
import { logEvent } from "./events";
import { sendSms } from "./twilio";
import { OfferStatus } from "@prisma/client";

export async function issueOffersForAppointment(params: {
	appointmentId: string;
	topN?: number;
	expiryMinutes?: number;
	suppressSms?: boolean;
}) {
	const { appointmentId } = params;
	const topN = params.topN ?? 3;
	const expiryMinutes = params.expiryMinutes ?? 5;
	const suppressSms = params.suppressSms ?? false;

	const appt = await db.appointment.findUnique({
		where: { id: appointmentId },
	});
	if (!appt) throw new Error("Appointment not found");
	if (appt.status !== "CANCELLED" && appt.status !== "SCHEDULED") {
		throw new Error("Appointment not eligible for offers");
	}

	// Normalize phone helper
	const norm = (p: string) => p.replace(/\D/g, "");
	const demoPhone = process.env.DEMO_PHONE ? norm(process.env.DEMO_PHONE) : undefined;
	const demoPhone2 = process.env.DEMO_PHONE_2 ? norm(process.env.DEMO_PHONE_2) : undefined;
	const allowedList =
		process.env.DEMO_ALLOWED_PHONES
			?.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.map(norm) ?? [];
	if (demoPhone && !allowedList.includes(demoPhone)) {
		allowedList.push(demoPhone);
	}
	if (demoPhone2 && !allowedList.includes(demoPhone2)) {
		allowedList.push(demoPhone2);
	}

	// Ensure allowed phones have a waitlist entry for this specialty
	for (const phone of allowedList) {
		const patient = await db.patient.findFirst({
			where: { phone: { contains: phone.slice(-10) } },
		});
		if (patient) {
			const existing = await db.waitlistEntry.findFirst({
				where: { patientId: patient.id, specialty: appt.specialty },
			});
			if (!existing) {
				await db.waitlistEntry.create({
					data: {
						patientId: patient.id,
						specialty: appt.specialty,
						radiusKm: 50,
						priority: 5,
						warmed: true,
					},
				});
			}
		}
	}

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
	// If we have an allowed list, prioritize those first, then fill up to topN with others
	let selected: typeof ranked = ranked.slice(0, topN);
	if (allowedList.length > 0) {
		const preferred = ranked.filter((c) =>
			allowedList.includes(norm(c.entry.patient.phone))
		);
		const others = ranked.filter(
			(c) => !allowedList.includes(norm(c.entry.patient.phone))
		);
		selected = [...preferred, ...others].slice(0, topN);
	}

	const now = new Date();
	const expiresAt = new Date(now.getTime() + expiryMinutes * 60000);

	for (const c of selected) {
		const offer = await db.offer.create({
			data: {
				appointmentId: appt.id,
				patientId: c.entry.patientId,
				status: "SENT",
				expiresAt,
			},
		});

		const timeStr = appt.startsAt.toLocaleString();
		const body = `SmartWait: A slot for ${appt.specialty} at ${timeStr}. Reply 1 to accept in ${expiryMinutes} min. Reply N to skip.`;
		// Send SMS only if not suppressed; and only to allowed phones when list provided
		if (!suppressSms && (allowedList.length === 0 || allowedList.includes(norm(c.entry.patient.phone)))) {
			try {
				const { sid } = await sendSms(c.entry.patient.phone, body);
				if (sid) {
					await db.offer.update({
						where: { id: offer.id },
						data: { smsSid: sid },
					});
				}
			} catch (err) {
				console.error("[SMS error]", err);
		await logEvent("SMS_ERROR", {
					error: (err as Error).message,
					appointmentId: appt.id,
					patientId: c.entry.patientId,
				});
			}
		}
		await logEvent("OFFER_SENT", {
			appointmentId: appt.id,
			patientId: c.entry.patientId,
			offerId: offer.id,
			patientName: c.entry.patient.name,
			specialty: appt.specialty,
		});
	}

	await logEvent("offer.batch_issued", {
		appointmentId: appt.id,
		count: selected.length,
	});
}

export async function acceptOfferForPatientPhone(phone: string) {
	// Find latest active offer to this patient
	const last10 = phone.replace(/\D/g, "").slice(-10);
	const patient = await db.patient.findFirst({ where: { phone: { contains: last10 } } });
	if (!patient) return { ok: false, message: "No patient found" };

	const offer = await db.offer.findFirst({
		where: {
			patientId: patient.id,
			status: OfferStatus.SENT,
			expiresAt: { gt: new Date() },
		},
		orderBy: { createdAt: "desc" },
	});
	if (!offer) return { ok: false, message: "No active offer" };

	// Assign appointment
	const appt = await db.appointment.update({
		where: { id: offer.appointmentId },
		data: { status: "FILLED", patientId: patient.id },
	});

	// Update offer and revoke others
	await db.offer.update({
		where: { id: offer.id },
		data: { status: "ACCEPTED", respondedAt: new Date() },
	});
	await db.offer.updateMany({
		where: {
			appointmentId: offer.appointmentId,
			status: OfferStatus.SENT,
			NOT: { id: offer.id },
		},
		data: { status: "REVOKED" },
	});

	await logEvent("OFFER_ACCEPTED", {
		appointmentId: offer.appointmentId,
		patientId: patient.id,
		offerId: offer.id,
		patientName: patient.name,
	});

	// Confirm SMS
	const timeStr = appt.startsAt.toLocaleString();
	await sendSms(phone, `Confirmed. See you at ${timeStr}. Text STOP to opt out.`);

	return { ok: true, message: "Accepted" };
}

export async function declineOfferForPatientPhone(phone: string) {
	const last10 = phone.replace(/\D/g, "").slice(-10);
	const patient = await db.patient.findFirst({ where: { phone: { contains: last10 } } });
	if (!patient) return { ok: false, message: "No patient found" };

	const offer = await db.offer.findFirst({
		where: {
			patientId: patient.id,
			status: OfferStatus.SENT,
			expiresAt: { gt: new Date() },
		},
		orderBy: { createdAt: "desc" },
	});
	if (!offer) return { ok: false, message: "No active offer" };

	await db.offer.update({
		where: { id: offer.id },
		data: { status: "REVOKED", respondedAt: new Date() },
	});
	await logEvent("OFFER_DECLINED", {
		appointmentId: offer.appointmentId,
		patientId: patient.id,
		offerId: offer.id,
		patientName: patient.name,
	});
	return { ok: true, message: "Declined" };
}

export async function acceptFirstOfferForAppointment(appointmentId: string) {
	// Normalize and load demo allowed phones to exclude in simulation auto-accept
	const norm = (p: string) => p.replace(/\D/g, "");
	const allowedList =
		process.env.DEMO_ALLOWED_PHONES
			?.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.map(norm) ?? [];

	// Find first active non-demo offer for this appointment
	const offers = await db.offer.findMany({
		where: {
			appointmentId,
			status: OfferStatus.SENT,
			expiresAt: { gt: new Date() },
		},
		orderBy: { createdAt: "asc" },
		include: { patient: true, appointment: true },
	});
	const offer = offers.find((o) => {
		const phone = o.patient?.phone ? norm(o.patient.phone) : "";
		const isDemo =
			allowedList.includes(phone) ||
			(o.patient?.name === "Omar Almishri" || o.patient?.name === "Mico Ben Issa");
		return !isDemo;
	}) ?? offers[0];
	if (!offer) return { ok: false, message: "No active offer to accept" };

	// Assign
	const appt = await db.appointment.update({
		where: { id: offer.appointmentId },
		data: { status: "FILLED", patientId: offer.patientId },
	});

	// Update offers
	await db.offer.update({
		where: { id: offer.id },
		data: { status: "ACCEPTED", respondedAt: new Date() },
	});
	await db.offer.updateMany({
		where: {
			appointmentId: offer.appointmentId,
			status: OfferStatus.SENT,
			NOT: { id: offer.id },
		},
		data: { status: "REVOKED" },
	});

	await logEvent("OFFER_ACCEPTED", {
		appointmentId: offer.appointmentId,
		patientId: offer.patientId,
		patientName: offer.patient.name,
	});

	return { ok: true, message: "Accepted", appointmentId: appt.id };
}

export async function cancelAppointmentForPatientPhone(phone: string) {
	// Find patient by phone (same logic as accept)
	const last10 = phone.replace(/\D/g, "").slice(-10);
	console.log("[CANCEL_FLOW] lookup patient by phone", { phone, last10 });
	const patient = await db.patient.findFirst({ where: { phone: { contains: last10 } } });
	console.log("[CANCEL_FLOW] patient match", { found: !!patient, patientId: patient?.id, patientName: patient?.name });
	if (!patient) return { ok: false, message: "No patient found" };

	// Find next scheduled appointment for this patient
	const nextAppt = await db.appointment.findFirst({
		where: { patientId: patient.id, status: "SCHEDULED" },
		orderBy: { startsAt: "asc" },
	});
	console.log("[CANCEL_FLOW] next scheduled appt", { nextApptId: nextAppt?.id });
	if (!nextAppt) return { ok: false, message: "No upcoming appointment" };

	// Cancel it
	const appt = await db.appointment.update({
		where: { id: nextAppt.id },
		data: { status: "CANCELLED", patientId: null },
	});
	console.log("[CANCEL_FLOW] appointment cancelled", { appointmentId: appt.id });
	
	await logEvent("APPOINTMENT_CANCELLED", {
		appointmentId: appt.id,
		patientId: patient.id,
		patientName: patient.name,
	});
	// Surface a narrative line in the activity feed immediately
	await logEvent("ACTIVITY_INFO", {
		message: "Sending offers to top 3 waitlist candidates…",
	});

	// Issue offers immediately
	try {
		await issueOffersForAppointment({ appointmentId: appt.id });
		console.log("[CANCEL_FLOW] offers issued", { appointmentId: appt.id });
	} catch (e) {
		console.error("[CANCEL_FLOW] offers error", e);
	}

	return { ok: true, message: "Cancelled and offers issued" };
}


