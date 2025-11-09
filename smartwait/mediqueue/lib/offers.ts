import { db } from "./db";
import { rankCandidates } from "./match";
import { logEvent } from "./events";
import { sendSms } from "./twilio";
import { OfferStatus } from "@prisma/client";

export async function issueOffersForAppointment(params: {
	appointmentId: string;
	topN?: number;
	expiryMinutes?: number;
}) {
	const { appointmentId } = params;
	const topN = params.topN ?? 3;
	const expiryMinutes = params.expiryMinutes ?? 5;

	const appt = await db.appointment.findUnique({
		where: { id: appointmentId },
	});
	if (!appt) throw new Error("Appointment not found");
	if (appt.status !== "CANCELLED" && appt.status !== "SCHEDULED") {
		throw new Error("Appointment not eligible for offers");
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
	// Demo bias: ensure DEMO_PHONE candidate is included and prioritized if present
	let selected = ranked.slice(0, topN);
	const demoPhone = process.env.DEMO_PHONE;
	if (demoPhone) {
		const demoIdx = ranked.findIndex(
			(c) => c.entry.patient.phone.replace(/\D/g, "") === demoPhone.replace(/\D/g, "")
		);
		if (demoIdx >= 0) {
			const demoCandidate = ranked[demoIdx];
			// Put demo candidate at the start
			selected = [
				demoCandidate,
				...ranked.filter((_, i) => i !== demoIdx).slice(0, topN - 1),
			];
		}
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
		const { sid } = await sendSms(c.entry.patient.phone, body);
		if (sid) {
			await db.offer.update({
				where: { id: offer.id },
				data: { smsSid: sid },
			});
		}
		await logEvent("offer.sent", {
			appointmentId: appt.id,
			patientId: c.entry.patientId,
			offerId: offer.id,
		});
	}

	await logEvent("offer.batch_issued", {
		appointmentId: appt.id,
		count: selected.length,
	});
}

export async function acceptOfferForPatientPhone(phone: string) {
	// Find latest active offer to this patient
	const patient = await db.patient.findFirst({ where: { phone } });
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

	await logEvent("offer.accepted", {
		appointmentId: offer.appointmentId,
		patientId: patient.id,
		offerId: offer.id,
	});

	// Confirm SMS
	const timeStr = appt.startsAt.toLocaleString();
	await sendSms(phone, `Confirmed. See you at ${timeStr}. Text STOP to opt out.`);

	return { ok: true, message: "Accepted" };
}

export async function declineOfferForPatientPhone(phone: string) {
	const patient = await db.patient.findFirst({ where: { phone } });
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
	await logEvent("offer.declined", {
		appointmentId: offer.appointmentId,
		patientId: patient.id,
		offerId: offer.id,
	});
	return { ok: true, message: "Declined" };
}


