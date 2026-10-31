"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "../../components/AuthShell";
import {
  AlertIcon,
  BarChartIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  RefreshIcon,
  ShieldIcon,
  TagIcon,
  TicketIcon,
  UsersIcon,
} from "../../components/icons";
import { RoleSwitcher } from "../../components/RoleSwitcher";
import type { PlatformStats } from "@/lib/stats";

type LoadState = "loading" | "unauthorized" | "forbidden" | "ready";

export default function AdminStatsPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);

  function fetchStats(params?: { startDate?: string; endDate?: string; category?: string }, isBackground = false) {
    if (!isBackground) {
      setLoadState("loading");
    } else {
      setIsRefreshing(true);
    }
    setFilterError(null);

    const query = new URLSearchParams();
    if (params?.startDate) query.set("startDate", params.startDate);
    if (params?.endDate) query.set("endDate", params.endDate);
    if (params?.category) query.set("category", params.category);

    const url = `/api/admin/stats${query.toString() ? `?${query.toString()}` : ""}`;

    fetch(url)
      .then(async (res) => {
        if (res.status === 401) {
          setLoadState("unauthorized");
          return;
        }
        if (res.status === 403) {
          setLoadState("forbidden");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setFilterError(data.error || "Failed to load statistics");
          if (!stats) setLoadState("ready");
          return;
        }
        setStats(data);
        setLoadState("ready");
      })
      .catch(() => {
        if (!stats) {
          setLoadState("forbidden");
        } else {
          setFilterError("Network error while updating statistics.");
        }
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }

  useEffect(() => {
    fetchStats();
  }, []);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setFilterError("Start date cannot be after end date");
      return;
    }
    fetchStats({
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      category: selectedCategory || undefined,
    });
  }

  function handleResetFilters() {
    setStartDate("");
    setEndDate("");
    setSelectedCategory("");
    setFilterError(null);
    fetchStats();
  }

  const isFiltered = Boolean(startDate || endDate || selectedCategory);

  return (
    <div className="events-directory-page">
      <header className="nav event-nav">
        <Brand />
        <div className="event-nav-actions">
          <Link
            href="/admin/stats"
            className="btn btn-ghost"
            style={{ fontWeight: 700, color: "var(--primary)" }}
          >
            Platform Stats
          </Link>
          <Link href="/admin/users" className="btn btn-ghost">
            Manage Users
          </Link>
          <Link href="/events" className="btn btn-ghost">
            Back to events
          </Link>
          <RoleSwitcher />
        </div>
      </header>

      <main className="events-directory-container">
        <div className="directory-header" style={{ marginBottom: "1.5rem" }}>
          <div>
            <span className="badge badge-primary">FR-010b • Admin</span>
            <h1>Platform statistics</h1>
            <p className="lede">
              Live aggregate metrics across events, user accounts, and registrations.
            </p>
          </div>

          {loadState === "ready" && stats && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: stats.cached ? "var(--warning)" : "var(--success)",
                    display: "inline-block",
                  }}
                  aria-hidden="true"
                />
                {stats.cached ? "Cached snapshot as of: " : "Live as of: "}
                <strong>{new Date(stats.asOf).toLocaleTimeString()}</strong>
              </span>

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() =>
                  fetchStats(
                    isFiltered
                      ? {
                          startDate: startDate || undefined,
                          endDate: endDate || undefined,
                          category: selectedCategory || undefined,
                        }
                      : undefined,
                    true
                  )
                }
                disabled={isRefreshing}
                title="Refresh live data from database"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <RefreshIcon size={14} />
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          )}
        </div>

        {loadState === "loading" && (
          <div className="loading-state">
            <span className="spinner" /> Loading platform statistics...
          </div>
        )}

        {loadState === "unauthorized" && (
          <div className="empty-state-card">
            <AlertIcon size={32} />
            <h3>Not signed in</h3>
            <p>You need to be logged in with an administrator account to view platform statistics.</p>
            <Link href="/login" className="btn btn-primary" style={{ marginTop: "1rem" }}>
              Log in
            </Link>
          </div>
        )}

        {loadState === "forbidden" && (
          <div className="empty-state-card">
            <ShieldIcon size={32} />
            <h3>Access denied</h3>
            <p>Only administrator accounts are permitted to view platform-wide statistics.</p>
            <Link href="/events" className="btn btn-ghost" style={{ marginTop: "1rem" }}>
              Back to events
            </Link>
          </div>
        )}

        {loadState === "ready" && stats && (
          <>
            {/* Filter Section (UC-17 Step 3 & 3a) */}
            <section
              className="card"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "18px 24px",
                marginBottom: "2rem",
              }}
              aria-label="Filter Statistics"
            >
              <form
                onSubmit={handleFilterSubmit}
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="startDate" style={{ fontSize: "12px", fontWeight: 600 }}>
                    Start Date
                  </label>
                  <input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input"
                    style={{ padding: "6px 12px", fontSize: "13px" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="endDate" style={{ fontSize: "12px", fontWeight: 600 }}>
                    End Date
                  </label>
                  <input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input"
                    style={{ padding: "6px 12px", fontSize: "13px" }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label htmlFor="category" style={{ fontSize: "12px", fontWeight: 600 }}>
                    Category
                  </label>
                  <input
                    id="category"
                    type="text"
                    placeholder="Filter by category"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="input"
                    style={{ padding: "6px 12px", fontSize: "13px", minWidth: "160px" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Apply Filter
                  </button>
                  {isFiltered && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="btn btn-ghost btn-sm"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </form>

              {filterError && (
                <div
                  style={{
                    color: "var(--danger)",
                    fontSize: "13px",
                    marginTop: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <AlertIcon size={14} />
                  {filterError}
                </div>
              )}

              {isFiltered && (
                <div
                  style={{
                    marginTop: "12px",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>Active filter:</span>
                  {startDate && <span className="badge">From: {startDate}</span>}
                  {endDate && <span className="badge">To: {endDate}</span>}
                  {selectedCategory && (
                    <span className="badge">Category: {selectedCategory}</span>
                  )}
                </div>
              )}
            </section>

            {/* 3 Core Metric KPI Cards (FR-010b Acceptance Criteria) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "20px",
                marginBottom: "2rem",
              }}
              data-testid="stats-kpi-grid"
            >
              {/* Total Events */}
              <div
                className="card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                  position: "relative",
                  overflow: "hidden",
                }}
                data-testid="total-events-card"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--text-muted)",
                    }}
                  >
                    Total Events
                  </span>
                  <div
                    style={{
                      padding: "8px",
                      borderRadius: "var(--radius)",
                      background: "var(--primary-soft)",
                      color: "var(--primary)",
                    }}
                  >
                    <CalendarIcon size={20} />
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "42px",
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                    marginBottom: "14px",
                  }}
                  data-testid="stat-total-events"
                >
                  {stats.totalEvents}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}>
                  <span className="status-pill status-active">
                    {stats.events.active} Active
                  </span>
                  {stats.events.cancelled > 0 ? (
                    <span className="status-pill status-cancelled">
                      {stats.events.cancelled} Cancelled
                    </span>
                  ) : (
                    <span className="badge">0 Cancelled</span>
                  )}
                </div>
              </div>

              {/* Total Users */}
              <div
                className="card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                  position: "relative",
                  overflow: "hidden",
                }}
                data-testid="total-users-card"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--text-muted)",
                    }}
                  >
                    Total Users
                  </span>
                  <div
                    style={{
                      padding: "8px",
                      borderRadius: "var(--radius)",
                      background: "var(--primary-soft)",
                      color: "var(--primary)",
                    }}
                  >
                    <UsersIcon size={20} />
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "42px",
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                    marginBottom: "14px",
                  }}
                  data-testid="stat-total-users"
                >
                  {stats.totalUsers}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}>
                  <span className="badge">
                    {stats.users.participants} Participants
                  </span>
                  <span className="badge">
                    {stats.users.organizers} Organizers
                  </span>
                  <span className="badge">
                    {stats.users.admins} Admins
                  </span>
                </div>
              </div>

              {/* Total Registrations */}
              <div
                className="card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                  position: "relative",
                  overflow: "hidden",
                }}
                data-testid="total-registrations-card"
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--text-muted)",
                    }}
                  >
                    Total Registrations
                  </span>
                  <div
                    style={{
                      padding: "8px",
                      borderRadius: "var(--radius)",
                      background: "var(--primary-soft)",
                      color: "var(--primary)",
                    }}
                  >
                    <TicketIcon size={20} />
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "42px",
                    fontWeight: 800,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                    marginBottom: "14px",
                  }}
                  data-testid="stat-total-registrations"
                >
                  {stats.totalRegistrations}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "12px" }}>
                  <span className="status-pill status-active">
                    {stats.registrations.confirmed} Confirmed
                  </span>
                  <span className="badge">
                    {stats.registrations.waitlisted} Waitlisted
                  </span>
                  {stats.registrations.cancelled > 0 ? (
                    <span className="status-pill status-cancelled">
                      {stats.registrations.cancelled} Cancelled
                    </span>
                  ) : (
                    <span className="badge">0 Cancelled</span>
                  )}
                </div>
              </div>
            </div>

            {/* Detailed Operational Breakdowns */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "20px",
                marginBottom: "2rem",
              }}
            >
              {/* Event Lifecycle & Schedule Breakdown */}
              <div
                className="card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <CalendarIcon size={18} />
                  <h3 style={{ fontSize: "16px", margin: 0 }}>Event Lifecycle</h3>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Active Events</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.events.active}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Upcoming Scheduled</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.events.upcoming}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Past Events</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.events.past}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Cancelled Events</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.events.cancelled}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* User Accounts & Health Breakdown */}
              <div
                className="card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <UsersIcon size={18} />
                  <h3 style={{ fontSize: "16px", margin: 0 }}>User Demographics</h3>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Participants</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.users.participants}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Organizers</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.users.organizers}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Administrators</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.users.admins}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Verified Accounts</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.users.verified}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Suspended Accounts</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.users.suspended > 0 ? (
                          <span className="status-pill status-cancelled">
                            {stats.users.suspended}
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Registration & Capacity Utilization */}
              <div
                className="card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <BarChartIcon size={18} />
                  <h3 style={{ fontSize: "16px", margin: 0 }}>Capacity & Health</h3>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Total Seat Capacity</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.capacity.totalCapacity}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Confirmed Seats</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.capacity.confirmedRegistrations}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Waitlist Queue</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.registrations.waitlisted}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "10px 0", color: "var(--text-muted)" }}>Capacity Utilization</td>
                      <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 700 }}>
                        {stats.capacity.utilizationRate}%
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop: "14px" }}>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: "var(--border)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.min(100, Math.max(0, stats.capacity.utilizationRate))}%`,
                        background:
                          stats.capacity.utilizationRate > 90
                            ? "var(--danger)"
                            : stats.capacity.utilizationRate > 75
                            ? "var(--warning)"
                            : "var(--primary)",
                        borderRadius: 4,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Event Distribution by Category Table */}
            {stats.events.byCategory.length > 0 && (
              <section
                className="card"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "24px",
                  overflow: "hidden",
                }}
                aria-label="Events by Category"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <TagIcon size={18} />
                  <h3 style={{ fontSize: "16px", margin: 0 }}>Events by Category</h3>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "8px 12px", color: "var(--text-muted)" }}>Category</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-muted)" }}>
                        Events
                      </th>
                      <th style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-muted)" }}>
                        Share
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.events.byCategory.map((cat) => {
                      const share =
                        stats.totalEvents > 0
                          ? Math.round((cat.count / stats.totalEvents) * 1000) / 10
                          : 0;
                      return (
                        <tr key={cat.category} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "10px 12px", fontWeight: 600 }}>{cat.category}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right" }}>{cat.count}</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-muted)" }}>
                            {share}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
