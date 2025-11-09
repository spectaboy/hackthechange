"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

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
	provider?: string;
	riskScore?: number;
	riskLevel?: "LOW" | "MEDIUM" | "HIGH";
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
	const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
	const activityRef = useRef<HTMLDivElement | null>(null);
	// Drawer state for appointment details
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [detailLoading, setDetailLoading] = useState(false);
	const [selectedAppointment, setSelectedAppointment] = useState<any>(null);

	// Derived departments from appointment specialties
	const departments = useMemo(() => {
		const s = new Set<string>();
		for (const a of appointments) s.add(a.specialty);
		return Array.from(s).sort();
	}, [appointments]);
	const [activeDept, setActiveDept] = useState<string>("");
	const [timeFilter, setTimeFilter] = useState<"day" | "week" | "month" | "all">("week");

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
		setLastSyncAt(new Date());
	}

	useEffect(() => {
		refreshAll();
		const t = setInterval(refreshAll, 2000);
		return () => clearInterval(t);
	}, []);

	// Smooth auto-scroll activity feed on new events
	useEffect(() => {
		const el = activityRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
	}, [events.length]);

	// Client-side simulation of auto-fill narrative after a cancellation
	const processedCancellations = useRef<Set<string>>(new Set());
	useEffect(() => {
		// Find the most recent cancellation event
		const lastCancel = [...events]
			.reverse()
			.find((e) => e.kind === "APPOINTMENT_CANCELLED" && (e.details as any)?.appointmentId);
		const apptId = (lastCancel?.details as any)?.appointmentId as string | undefined;
		if (!apptId || processedCancellations.current.has(apptId)) return;
		processedCancellations.current.add(apptId);

		// After 1s, add "sending offers" activity (logged as ACTIVITY_INFO via local POST)
		setTimeout(async () => {
			try {
				// Fire-and-forget: not critical if fails
				await fetch("/api/dashboard/events", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						kind: "ACTIVITY_INFO",
						details: { message: "Sending offers to top 3 waitlist candidates…" },
					}),
				});
			} catch {}
		}, 1000);

		// After 3-5s, trigger simulate fill endpoint (auto-accept) to close the loop
		const delay = 3000 + Math.floor(Math.random() * 2000);
		setTimeout(async () => {
			try {
				await fetch(`/api/appointments/${apptId}/simulate-fill`, { method: "POST" });
			} catch {}
		}, delay);
	}, [events]);

	// Format activity feed entries
	const formattedEvents = useMemo(() => {
		return events.slice(-20).reverse().map((ev) => {
			const time = new Date(ev.createdAt).toLocaleTimeString("en-US", {
				hour: "2-digit",
				minute: "2-digit",
			});
			const kind = ev.kind;
			const details = ev.details as Record<string, unknown>;
			
			if (kind === "OFFER_SENT" && details.patientName && details.specialty) {
				return `[${time}] Offer sent → ${details.patientName} (${details.specialty})`;
			}
			if (kind === "OFFER_ACCEPTED" && details.patientName) {
				return `[${time}] ${details.patientName} ACCEPTED`;
			}
			if (kind === "OFFER_DECLINED" && details.patientName) {
				return `[${time}] ${details.patientName} DECLINED`;
			}
			if (kind === "APPOINTMENT_CANCELLED" && details.appointmentId) {
				return `[${time}] Appointment cancelled (${details.appointmentId})`;
			}
			if (kind === "ACTIVITY_INFO" && details.message) {
				return `[${time}] ${details.message}`;
			}
			return `[${time}] ${kind}`;
		});
	}, [events]);

	const kpis = useMemo(
		() => [
			{ label: "Avg Wait Time ↓", value: "2.3d", trend: "down" },
			{ label: "Active Appointments", value: summary?.scheduled ?? 0 },
			{ label: "Auto-Filled Slots", value: summary?.filled ?? 0 },
			{ label: "Cancellations", value: summary?.cancelled ?? 0 },
			{ label: "Offers Accepted", value: offers.filter((o) => o.status === "ACCEPTED").length },
		],
		[summary, offers]
	);

	const visibleAppointments = useMemo(() => {
		const now = new Date();
		const filterByTime = (date: Date): boolean => {
			if (timeFilter === "all") return true;
			
			const appointmentDate = new Date(date);
			const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			
			if (timeFilter === "day") {
				return appointmentDate >= startOfDay && appointmentDate < new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
			}
			
			if (timeFilter === "week") {
				const startOfWeek = new Date(startOfDay);
				startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
				const endOfWeek = new Date(startOfWeek);
				endOfWeek.setDate(startOfWeek.getDate() + 7);
				return appointmentDate >= startOfWeek && appointmentDate < endOfWeek;
			}
			
			if (timeFilter === "month") {
				const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
				const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
				return appointmentDate >= startOfMonth && appointmentDate < endOfMonth;
			}
			
			return true;
		};

		return appointments.filter((a) => {
			// Department filter
			if (activeDept && !a.specialty.toLowerCase().includes(activeDept.toLowerCase())) {
				return false;
			}
			// Time filter
			return filterByTime(new Date(a.startsAt));
		});
	}, [appointments, activeDept, timeFilter]);

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
		<div className="relative min-h-screen overflow-hidden bg-white text-zinc-900">
			{/* Blue sky background with soft gradient */}
			<div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-sky-100 to-white" aria-hidden />
			{/* Green hill at bottom */}
			<div
				className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-emerald-500 to-emerald-400"
				style={{ clipPath: "ellipse(120% 60% at 50% 100%)" }}
				aria-hidden
			/>

			<div className="relative flex min-h-screen overflow-hidden">
				{/* Left Sidebar - Fixed */}
				<aside className="sticky top-0 h-screen w-80 shrink-0 border-r border-sky-100 bg-white/80 backdrop-blur flex flex-col">
					<div className="flex-1 flex flex-col px-6 pt-6 pb-0 min-h-0">
						<h3 className="mb-6 shrink-0 text-base font-semibold uppercase tracking-wider text-sky-800">
							Departments
						</h3>
						<ul className="flex-1 space-y-2.5 overflow-y-auto min-h-0">
							{departments.map((d) => (
								<li key={d}>
									<button
										onClick={() => setActiveDept(d)}
										className={cn(
											"w-full rounded-lg px-5 py-3.5 text-left text-lg font-medium transition-all",
											activeDept === d
												? "bg-gradient-to-r from-sky-100 to-blue-50 text-sky-900 shadow-lg ring-2 ring-sky-300/50 border-l-4 border-sky-500"
												: "text-sky-600 hover:bg-sky-50/50 hover:text-sky-900"
										)}
									>
										<span className={cn(activeDept === d && "font-bold")}>
											{d}
										</span>
									</button>
								</li>
							))}
						</ul>
					</div>
					<div className="shrink-0 px-6 pb-4 pt-2">
						<button className="flex w-full items-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-3 text-base font-medium text-sky-700 transition-colors hover:bg-sky-50">
							<Settings className="h-5 w-5" />
							Settings
						</button>
					</div>
				</aside>

				{/* Main Content Area */}
				<main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
					{/* Top Bar */}
					<div className="sticky top-0 z-10 mx-8 mt-6 mb-6">
						<div className="rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white/95 to-sky-50/30 p-6 shadow-lg backdrop-blur-sm">
							<div className="flex items-center justify-between min-w-0">
								<h1 className="text-xl font-semibold text-sky-900 min-w-0 truncate">Smart Scheduling Dashboard</h1>
								<div className="flex items-center gap-6 text-sm text-sky-700 shrink-0">
									<span className="inline-flex items-center gap-1.5 text-emerald-700">
										<CheckCircle2 className="h-4 w-4" />
										Auto-Fill: ON
									</span>
									<span>Last Sync: {lastSyncAt ? lastSyncAt.toLocaleTimeString() : "—"}</span>
								</div>
							</div>
							{/* Action Buttons */}
							<div className="mt-4 flex items-center gap-3">
							<button
								onClick={seed}
								disabled={loading}
								className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:bg-emerald-700 disabled:opacity-50"
							>
								Seed demo data
							</button>
							<button
								onClick={prepStandby}
								disabled={loading}
								className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-900 shadow-sm transition-opacity hover:bg-sky-50 disabled:opacity-50"
							>
								Prep standby (risk-based)
							</button>
							</div>
						</div>
					</div>

					<div className="px-8 pb-12 max-w-full">
						{/* KPI Cards - 5 in a row */}
						<div className="mb-8 grid grid-cols-5 gap-5 min-w-0">
							{kpis.map((kpi) => (
								<div
									key={kpi.label}
									className="rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white to-sky-50/30 p-5 shadow-md"
								>
									<div className="mb-2 text-sm font-semibold text-sky-700">{kpi.label}</div>
									<div className="text-3xl font-bold text-sky-900">{kpi.value}</div>
								</div>
							))}
						</div>

						{/* Risk Factor Section */}
						<section className="mb-8 rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white to-sky-50/30 p-5 shadow-lg">
							<h2 className="mb-4 text-base font-bold uppercase tracking-wide text-sky-900">
								Risk Factor Analysis
							</h2>
							<div className="flex h-32 items-center justify-center rounded-lg border border-sky-100 text-sm text-sky-700/70">
								Risk factor visualization (to be implemented)
							</div>
						</section>

						{/* Schedule + Activity Feed Side by Side */}
						<div className="mb-8 grid grid-cols-12 gap-6 min-w-0">
							{/* Real-Time Schedule - Takes 8 columns */}
							<section className="col-span-8 min-w-0 flex flex-col rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white to-blue-50/20 p-6 shadow-lg max-h-[700px]">
								<div className="mb-5 flex shrink-0 items-center justify-between">
									<h2 className="text-lg font-bold uppercase tracking-wide text-sky-900">
										Real-Time Schedule — {activeDept || "All Departments"}
									</h2>
									<div className="flex items-center gap-2">
										{(["day", "week", "month", "all"] as const).map((period) => (
											<button
												key={period}
												onClick={() => setTimeFilter(period)}
												className={cn(
													"rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all",
													timeFilter === period
														? "border-sky-500 bg-sky-500 text-white shadow-sm"
														: "border-sky-200 bg-white text-sky-700 hover:bg-sky-50"
												)}
											>
												{period}
											</button>
										))}
									</div>
								</div>
								<div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
									<table className="min-w-full text-sm">
										<thead className="sticky top-0 z-10">
											<tr className="border-b-2 border-sky-200 bg-sky-50/90 backdrop-blur text-left text-xs font-bold uppercase tracking-wide text-sky-800">
												<th className="px-4 py-3">Time</th>
												<th className="px-4 py-3">Specialist</th>
												<th className="px-4 py-3">Patient</th>
												<th className="px-4 py-3">Status</th>
												<th className="px-4 py-3">Action</th>
											</tr>
										</thead>
										<tbody>
											{visibleAppointments.length === 0 ? (
												<tr>
													<td className="px-3 py-8 text-center text-sm text-zinc-500" colSpan={5}>
														No appointments. Updates live as slots are filled or cancelled.
													</td>
												</tr>
											) : (
												visibleAppointments.map((a) => (
													<tr
														key={a.id}
														className="border-b border-sky-100 hover:bg-sky-50/30 transition-colors cursor-pointer"
														onClick={async () => {
															setDetailLoading(true);
															setDrawerOpen(true);
															try {
																const res = await fetch(`/api/appointment/${a.id}`);
																const data = await res.json();
																setSelectedAppointment(data);
															} finally {
																setDetailLoading(false);
															}
														}}
													>
														<td className="px-4 py-3.5 text-zinc-800 font-medium">
															{new Date(a.startsAt).toLocaleString()}
														</td>
														<td className="px-4 py-3.5 text-zinc-800 font-medium">
															<div className="flex items-center gap-2">
																<span>{a.specialty}</span>
																{typeof a.riskScore === "number" && a.riskLevel && (
																	<span
																		className={cn(
																			"inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border",
																			a.riskLevel === "HIGH" && "border-red-300 bg-red-50 text-red-700",
																			a.riskLevel === "MEDIUM" && "border-amber-300 bg-amber-50 text-amber-700",
																			a.riskLevel === "LOW" && "border-emerald-300 bg-emerald-50 text-emerald-700"
																		)}
																		title={`No-show risk ${a.riskLevel}`}
																	>
																		{a.riskLevel} {a.riskScore.toFixed(2)}
																	</span>
																)}
															</div>
															<div className="text-xs text-sky-700 mt-0.5">
																{a.provider ?? "-"}
															</div>
														</td>
														<td className="px-4 py-3.5 text-zinc-800 font-medium">{a.patient?.name ?? "-"}</td>
														<td className="px-4 py-3.5">
															<span
																className={cn(
																	"inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
																	a.status === "SCHEDULED" &&
																		"border-sky-200 bg-sky-50 text-sky-700",
																	a.status === "CANCELLED" &&
																		"border-red-200 bg-red-50 text-red-700",
																	a.status === "FILLED" &&
																		"border-emerald-200 bg-emerald-50 text-emerald-700"
																)}
															>
																{a.status}
															</span>
														</td>
														<td className="px-4 py-3.5">
															{a.status === "SCHEDULED" && (
																<button
																	onClick={() => cancel(a.id)}
																	onMouseDown={(e) => e.stopPropagation()}
																	onClickCapture={(e) => e.stopPropagation()}
																	disabled={loading}
																	className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:bg-red-700 disabled:opacity-50"
																>
																	Cancel
																</button>
															)}
														</td>
													</tr>
												))
											)}
										</tbody>
									</table>
								</div>
							</section>

							{/* Activity Feed - Takes 4 columns */}
							<section className="col-span-4 min-w-0 flex flex-col rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white to-sky-50/30 p-6 shadow-lg max-h-[700px]">
								<h2 className="mb-5 shrink-0 text-lg font-bold uppercase tracking-wide text-sky-900">
									Activity Feed
								</h2>
								<div
									ref={activityRef}
									className="flex-1 min-h-0 space-y-3 overflow-y-auto pr-2"
								>
									{formattedEvents.length === 0 ? (
										<div className="py-4 text-center text-sm text-zinc-500">
											No activity yet
										</div>
									) : (
										formattedEvents.map((text, idx) => (
											<div key={idx} className="border-b border-sky-100 pb-3 text-sm font-medium text-zinc-800">
												{text}
											</div>
										))
									)}
								</div>
							</section>
						</div>

						{/* Footer */}
						<footer className="mt-8 text-center text-xs font-medium uppercase tracking-wider text-sky-800/80">
							Smart Wait Time Reduction Dashboard — Department-Based Overview
						</footer>
					</div>
				</main>
			</div>

			{/* Loading overlay */}
			{loading && (
				<div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-sky-100/50">
					<div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-sm">
						<Loader2 className="h-4 w-4 animate-spin text-sky-700" />
						<span className="text-sm text-sky-800">Working…</span>
					</div>
				</div>
			)}

			{/* Appointment detail drawer (overlay) */}
			{drawerOpen && (
				<div className="fixed inset-0 z-40 flex">
					<div
						className="flex-1 bg-black/20"
						onClick={() => {
							setDrawerOpen(false);
							setSelectedAppointment(null);
						}}
					/>
					<div className="w-full max-w-xl h-full overflow-y-auto bg-white border-l border-sky-200 p-6">
						<h3 className="text-lg font-semibold text-sky-900">Appointment Details</h3>
						{detailLoading || !selectedAppointment ? (
							<div className="mt-6 flex items-center gap-2 text-sky-800">
								<Loader2 className="h-4 w-4 animate-spin" />
								Loading details…
							</div>
						) : (
							<div className="mt-4 space-y-6">
								<div>
									<div className="text-sm text-sky-700">
										{new Date(selectedAppointment.appointment.startsAt).toLocaleString()}
									</div>
									<div className="mt-1 font-semibold text-zinc-900">
										{selectedAppointment.appointment.specialty} · {selectedAppointment.appointment.provider}
									</div>
									<div className="mt-1 text-sm text-zinc-600">
										Status: {selectedAppointment.appointment.status} · Patient:{" "}
										{selectedAppointment.appointment.patientName ?? "-"}
									</div>
								</div>

								{/* Risk block */}
								{selectedAppointment.risk && (
									<div className="rounded-lg border border-sky-200 p-4">
										<div className="flex items-center justify-between">
											<div className="font-semibold text-sky-900">No‑Show Risk</div>
											<div
												className={cn(
													"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
													selectedAppointment.risk.level === "HIGH" &&
														"border-red-300 bg-red-50 text-red-700",
													selectedAppointment.risk.level === "MEDIUM" &&
														"border-amber-300 bg-amber-50 text-amber-700",
													selectedAppointment.risk.level === "LOW" &&
														"border-emerald-300 bg-emerald-50 text-emerald-700"
												)}
											>
												{selectedAppointment.risk.level} {selectedAppointment.risk.score.toFixed(2)}
											</div>
										</div>
										<ul className="mt-3 space-y-1 text-sm">
											{selectedAppointment.risk.factors.map((f: any) => (
												<li key={f.id} className="flex items-center justify-between">
													<span className="text-zinc-700">{f.label}</span>
													<span className={cn(f.contribution >= 0 ? "text-red-600" : "text-emerald-700")}>
														{f.contribution >= 0 ? "+" : ""}
														{f.contribution.toFixed(2)}
													</span>
												</li>
											))}
										</ul>
									</div>
								)}

								{/* Waitlist block */}
								<div className="rounded-lg border border-sky-200 p-4">
									<div className="font-semibold text-sky-900">Waitlist (top 5)</div>
									<div className="mt-2 overflow-x-auto">
										<table className="min-w-full text-sm">
											<thead>
												<tr className="text-left text-xs uppercase tracking-wide text-sky-800">
													<th className="py-1 pr-2">Candidate</th>
													<th className="py-1 pr-2">Score</th>
													<th className="py-1 pr-2">ETA</th>
													<th className="py-1">Reasons</th>
												</tr>
											</thead>
											<tbody>
												{selectedAppointment.waitlist?.slice(0, 5).map((c: any) => (
													<tr key={c.patientId} className="border-t text-zinc-800">
														<td className="py-1 pr-2">{c.patientName}</td>
														<td className="py-1 pr-2">{c.score.toFixed(2)}</td>
														<td className="py-1 pr-2">
															{c.canArriveMinutes != null ? `${c.canArriveMinutes} min` : "-"}
														</td>
														<td className="py-1">
															<div className="flex flex-wrap gap-1">
																{c.reasons?.map((r: any, i: number) => (
																	<span
																		key={i}
																		className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px]"
																	>
																		{r}
																	</span>
																))}
															</div>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
