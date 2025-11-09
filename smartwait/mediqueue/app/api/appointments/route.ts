import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";

type Scope = "day" | "week" | "month" | "all";

export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const specialty = searchParams.get("specialty") || undefined;
	const scope = (searchParams.get("scope") as Scope) || "week";
	const dateParam = searchParams.get("date");
	const base = dateParam ? new Date(dateParam) : new Date();

	const range = getRange(scope, base);

	const where: any = {
		startsAt: { gte: range.start, lt: range.end },
	};
	if (specialty) where.specialty = specialty;

	const appointments = await db.appointment.findMany({
		where,
		include: { patient: true },
		orderBy: { startsAt: "asc" },
		take: scope === "all" ? 200 : 100,
	});
	return NextResponse.json({ appointments });
}

function getRange(scope: Scope, base: Date) {
	const startOfDay = new Date(base.getFullYear(), base.getMonth(), base.getDate());
	if (scope === "day") {
		return { start: startOfDay, end: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) };
	}
	if (scope === "week") {
		const startOfWeek = new Date(startOfDay);
		startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 7);
		return { start: startOfWeek, end: endOfWeek };
	}
	if (scope === "month") {
		const startOfMonth = new Date(base.getFullYear(), base.getMonth(), 1);
		const endOfMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
		return { start: startOfMonth, end: endOfMonth };
	}
	// all
	const start = new Date();
	const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
	return { start, end };
}


