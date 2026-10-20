import type { Metadata } from "next";
export const metadata: Metadata = { title: "Quản trị | Fotban", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default function AdminLayout({children}:{children:React.ReactNode}) { return children; }
