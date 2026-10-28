import { redirect } from "next/navigation";

export default function RegistrationsPage() {
  redirect("/events?tab=registrations");
}
