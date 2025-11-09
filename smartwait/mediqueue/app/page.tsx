"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export default function Landing() {
	const [mounted, setMounted] = useState(false);
	const [fadeInComplete, setFadeInComplete] = useState(false);

	useEffect(() => {
		// Start the fade-in animation after a brief moment
		const t1 = setTimeout(() => setMounted(true), 200);
		// Complete the fade-in after animation duration
		const t2 = setTimeout(() => setFadeInComplete(true), 1400);
		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
		};
	}, []);

	return (
		<div className="relative min-h-screen overflow-hidden">
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
			{/* Sky gradient (slightly deeper for better cloud contrast) */}
			<div
				className={`absolute inset-0 bg-gradient-to-b from-sky-300 via-sky-200 to-sky-100 transition-all duration-1400 ease-[cubic-bezier(0.4,0,0.2,1)] ${
					fadeInComplete ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
				}`}
				aria-hidden
			/>

			{/* Simple clouds */}
			<div
				className={`pointer-events-none absolute inset-0 transition-all duration-1400 ease-[cubic-bezier(0.4,0,0.2,1)] ${
					fadeInComplete ? "opacity-100 translate-x-0" : "opacity-0 translate-x-10"
				}`}
				style={{
					transitionDelay: fadeInComplete ? "0.3s" : "0s",
				}}
				aria-hidden
			>
				<div className="cloud cloud-a" />
				<div className="cloud cloud-b" />
				<div className="cloud cloud-c" />
				{/* Image clouds */}
				<img src="/cloud.png" alt="" className="cloud-img cloud-left" />
				<img src="/cloud.png" alt="" className="cloud-img cloud-right" />
			</div>

			{/* Animated health plus signs field */}
			<div
				className={`transition-opacity duration-1000 ease-out ${
					fadeInComplete ? "opacity-100" : "opacity-60"
				}`}
			>
				<PlusField />
			</div>

			{/* Green hill */}
			<div
				aria-hidden
				className={`absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-emerald-500 to-emerald-400 transition-all duration-1400 ease-[cubic-bezier(0.4,0,0.2,1)] ${
					fadeInComplete ? "opacity-100 translate-y-0" : "opacity-0 translate-y-20"
				}`}
				style={{
					clipPath: "ellipse(120% 60% at 50% 100%)",
					transitionDelay: fadeInComplete ? "0.2s" : "0s",
				}}
			/>

			<main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
				<div className={`mt-[-8vh] ${fadeInComplete ? "" : "opacity-0"}`}>
					<div className="hero-bob">
						{/* Title - flies in from top */}
						<h1
							className={`bg-gradient-to-r from-sky-800 via-teal-800 to-emerald-700 bg-clip-text text-7xl tracking-tight text-transparent drop-shadow-[0_2px_0_rgba(0,0,0,0.06)] sm:text-9xl transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
								fadeInComplete
									? "opacity-100 translate-y-0"
									: "opacity-0 -translate-y-20"
							}`}
							style={{
								fontFamily: "var(--font-display)",
								transitionDelay: fadeInComplete ? "0.2s" : "0s",
							}}
						>
							Mediqueue
						</h1>
						{/* Subtitle - flies in from bottom */}
						<p
							className={`mx-auto mt-6 max-w-4xl text-balance text-2xl leading-8 text-sky-900 sm:text-3xl font-normal tracking-tight italic transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
								fadeInComplete
									? "opacity-100 translate-y-0"
									: "opacity-0 translate-y-16"
							}`}
							style={{
								fontFamily: "var(--font-geist-sans)",
								transitionDelay: fadeInComplete ? "0.4s" : "0s",
							}}
						>
							Faster care. Fuller schedules. Healthier communities.
						</p>

						{/* Button - flies in from side */}
						<div
							className={`relative mt-12 flex items-center justify-center transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
								fadeInComplete
									? "opacity-100 translate-x-0"
									: "opacity-0 translate-x-20"
							}`}
							style={{
								transitionDelay: fadeInComplete ? "0.6s" : "0s",
							}}
						>
							<Link
								href="/login"
								className="btn-hero inline-flex items-center justify-center rounded-full bg-emerald-600 px-10 py-4 text-lg font-semibold text-white shadow-lg ring-1 ring-emerald-500/30 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-emerald-700"
							>
								Login
							</Link>
						</div>
				</div>
					<style jsx>{`
						/* Gentle bob for the whole hero content */
						.hero-bob {
							will-change: transform;
							animation: heroBob 4.5s ease-in-out infinite alternate;
						}
						@keyframes heroBob {
							from { transform: translateY(0) }
							to { transform: translateY(-14px) }
						}
						@media (prefers-reduced-motion: reduce) {
							.hero-bob { animation: none; }
						}

						/* Clouds */
						.cloud { position: absolute; background: #fff; border-radius: 9999px; opacity: .9; }
						.cloud::before, .cloud::after { content: ""; position: absolute; background: #fff; border-radius: 9999px; }
						.cloud-a { top: 12%; left: 10%; width: 260px; height: 70px; filter: blur(1.5px); animation: floatA 14s ease-in-out infinite alternate; }
						.cloud-a::before { width: 90px; height: 90px; left: 35px; top: -35px; }
						.cloud-a::after  { width: 120px; height: 120px; left: 120px; top: -50px; }
						.cloud-b { top: 22%; right: 12%; width: 220px; height: 60px; opacity: .85; filter: blur(1.5px); animation: floatB 18s ease-in-out infinite alternate; }
						.cloud-b::before { width: 80px; height: 80px; left: 25px; top: -30px; }
						.cloud-b::after  { width: 100px; height: 100px; left: 105px; top: -40px; }
						.cloud-c { top: 30%; left: 38%; width: 180px; height: 55px; opacity: .8; filter: blur(1.5px); animation: floatC 16s ease-in-out infinite alternate; }
						.cloud-c::before { width: 70px; height: 70px; left: 20px; top: -28px; }
						.cloud-c::after  { width: 85px; height: 85px; left: 85px; top: -35px; }
						@keyframes floatA { from { transform: translateX(0) } to { transform: translateX(24px) } }
						@keyframes floatB { from { transform: translateX(0) } to { transform: translateX(-20px) } }
						@keyframes floatC { from { transform: translateX(0) } to { transform: translateX(18px) } }

						/* Image clouds */
						.cloud-img { position: absolute; opacity: .9; filter: drop-shadow(0 6px 12px rgba(2, 132, 199, 0.10)); }
						.cloud-left  { left: 2%;  top: 10%; width: clamp(180px, 22vw, 320px); animation: floatA 16s ease-in-out infinite alternate; }
						.cloud-right { right: 3%; top: 18%; width: clamp(160px, 20vw, 300px); animation: floatB 20s ease-in-out infinite alternate; }

						/* Shiny reflective overlay */
						.btn-hero {
							position: relative;
							overflow: hidden;
						}
						.btn-hero::after {
							content: "";
							position: absolute;
							inset: -2px;
							border-radius: 9999px;
							background:
								radial-gradient(120% 180% at 50% 0%,
									rgba(255,255,255,0.55) 0%,
									rgba(255,255,255,0.12) 35%,
									rgba(255,255,255,0) 45%);
							transform: translateY(-8%);
							transition: transform .45s ease, opacity .45s ease;
							pointer-events: none;
							opacity: .9;
		    			}
						.btn-hero:hover::after {
							transform: translateY(-16%) translateX(2%);
							opacity: 1;
						}
					`}</style>
				</div>
			</main>
		</div>
	);
}

