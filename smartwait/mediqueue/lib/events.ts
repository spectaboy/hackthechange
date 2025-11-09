import { db } from "./db";

export async function logEvent(kind: string, details: Record<string, unknown>) {
	await db.eventLog.create({
		data: { kind, details },
	});
}


