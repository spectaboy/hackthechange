export function getSimulatedWeatherSeverity(at: Date): number {
	// Simple heuristic: colder mornings and late nights worse; occasional spike
	const hour = at.getHours();
	let base = 0.2;
	if (hour <= 9 || hour >= 20) base += 0.2;
	// Random mild fluctuation per hour bucket
	const seed = at.getFullYear() * 10000 + (at.getMonth() + 1) * 100 + at.getDate() * 10 + Math.floor(hour / 2);
	const rand = pseudoRandom(seed);
	if (rand > 0.92) base += 0.3; // rare spike (e.g., storm)
	return clamp(base, 0, 1);
}

function pseudoRandom(seed: number): number {
	// xorshift-ish deterministic per seed
	let x = seed ^ 0x6d2b79f5;
	x = Math.imul(x ^ (x >>> 15), 1 | x);
	x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
	return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

function clamp(v: number, min: number, max: number) {
	return Math.max(min, Math.min(max, v));
}


