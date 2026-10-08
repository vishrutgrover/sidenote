import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsPage from "@/app/(app)/analytics/page";
import IntegrationsPage from "@/app/(app)/integrations/page";
import SkillsPage from "@/app/(app)/ai-skills/page";
import VoicePage from "@/app/(app)/voice-agents/page";
import Home from "@/app/(app)/page";
import TasksPage from "@/app/(app)/tasks/page";
import SettingsLayout from "@/app/settings/layout";
import SettingsSectionPage from "@/app/settings/[section]/page";
import { NotificationsMenu } from "@/components/NotificationsMenu";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { SETTINGS_SECTIONS, sectionById } from "@/lib/settingsSections";
import { item, items, llm, meeting, mockApi, people } from "./helpers/fixtures";

const openItems = items.filter((i) => !i.is_done); // what the server returns for ?done=false

let params: Record<string, string> = {};
vi.mock("next/navigation", () => ({ useParams: () => params, useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const wrap = (ui: React.ReactNode) => render(<ThemeProvider><ToastProvider>{ui}</ToastProvider></ThemeProvider>);
const me = { id: 1, name: "Vishrut Grover", email: "vishrut@example.com", person_id: 1 };
beforeEach(() => { params = {}; Element.prototype.scrollIntoView = vi.fn(); });

describe("placeholder pages", () => {
  it.each([[AnalyticsPage, "Analytics"], [VoicePage, "Voice Agents"], [IntegrationsPage, "Integrations"], [SkillsPage, "AI Skills"]])("%# says it is coming soon", (Page, name) => {
    render(<Page />);
    expect(screen.getByText(`${name} is coming soon`)).toBeInTheDocument();
  });
});

describe("settings sections", () => {
  it("has unique ids, and only appearance and AI are real", () => {
    const ids = SETTINGS_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SETTINGS_SECTIONS.filter((s) => s.ready).map((s) => s.id)).toEqual(["appearance", "ai"]);
    expect(sectionById("nope")).toBeUndefined();
    expect(SETTINGS_SECTIONS.filter((s) => !s.ready).every((s) => s.blurb.length > 10)).toBe(true);
  });
});

describe("Settings layout", () => {
  const open = (section = "appearance") => {
    params = { section };
    mockApi({ "/api/me": me });
    wrap(<SettingsLayout><p>content</p></SettingsLayout>);
  };

  it("shows who you are, the sections, the current one marked, and a way back", async () => {
    open("ai");
    expect(await screen.findByText("vishrut@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /AI Settings/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Cookies/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Back to the app" })).toHaveAttribute("href", "/meetings");
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("Team is visibly not available", () => {
    open();
    expect(screen.getByRole("tab", { name: "Team" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Personal" })).toHaveAttribute("aria-selected", "true");
  });

  it("filters sections as you type and says when nothing matches", () => {
    open();
    fireEvent.change(screen.getByLabelText("Search settings"), { target: { value: "  KNOW " } });
    expect(screen.getAllByRole("link", { name: /./ }).filter((l) => l.getAttribute("href")?.startsWith("/settings/"))).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search settings"), { target: { value: "zzz" } });
    expect(screen.getByText("No settings match")).toBeInTheDocument();
  });
});

describe("Settings pages", () => {
  const show = () => wrap(<SettingsSectionPage />);

  it("Appearance: picking a theme applies and remembers it", () => {
    params = { section: "appearance" };
    show();
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Language")).toBeDisabled();
  });

  it("AI: lists providers, remembers the chosen default and shows recent activity with fallbacks marked", async () => {
    params = { section: "ai" };
    mockApi({
      "/api/llm/models": llm,
      "/api/ai-runs": [
        { id: 2, meeting_id: 1, task: "ask", provider: "anthropic", model: "claude-sonnet-5-5", latency_ms: 840, status: "fallback", error: "HTTP 401: bad key", created_at: "2026-10-07T18:00:00" },
        { id: 1, meeting_id: 1, task: "summarize", provider: "mock", model: "heuristic", latency_ms: 3, status: "ok", error: null, created_at: "2026-10-07T17:00:00" },
      ],
    });
    show();
    const picker = await screen.findByLabelText("Default model");
    await waitFor(() => expect(picker).toHaveValue("mock|heuristic"));
    fireEvent.change(picker, { target: { value: "anthropic|claude-opus-5-5" } });
    expect(localStorage.getItem("askModel")).toBe("anthropic|claude-opus-5-5"); // the same key the Ask panel reads
    expect(screen.getByText(/Built-in \(no API key\)/)).toBeInTheDocument();
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).getByText("Question")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Fell back to built-in").closest("td")).toHaveAttribute("title", "HTTP 401: bad key"); // hover shows why
    expect(within(rows[2]).getByText("Notes")).toBeInTheDocument();
    expect(within(rows[2]).getByText("OK")).toBeInTheDocument();
  });

  it("AI: says so when nothing has run yet", async () => {
    params = { section: "ai" };
    mockApi({ "/api/llm/models": llm, "/api/ai-runs": [] });
    show();
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
  });

  it("other sections are honest placeholders with a description; unknown ones say so", () => {
    params = { section: "cookies" };
    const { unmount } = show();
    expect(screen.getByText("Cookies is coming soon")).toBeInTheDocument();
    expect(screen.getByText(/cookie preferences/)).toBeInTheDocument();
    unmount();
    params = { section: "nonsense" };
    show();
    expect(screen.getByText("That settings page does not exist")).toBeInTheDocument();
  });
});

describe("Tasks page", () => {
  const open = (routes: Record<string, unknown> = {}) => {
    const calls = mockApi({ "/api/action-items": items, ...routes });
    wrap(<TasksPage />);
    return calls;
  };

  it("starts with my open tasks, grouped under their meeting", async () => {
    const calls = open();
    expect(await screen.findByText("Draft the copy")).toBeInTheDocument();
    expect(calls[0]).toBe("/api/action-items?mine=true&done=false");
    expect(screen.getByRole("link", { name: "Weekly Sync" })).toHaveAttribute("href", "/view/1");
    expect(screen.getByText("3 open of 4")).toBeInTheDocument();
  });

  it("the tabs and the filter change what is asked for", async () => {
    const calls = open();
    await screen.findByText("Draft the copy");
    fireEvent.click(screen.getByRole("tab", { name: "All Tasks" }));
    await waitFor(() => expect(calls.at(-1)).toBe("/api/action-items?done=false"));
    fireEvent.click(screen.getByRole("radio", { name: "Done" }));
    await waitFor(() => expect(calls.at(-1)).toBe("/api/action-items?done=true"));
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    await waitFor(() => expect(calls.at(-1)).toBe("/api/action-items"));
  });

  it("each task links to its moment and shows who owns it", async () => {
    open();
    await screen.findByText("Draft the copy");
    expect(screen.getAllByTitle("Open at this moment")[0]).toHaveAttribute("href", "/view/1?t=83");
    expect(screen.getAllByText("Maya Chen", { selector: ".chip" }).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Open at this moment")).toHaveLength(3); // "Book a room" has no time
  });

  it("ticking is instant and saved; a failure puts it back with the message", async () => {
    const calls = open({ "/api/action-items/1": item({ is_done: true }) });
    fireEvent.click(await screen.findByLabelText('Mark "Draft the copy" done'));
    expect(screen.getByLabelText('Mark "Draft the copy" not done')).toBeChecked();
    await waitFor(() => expect(calls.requests!.find((r) => r.method === "PATCH")).toMatchObject({ path: "/api/action-items/1", body: { is_done: true } }));
  });

  it("a failed save restores the box", async () => {
    open({ "/api/action-items/1": new Response(JSON.stringify({ detail: "Action item not found" }), { status: 404 }) });
    fireEvent.click(await screen.findByLabelText('Mark "Draft the copy" done'));
    expect(await screen.findByText("Action item not found")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Mark "Draft the copy" done')).not.toBeChecked());
  });

  it.each([["mine", "open", "No tasks for you"], ["all", "open", "All your meeting tasks in one place"]])("empty %s/%s says '%s'", async (tab, _, title) => {
    open({ "/api/action-items": [] });
    if (tab === "all") fireEvent.click(await screen.findByRole("tab", { name: "All Tasks" }));
    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  it("explains an empty Done list differently", async () => {
    open({ "/api/action-items": [] });
    fireEvent.click(await screen.findByRole("radio", { name: "Done" }));
    expect(await screen.findByText("Nothing finished yet")).toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    let fail = true;
    mockApi({ "/api/action-items": () => (fail ? new Response(JSON.stringify({ detail: "Database is down" }), { status: 500 }) : items) });
    wrap(<TasksPage />);
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Draft the copy")).toBeInTheDocument();
  });
});

describe("NotificationsMenu", () => {
  const recent = [meeting({ id: 3, title: "Newest", started_at: "2026-10-09T10:00:00" }), meeting({ id: 2, title: "Busy", status: "processing", started_at: "2026-10-08T10:00:00" }), meeting({ id: 1, title: "Broken", status: "failed", started_at: "2026-10-07T10:00:00" })];
  const setup = (routes: Record<string, unknown> = {}) => {
    mockApi({ "/api/meetings": recent, "/api/action-items": openItems, ...routes });
    wrap(<NotificationsMenu />);
  };
  const bell = () => screen.getByRole("button", { name: /Notifications/ });

  it("shows a red dot for something new, and opening the bell clears it for good", async () => {
    setup();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications, new"));
    fireEvent.click(bell());
    expect(localStorage.getItem("notificationsSeen")).toBe("2026-10-09T10:00:00");
    expect(bell()).toHaveAccessibleName("Notifications");
  });

  it("no dot when everything was already seen", async () => {
    localStorage.setItem("notificationsSeen", "2026-10-09T10:00:00");
    setup();
    await screen.findByRole("button", { name: "Notifications" });
    await act(async () => { await Promise.resolve(); });
    expect(bell()).toHaveAccessibleName("Notifications");
  });

  it("lists the open tasks and the latest meetings with their state", async () => {
    setup();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications, new"));
    fireEvent.click(bell());
    const menu = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(menu).getByText("3 open tasks for you")).toBeInTheDocument();
    expect(within(menu).getByText("“Newest” is ready")).toBeInTheDocument();
    expect(within(menu).getByText("“Busy” is being processed")).toBeInTheDocument();
    expect(within(menu).getByText("“Broken” could not be processed")).toBeInTheDocument();
    expect(within(menu).getByText("“Newest” is ready").closest("a")).toHaveAttribute("href", "/view/3");
  });

  it("uses the singular for one task, and says all caught up when empty", async () => {
    setup({ "/api/action-items": [item()] });
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications, new"));
    fireEvent.click(bell());
    expect(screen.getByText("1 open task for you")).toBeInTheDocument();
  });

  it("is empty and calm with nothing to report", async () => {
    setup({ "/api/meetings": [], "/api/action-items": [] });
    fireEvent.click(bell());
    expect(await screen.findByText(/all caught up/)).toBeInTheDocument();
    expect(bell()).toHaveAccessibleName("Notifications");
  });

  it("closes on Escape, an outside click, or choosing something", async () => {
    setup();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications, new"));
    fireEvent.click(bell());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(bell());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(bell());
    fireEvent.click(screen.getByText("“Newest” is ready"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Home", () => {
  const open = (routes: Record<string, unknown> = {}) => {
    const calls = mockApi({
      "/api/me": me, "/api/people": people,
      "/api/meetings": [meeting({ id: 1, title: "Weekly Sync", overview: "x".repeat(100) }), meeting({ id: 2, title: "Second", overview: "" })],
      "/api/action-items": openItems, "/api/chat": [], "/api/llm/models": llm, ...routes,
    });
    wrap(<Home />);
    return calls;
  };

  it.each([[3, "Good Night"], [9, "Good Morning"], [14, "Good Afternoon"], [18, "Good Evening"], [22, "Good Night"]])("at %s o'clock the browser says %s", async (hour, hello) => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 9, 7, hour, 30) });
    try {
      open();
      expect(await screen.findByRole("heading", { level: 2, name: `${hello}, Vishrut` })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("greets you by first name", async () => {
    open();
    expect(await screen.findByRole("heading", { level: 2, name: /Good (Morning|Afternoon|Evening|Night), Vishrut$/ })).toBeInTheDocument();
  });

  it("the assistant cards show the latest brief, a coming-soon prep and your open tasks", async () => {
    open();
    expect(await screen.findByText(/x{70}…/)).toBeInTheDocument(); // brief is cut at 70 characters
    expect(screen.getByRole("link", { name: /Daily Brief/ })).toHaveAttribute("href", "/view/1");
    expect(screen.getByRole("link", { name: /Tasks/ })).toHaveTextContent("3 open for you");
    fireEvent.click(screen.getByRole("button", { name: /Meeting Prep/ }));
    expect(await screen.findByText("Meeting Prep is coming soon")).toBeInTheDocument();
  });

  it("says all caught up and no brief when there is nothing", async () => {
    open({ "/api/meetings": [], "/api/action-items": [] });
    expect(await screen.findByText("All caught up")).toBeInTheDocument();
    expect(screen.getByText("No brief yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Daily Brief/ })).toHaveAttribute("href", "/meetings");
  });

  it("Quick Start opens the add dialog on the right tab, and live capture is coming soon", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /Paste Transcript/ }));
    expect(screen.getByRole("tab", { name: "Paste text" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: /Capture Meeting/ }));
    expect(await screen.findByText(/Capturing live meetings is coming soon/)).toBeInTheDocument();
  });

  it("lists recent meetings, and the other tabs are honest", async () => {
    open();
    expect(await screen.findByRole("link", { name: /Weekly Sync/ })).toHaveAttribute("href", "/view/1");
    expect(screen.getByText("All caught up!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Upcoming" }));
    expect(screen.getByText("No upcoming meetings", { selector: "strong" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "AI Feed" }));
    expect(screen.getByText("Your AI feed is coming soon")).toBeInTheDocument();
  });

  it("has the Ask Sidenote panel for all meetings and the Try More cards", async () => {
    open();
    expect(await screen.findByLabelText("Ask Sidenote")).toBeInTheDocument();
    expect(screen.getByText("Desktop App")).toBeInTheDocument();
    expect(screen.getByText("Mobile App")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings");
  });
});
