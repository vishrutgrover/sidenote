import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComingSoon } from "@/components/ComingSoon";
import { Sidebar } from "@/components/Sidebar";
import { ThemeProvider, useTheme } from "@/components/ThemeProvider";
import { ToastProvider, useToast } from "@/components/Toast";
import { Topbar } from "@/components/Topbar";
import { pageTitle } from "@/components/nav";

let path = "/";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

beforeEach(() => {
  path = "/";
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: 1, name: "Vishrut Grover", email: "v@x.com", person_id: 1 })));
});

describe("pageTitle", () => {
  it.each([["/", "Home"], ["/meetings", "Meetings"], ["/meetings/", "Meetings"], ["/tasks", "Tasks"], ["/people/4", "People"], ["/ask", "Ask Sidenote"], ["/unknown", "Home"], ["/meetingsX", "Home"]])("%s -> %s", (p, title) => {
    expect(pageTitle(p)).toBe(title);
  });
});

describe("Sidebar", () => {
  it("marks the current page and only that page", async () => {
    path = "/tasks";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Tasks/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Meetings/ })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /^Home/ })).not.toHaveAttribute("aria-current");
  });

  it("keeps a parent item active on a child page, but not Home", () => {
    path = "/people/3";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /People/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^Home/ })).not.toHaveAttribute("aria-current");
  });

  it("shows the logged-in user", async () => {
    render(<Sidebar />);
    expect(await screen.findByText("Vishrut Grover")).toBeInTheDocument();
    expect(screen.getByText("VG")).toBeInTheDocument();
  });

  it("labels placeholder sections as coming soon", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Analytics/ })).toHaveTextContent("Soon");
    expect(screen.getByRole("link", { name: /^Meetings/ })).not.toHaveTextContent("Soon");
  });

  it("collapses to icons, remembers it, and expands again", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Sidebar />);
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.queryByText("Meetings")).toBeNull();
    expect(screen.getByRole("link", { name: "Meetings" })).toHaveAttribute("title", "Meetings"); // still reachable, with a tooltip
    unmount();
    render(<Sidebar />);
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByText("Meetings")).toBeInTheDocument();
  });

  it("still renders if the user request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Settings/ })).toBeInTheDocument();
  });
});

describe("Topbar", () => {
  it("shows the title for the current path and renders extra controls", () => {
    path = "/meetings/12";
    render(<Topbar><button>Capture</button></Topbar>);
    expect(screen.getByRole("heading", { name: "Meetings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Capture" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open global search" })).toBeInTheDocument();
  });
});

describe("Toast", () => {
  function Button({ message, kind }: { message: string; kind?: "success" | "error" }) {
    const toast = useToast();
    return <button onClick={() => toast(message, kind)}>go</button>;
  }

  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("shows a message, then removes it", async () => {
    render(<ToastProvider><Button message="Saved" /></ToastProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    act(() => vi.advanceTimersByTime(4000));
    await waitFor(() => expect(screen.getByRole("status")).not.toHaveTextContent("Saved"));
  });

  it("keeps error messages on screen longer", () => {
    render(<ToastProvider><Button message="Failed" kind="error" /></ToastProvider>);
    fireEvent.click(screen.getByText("go"));
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("status")).toHaveTextContent("Failed");
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getByRole("status")).not.toHaveTextContent("Failed");
  });

  it("stacks several at once and removes each on its own timer", () => {
    render(<ToastProvider><Button message="One" /></ToastProvider>);
    fireEvent.click(screen.getByText("go"));
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByText("go"));
    expect(screen.getAllByText("One")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1600));
    expect(screen.getAllByText("One")).toHaveLength(1);
  });

  it("does nothing, and does not crash, when used outside a provider", () => {
    render(<Button message="x" />);
    expect(() => fireEvent.click(screen.getByText("go"))).not.toThrow();
  });
});

describe("ThemeProvider", () => {
  function Picker() {
    const { theme, setTheme } = useTheme();
    return <><p>current: {theme}</p><button onClick={() => setTheme("dark")}>dark</button><button onClick={() => setTheme("light")}>light</button><button onClick={() => setTheme("system")}>system</button></>;
  }
  const mockSystem = (dark: boolean) => {
    const listeners: (() => void)[] = [];
    window.matchMedia = (() => ({ matches: dark, addEventListener: (_: string, l: () => void) => listeners.push(l), removeEventListener: () => {} })) as never;
    return listeners;
  };

  it("applies the saved choice and lets the user change it", async () => {
    mockSystem(false);
    const user = userEvent.setup();
    render(<ThemeProvider><Picker /></ThemeProvider>);
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByText("dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.getByText("current: dark")).toBeInTheDocument();
  });

  it("follows the operating system while set to system", () => {
    mockSystem(true);
    render(<ThemeProvider><Picker /></ThemeProvider>);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("an explicit light choice beats a dark operating system", async () => {
    mockSystem(true);
    localStorage.setItem("theme", "light");
    render(<ThemeProvider><Picker /></ThemeProvider>);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ignores a corrupted saved value", () => {
    mockSystem(false);
    localStorage.setItem("theme", "purple");
    render(<ThemeProvider><Picker /></ThemeProvider>);
    expect(screen.getByText("current: system")).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("switches live when the system changes", () => {
    const listeners = mockSystem(false);
    render(<ThemeProvider><Picker /></ThemeProvider>);
    window.matchMedia = (() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })) as never;
    act(() => listeners.forEach((l) => l()));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("ComingSoon", () => {
  it("names the feature and accepts custom text", () => {
    render(<ComingSoon title="Analytics">Charts will live here.</ComingSoon>);
    expect(screen.getByText("Analytics is coming soon")).toBeInTheDocument();
    expect(screen.getByText("Charts will live here.")).toBeInTheDocument();
  });
});
