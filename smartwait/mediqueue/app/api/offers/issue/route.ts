import { NextResponse } from "next/server";
import { issueOffersForAppointment } from "@/lib/offers";

export async function POST(req: Request) {
	const body = await req.json().catch(() => ({}));
	const appointmentId = body.appointmentId as string | undefined;
	if (!appointmentId) {
		return NextResponse.json({ ok: false, error: "appointmentId required" }, { status: 400 });
	}
	await issueOffersForAppointment({ appointmentId });
	return NextResponse.json({ ok: true });
}


