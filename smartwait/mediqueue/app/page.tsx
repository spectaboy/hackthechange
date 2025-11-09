"use client";

import { useEffect, useMemo, useState } from "react";

type Summary = {
	scheduled: number;
	cancelled: number;
	filled: number;
	offersSent: number;
	warmedCount: number;
	highRisk: number;
};

type Appointment = {
	id: string;
	specialty: string;
	startsAt: string;
	durationMin: number;
	status: "SCHEDULED" | "CANCELLED" | "FILLED";
	patient?: { name: string } | null;
};

type Offer = {
	id: string;
	status: "SENT" | "ACCEPTED" | "EXPIRED" | "REVOKED";
	createdAt: string;
	expiresAt: string;
	patient: { name: string; phone: string };
	appointment: { specialty: string; startsAt: string };
};

type EventLog = {
	id: string;
	kind: string;
	createdAt: string;
	details: Record<string, unknown>;
};

export default function Home() {
	const [summary, setSummary] = useState<Summary | null>(null);
	const [appointments, setAppointments] = useState<Appointment[]>([]);
	const [offers, setOffers] = useState<Offer[]>([]);
	const [events, setEvents] = useState<EventLog[]>([]);
	const [loading, setLoading] = useState(false);

	async function refreshAll() {
		const [s, a, o, e] = await Promise.all([
			fetch("/api/dashboard/summary").then((r) => r.json()),
			fetch("/api/dashboard/appointments").then((r) => r.json()),
			fetch("/api/dashboard/offers").then((r) => r.json()),
			fetch("/api/dashboard/events").then((r) => r.json()),
		]);
		setSummary(s);
		setAppointments(a.appointments ?? []);
		setOffers(o.offers ?? []);
		setEvents(e.events ?? []);
	}

	useEffect(() => {
		refreshAll();
		const t = setInterval(refreshAll, 2000);
		return () => clearInterval(t);
	}, []);

	const kpis = useMemo(
		() => [
			{ label: "Scheduled", value: summary?.scheduled ?? 0 },
			{ label: "Cancelled", value: summary?.cancelled ?? 0 },
			{ label: "Filled", value: summary?.filled ?? 0 },
			{ label: "Active Offers", value: summary?.offersSent ?? 0 },
			{ label: "Standby Ready", value: summary?.warmedCount ?? 0 },
			{ label: "High-risk Upcoming", value: summary?.highRisk ?? 0 },
		],
		[summary]
	);

	async function seed() {
		setLoading(true);
		await fetch("/api/seed", { method: "POST" });
		await refreshAll();
		setLoading(false);
	}

	async function prepStandby() {
		setLoading(true);
		await fetch("/api/prep-standby", { method: "POST" });
		await refreshAll();
		setLoading(false);
	}

	async function cancel(id: string) {
		setLoading(true);
		await fetch(`/api/appointments/${id}/cancel`, { method: "POST" });
		await refreshAll();
		setLoading(false);
	}

	return (
		<div className="min-h-screen bg-zinc-50 text-zinc-900">
			<header className="mx-auto max-w-6xl px-6 py-6">
				<h1 className="text-2xl font-semibold">SmartWait Dashboard</h1>
				<p className="text-sm text-zinc-600">
					Live demo: auto-fill cancellations and prep standby via SMS
				</p>
			</header>
			<main className="mx-auto max-w-6xl px-6 pb-20">
				<div className="mb-4 flex gap-2">
					<button
						onClick={seed}
						disabled={loading}
						className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
					>
						Seed demo data
					</button>
					<button
						onClick={prepStandby}
						disabled={loading}
						className="rounded border border-zinc-300 px-4 py-2 disabled:opacity-50"
					>
						Prep standby (risk-based)
					</button>
				</div>

				{/* KPI tiles */}
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
					{kpis.map((k) => (
						<div
							key={k.label}
							className="rounded-lg border border-zinc-200 bg-white p-4"
						>
							<div className="text-xs text-zinc-500">{k.label}</div>
							<div className="text-2xl font-semibold">{k.value}</div>
						</div>
					))}
				</div>

				<div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
					{/* Schedule */}
					<section className="md:col-span-2 rounded-lg border border-zinc-200 bg-white p-4">
						<div className="mb-3 flex items-center justify-between">
							<h2 className="text-lg font-medium">Upcoming schedule</h2>
						</div>
						<div className="overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead>
									<tr className="text-left text-zinc-500">
										<th className="px-2 py-2">Time</th>
										<th className="px-2 py-2">Specialty</th>
										<th className="px-2 py-2">Duration</th>
										<th className="px-2 py-2">Status</th>
										<th className="px-2 py-2">Patient</th>
										<th className="px-2 py-2">Action</th>
									</tr>
								</thead>
								<tbody>
									{appointments.map((a) => (
										<tr key={a.id} className="border-t">
											<td className="px-2 py-2">
												{new Date(a.startsAt).toLocaleString()}
											</td>
											<td className="px-2 py-2">{a.specialty}</td>
											<td className="px-2 py-2">{a.durationMin} min</td>
											<td className="px-2 py-2">{a.status}</td>
											<td className="px-2 py-2">{a.patient?.name ?? "-"}</td>
											<td className="px-2 py-2">
												{a.status === "SCHEDULED" && (
													<button
														onClick={() => cancel(a.id)}
														disabled={loading}
														className="rounded bg-red-600 px-3 py-1 text-white disabled:opacity-50"
													>
														Mark Cancelled
													</button>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>

					{/* Activity + Offers */}
					<section className="rounded-lg border border-zinc-200 bg-white p-4">
						<h2 className="mb-3 text-lg font-medium">Activity</h2>
						<ul className="space-y-2 text-sm">
							{events.map((ev) => (
								<li key={ev.id} className="border-b pb-2">
									<div className="font-mono text-xs text-zinc-500">
										{new Date(ev.createdAt).toLocaleTimeString()} · {ev.kind}
									</div>
									<div className="truncate">
										{JSON.stringify(ev.details)}
									</div>
								</li>
							))}
						</ul>
					</section>

					<section className="rounded-lg border border-zinc-200 bg-white p-4 md:col-span-3">
						<h2 className="mb-3 text-lg font-medium">Offers</h2>
						<div className="overflow-x-auto">
							<table className="min-w-full text-sm">
								<thead>
									<tr className="text-left text-zinc-500">
										<th className="px-2 py-2">When</th>
										<th className="px-2 py-2">Patient</th>
										<th className="px-2 py-2">Phone</th>
										<th className="px-2 py-2">Appt</th>
										<th className="px-2 py-2">Status</th>
										<th className="px-2 py-2">Expires</th>
									</tr>
								</thead>
								<tbody>
									{offers.map((o) => (
										<tr key={o.id} className="border-t">
											<td className="px-2 py-2">
												{new Date(o.createdAt).toLocaleTimeString()}
											</td>
											<td className="px-2 py-2">{o.patient.name}</td>
											<td className="px-2 py-2">{o.patient.phone}</td>
											<td className="px-2 py-2">
												{new Date(o.appointment.startsAt).toLocaleString()} ·{" "}
												{o.appointment.specialty}
											</td>
											<td className="px-2 py-2">{o.status}</td>
											<td className="px-2 py-2">
												{new Date(o.expiresAt).toLocaleTimeString()}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
