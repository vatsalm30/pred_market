import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "API Dashboard — OmniPred",
  robots: { index: false },
};

export default async function DashboardPage() {
  if (!(await currentUser())) redirect("/login?next=/dashboard");
  return <DashboardClient />;
}
