import { screen, waitFor } from "@testing-library/react";
import { CategoriesManager } from "@/features/categories/CategoriesManager";
import { workCategory } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";
import { apiUrl, fail, http, ok, server } from "@/test/server";
import type { Category } from "@/lib/types";

describe("CategoriesManager", () => {
  let categories: Category[];

  beforeEach(() => {
    categories = [workCategory];
    server.use(http.get(apiUrl("/categories"), () => ok(categories)));
  });

  it("creates a category", async () => {
    let body: unknown;
    server.use(
      http.post(apiUrl("/categories"), async ({ request }) => {
        body = await request.json();
        const created = { ...workCategory, id: 11, name: "Home", color: "#6366f1" };
        categories = [...categories, created];
        return ok(created);
      }),
    );
    const { user } = renderWithProviders(<CategoriesManager />);
    await screen.findByDisplayValue("Work");

    await user.type(screen.getByLabelText("New category name"), "Home");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByDisplayValue("Home")).toBeInTheDocument();
    expect(body).toEqual({ name: "Home", color: "#6366f1" });
    expect(screen.getByLabelText("New category name")).toHaveValue("");
  });

  it("shows a duplicate-name error", async () => {
    server.use(
      http.post(apiUrl("/categories"), () => fail(409, "CATEGORY_EXISTS", "A category named 'Work' already exists")),
    );
    const { user } = renderWithProviders(<CategoriesManager />);
    await screen.findByDisplayValue("Work");
    await user.type(screen.getByLabelText("New category name"), "work");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("A category named 'Work' already exists")).toBeInTheDocument();
  });

  it("deletes after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    server.use(
      http.delete(apiUrl("/categories/10"), () => {
        categories = [];
        return ok(null);
      }),
    );
    const { user } = renderWithProviders(<CategoriesManager />);
    await user.click(await screen.findByRole("button", { name: "Delete Work" }));
    await waitFor(() => expect(screen.getByText("No categories yet.")).toBeInTheDocument());
  });
});
