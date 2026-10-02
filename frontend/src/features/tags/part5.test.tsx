import { screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { AppearanceSection } from "@/features/account/AppearanceSection";
import { CalendarFeedSection } from "@/features/account/CalendarFeedSection";
import { parseQuickAdd } from "@/features/quickadd/parse";
import { TagInput } from "@/features/tags/TagInput";
import { TaskItem } from "@/features/tasks/TaskItem";
import { TasksPage } from "@/features/tasks/TasksPage";
import { TrashPage } from "@/features/trash/TrashPage";
import { applyTheme, setTheme, storedTheme } from "@/lib/theme";
import { makeTask } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, http, ok, server } from "@/test/server";
import type { Task } from "@/lib/types";

describe("Tags", () => {
  function Harness({ initial = [] as string[] }) {
    const [tags, setTags] = useState(initial);
    return (
      <>
        <TagInput label="Tags" value={tags} onChange={setTags} />
        <output data-testid="value">{JSON.stringify(tags)}</output>
      </>
    );
  }
  const value = () => JSON.parse(screen.getByTestId("value").textContent!);

  it("adds with Enter or comma, cleans and de-duplicates, removes with Backspace or ✕", async () => {
    server.use(http.get(apiUrl("/tags"), () => ok([{ id: 1, name: "Cliente", taskCount: 3 }])));
    const { user } = renderWithProviders(<Harness />);
    const input = screen.getByLabelText("Tags");

    await user.type(input, "@urgent{Enter}cliente,"); // reuses the known spelling "Cliente"
    await waitFor(() => expect(value()).toEqual(["urgent", "Cliente"]));
    await user.type(input, "URGENT{Enter}");
    expect(value()).toEqual(["urgent", "Cliente"]);

    await user.type(input, "{Backspace}");
    expect(value()).toEqual(["urgent"]);
    await user.click(screen.getByRole("button", { name: "Remove tag urgent" }));
    expect(value()).toEqual([]);
  });

  it("shows tags on tasks", () => {
    renderWithProviders(<TaskItem task={makeTask({ tags: ["cliente", "urgent"] })} onEdit={vi.fn()} />);
    expect(screen.getByLabelText("Tag cliente")).toHaveTextContent("@cliente");
  });

  it("quick add understands @tags but not e-mail addresses", () => {
    expect(parseQuickAdd("Email ana@x.pt about @cliente @Urgent @cliente")).toMatchObject({
      title: "Email ana@x.pt about",
      tags: ["cliente", "Urgent"],
    });
  });

  it("filters the list by tag", async () => {
    const requests: URLSearchParams[] = [];
    server.use(
      http.get(apiUrl("/categories"), () => ok([])),
      http.get(apiUrl("/tags"), () => ok([{ id: 1, name: "cliente", taskCount: 2 }])),
      http.get(apiUrl("/tasks"), ({ request }) => {
        requests.push(new URL(request.url).searchParams);
        return ok([], { total: 0, page: 1, pageSize: 20 });
      }),
    );
    const { user, router } = renderWithProviders(<TasksPage />, { path: "/tasks" });
    await screen.findByRole("option", { name: "@cliente (2)" }); // tags load after the select renders
    await user.selectOptions(screen.getByLabelText("Tag"), "cliente");
    await waitFor(() => expect(requests.at(-1)?.get("tag")).toBe("cliente"));
    expect(router.state.location.search).toBe("?tag=cliente");
  });
});

