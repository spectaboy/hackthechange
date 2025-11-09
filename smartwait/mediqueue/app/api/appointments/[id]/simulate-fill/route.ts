import { NextResponse } from "next/server";
import { acceptFirstOfferForAppointment } from "@/lib/offers";
export const runtime = "nodejs";

export async function POST(
	_req: Request,
	ctx: { params: Promise<{ id: string }> }
) {
	const { id } = await ctx.params;
	const res = await acceptFirstOfferForAppointment(id);
	const status = res.ok ? 200 : 400;
	return NextResponse.json(res, { status });
}


