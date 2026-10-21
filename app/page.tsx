import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 480, margin: "80px auto", textAlign: "center" }}>
      <h1>Event Management System</h1>
      <p>Discover, register for, and manage events.</p>
      <Link href="/signup">Create an account</Link>
    </main>
  );
}
