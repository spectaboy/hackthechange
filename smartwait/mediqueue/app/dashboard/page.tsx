"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
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
	const [fadeInComplete, setFadeInComplete] = useState(false);
	// Drawer state for appointment details
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [detailLoading, setDetailLoading] = useState(false);
	const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
	const [showRiskDetails, setShowRiskDetails] = useState(false);
	const [expandedReasons, setExpandedReasons] = useState<Set<string>>(new Set());

	// Derived departments from appointment specialties
	const departments = useMemo(() => {
		const s = new Set<string>();
		for (const a of appointments) s.add(a.specialty);
		return Array.from(s).sort();
	}, [appointments]);
	const [activeDept, setActiveDept] = useState<string>("");
	const [timeFilter, setTimeFilter] = useState<"day" | "week" | "month" | "all">("all");

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

	// Fade-in animation on mount - match landing page timing for seamless transition
	useEffect(() => {
		const timer = setTimeout(() => setFadeInComplete(true), 200);
		return () => clearTimeout(timer);
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

	// Activity feed items with color-coded badges
	const activityItems = useMemo(() => {
		return events.slice(-30).reverse().map((ev) => {
			const time = new Date(ev.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
			const kind = ev.kind as string;
			const details = ev.details as Record<string, unknown>;

			let text = "";
			if (kind === "OFFER_SENT" && details.patientName && details.specialty) {
				text = `Offer sent → ${details.patientName} (${details.specialty})`;
			} else if (kind === "OFFER_ACCEPTED" && details.patientName) {
				text = `${details.patientName} ACCEPTED`;
			} else if (kind === "OFFER_DECLINED" && details.patientName) {
				text = `${details.patientName} DECLINED`;
			} else if (kind === "APPOINTMENT_CANCELLED" && details.appointmentId) {
				text = `Appointment cancelled (${details.appointmentId})`;
			} else if (kind === "ACTIVITY_INFO" && details.message) {
				text = String(details.message);
			} else {
				text = kind;
			}

			// Map kinds to badge styles
			const badge =
				kind === "OFFER_ACCEPTED"
					? "border-emerald-200 bg-emerald-50 text-emerald-700"
					: kind === "OFFER_DECLINED" || kind === "APPOINTMENT_CANCELLED"
					? "border-red-200 bg-red-50 text-red-700"
					: kind === "OFFER_SENT"
					? "border-sky-200 bg-sky-50 text-sky-800"
					: "border-zinc-200 bg-white text-zinc-700";

		return { time, kind, text, badge };
		});
	}, [events]);

	const kpis = useMemo(
		() => [
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

		return appointments
			.filter((a) => {
				// Department filter
				if (activeDept && !a.specialty.toLowerCase().includes(activeDept.toLowerCase())) {
					return false;
				}
				// Time filter
				return filterByTime(new Date(a.startsAt));
			})
			// Sort ascending (earliest -> latest)
			.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
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

			<div className={`relative flex min-h-screen overflow-hidden transition-all duration-1000 ease-out ${fadeInComplete ? "opacity-100" : "opacity-0"}`}>
				{/* Left Sidebar - Fixed */}
				<aside className="sticky top-0 h-screen w-80 shrink-0 border-r border-sky-200 bg-white/40 backdrop-blur flex flex-col">
					<div className="flex-1 flex flex-col px-6 pt-6 pb-0 min-h-0">
						<div className="mb-4 shrink-0 rounded-lg border-b-2 border-sky-200 bg-gradient-to-r from-sky-50 to-emerald-50/30 px-4 py-3">
							<h3 className="text-lg font-bold uppercase tracking-wider text-sky-900">
								Departments
							</h3>
						</div>
						<ul className="flex-1 space-y-3 overflow-y-auto min-h-0">
							<li key="__all__">
								<button
									onClick={() => setActiveDept("")}
									className={cn(
										"w-full rounded-xl px-5 py-4 text-left text-lg font-medium transition-all border-2",
										activeDept === ""
											? "border-sky-200 bg-gradient-to-br from-white to-sky-50/30 text-sky-900 shadow-lg font-bold"
											: "border-sky-100 bg-white/50 text-sky-700 hover:bg-gradient-to-br hover:from-white hover:to-sky-50/20 hover:shadow-md hover:text-sky-900"
									)}
								>
									All Departments
								</button>
							</li>
							{departments.map((d) => (
								<li key={d}>
									<button
										onClick={() => setActiveDept(d)}
										className={cn(
											"w-full rounded-xl px-5 py-4 text-left text-lg font-medium transition-all border-2",
											activeDept === d
												? "border-sky-200 bg-gradient-to-br from-white to-sky-50/30 text-sky-900 shadow-lg font-bold"
												: "border-sky-100 bg-white/50 text-sky-700 hover:bg-gradient-to-br hover:from-white hover:to-sky-50/20 hover:shadow-md hover:text-sky-900"
										)}
									>
										{d}
									</button>
								</li>
							))}
						</ul>
					</div>
				</aside>

				{/* Main Content Area */}
				<main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
					{/* Top Bar */}
					<div className="sticky top-0 z-10 mx-8 mt-6 mb-6">
						<div className="rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white/95 to-sky-50/30 p-6 shadow-lg backdrop-blur-sm">
							<div className="flex flex-col items-center justify-center gap-4">
								<h1 
									className="bg-gradient-to-r from-sky-800 via-teal-800 to-emerald-700 bg-clip-text text-5xl tracking-tight text-transparent drop-shadow-[0_2px_0_rgba(0,0,0,0.06)]"
									style={{ fontFamily: "var(--font-display)" }}
								>
									Mediqueue
								</h1>
								<div className="flex items-center gap-6 text-sm text-sky-700">
									<span className="inline-flex items-center gap-1.5 text-emerald-700">
										<CheckCircle2 className="h-4 w-4" />
										Auto-Fill: ON
									</span>
									<span>Last Sync: {lastSyncAt ? lastSyncAt.toLocaleTimeString() : "—"}</span>
								</div>
								{/* Action Buttons */}
								<div className="flex items-center gap-3">
									<button
										onClick={seed}
										disabled={loading}
										className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:bg-emerald-700 disabled:opacity-50"
									>
										Seed demo data
									</button>
								</div>
							</div>
						</div>
					</div>

					<div className="px-8 pb-32 max-w-full">
						{/* KPI Cards - Centered */}
						<div className="mb-8 flex justify-center">
							<div className="grid grid-cols-4 gap-5 max-w-6xl">
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
						</div>

						{/* Risk Factor Section */}
						<section className="mb-8 rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white to-sky-50/30 p-5 shadow-lg">
							<h2 className="mb-4 text-base font-bold uppercase tracking-wide text-sky-900">
								Risk Factor Analysis
							</h2>
							<div className="grid grid-cols-3 gap-4">
								{/* HIGH Risk */}
								<div className="rounded-lg border-2 border-red-200 bg-gradient-to-br from-red-50 to-white p-4">
									<div className="mb-3 flex items-center gap-2">
										<AlertTriangle className="h-5 w-5 text-red-600" />
										<h3 className="text-sm font-bold uppercase tracking-wide text-red-900">
											High Risk
										</h3>
									</div>
									<div className="space-y-2">
										{visibleAppointments
											.filter((a) => a.riskLevel === "HIGH")
											.map((a) => (
												<div
													key={a.id}
													className="rounded-md border border-red-200 bg-white/80 px-3 py-2 text-sm cursor-pointer hover:bg-red-50/50 transition-all hover:shadow-md"
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
													<div className="font-semibold text-red-900">
														{a.patient?.name || "Unknown Patient"}
													</div>
													<div className="text-xs text-red-700">
														{a.specialty} • {a.riskScore?.toFixed(2) || "N/A"}
													</div>
												</div>
											))}
										{visibleAppointments.filter((a) => a.riskLevel === "HIGH").length === 0 && (
											<div className="text-center text-xs text-red-600/60 py-2">
												No high risk patients
											</div>
										)}
									</div>
								</div>

								{/* MEDIUM Risk */}
								<div className="rounded-lg border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4">
									<div className="mb-3 flex items-center gap-2">
										<AlertTriangle className="h-5 w-5 text-amber-600" />
										<h3 className="text-sm font-bold uppercase tracking-wide text-amber-900">
											Medium Risk
										</h3>
									</div>
									<div className="space-y-2">
										{visibleAppointments
											.filter((a) => a.riskLevel === "MEDIUM")
											.map((a) => (
												<div
													key={a.id}
													className="rounded-md border border-amber-200 bg-white/80 px-3 py-2 text-sm cursor-pointer hover:bg-amber-50/50 transition-all hover:shadow-md"
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
													<div className="font-semibold text-amber-900">
														{a.patient?.name || "Unknown Patient"}
													</div>
													<div className="text-xs text-amber-700">
														{a.specialty} • {a.riskScore?.toFixed(2) || "N/A"}
													</div>
												</div>
											))}
										{visibleAppointments.filter((a) => a.riskLevel === "MEDIUM").length === 0 && (
											<div className="text-center text-xs text-amber-600/60 py-2">
												No medium risk patients
											</div>
										)}
									</div>
								</div>

								{/* LOW Risk */}
								<div className="rounded-lg border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
									<div className="mb-3 flex items-center gap-2">
										<CheckCircle2 className="h-5 w-5 text-emerald-600" />
										<h3 className="text-sm font-bold uppercase tracking-wide text-emerald-900">
											Low Risk
										</h3>
									</div>
									<div className="space-y-2">
										{visibleAppointments
											.filter((a) => a.riskLevel === "LOW")
											.map((a) => (
												<div
													key={a.id}
													className="rounded-md border border-emerald-200 bg-white/80 px-3 py-2 text-sm cursor-pointer hover:bg-emerald-50/50 transition-all hover:shadow-md"
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
													<div className="font-semibold text-emerald-900">
														{a.patient?.name || "Unknown Patient"}
													</div>
													<div className="text-xs text-emerald-700">
														{a.specialty} • {a.riskScore?.toFixed(2) || "N/A"}
													</div>
												</div>
											))}
										{visibleAppointments.filter((a) => a.riskLevel === "LOW").length === 0 && (
											<div className="text-center text-xs text-emerald-600/60 py-2">
												No low risk patients
											</div>
										)}
									</div>
								</div>
							</div>
						</section>

						{/* Schedule + Activity Feed Side by Side */}
						<div className="mb-8 grid grid-cols-12 gap-6 min-w-0">
							{/* Real-Time Schedule - Takes 8 columns */}
							<section className="col-span-8 min-w-0 flex flex-col rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white to-blue-50/20 p-6 shadow-lg max-h-[700px]">
								<div className="mb-5 flex shrink-0 items-center gap-3">
									<h2 className="text-lg font-bold text-sky-900">
										Real‑Time Schedule
									</h2>
									<span
										className={cn(
											"inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold",
											activeDept
												? "border-sky-300 bg-gradient-to-r from-sky-50 to-emerald-50 text-sky-900"
												: "border-zinc-200 bg-white text-zinc-700"
										)}
										title={activeDept ? `Filtering by ${activeDept}` : "Showing all departments"}
									>
										{activeDept || "All Departments"}
									</span>
								</div>
								<div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
									<table className="min-w-full text-sm">
										<thead className="sticky top-0 z-10">
											<tr className="border-b-2 border-sky-200 bg-sky-50/90 backdrop-blur text-left text-xs font-bold uppercase tracking-wide text-sky-800">
												<th className="px-4 py-3">Time</th>
												<th className="px-4 py-3">Specialist</th>
												<th className="px-4 py-3">Risk Score</th>
												<th className="px-4 py-3">Patient</th>
												<th className="px-4 py-3">Status</th>
												<th className="px-4 py-3">Action</th>
											</tr>
										</thead>
										<tbody>
											{visibleAppointments.length === 0 ? (
												<tr>
													<td className="px-3 py-8 text-center text-sm text-zinc-500" colSpan={6}>
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
															<div>{a.specialty}</div>
															<div className="text-xs text-sky-700 mt-0.5">
																{a.provider ?? "-"}
															</div>
														</td>
														<td className="px-4 py-3.5">
															{typeof a.riskScore === "number" && a.riskLevel ? (
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
															) : (
																<span className="text-zinc-400 text-xs">-</span>
															)}
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
									{activityItems.length === 0 ? (
										<div className="py-4 text-center text-sm text-zinc-500">
											No activity yet
										</div>
									) : (
										activityItems.map((item, idx) => (
											<div key={idx} className="border-b border-sky-100 pb-3 text-sm">
												<div className="mb-1 flex items-center gap-2">
													<span className="text-xs font-semibold text-zinc-500">{item.time}</span>
													<span
														className={cn(
															"inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
															item.badge
														)}
													>
														{item.kind.replaceAll("_", " ").toLowerCase()}
													</span>
												</div>
												<div className="font-medium text-zinc-800">{item.text}</div>
											</div>
										))
									)}
								</div>
							</section>
						</div>
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

			{/* Full-page fade-in overlay */}
			<div
				className={`fixed inset-0 z-[100] transition-all duration-1400 ease-[cubic-bezier(0.4,0,0.2,1)] ${
					fadeInComplete
						? "pointer-events-none opacity-0 scale-105"
						: "opacity-100 scale-100"
				}`}
				aria-hidden="true"
			>
				<div className="absolute inset-0 bg-gradient-to-br from-sky-300 via-sky-200 to-emerald-100" />
				{/* Animated loading bars effect */}
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex gap-2">
						<div
							className={`h-16 w-1 bg-gradient-to-t from-emerald-400 to-sky-400 rounded-full transition-all duration-500 ${
								fadeInComplete ? "opacity-0 scale-y-0" : "opacity-100 scale-y-100"
							}`}
							style={{
								animation: fadeInComplete ? "none" : "pulseBar 1s ease-in-out 0s infinite",
							}}
						/>
						<div
							className={`h-16 w-1 bg-gradient-to-t from-emerald-400 to-sky-400 rounded-full transition-all duration-500 ${
								fadeInComplete ? "opacity-0 scale-y-0" : "opacity-100 scale-y-100"
							}`}
							style={{
								animation: fadeInComplete ? "none" : "pulseBar 1s ease-in-out 0.15s infinite",
							}}
						/>
						<div
							className={`h-16 w-1 bg-gradient-to-t from-emerald-400 to-sky-400 rounded-full transition-all duration-500 ${
								fadeInComplete ? "opacity-0 scale-y-0" : "opacity-100 scale-y-100"
							}`}
							style={{
								animation: fadeInComplete ? "none" : "pulseBar 1s ease-in-out 0.3s infinite",
							}}
						/>
					</div>
				</div>
				<style jsx>{`
					@keyframes pulseBar {
						0%, 100% { transform: scaleY(1); opacity: 0.6; }
						50% { transform: scaleY(1.5); opacity: 1; }
					}
				`}</style>
			</div>
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
									<div className="rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white to-sky-50/30 p-5 shadow-lg">
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

										{/* Friendly summary */}
										{(() => {
											const factors: any[] = selectedAppointment.risk.factors ?? [];
											const byMagnitude = [...factors].sort(
												(a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
											);
											const top = byMagnitude.slice(0, 1)[0];
											return (
												<p className="mt-2 text-sm text-zinc-700">
													Top factor:{" "}
													<span className="font-medium text-zinc-900">
														{top ? top.label : "—"}
													</span>{" "}
													{top && (
														<span
															className={cn(
																"ml-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
																top.contribution >= 0
																	? "border-red-200 bg-red-50 text-red-700"
																	: "border-emerald-200 bg-emerald-50 text-emerald-700"
															)}
														>
															{top.contribution >= 0 ? "+" : ""}
															{top.contribution.toFixed(2)}
														</span>
													)}
												</p>
											);
										})()}

										{/* Compact list with toggle */}
										<div className="mt-3">
											<ul className="space-y-1 text-sm">
												{(showRiskDetails
													? selectedAppointment.risk.factors
													: (selectedAppointment.risk.factors ?? []).slice(0, 3)
												).map((f: any) => (
													<li key={f.id} className="flex items-center justify-between">
														<span className="text-zinc-700">{f.label}</span>
														<span
															className={cn(
																"ml-3 rounded px-1.5 py-0.5 text-[11px]",
																f.contribution >= 0 ? "text-red-700" : "text-emerald-700"
															)}
														>
															{f.contribution >= 0 ? "+" : ""}
															{f.contribution.toFixed(2)}
														</span>
													</li>
												))}
											</ul>
											{(selectedAppointment.risk.factors?.length ?? 0) > 3 && (
												<button
													type="button"
													onClick={() => setShowRiskDetails((v) => !v)}
													className="mt-2 text-xs font-semibold text-sky-800 hover:underline"
												>
													{showRiskDetails ? "Show less" : "Show all factors"}
												</button>
											)}
										</div>
									</div>
								)}

								{/* Waitlist block */}
								<div className="rounded-xl border-2 border-sky-200 bg-gradient-to-br from-white to-sky-50/30 p-5 shadow-lg">
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
														<td className="py-2 pr-2">{c.patientName}</td>
														<td className="py-2 pr-2">
															<span className="inline-flex rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-sky-900">
																{c.score.toFixed(2)}
															</span>
														</td>
														<td className="py-2 pr-2">
															{c.canArriveMinutes != null ? (
																<span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
																	{c.canArriveMinutes} min
																</span>
															) : (
																<span className="text-zinc-400 text-xs">-</span>
															)}
														</td>
														<td className="py-2">
															{(() => {
																const all = c.reasons ?? [];
																const isOpen = expandedReasons.has(c.patientId);
																const show = isOpen ? all : all.slice(0, 2);
																const extra = all.length - show.length;
																return (
																	<div className="flex flex-wrap items-center gap-1">
																		{show.map((r: any, i: number) => (
																			<span
																				key={i}
																				className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px]"
																			>
																				{r}
																			</span>
																		))}
																		{extra > 0 && !isOpen && (
																			<button
																				type="button"
																				onClick={() => {
																					const next = new Set(expandedReasons);
																					next.add(c.patientId);
																					setExpandedReasons(next);
																				}}
																				className="ml-1 text-[11px] font-semibold text-sky-800 hover:underline"
																			>
																				+{extra} more
																			</button>
																		)}
																		{isOpen && all.length > 2 && (
																			<button
																				type="button"
																				onClick={() => {
																					const next = new Set(expandedReasons);
																					next.delete(c.patientId);
																					setExpandedReasons(next);
																				}}
																				className="ml-1 text-[11px] font-semibold text-sky-800 hover:underline"
																			>
																				Show less
																			</button>
																		)}
																	</div>
																);
															})()}
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
