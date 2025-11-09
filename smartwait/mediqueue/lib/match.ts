import { Patient, WaitlistEntry } from "@prisma/client";

export type Candidate = {
	entry: WaitlistEntry & { patient: Patient };
	score: number;
	distanceKm: number | null;
	canArriveMinutes: number | null;
};

function haversineKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const R = 6371; // km
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function estimateTravelMinutes(distanceKm: number): number {
	// Simple heuristic: 35 km/h average
	return Math.round((distanceKm / 35) * 60);
}

export function rankCandidates(params: {
	waitlist: (WaitlistEntry & { patient: Patient })[];
	clinicLat?: number | null;
	clinicLng?: number | null;
	startsAt: Date;
	minPrepMinutes?: number;
}): Candidate[] {
	const { waitlist, clinicLat, clinicLng } = params;
	const minPrepMinutes = params.minPrepMinutes ?? 30;
	const startsAtMs = params.startsAt.getTime();
	const nowMs = Date.now();

	// First pass: compute raw scores and attributes
	const raw = waitlist
		.map((entry) => {
			let distanceKm: number | null = null;
			let canArriveMinutes: number | null = null;
			if (
				clinicLat != null &&
				clinicLng != null &&
				entry.patient.homeLat != null &&
				entry.patient.homeLng != null
			) {
				distanceKm = haversineKm(
					entry.patient.homeLat,
					entry.patient.homeLng,
					clinicLat,
					clinicLng
				);
				canArriveMinutes = estimateTravelMinutes(distanceKm);
				// Cap ETA to a reasonable demo range
				canArriveMinutes = Math.max(5, Math.min(80, canArriveMinutes));
			}

			// Base score
			let score = 0;

			// Distance fit
			if (distanceKm != null) {
				const within = distanceKm <= entry.radiusKm;
				score += within ? 0.3 : -0.2;
				// Closer is better
				score += Math.max(0, (entry.radiusKm - distanceKm) / entry.radiusKm) * 0.2;
			}

			// Time-to-appointment feasibility
			const minutesUntil =
				startsAtMs > nowMs ? Math.round((startsAtMs - nowMs) / 60000) : 0;
			if (canArriveMinutes != null) {
				const feasible = minutesUntil - canArriveMinutes >= minPrepMinutes;
				score += feasible ? 0.25 : -0.2;
			}

			// Engagement
			const penaltyNoShows = Math.min(3, Math.max(0, entry.patient.pastNoShows));
			const penaltyCancels = Math.min(3, Math.max(0, entry.patient.pastCancels));
			score += -0.05 * penaltyNoShows - 0.03 * penaltyCancels;

			// Priority / warmed
			score += Math.min(0.2, entry.priority * 0.05);
			if (entry.warmed) score += 0.1;

			// Micro tie-breaker on createdAt (older first) – tiny epsilon
			const epsilon = (new Date(entry.createdAt).getTime() % 1000) * 1e-6;
			const sortScore = score + epsilon;

			return { entry, rawScore: score, sortScore, distanceKm, canArriveMinutes };
		});

	// Normalize scores to 0..1
	const minScore = Math.min(...raw.map((r) => r.rawScore));
	const maxScore = Math.max(...raw.map((r) => r.rawScore));
	const denom = maxScore - minScore || 1;

	const normalized: Candidate[] = raw
		.map((r) => ({
			entry: r.entry,
			score: Math.max(0, Math.min(1, (r.rawScore - minScore) / denom)),
			distanceKm: r.distanceKm,
			canArriveMinutes: r.canArriveMinutes,
		}))
		.sort((a, b) => b.score - a.score);

	return normalized;
}


