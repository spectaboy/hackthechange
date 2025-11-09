import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const runtime = "nodejs";
import { logEvent } from "@/lib/events";
import { sendSms } from "@/lib/twilio";

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

// Diverse patient names for dummy data (beyond Omar and Mico)
const PATIENT_NAMES = [
	"Harper Mendez",
	"Aiden Singh",
	"Naomi Okafor",
	"Sofia Morin",
	"Mateo Alvarez",
	"Kenji Sato",
	"Layla Haddad",
	"Isabella Rossi",
	"Gabriel Munro",
	"Evelyn Chen",
	"Priya Patel",
	"Leo Dubois",
	"Fatima Suleiman",
	"Hudson Clark",
	"Xinyi Zhao",
	"Daniela Costa",
	"Noah Sinclair",
	"Zara Kaur",
	"Jonah Peters",
	"Maya Desai",
	"Liam Bennett",
	"Aria Khan",
	"Lucas Ferreira",
	"Ava Nguyen",
	"Oliver Petrov",
	"Emma Johansson",
	"Amir Haddadi",
	"Chloe Laurent",
	"Diego Torres",
	"Gianna Romano",
	"Yara Mansour",
	"James Park",
	"Elena Ivanova",
	"Marcus Silva",
	"Luna Ortega",
	"David Cohen",
	"Nora Schmidt",
];

export async function POST() {
	// Clear existing data (MVP)
	await db.offer.deleteMany({});
	await db.eventLog.deleteMany({});
	await db.waitlistEntry.deleteMany({});
	await db.appointment.deleteMany({});
	await db.patient.deleteMany({});

	// Patients (first two are named demo patients; others use diverse names)
	const patients = await db.$transaction(
		Array.from({ length: 40 }).map((_, i) => {
			const city = CLINICS[i % CLINICS.length];
			const isOmar = i === 0;
			const isMico = i === 1;
			const fallbackName = PATIENT_NAMES[(i - 2 + PATIENT_NAMES.length) % PATIENT_NAMES.length];
			const name = isOmar ? "Omar Almishri" : isMico ? "Mico Ben Issa" : fallbackName;
			const phone = isOmar
				? (process.env.DEMO_PHONE ?? "+18259940093")
				: isMico
					? (process.env.DEMO_PHONE_2 ?? "+15875759496")
					: `+1${String(5874100000 + i).padStart(10, "0")}`;
			return db.patient.create({
				data: {
					name,
					phone,
					homeLat: city.lat + rnd(-0.2, 0.2),
					homeLng: city.lng + rnd(-0.2, 0.2),
					pastNoShows: isOmar ? 0 : isMico ? 1 : Math.random() < 0.4 ? Math.floor(rnd(0, 3)) : 0,
					pastCancels: isOmar ? 0 : isMico ? 0 : Math.random() < 0.5 ? Math.floor(rnd(0, 3)) : 0,
					avgConfirmDelayDays: isOmar ? 0.5 : isMico ? 1.2 : Math.random() < 0.6 ? rnd(0, 4) : 1,
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

	// Create a demo appointment A-DEM1 in ~10 minutes, assigned to Omar
	const omar = patients[0];
	const demoStarts = new Date(now.getTime() + 10 * 60000);
	const demoAppt = await db.appointment.create({
		data: {
			specialty: "Cardiology",
			startsAt: demoStarts,
			durationMin: 30,
			status: "SCHEDULED",
			clinicLat: CLINICS[0].lat,
			clinicLng: CLINICS[0].lng,
			patientId: omar.id,
		},
	});

	await db.$transaction(
		Array.from({ length: 16 }).map((_, i) => {
			const city = CLINICS[i % CLINICS.length];
			const startsAt = new Date(now.getTime() + (i + 1) * 60 * 60000); // spaced 1h apart
			// Always assign a patient to display names in schedule (skip the first slot which is Omar's demo)
			// Use round-robin across the pool starting after Omar/Mico to diversify names.
			const assignedIndex = (i % (patients.length - 2)) + 2;
			const patientId = patients[assignedIndex]?.id ?? patients[2]?.id;
			return db.appointment.create({
				data: {
					specialty: SPECIALTIES[i % SPECIALTIES.length],
					startsAt,
					durationMin: [30, 45, 60][i % 3],
					status: "SCHEDULED",
					clinicLat: city.lat,
					clinicLng: city.lng,
					patientId,
				},
			});
		})
	);

	// Send confirmation to Omar for the demo appointment
	const timeStr = demoAppt.startsAt.toLocaleString();
	await sendSms(
		omar.phone,
		`Mediqueue: Confirm your appointment A-DEM1 at ${timeStr}. Reply C to confirm or X to cancel.`
	);

	await logEvent("seed.completed", { patients: patients.length, demoAppointmentId: demoAppt.id });
	return NextResponse.json({ ok: true, demoAppointmentId: demoAppt.id });
}


