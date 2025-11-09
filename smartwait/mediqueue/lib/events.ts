import { db } from "./db";
import type { Prisma } from "@prisma/client";

export async function logEvent(kind: string, details: Prisma.InputJsonValue) {
	// Ensure JSON-serializable payload (strip undefined/functions)
	const safe: Prisma.InputJsonValue = JSON.parse(
		JSON.stringify(details ?? null)
	);
	await db.eventLog.create({
		data: { kind, details: safe },
	});
}


