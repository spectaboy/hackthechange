import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
	try {
		await db.$queryRaw`SELECT 1`;
		return NextResponse.json({ ok: true });
	} catch (e) {
		return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200 });
	}
}


