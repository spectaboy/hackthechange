import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";

export async function GET() {
	const appointments = await db.appointment.findMany({
		include: { patient: true },
		orderBy: { startsAt: "asc" },
		take: 50,
	});
	return NextResponse.json({ appointments });
}


