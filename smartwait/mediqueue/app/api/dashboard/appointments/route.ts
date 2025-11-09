import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeNoShowRisk } from "@/lib/risk";
import { getSimulatedWeatherSeverity } from "@/lib/weather";
export const runtime = "nodejs";

export async function GET() {
	const appointments = await db.appointment.findMany({
		include: { patient: true },
		orderBy: { startsAt: "asc" },
		take: 50,
	});

	const enriched = appointments.map((a) => {
		const startsAt = new Date(a.startsAt);
		const patient =
			a.patient ?? { pastNoShows: 0, pastCancels: 0, avgConfirmDelayDays: 1 };
		const severity = getSimulatedWeatherSeverity(startsAt);
		const riskScore = computeNoShowRisk({
			appointment: a,
			patient,
			weather: { extremeCold: severity >= 0.7, snowStorm: severity >= 0.7 },
		});
		const riskLevel =
			riskScore >= 0.55 ? "HIGH" : riskScore >= 0.3 ? "MEDIUM" : "LOW";
		const provider = getProviderName(a.specialty, startsAt);
		return {
			...a,
			provider,
			riskScore,
			riskLevel,
		};
	});

	return NextResponse.json({ appointments: enriched });
}

function getProviderName(specialty: string, startsAt: Date): string {
	const providersBySpecialty: Record<string, string[]> = {
		Cardiology: ["Dr. Lee", "Dr. Aiden Singh", "Dr. Priya Patel"],
		Dermatology: ["Dr. Frank", "Dr. Maria Chen"],
		"Mental Health": ["Dr. Zoe Hart", "Dr. Gabriel Munro"],
		"Orthopedic Surgery": ["Dr. Chloe Bennett", "Dr. Ibrahim Kassim"],
		Neurology: ["Dr. Eva Laurent", "Dr. Malik Farah"],
		Oncology: ["Dr. Rafael Costa", "Dr. Naomi Okafor"],
		Ophthalmology: ["Dr. Clara Ibarra", "Dr. Henry Lewis"],
	};
	const list = providersBySpecialty[specialty] ?? ["Dr. Alex Morgan"];
	const index = startsAt.getHours() % list.length;
	return list[index];
}


