import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
import { logEvent } from "@/lib/events";

function rnd(min: number, max: number) {
	return Math.random() * (max - min) + min;
}

const SPECIALTIES = [
	"Dermatology",
	"Mental Health",
	"Orthopedic Surgery",
	"Cardiology",
	"Oncology",
	"Neurology",
	"Ophthalmology",
];

const CLINICS = [
	{ name: "Calgary Central", lat: 51.047, lng: -114.072 },
	{ name: "Edmonton West", lat: 53.546, lng: -113.494 },
];

export async function POST() {
	// Clear existing data (MVP)
	await db.offer.deleteMany({});
	await db.eventLog.deleteMany({});
	await db.waitlistEntry.deleteMany({});
	await db.appointment.deleteMany({});
	await db.patient.deleteMany({});

	// Patients
	const patients = await db.$transaction(
		Array.from({ length: 40 }).map((_, i) => {
			const city = CLINICS[i % CLINICS.length];
			return db.patient.create({
				data: {
					name: `Patient ${i + 1}`,
					phone:
						i === 0 && process.env.DEMO_PHONE
							? process.env.DEMO_PHONE
							: i === 1 && process.env.DEMO_PHONE_2
								? process.env.DEMO_PHONE_2
								: `+1${String(4030000000 + i).padStart(10, "0")}`,
					homeLat: city.lat + rnd(-0.2, 0.2),
					homeLng: city.lng + rnd(-0.2, 0.2),
					pastNoShows: Math.random() < 0.3 ? Math.floor(rnd(0, 3)) : 0,
					pastCancels: Math.random() < 0.4 ? Math.floor(rnd(0, 3)) : 0,
					avgConfirmDelayDays: Math.random() < 0.5 ? rnd(0, 4) : 1,
				},
			});
		})
	);

	// Waitlist entries
	await db.$transaction(
		patients.map((p, i) => {
			const isDemo = i === 0 && process.env.DEMO_PHONE;
			return db.waitlistEntry.create({
				data: {
					patientId: p.id,
					specialty: SPECIALTIES[i % SPECIALTIES.length],
					radiusKm: 25 + Math.floor(rnd(0, 30)),
					priority: isDemo ? 3 : Math.floor(rnd(0, 3)),
					warmed: isDemo ? true : Math.random() < 0.2,
				},
			});
		})
	);

	// Appointments
	const now = new Date();
	await db.$transaction(
		Array.from({ length: 16 }).map((_, i) => {
			const city = CLINICS[i % CLINICS.length];
			const startsAt = new Date(now.getTime() + (i + 1) * 60 * 60000); // spaced 1h apart
			return db.appointment.create({
				data: {
					specialty: SPECIALTIES[i % SPECIALTIES.length],
					startsAt,
					durationMin: [30, 45, 60][i % 3],
					status: "SCHEDULED",
					clinicLat: city.lat,
					clinicLng: city.lng,
				},
			});
		})
	);

	await logEvent("seed.completed", { patients: patients.length });
	return NextResponse.json({ ok: true });
}


