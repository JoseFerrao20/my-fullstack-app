import { fromDateTimeLocal, isOverdue, toDateTimeLocal } from "@/lib/format";

describe("format", () => {
  it("round-trips datetime-local values", () => {
    const iso = fromDateTimeLocal("2030-05-01T09:30");
    expect(iso).toBe(new Date("2030-05-01T09:30").toISOString());
    expect(toDateTimeLocal(iso)).toBe("2030-05-01T09:30");
    expect(fromDateTimeLocal("")).toBeNull();
    expect(toDateTimeLocal(null)).toBe("");
  });

  it("flags only open tasks past their due date as overdue", () => {
    const now = new Date("2030-01-02T00:00:00Z");
    const past = "2030-01-01T00:00:00Z";
    expect(isOverdue({ dueAt: past, status: "todo" }, now)).toBe(true);
    expect(isOverdue({ dueAt: past, status: "done" }, now)).toBe(false);
    expect(isOverdue({ dueAt: "2030-01-03T00:00:00Z", status: "todo" }, now)).toBe(false);
    expect(isOverdue({ dueAt: null, status: "todo" }, now)).toBe(false);
  });
});
