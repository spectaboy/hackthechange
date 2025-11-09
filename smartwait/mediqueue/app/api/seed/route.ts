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
	// Non-destructive seed: ensure demo data exists; do NOT delete anything.

	// Helper: find-or-create patient by phone (last 10)
	const getOrCreatePatientByPhone = async (opts: {
		name: string;
		phone: string;
		cityIndex: number;
		config?: {
			confirmReliability?: number;
			pastNoShows?: number;
			pastCancels?: number;
			avgConfirmDelayDays?: number;
		};
	}) => {
		const last10 = opts.phone.replace(/\D/g, "").slice(-10);
		const existing = await db.patient.findFirst({
			where: { phone: { contains: last10 } },
		});
		if (existing) return existing;
		const city = CLINICS[opts.cityIndex % CLINICS.length];
		return db.patient.create({
			data: {
				name: opts.name,
				phone: opts.phone,
				homeLat: city.lat + rnd(-0.2, 0.2),
				homeLng: city.lng + rnd(-0.2, 0.2),
				ageYears: 18 + Math.floor(rnd(0, 70)),
				confirmReliability: opts.config?.confirmReliability ?? Math.round(rnd(0.5, 0.98) * 100) / 100,
				pastNoShows: opts.config?.pastNoShows ?? (Math.random() < 0.4 ? Math.floor(rnd(0, 3)) : 0),
				pastCancels: opts.config?.pastCancels ?? (Math.random() < 0.5 ? Math.floor(rnd(0, 3)) : 0),
				avgConfirmDelayDays: opts.config?.avgConfirmDelayDays ?? (Math.random() < 0.6 ? rnd(0, 4) : 1),
			},
		});
	};

	// Ensure demo patients exist (Omar, Mico)
	const omar = await getOrCreatePatientByPhone({
		name: "Omar Almishri",
		phone: process.env.DEMO_PHONE ?? "+18259940093",
		cityIndex: 0,
		config: { confirmReliability: 0.95, pastNoShows: 0, pastCancels: 0, avgConfirmDelayDays: 0.5 },
	});
	const mico = await getOrCreatePatientByPhone({
		name: "Mico Ben Issa",
		phone: process.env.DEMO_PHONE_2 ?? "+15875759496",
		cityIndex: 1,
		config: { confirmReliability: 0.85, pastNoShows: 1, pastCancels: 0, avgConfirmDelayDays: 1.2 },
	});

	// Ensure a pool of additional patients exists
	const extraPatients: typeof omar[] = [];
	for (let i = 2; i < 40; i++) {
		const name = PATIENT_NAMES[(i - 2 + PATIENT_NAMES.length) % PATIENT_NAMES.length];
		const phone = `+1${String(5874100000 + i).padStart(10, "0")}`;
		const p = await getOrCreatePatientByPhone({
			name,
			phone,
			cityIndex: i,
		});
		extraPatients.push(p);
	}
	const patients = [omar, mico, ...extraPatients];

	// Waitlist entries
	for (let i = 0; i < patients.length; i++) {
		const p = patients[i];
		const spec = SPECIALTIES[i % SPECIALTIES.length];
		const existing = await db.waitlistEntry.findFirst({
			where: { patientId: p.id, specialty: spec },
		});
		if (!existing) {
			const isDemo = (i === 0 && !!process.env.DEMO_PHONE) || (i === 1 && !!process.env.DEMO_PHONE_2);
			await db.waitlistEntry.create({
				data: {
					patientId: p.id,
					specialty: spec,
					radiusKm: 25 + Math.floor(rnd(0, 30)),
					priority: isDemo ? 3 : Math.floor(rnd(0, 3)),
					warmed: isDemo ? true : Math.random() < 0.2,
				},
			});
		}
	}

	// Appointments
	const now = new Date();

	// Ensure a demo appointment for Omar exists soon
	let demoAppt = await db.appointment.findFirst({
		where: { patientId: omar.id, status: "SCHEDULED", startsAt: { gt: now, lt: new Date(now.getTime() + 2 * 60 * 60000) } },
	});
	if (!demoAppt) {
		const demoStarts = new Date(now.getTime() + 10 * 60000);
		demoAppt = await db.appointment.create({
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
	}

	// Reset upcoming FILLED to SCHEDULED so dashboard starts clean (non-destructive)
	await db.appointment.updateMany({
		where: { startsAt: { gt: now }, status: { in: ["FILLED"] } },
		data: { status: "SCHEDULED" },
	});

	// Ensure there are at least 16 additional upcoming scheduled appointments (total 17 with Omar)
	const existingUpcoming = await db.appointment.count({
		where: { status: "SCHEDULED", startsAt: { gt: now } },
	});
	const target = 17;
	const need = Math.max(0, target - existingUpcoming);
	for (let i = 0; i < need; i++) {
		const idx = i % 16;
		const city = CLINICS[idx % CLINICS.length];
		const startsAt = new Date(now.getTime() + (idx + 1) * 60 * 60000);
		const assignedIndex = (idx % (patients.length - 2)) + 2;
		const patient = patients[assignedIndex] ?? patients[2];
		await db.appointment.create({
			data: {
				specialty: SPECIALTIES[idx % SPECIALTIES.length],
				startsAt,
				durationMin: [30, 45, 60][idx % 3],
				status: "SCHEDULED",
				clinicLat: city.lat,
				clinicLng: city.lng,
				patientId: patient.id,
			},
		});
	}

	// Send confirmation to Omar for the demo appointment
	{
		const timeStr = demoAppt.startsAt.toLocaleString();
		await sendSms(
			omar.phone,
			`Mediqueue: Confirm your appointment A-DEM1 at ${timeStr}. Reply C to confirm or X to cancel.`
		);
	}

	// Ensure both demo phones have waitlist entries for Cardiology to receive offers
	for (const p of [omar, mico]) {
		const existing = await db.waitlistEntry.findFirst({
			where: { patientId: p.id, specialty: "Cardiology" },
		});
		if (!existing) {
			await db.waitlistEntry.create({
				data: {
					patientId: p.id,
					specialty: "Cardiology",
					radiusKm: 50,
					priority: 5,
					warmed: true,
				},
			});
		}
	}

	await logEvent("seed.completed", { patients: patients.length, demoAppointmentId: demoAppt.id });
	return NextResponse.json({ ok: true, demoAppointmentId: demoAppt.id });
}


