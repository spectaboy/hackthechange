import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const appointmentId = searchParams.get("appointmentId") || undefined;
	const where = appointmentId
		? { appointmentId }
		: { status: { in: ["SENT", "ACCEPTED"] } };
	const offers = await db.offer.findMany({
		where,
		include: { patient: true, appointment: true },
		orderBy: { createdAt: "desc" },
		take: 50,
	});
	return NextResponse.json({ offers });
}


