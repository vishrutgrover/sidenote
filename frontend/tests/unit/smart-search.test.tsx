import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SmartSearch } from "@/components/SmartSearch";
import { ToastProvider } from "@/components/Toast";
import { insights, items, meeting, mockApi, topics, transcript } from "./helpers/fixtures";

const setup = (over: Partial<React.ComponentProps<typeof SmartSearch>> = {}, routes: Record<string, unknown> = {}) => {
  const calls = mockApi({ "/api/topics": topics, ...routes });
  const props = { meeting: meeting({ topics: ["product", "planning"] }), lines: transcript, insights, tasks: items, onSeek: vi.fn(), onTagsChanged: vi.fn(), ...over };
  const view = render(<ToastProvider><SmartSearch {...props} /></ToastProvider>);
  return { calls, ...props, ...view };
};

describe("SmartSearch", () => {
  it("shows a placeholder until the numbers arrive", () => {
    const { container } = setup({ insights: undefined });
    expect(container.querySelector(".skeleton")).not.toBeNull();
  });

  it("shows how many lines of each kind there are, and disables kinds with none", () => {
    setup();
    expect(screen.getByRole("button", { name: /Questions/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: /Date & Time/ })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /Tasks/ })).toHaveTextContent("4"); // the live task list, not the stale insight
    expect(screen.getByRole("button", { name: /Metrics/ })).toBeDisabled();
  });

  it("opening a filter lists those transcript lines, and a click jumps there", () => {
    const { onSeek } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Date & Time/ }));
    const list = screen.getByRole("list", { name: "Date & Time in this meeting" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2); // lines 4 and 5 of the transcript
    fireEvent.click(within(list).getByText(/Then we launch on Friday/));
    expect(onSeek).toHaveBeenCalledWith(30);
  });

  it("clicking the same filter again closes the list", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Questions/ }));
    expect(screen.getByRole("list", { name: /Questions/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Questions/ }));
    expect(screen.queryByRole("list", { name: /Questions/ })).toBeNull();
  });

  it("the Tasks filter lists the action items with their moments", () => {
    const { onSeek } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Tasks/ }));
    const list = screen.getByRole("list", { name: /Tasks/ });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    fireEvent.click(within(list).getByText(/Draft the copy/));
    expect(onSeek).toHaveBeenCalledWith(83);
    fireEvent.click(within(list).getByText("Book a room")); // no time: nothing to jump to
    expect(onSeek).toHaveBeenCalledTimes(1);
  });

  it("skips filter lines that are not in the transcript", () => {
    setup({ insights: { ...insights, filters: { ...insights.filters, questions: [2, 999] } } });
    fireEvent.click(screen.getByRole("button", { name: /Questions/ }));
    expect(within(screen.getByRole("list", { name: /Questions/ })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows sentiment percentages", () => {
    setup();
    expect(screen.getByText("Positive").closest("div")).toHaveTextContent("40%");
    expect(screen.getByText("Negative").closest("div")).toHaveTextContent("5%");
  });

  it("shows each speaker's pace and share of the talking", () => {
    setup();
    const row = screen.getByText("Maya Chen", { selector: "span *, span" }).closest("div")!;
    expect(row).toHaveTextContent("150");
    expect(row).toHaveTextContent("34%");
    expect(screen.getByText("Vishrut Grover", { selector: "span" }).closest("div")).toHaveTextContent("66%");
  });

  describe("tags", () => {
    it("lists the meeting's tags and removes one", async () => {
      const { calls, onTagsChanged } = setup({}, { "/api/meetings/1/topics/product": new Response(null, { status: 204 }) });
      expect(screen.getByText("planning", { selector: ".chip" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Remove tag product" }));
      await waitFor(() => expect(onTagsChanged).toHaveBeenCalled());
      expect(calls.requests!.at(-1)).toMatchObject({ method: "DELETE", path: "/api/meetings/1/topics/product" });
    });

    it("adds a tag, encoding odd characters, then closes the box", async () => {
      const { calls, onTagsChanged } = setup({}, { "/api/meetings/1/topics/": ["x"] });
      fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
      fireEvent.change(screen.getByLabelText("New tag"), { target: { value: " q4 / launch? " } });
      fireEvent.submit(screen.getByLabelText("New tag").closest("form")!);
      await waitFor(() => expect(onTagsChanged).toHaveBeenCalled());
      expect(calls.requests!.at(-1)).toMatchObject({ method: "PUT", path: "/api/meetings/1/topics/q4%20%2F%20launch%3F" });
      expect(screen.queryByLabelText("New tag")).toBeNull();
    });

    it("suggests existing tags the meeting does not have yet", async () => {
      setup();
      fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
      await waitFor(() => expect([...document.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"))).toEqual(["hiring"])); // product is already on this meeting
    });

    it("ignores a blank tag and closes on Escape", () => {
      const { calls } = setup();
      fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
      fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "   " } });
      fireEvent.submit(screen.getByLabelText("New tag").closest("form")!);
      expect(calls.requests!.filter((r) => r.method === "PUT")).toHaveLength(0);
      fireEvent.keyDown(screen.getByLabelText("New tag"), { key: "Escape" });
      expect(screen.queryByLabelText("New tag")).toBeNull();
    });

    it("explains an empty tag list", () => {
      setup({ meeting: meeting({ topics: [] }) });
      expect(screen.getByText(/No tags yet/)).toBeInTheDocument();
    });

    it("shows the server's message when a tag cannot be saved", async () => {
      setup({}, { "/api/meetings/1/topics/": new Response(JSON.stringify({ detail: "Topic name is empty" }), { status: 400 }) });
      fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
      fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "x" } });
      fireEvent.submit(screen.getByLabelText("New tag").closest("form")!);
      expect(await screen.findByText("Topic name is empty")).toBeInTheDocument();
    });
  });
});
