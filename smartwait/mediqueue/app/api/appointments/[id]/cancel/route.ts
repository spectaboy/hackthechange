import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueOffersForAppointment } from "@/lib/offers";
import { logEvent } from "@/lib/events";
export const runtime = "nodejs";

export async function POST(
	_req: Request,
	ctx: { params: Promise<{ id: string }> }
) {
	const { id } = await ctx.params;
	if (!id) {
		return NextResponse.json(
			{ ok: false, error: "Missing appointment id" },
			{ status: 400 }
		);
	}
	const appt = await db.appointment.update({
		where: { id },
		data: { status: "CANCELLED" },
	});
	await logEvent("appointment.cancelled", { appointmentId: appt.id });
	await issueOffersForAppointment({ appointmentId: appt.id });
	return NextResponse.json({ ok: true });
}


