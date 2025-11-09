import { Appointment, Patient } from "@prisma/client";

export function computeNoShowRisk(input: {
	appointment: Pick<Appointment, "startsAt" | "durationMin" | "specialty">;
	patient: Pick<
		Patient,
		"pastNoShows" | "pastCancels" | "avgConfirmDelayDays"
	>;
	weekday?: number; // 0 (Sun) - 6 (Sat)
	hour?: number; // 0-23
	weather?: { extremeCold?: boolean; snowStorm?: boolean } | null;
}): number {
	const { appointment, patient } = input;
	const date = new Date(appointment.startsAt);
	const weekday = input.weekday ?? date.getDay();
	const hour = input.hour ?? date.getHours();

	let score = 0.2;

	// Lead time: assume compute offline; for MVP we approximate using duration as proxy
	// If duration is long, add some risk
	if (appointment.durationMin >= 60) score += 0.1;

	// Day/time effects
	if (weekday === 1 || weekday === 5) score += 0.05; // Mon or Fri
	if (hour <= 9 || hour >= 16) score += 0.05; // early or late

	// Specialty heuristics
	const s = appointment.specialty.toLowerCase();
	if (s.includes("mental")) score += 0.1;
	else if (s.includes("derma")) score += 0.05;
	else if (s.includes("surgery") || s.includes("onco")) score -= 0.1;

	// History
	score += Math.min(0.24, Math.max(0, patient.pastNoShows) * 0.08);
	score += Math.min(0.15, Math.max(0, patient.pastCancels) * 0.05);
	if ((patient.avgConfirmDelayDays ?? 0) > 2) score += 0.1;

	// Weather
	if (input.weather?.extremeCold || input.weather?.snowStorm) score += 0.1;

	// Clamp to [0, 1]
	return Math.max(0, Math.min(1, score));
}


