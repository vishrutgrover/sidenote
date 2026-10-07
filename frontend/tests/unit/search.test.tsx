import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/CommandPalette";
import { SearchProvider, useSearch } from "@/components/SearchProvider";
import { Topbar } from "@/components/Topbar";
import { mockApi, searchResults } from "./helpers/fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/meetings" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
beforeEach(() => { push.mockClear(); Element.prototype.scrollIntoView = vi.fn(); });

const input = () => screen.getByLabelText("Search");
const options = () => within(screen.getByRole("listbox")).getAllByRole("option"); // the result rows, not the sort menu's options
const title = (text: string) => screen.findByText((_, el) => el?.tagName === "STRONG" && el.textContent === text); // a highlighted title is split into pieces
const type = async (text: string) => {
  fireEvent.change(input(), { target: { value: text } });
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
};
const open = (onClose = vi.fn()) => { render(<CommandPalette open onClose={onClose} />); return onClose; };

describe("CommandPalette", () => {
  it("starts with a hint and the Ask Sidenote shortcut, and searches nothing yet", () => {
    const calls = mockApi({ "/api/search": [] });
    open();
    expect(screen.getByRole("dialog", { name: "Search meetings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ask Sidenote anything/ })).toHaveAttribute("href", "/ask");
    expect(screen.getByText(/Search titles, people/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("searches after typing pauses, with the sort and title-only options", async () => {
    const calls = mockApi({ "/api/search": searchResults });
    open();
    for (const t of ["s", "sa", "saf"]) fireEvent.change(input(), { target: { value: t } });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    expect(calls).toHaveLength(0);
    await waitFor(() => expect(calls.at(-1)).toBe("/api/search?q=saf&title_only=false&sort=recent"));
    fireEvent.click(screen.getByLabelText("Title only"));
    fireEvent.change(screen.getByLabelText("Sort results"), { target: { value: "oldest" } });
    await waitFor(() => expect(calls.at(-1)).toBe("/api/search?q=saf&title_only=true&sort=oldest"));
  });

  it("shows each meeting with the lines that matched, highlighted, and how many more there are", async () => {
    mockApi({ "/api/search": searchResults });
    open();
    await type("safari");
    expect(await screen.findByText("Engineering Standup")).toBeInTheDocument();
    const marks = [...document.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toEqual(["Safari", "Safari", "Safari"]); // two hit lines and the matching title
    expect(screen.getByText("00:31")).toBeInTheDocument();
    expect(screen.getByText("+3 more in this meeting")).toBeInTheDocument();
    expect(screen.queryByText(/more in this meeting/, { selector: "p" })).not.toBeNull();
  });

  it("title matches without transcript hits show just the meeting", async () => {
    mockApi({ "/api/search": [searchResults[1]] });
    open();
    await type("weekly");
    expect(await title("Safari Weekly")).toBeInTheDocument();
    expect(screen.queryByText(/more in this meeting/)).toBeNull();
  });

  it("links open the meeting, or the meeting at the moment that matched", async () => {
    mockApi({ "/api/search": searchResults });
    open();
    await type("safari");
    await screen.findByText("Engineering Standup");
    expect(options().map((o) => o.getAttribute("href"))).toEqual(["/view/4", "/view/4?t=31", "/view/4?t=48", "/view/1"]);
  });

  it("arrow keys move the selection (wrapping) and Enter opens it", async () => {
    mockApi({ "/api/search": searchResults });
    const onClose = open();
    await type("safari");
    await screen.findByText("Engineering Standup");
    const selected = () => options().findIndex((o) => o.getAttribute("aria-selected") === "true");
    expect(selected()).toBe(0);
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(selected()).toBe(2);
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(selected()).toBe(3); // wrapped to the last row
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/view/1");
    expect(onClose).toHaveBeenCalled();
  });

  it("Enter with nothing to open does nothing", async () => {
    mockApi({ "/api/search": [] });
    open();
    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(push).not.toHaveBeenCalled();
  });

  it("a new search starts again at the top", async () => {
    mockApi({ "/api/search": searchResults });
    open();
    await type("safari");
    await screen.findByText("Engineering Standup");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    await type("safari standup");
    await waitFor(() => expect(options()[0]).toHaveAttribute("aria-selected", "true"));
  });

  it("clicking a result closes the dialog", async () => {
    mockApi({ "/api/search": searchResults });
    const onClose = open();
    await type("safari");
    fireEvent.click(await title("Safari Weekly"));
    expect(onClose).toHaveBeenCalled();
  });

  it("says when nothing matches, with the words that were searched", async () => {
    mockApi({ "/api/search": [] });
    open();
    await type("zeppelin");
    expect(await screen.findByText("No results for “zeppelin”")).toBeInTheDocument();
  });

  it("shows the server's message if the search fails", async () => {
    mockApi({ "/api/search": () => new Response(JSON.stringify({ detail: "Database is down" }), { status: 500 }) });
    open();
    await type("anything");
    expect(await screen.findByRole("alert")).toHaveTextContent("Database is down");
  });

  it("ignores whitespace, clears at once, and encodes odd characters", async () => {
    const calls = mockApi({ "/api/search": searchResults });
    open();
    await type("   ");
    expect(calls).toHaveLength(0);
    await type("a&b=c %");
    await waitFor(() => expect(calls.at(-1)).toContain("q=a%26b%3Dc+%25"));
    await screen.findByText("Engineering Standup");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("Engineering Standup")).toBeNull(); // gone at once, not after a delay
    expect(input()).toHaveValue("");
  });
});

describe("SearchProvider and the top bar", () => {
  function Opener() {
    const { open } = useSearch();
    return <button onClick={open}>open search</button>;
  }
  const mount = () => render(<SearchProvider><Opener /><Topbar /></SearchProvider>);

  it("Cmd+K and Ctrl+K open it, again closes it, Escape closes it, plain K does nothing", () => {
    mount();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "k" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "K", ctrlKey: true });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    fireEvent(screen.getByRole("dialog"), new Event("close")); // Escape
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the top bar search box and any other opener show the dialog", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open global search" }));
    expect(screen.getByRole("dialog", { name: "Search meetings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search")).toHaveFocus();
  });

  it("opening it again starts with an empty box", () => {
    mockApi({ "/api/search": [] });
    mount();
    fireEvent.click(screen.getByText("open search"));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "left over" } });
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(screen.getByLabelText("Search")).toHaveValue("");
  });
});
