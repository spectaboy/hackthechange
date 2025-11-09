"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginRedirect() {
	const router = useRouter();
	useEffect(() => {
		const t = setTimeout(() => router.replace("/dashboard"), 200);
		return () => clearTimeout(t);
	}, [router]);

	return (
		<div className="flex min-h-screen items-center justify-center bg-sky-50">
			<div className="rounded-2xl border border-sky-100 bg-white px-6 py-4 text-sky-900 shadow-sm">
				Redirecting to dashboard…
			</div>
		</div>
	);
}