type PlusParticle = {
	leftPercent: number;
	fontSizePx: number;
	animationDelaySec: number;
	animationDurationSec: number;
	opacity: number;
	color: string;
	driftPx: number;
	scale: number;
};

function PlusField() {
	const [mounted, setMounted] = useState(false);
	
	useEffect(() => {
		setMounted(true);
	}, []);

	const particles = useMemo<PlusParticle[]>(() => {
		if (!mounted) return [];
		const count = 36;
		const result: PlusParticle[] = [];
		for (let i = 0; i < count; i++) {
			// Neon health hues between green and aqua
			const hue = 150 + Math.random() * 30; // 150-180
			result.push({
				leftPercent: Math.random() * 100,
				fontSizePx: 12 + Math.round(Math.random() * 20),
				animationDelaySec: Math.random() * 5,
				animationDurationSec: 10 + Math.random() * 10, // 10-20s smooth rise
				opacity: 0.45 + Math.random() * 0.35,
				color: `hsl(${hue}, 100%, 60%)`,
				driftPx: (Math.random() - 0.5) * 60, // -30..30px horizontal drift
				scale: 0.8 + Math.random() * 0.8, // 0.8 - 1.6
			});
		}
		return result;
	}, [mounted]);

	return (
		<div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden>
			{mounted && particles.map((p, i) => (
				<span
					key={i}
					className="plus-particle select-none"
					style={{
						left: `${p.leftPercent}%`,
						top: `100%`, // always start from bottom
						fontSize: `${p.fontSizePx}px`,
						animationDelay: `${p.animationDelaySec}s`,
						animationDuration: `${p.animationDurationSec}s`,
						opacity: p.opacity,
						color: p.color,
						// CSS vars for smooth transform-based animation
						// @ts-ignore - custom props for CSS
						"--driftX": `${p.driftPx}px`,
						"--scale": p.scale,
					}}
				>
					+
				</span>
			))}
			<style jsx>{`
				.plus-particle {
					position: absolute;
					/* Neon glow using currentColor */
					text-shadow:
						0 0 6px currentColor,
						0 0 14px color-mix(in oklab, currentColor 65%, white 35%),
						0 1px 0 rgba(255, 255, 255, 0.18);
					transform-origin: center;
					will-change: transform;
					animation-name: plusRise;
					animation-iteration-count: infinite;
					animation-timing-function: linear;
				}
				@keyframes plusRise {
					0%   { transform: translate3d(0, 0, 0) scale(var(--scale)) rotate(0deg); }
					100% { transform: translate3d(var(--driftX), -120vh, 0) scale(calc(var(--scale) * 1.15)) rotate(25deg); }
				}
				@media (prefers-reduced-motion: reduce) {
					.plus-particle { animation: none; }
				}
			`}</style>
		</div>
	);
}