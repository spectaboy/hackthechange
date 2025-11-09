import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { OfferStatus } from "@prisma/client";
export const runtime = "nodejs";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const appointmentId = searchParams.get("appointmentId") || undefined;
	const where = appointmentId
		? { appointmentId }
		: { status: { in: [OfferStatus.SENT, OfferStatus.ACCEPTED] } };
	const offers = await db.offer.findMany({
		where,
		include: { patient: true, appointment: true },
		orderBy: { createdAt: "desc" },
		take: 50,
	});
	return NextResponse.json({ offers });
}


