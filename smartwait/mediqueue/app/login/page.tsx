"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine, User, Lock } from "lucide-react";

export default function LoginPage() {
	const router = useRouter();
	const [fadeInComplete, setFadeInComplete] = useState(false);
	const [isLoggingIn, setIsLoggingIn] = useState(false);
	const [showScanModal, setShowScanModal] = useState(false);
	const [showRedirectOverlay, setShowRedirectOverlay] = useState(false);
	const [credentials, setCredentials] = useState({ username: "", password: "" });

	useEffect(() => {
		// Fade-in animation on mount
		const timer = setTimeout(() => setFadeInComplete(true), 200);
		return () => clearTimeout(timer);
	}, []);

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoggingIn(true);
		// Simulate login - in production, this would call an API
		await new Promise((resolve) => setTimeout(resolve, 800));
		// Show fade-out animation then redirect
		setShowRedirectOverlay(true);
		setFadeInComplete(false);
		setTimeout(() => router.push("/dashboard"), 1400);
	};

	const handleScanLogin = async () => {
		setShowScanModal(true);
		setIsLoggingIn(true);
		// Simulate ID scan
		await new Promise((resolve) => setTimeout(resolve, 1500));
		setShowScanModal(false);
		// Show fade-out animation then redirect
		setShowRedirectOverlay(true);
		setFadeInComplete(false);
		setTimeout(() => router.push("/dashboard"), 1400);
	};

	return (
		<div className="relative min-h-screen overflow-hidden">
			{/* Blue sky background gradient */}
			<div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-sky-100 to-sky-100" aria-hidden />
			{/* Green hill at bottom */}
			<div
				className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-emerald-500 to-emerald-400"
				style={{ clipPath: "ellipse(120% 60% at 50% 100%)" }}
				aria-hidden
			/>
			
			{/* Content wrapper to prevent overflow */}
			<div className="relative z-10 min-h-screen overflow-y-auto">
				{/* Main Content */}
				<div className={`flex min-h-screen items-center justify-center px-6 py-12 pb-32 transition-all duration-1000 ease-out ${fadeInComplete ? "opacity-100" : "opacity-0"}`}>
				<div className="w-full max-w-md">
					{/* Logo/Title Section */}
					<div className="mb-8 text-center">
						<h1 className="bg-gradient-to-r from-sky-800 via-teal-800 to-emerald-700 bg-clip-text text-5xl font-bold tracking-tight text-transparent" style={{ fontFamily: "var(--font-display)" }}>
							Mediqueue
						</h1>
					</div>

					{/* Login Card */}
					<div className="rounded-2xl bg-gradient-to-br from-white/95 to-sky-50/50 p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] backdrop-blur-sm">
						{/* ID Scan Option */}
						<button
							onClick={handleScanLogin}
							disabled={isLoggingIn}
							className="mb-6 flex w-full items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-lg font-semibold text-emerald-800 shadow-md transition-all hover:-translate-y-1 hover:bg-emerald-100 hover:shadow-xl disabled:opacity-50"
						>
							<ScanLine className="h-6 w-6" />
							<span>Scan ID Badge</span>
						</button>

						<div className="relative mb-6">
							<div className="absolute inset-0 flex items-center">
								<div className="w-full border-t border-sky-200"></div>
							</div>
							<div className="relative flex justify-center text-sm">
								<span className="bg-gradient-to-br from-white/95 to-sky-50/50 px-4 text-sky-600">or</span>
							</div>
						</div>

						{/* Login Form */}
						<form onSubmit={handleLogin} className="space-y-5">
							<div>
								<label htmlFor="username" className="mb-2 block text-sm font-medium text-sky-800">
									Username / Employee ID
								</label>
								<div className="relative">
									<User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-sky-400" />
									<input
										id="username"
										type="text"
										value={credentials.username}
										onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
										className="w-full rounded-lg border border-zinc-300 bg-white/80 pl-10 pr-4 py-3 text-sky-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300"
										placeholder="Enter your username"
										required
									/>
								</div>
							</div>

							<div>
								<label htmlFor="password" className="mb-2 block text-sm font-medium text-sky-800">
									Password
								</label>
								<div className="relative">
									<Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-sky-400" />
									<input
										id="password"
										type="password"
										value={credentials.password}
										onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
										className="w-full rounded-lg border border-zinc-300 bg-white/80 pl-10 pr-4 py-3 text-sky-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300"
										placeholder="Enter your password"
										required
									/>
								</div>
							</div>

							<button
								type="submit"
								disabled={isLoggingIn}
								className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:from-emerald-700 hover:to-teal-700 hover:shadow-2xl disabled:opacity-50"
							>
								{isLoggingIn ? "Signing in..." : "Sign In"}
							</button>
						</form>
					</div>
				</div>
				</div>
			</div>

			{/* ID Scan Modal */}
			{showScanModal && (
				<div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="rounded-2xl bg-gradient-to-br from-white/95 to-sky-50/50 p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)]">
						<div className="text-center">
							<div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-sky-100">
								<ScanLine className="h-10 w-10 animate-pulse text-emerald-600" />
							</div>
							<h3 className="mb-2 text-xl font-bold text-sky-900">Scanning ID Badge</h3>
							<p className="text-sky-600">Please hold your ID badge in front of the camera</p>
							<div className="mt-6 h-48 w-full rounded-lg border-2 border-dashed border-sky-300 bg-sky-50/50 flex items-center justify-center">
								<div className="text-center">
									<ScanLine className="mx-auto h-12 w-12 text-sky-400 mb-2" />
									<p className="text-sm text-sky-600">Camera view would appear here</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Full-page fade-out overlay for redirect */}
			{showRedirectOverlay && (
				<div
					className="fixed inset-0 z-[100] transition-all duration-1400 ease-[cubic-bezier(0.4,0,0.2,1)] opacity-100 scale-100"
					aria-hidden="true"
				>
					<div className="absolute inset-0 bg-gradient-to-br from-sky-300 via-sky-200 to-emerald-100" />
					{/* Animated loading bars effect */}
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="flex gap-2">
							<div
								className="h-16 w-1 bg-gradient-to-t from-emerald-400 to-sky-400 rounded-full opacity-100 scale-y-100"
								style={{
									animation: "pulseBar 1s ease-in-out 0s infinite",
								}}
							/>
							<div
								className="h-16 w-1 bg-gradient-to-t from-emerald-400 to-sky-400 rounded-full opacity-100 scale-y-100"
								style={{
									animation: "pulseBar 1s ease-in-out 0.15s infinite",
								}}
							/>
							<div
								className="h-16 w-1 bg-gradient-to-t from-emerald-400 to-sky-400 rounded-full opacity-100 scale-y-100"
								style={{
									animation: "pulseBar 1s ease-in-out 0.3s infinite",
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
			)}
		</div>
	);
}
