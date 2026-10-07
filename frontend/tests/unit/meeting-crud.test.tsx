import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureMenu } from "@/components/CaptureMenu";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { EditMeetingModal } from "@/components/EditMeetingModal";
import { MeetingMenu } from "@/components/MeetingMenu";
import { Modal } from "@/components/Modal";
import { NewMeetingModal } from "@/components/NewMeetingModal";
import { ShareModal } from "@/components/ShareModal";
import { ToastProvider } from "@/components/Toast";
import { meeting, mockApi } from "./helpers/fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const wrap = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);
beforeEach(() => push.mockClear());

describe("Modal", () => {
  it("renders nothing until opened, and forgets its content when closed", () => {
    function Counter() {
      return <input aria-label="note" defaultValue="" />;
    }
    const { rerender } = render(<Modal open={false} onClose={vi.fn()} title="T"><Counter /></Modal>);
    expect(screen.queryByLabelText("note")).toBeNull();
    rerender(<Modal open onClose={vi.fn()} title="T"><Counter /></Modal>);
    fireEvent.change(screen.getByLabelText("note"), { target: { value: "typed" } });
    rerender(<Modal open={false} onClose={vi.fn()} title="T"><Counter /></Modal>);
    rerender(<Modal open onClose={vi.fn()} title="T"><Counter /></Modal>);
    expect(screen.getByLabelText("note")).toHaveValue(""); // fresh every time
  });

  it("is a labelled dialog that closes from the x, Escape and the backdrop", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Hello"><p>body</p></Modal>);
    expect(screen.getByRole("dialog", { name: "Hello" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.mouseDown(screen.getByRole("dialog")); // the backdrop is the dialog element itself
    fireEvent(screen.getByRole("dialog"), new Event("close")); // what the browser sends for Escape
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("a click inside the box does not close it", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Hello"><p>body</p></Modal>);
    fireEvent.mouseDown(screen.getByText("body"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("NewMeetingModal", () => {
  const file = (name: string, size = 100) => {
    const f = new File(["x".repeat(Math.min(size, 10))], name, { type: "text/plain" });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };
  const open = (props: Partial<React.ComponentProps<typeof NewMeetingModal>> = {}) => {
    const p = { open: true, onClose: vi.fn(), onCreated: vi.fn(), ...props };
    wrap(<NewMeetingModal {...p} />);
    return p;
  };
  const choose = (f: File) => fireEvent.change(screen.getByLabelText("Transcript file"), { target: { files: [f] } });
  const addButton = () => screen.getByRole("button", { name: /Add meeting|Adding/ });

  it("needs a file before it can be submitted", () => {
    open();
    expect(addButton()).toBeDisabled();
    choose(file("call.vtt"));
    expect(screen.getByText("call.vtt")).toBeInTheDocument();
    expect(addButton()).toBeEnabled();
  });

  it.each([["notes.pdf", 100, /\.txt, \.vtt or \.json/], ["huge.txt", 3_000_000, /larger than 2 MB/]])("rejects %s at once", (name, size, message) => {
    open();
    choose(file(name, size));
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(addButton()).toBeDisabled();
  });

  it("accepts a dropped file", () => {
    open();
    fireEvent.drop(screen.getByText(/Drop a transcript/).closest("label")!, { dataTransfer: { files: [file("dropped.txt")] } });
    expect(screen.getByText("dropped.txt")).toBeInTheDocument();
    expect(addButton()).toBeEnabled();
  });

  it("uploads the file with the title, then opens the new meeting", async () => {
    const calls = mockApi({ "/api/meetings": meeting({ id: 7, status: "processing" }) });
    const { onCreated, onClose } = open();
    fireEvent.change(screen.getByPlaceholderText("E.g. Product team sync"), { target: { value: "Kickoff" } });
    choose(file("call.vtt"));
    fireEvent.click(addButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/view/7"));
    const form = calls.requests![0].body as FormData;
    expect(calls.requests![0]).toMatchObject({ method: "POST", path: "/api/meetings" });
    expect(form.get("title")).toBe("Kickoff");
    expect((form.get("file") as File).name).toBe("call.vtt");
    expect(form.has("transcript")).toBe(false);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText(/Meeting added/)).toBeInTheDocument();
  });

  it("pasted text goes up as text, not as a file", async () => {
    const calls = mockApi({ "/api/meetings": meeting({ id: 8 }) });
    open();
    fireEvent.click(screen.getByRole("tab", { name: "Paste text" }));
    expect(addButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Transcript text"), { target: { value: "Ana: Hello there" } });
    fireEvent.click(addButton());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/view/8"));
    const form = calls.requests![0].body as FormData;
    expect(form.get("transcript")).toBe("Ana: Hello there");
    expect(form.has("file")).toBe(false);
  });

  it("whitespace is not a transcript", () => {
    open({ start: "text" });
    fireEvent.change(screen.getByLabelText("Transcript text"), { target: { value: "   \n  " } });
    expect(addButton()).toBeDisabled();
  });

  it("shows the server's reason inline and stays open", async () => {
    mockApi({ "/api/meetings": new Response(JSON.stringify({ detail: "No transcript lines found" }), { status: 400 }) });
    const { onClose } = open({ start: "text" });
    fireEvent.change(screen.getByLabelText("Transcript text"), { target: { value: "?" } });
    fireEvent.click(addButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("No transcript lines found");
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(addButton()).toBeEnabled(); // can try again
  });

  it("disables the button while uploading so it cannot be sent twice", async () => {
    let finish!: () => void;
    const calls = mockApi({ "/api/meetings": () => new Promise<Response>((r) => (finish = () => r(new Response(JSON.stringify(meeting({ id: 9 })))))) });
    open({ start: "text" });
    fireEvent.change(screen.getByLabelText("Transcript text"), { target: { value: "Ana: Hi" } });
    fireEvent.click(addButton());
    expect(await screen.findByRole("button", { name: /Adding/ })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Transcript text").closest("form")!); // pressing Enter in the title field, say
    await act(async () => finish());
    expect(calls.requests!.filter((r) => r.method === "POST").length).toBeGreaterThanOrEqual(1);
  });

  it("switching tabs clears an error", () => {
    open();
    choose(file("bad.pdf"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Paste text" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("EditMeetingModal", () => {
  const m = meeting();
  const open = (props: Partial<React.ComponentProps<typeof EditMeetingModal>> = {}) => {
    const p = { meeting: m, open: true, onClose: vi.fn(), onSaved: vi.fn(), ...props };
    wrap(<EditMeetingModal {...p} />);
    return p;
  };
  const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

  it("starts with the current title and people, and the host cannot be removed", () => {
    open();
    expect(screen.getByDisplayValue("Weekly Sync")).toBeInTheDocument();
    expect(screen.getByText("Vishrut Grover").closest("li")!.querySelector("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove Maya Chen" })).toBeInTheDocument();
  });

  it("saves the new title and the full list of people", async () => {
    const calls = mockApi({ "/api/meetings/1": m });
    const { onSaved, onClose } = open();
    fireEvent.change(screen.getByDisplayValue("Weekly Sync"), { target: { value: "  Renamed  " } });
    fireEvent.click(screen.getByRole("button", { name: "Remove Maya Chen" }));
    fireEvent.change(screen.getByLabelText("Add a person"), { target: { value: "Cara Diaz" } });
    fireEvent.click(screen.getByRole("button", { name: /Add$/ }));
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls.requests![0]).toMatchObject({ method: "PATCH", path: "/api/meetings/1", body: { title: "Renamed", participants: ["Vishrut Grover", "Cara Diaz"] } });
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText("Meeting updated")).toBeInTheDocument();
  });

  it("warns that removing someone leaves their lines as Unknown", () => {
    open();
    expect(screen.queryByText(/stay in the transcript as Unknown/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove Maya Chen" }));
    expect(screen.getByText(/stay in the transcript as Unknown/)).toBeInTheDocument();
  });

  it("adds with Enter, ignores blanks and duplicates in any letter case", () => {
    open();
    const input = screen.getByLabelText("Add a person");
    for (const value of ["  ", "maya chen", "Dee", "DEE"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    expect(screen.getAllByRole("listitem").map((li) => li.textContent?.replace("host", ""))).toEqual(["Vishrut Grover", "Maya Chen", "Dee"]);
  });

  it("will not save an empty title", async () => {
    const calls = mockApi({});
    open();
    fireEvent.change(screen.getByDisplayValue("Weekly Sync"), { target: { value: "   " } });
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("title cannot be empty");
    expect(calls).toHaveLength(0);
  });

  it("shows the server's message when saving fails", async () => {
    mockApi({ "/api/meetings/1": new Response(JSON.stringify({ detail: "Meeting not found" }), { status: 404 }) });
    const { onSaved } = open();
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Meeting not found");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("forgets unsaved edits when closed and reopened", () => {
    const props = { meeting: m, onClose: vi.fn(), onSaved: vi.fn() };
    const { rerender } = render(<ToastProvider><EditMeetingModal {...props} open /></ToastProvider>);
    fireEvent.change(screen.getByDisplayValue("Weekly Sync"), { target: { value: "scratch" } });
    rerender(<ToastProvider><EditMeetingModal {...props} open={false} /></ToastProvider>);
    rerender(<ToastProvider><EditMeetingModal {...props} open /></ToastProvider>);
    expect(screen.getByDisplayValue("Weekly Sync")).toBeInTheDocument();
  });
});

describe("ConfirmDelete", () => {
  const props = () => ({ meeting: meeting(), open: true, onClose: vi.fn(), onDeleted: vi.fn() });

  it("names the meeting and warns what goes with it", () => {
    wrap(<ConfirmDelete {...props()} />);
    expect(screen.getByRole("dialog", { name: "Delete this meeting?" })).toHaveTextContent(/Weekly Sync.*transcript, notes, action items, comments and chat/);
  });

  it("Cancel deletes nothing", () => {
    const calls = mockApi({});
    const p = props();
    wrap(<ConfirmDelete {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onClose).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("Delete removes it, says so and tells the page", async () => {
    const calls = mockApi({ "/api/meetings/1": new Response(null, { status: 204 }) });
    const p = props();
    wrap(<ConfirmDelete {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(p.onDeleted).toHaveBeenCalled());
    expect(calls.requests![0]).toMatchObject({ method: "DELETE", path: "/api/meetings/1" });
    expect(await screen.findByText('Deleted "Weekly Sync"')).toBeInTheDocument();
    expect(p.onClose).toHaveBeenCalled();
  });

  it("a failed delete reports the error and keeps the dialog", async () => {
    mockApi({ "/api/meetings/1": new Response(JSON.stringify({ detail: "Meeting not found" }), { status: 404 }) });
    const p = props();
    wrap(<ConfirmDelete {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Meeting not found")).toBeInTheDocument();
    expect(p.onDeleted).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled();
  });
});

describe("ShareModal", () => {
  it("is honest that sharing is not built, and copies the link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    wrap(<ShareModal meeting={meeting({ id: 5 })} open onClose={vi.fn()} />);
    expect(screen.getByText("Sharing with teammates is coming soon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Copy link/ }));
    await screen.findByText("Link copied");
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/view/5`);
  });

  it("says so when the browser blocks copying", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    wrap(<ShareModal meeting={meeting()} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy link/ }));
    expect(await screen.findByText(/browser blocked it/)).toBeInTheDocument();
  });
});

describe("MeetingMenu", () => {
  const setup = () => {
    const p = { meeting: meeting({ id: 3 }), onChanged: vi.fn(), onDeleted: vi.fn() };
    wrap(<MeetingMenu {...p} />);
    return p;
  };
  const openMenu = () => fireEvent.click(screen.getByRole("button", { name: /Actions for/ }));

  it("lists the actions and closes on Escape or an outside click", () => {
    setup();
    expect(screen.queryByRole("menu")).toBeNull();
    openMenu();
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((i) => i.textContent?.trim())).toEqual(["Share", "Copy link", "Rename and people", "Delete"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    openMenu();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("copies the link to this meeting", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy link" }));
    await screen.findByText("Link copied");
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/view/3`);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens the share, edit and delete dialogs", () => {
    setup();
    for (const [item, dialog] of [["Share", "Weekly Sync"], ["Rename and people", "Edit meeting"], ["Delete", "Delete this meeting?"]]) {
      openMenu();
      fireEvent.click(screen.getByRole("menuitem", { name: item }));
      expect(screen.getByRole("dialog", { name: dialog })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  });

  it("deleting tells the page, renaming asks it to refresh", async () => {
    mockApi({ "/api/meetings/3": new Response(null, { status: 204 }) });
    const p = setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(p.onDeleted).toHaveBeenCalled());
    expect(p.onChanged).not.toHaveBeenCalled();
  });

  it("renders extra items passed by the page", () => {
    wrap(<MeetingMenu meeting={meeting()} onChanged={vi.fn()} onDeleted={vi.fn()} extra={<button role="menuitem">Download</button>} />);
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Download" })).toBeInTheDocument();
  });
});

describe("CaptureMenu", () => {
  it("the main button opens the upload dialog", () => {
    wrap(<CaptureMenu />);
    fireEvent.click(screen.getByRole("button", { name: /^Capture/ }));
    expect(screen.getByRole("dialog", { name: "Add a meeting" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Upload file" })).toHaveAttribute("aria-selected", "true");
  });

  it("the arrow offers upload and paste, which open the right tab", () => {
    wrap(<CaptureMenu />);
    fireEvent.click(screen.getByRole("button", { name: "More ways to add a meeting" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Paste transcript/ }));
    expect(screen.getByRole("tab", { name: "Paste text" })).toHaveAttribute("aria-selected", "true");
  });

  it("live capture, scheduling and recording say they are coming soon", async () => {
    wrap(<CaptureMenu />);
    for (const [item, text] of [[/Add to live meeting/, "Adding to a live meeting is coming soon"], [/Schedule new meeting/, "Scheduling is coming soon"], [/Start recording/, "Recording is coming soon"]] as const) {
      fireEvent.click(screen.getByRole("button", { name: "More ways to add a meeting" }));
      fireEvent.click(screen.getByRole("menuitem", { name: item }));
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  });

  it("closes the menu on an outside click", () => {
    wrap(<CaptureMenu />);
    fireEvent.click(screen.getByRole("button", { name: "More ways to add a meeting" }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
