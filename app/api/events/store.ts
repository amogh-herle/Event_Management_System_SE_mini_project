/**
 * Shared in-memory event store.
 * Used as a graceful fallback when the database is unavailable.
 * Exported as a mutable array so both /api/events and /api/events/[id] share state.
 */

export interface StoredEvent {
  id: string;
  name: string;
  description: string;
  date: string;
  time: string;
  venue: string;
  category: string;
  capacity: number;
  status: "ACTIVE" | "CANCELLED";
  organizerId: string;
  organizerName: string;
  createdAt: string;
  updatedAt: string;
}

export const inMemoryEvents: StoredEvent[] = [
  {
    id: "evt-seed-1",
    name: "Tech Fest 2026",
    description: "Annual university technical symposium featuring hackathons and keynote talks.",
    date: "2026-11-10",
    time: "10:00 AM",
    venue: "Main Auditorium",
    category: "Technology",
    capacity: 100,
    status: "ACTIVE",
    organizerId: "organizer-demo-id",
    organizerName: "Campus Organizer",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "evt-seed-2",
    name: "Full Stack Workshop",
    description: "Hands-on Next.js and Prisma masterclass for developers.",
    date: "2026-11-15",
    time: "02:00 PM",
    venue: "Seminar Hall 2",
    category: "Workshops",
    capacity: 50,
    status: "ACTIVE",
    organizerId: "organizer-demo-id",
    organizerName: "Campus Organizer",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "evt-seed-3",
    name: "Cultural Night",
    description: "Annual inter-college cultural extravaganza — music, dance, and drama.",
    date: "2026-11-20",
    time: "05:00 PM",
    venue: "Open Air Theatre",
    category: "Cultural",
    capacity: 300,
    status: "ACTIVE",
    organizerId: "organizer-demo-id",
    organizerName: "Campus Organizer",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
