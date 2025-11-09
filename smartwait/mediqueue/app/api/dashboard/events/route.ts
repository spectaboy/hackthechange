import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";

export async function GET() {
	const events = await db.eventLog.findMany({
		orderBy: { createdAt: "desc" },
		take: 50,
	});
	return NextResponse.json({ events });
}