describe("Trash", () => {
  it("deleting moves to the trash with Undo", async () => {
    const calls: string[] = [];
    server.use(
      http.delete(apiUrl("/tasks/5"), () => {
        calls.push("delete");
        return ok(null);
      }),
      http.post(apiUrl("/tasks/5/restore"), () => {
        calls.push("restore");
        return ok(makeTask({ id: 5 }));
      }),
    );
    const confirmSpy = vi.spyOn(window, "confirm");
    const { user } = renderWithProviders(<TaskItem task={makeTask({ id: 5, title: "Old plan" })} onEdit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: 'Delete "Old plan"' }));
    expect(confirmSpy).not.toHaveBeenCalled(); // no "are you sure?": it's undoable
    const toast = await screen.findByText("Moved “Old plan” to the trash");
    await user.click(within(toast.parentElement!).getByRole("button", { name: "Undo" }));

    await waitFor(() => expect(calls).toEqual(["delete", "restore"]));
    expect(await screen.findByText("Restored “Old plan”")).toBeInTheDocument();
  });

  it("lists, restores, deletes forever and empties", async () => {
    let trash: Task[] = [
      makeTask({ id: 1, title: "First", deletedAt: "2030-05-01T10:00:00Z" }),
      makeTask({ id: 2, title: "Second", deletedAt: "2030-05-02T10:00:00Z" }),
      makeTask({ id: 3, title: "Third", deletedAt: "2030-05-03T10:00:00Z" }),
    ];
    const drop = (id: number) => (trash = trash.filter((t) => t.id !== id));
    server.use(
      http.get(apiUrl("/trash"), () => ok(trash)),
      http.post(apiUrl("/tasks/:id/restore"), ({ params }) => {
        drop(Number(params.id));
        return ok(makeTask());
      }),
      http.delete(apiUrl("/trash/:id"), ({ params }) => {
        drop(Number(params.id));
        return ok(null);
      }),
      http.delete(apiUrl("/trash"), () => {
        trash = [];
        return ok(null, { deleted: 1 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderWithProviders(<TrashPage />, { path: "/trash" });
    const list = await screen.findByRole("list", { name: "Trash" });

    await user.click(within(within(list).getByText("First").closest("li")!).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(screen.queryByText("First")).not.toBeInTheDocument());

    await user.click(within(screen.getByText("Second").closest("li")!).getByRole("button", { name: "Delete forever" }));
    await waitFor(() => expect(screen.queryByText("Second")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Empty trash" }));
    expect(await screen.findByText("The trash is empty.")).toBeInTheDocument();
  });
});

describe("Calendar feed settings", () => {
  it("creates a link, shows it once with subscribe shortcuts, and turns it off", async () => {
    const url = "http://localhost/api/ical/secret-token.ics";
    server.use(
      http.post(apiUrl("/calendar-feed"), () => ok({ enabled: true, createdAt: "2030-05-01T10:00:00Z", url })),
      http.delete(apiUrl("/calendar-feed"), () => ok(null)),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user } = renderWithProviders(<CalendarFeedSection />, { path: "/settings" });

    expect(await screen.findByText("The feed is off.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create feed link" }));

    expect(await screen.findByLabelText("Your private feed link")).toHaveValue(url);
    expect(screen.getByRole("link", { name: "Add to Google Calendar" })).toHaveAttribute(
      "href",
      `https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(url)}`,
    );
    expect(screen.getByRole("link", { name: "Open in Apple Calendar / Outlook" })).toHaveAttribute(
      "href",
      "webcal://localhost/api/ical/secret-token.ics",
    );

    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByText("The feed is off.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your private feed link")).not.toBeInTheDocument();
  });
});

describe("Theme", () => {
  let systemDark = false;
  beforeEach(() => {
    systemDark = false;
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("dark") && systemDark,
      addEventListener: () => {},
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("follows the device by default and remembers an explicit choice", () => {
    systemDark = true;
    applyTheme();
    expect(document.documentElement).toHaveClass("dark");
    expect(storedTheme()).toBe("system");

    setTheme("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("theme")).toBe("light");

    setTheme("system");
    expect(localStorage.getItem("theme")).toBeNull();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("can be changed in settings", async () => {
    const { user } = renderWithProviders(<AppearanceSection />);
    await user.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(storedTheme()).toBe("dark");
  });
});
