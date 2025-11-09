import { NextResponse } from "next/server";
import { acceptOfferForPatientPhone, declineOfferForPatientPhone } from "@/lib/offers";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
	// Twilio sends x-www-form-urlencoded
	const text = await req.text();
	const params = new URLSearchParams(text);
	const from = params.get("From") || params.get("from") || "";
	const body = (params.get("Body") || params.get("body") || "").trim().toUpperCase();

	if (!from) return NextResponse.json({ ok: false }, { status: 400 });

	if (["1", "Y", "YES", "ACCEPT"].includes(body)) {
		const res = await acceptOfferForPatientPhone(from);
		return NextResponse.json({ ok: res.ok, message: res.message });
	}
	if (["N", "NO"].includes(body)) {
		const res = await declineOfferForPatientPhone(from);
		return NextResponse.json({ ok: res.ok, message: res.message });
	}
	if (["READY"].includes(body)) {
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
	await logEvent("sms.unknown", { from, body });
	return NextResponse.json({ ok: true });
}


