import { parseQuickAdd } from "@/features/quickadd/parse";

// Wednesday 15 May 2030, 10:00 local time.
const NOW = new Date(2030, 4, 15, 10, 0);
const p = (text: string) => parseQuickAdd(text, NOW);
const at = (month: number, day: number, h = 23, m = 59, year = 2030) => new Date(year, month - 1, day, h, m);

describe("parseQuickAdd", () => {
  it("parses the example sentence", () => {
    expect(p("Pagar renda dia 1 todos os meses #casa !alta")).toEqual({
      title: "Pagar renda",
      dueAt: at(6, 1), // the 1st already passed this month
      hasTime: false,
      recurrence: "monthly",
      recurrenceInterval: 1,
      priority: "high",
      category: "casa",
    });
  });

  it("keeps plain text as the title", () => {
    expect(p("Comprar leite")).toMatchObject({ title: "Comprar leite", dueAt: null, recurrence: null, priority: null, category: null });
  });

  describe("dates (PT and EN, accents optional)", () => {
    it.each([
      ["Ligar hoje", at(5, 15)],
      ["Ligar amanhã", at(5, 16)],
      ["Ligar amanha", at(5, 16)],
      ["Call tomorrow", at(5, 16)],
      ["Ligar depois de amanhã", at(5, 17)],
      ["Ligar daqui a 3 dias", at(5, 18)],
      ["Call in 2 weeks", at(5, 29)],
      ["Renovar em 1 mês", at(6, 15)],
      ["Reunião na sexta", at(5, 17)],
      ["Reunião sexta-feira", at(5, 17)],
      ["Meeting on monday", at(5, 20)],
      ["Hoje é quarta: quarta", at(5, 15)], // "hoje" wins; one date only
      ["Pagar dia 20", at(5, 20)],
      ["Pay on the 3rd", at(6, 3)],
      ["Entregar 25/12", at(12, 25)],
      ["Entregar 3/2", at(2, 3, 23, 59, 2031)], // already passed this year
      ["Exame 2030-09-01", at(9, 1)],
      ["Festa 5 de junho", at(6, 5)],
      ["Party June 5th", at(6, 5)],
      ["Party 5 June", at(6, 5)],
    ])("%s", (text, expected) => {
      expect(p(text).dueAt).toEqual(expected);
    });

    it("clamps day 31 to the month's last day", () => {
      expect(parseQuickAdd("Pagar dia 31", new Date(2030, 1, 10)).dueAt).toEqual(new Date(2030, 1, 28, 23, 59));
    });
  });

  describe("times", () => {
    it.each([
      ["Dentista amanhã às 9h", at(5, 16, 9, 0)],
      ["Dentista amanhã as 9h30", at(5, 16, 9, 30)],
      ["Dentista amanhã 14:30", at(5, 16, 14, 30)],
      ["Dentist tomorrow at 9am", at(5, 16, 9, 0)],
      ["Dentist tomorrow at 5:30pm", at(5, 16, 17, 30)],
      ["Dentist tomorrow at 12am", at(5, 16, 0, 0)],
      ["Ligar às 15", at(5, 15, 15, 0)], // later today
      ["Ligar às 8h", at(5, 16, 8, 0)], // 8:00 already gone → tomorrow
    ])("%s", (text, expected) => {
      const parsed = p(text);
      expect(parsed.dueAt).toEqual(expected);
      expect(parsed.hasTime).toBe(true);
    });

    it("leaves untimed dates at the end of the day", () => {
      expect(p("Ligar amanhã")).toMatchObject({ dueAt: at(5, 16, 23, 59), hasTime: false });
    });
  });

  describe("recurrence", () => {
    it.each([
      ["Regar plantas todos os dias", "daily", 1],
      ["Water plants every day", "daily", 1],
      ["Water plants daily", "daily", 1],
      ["Limpar semanalmente", "weekly", 1],
      ["Clean every week", "weekly", 1],
      ["Backup todos os meses", "monthly", 1],
      ["Backup a cada 2 semanas", "weekly", 2],
      ["Backup every 3 days", "daily", 3],
      ["Revisão a cada 6 meses", "monthly", 6],
    ] as const)("%s", (text, recurrence, interval) => {
      const parsed = p(text);
      expect(parsed.recurrence).toBe(recurrence);
      expect(parsed.recurrenceInterval).toBe(interval);
      expect(parsed.dueAt).not.toBeNull(); // recurring tasks need a due date: today by default
    });

    it("every weekday sets the first date", () => {
      expect(p("Ginásio todas as segundas às 7h")).toMatchObject({
        title: "Ginásio",
        recurrence: "weekly",
        dueAt: at(5, 20, 7, 0),
      });
      expect(p("Gym every friday")).toMatchObject({ title: "Gym", recurrence: "weekly", dueAt: at(5, 17) });
    });
  });

  describe("tags", () => {
    it.each([
      ["Tarefa !urgente", "urgent"],
      ["Task !high", "high"],
      ["Tarefa !média", "medium"],
      ["Task !low", "low"],
    ] as const)("%s", (text, priority) => {
      expect(p(text).priority).toBe(priority);
    });

    it("keeps the category as typed, accents included", () => {
      expect(p("Estudar #Faculdade-Ação")).toMatchObject({ title: "Estudar", category: "Faculdade-Ação" });
    });

    it("ignores # and ! inside words", () => {
      expect(p("Email ana#1 sobre isto! agora")).toMatchObject({ title: "Email ana#1 sobre isto! agora", category: null, priority: null });
    });
  });

  it("doesn't mistake ordinary words or numbers for dates", () => {
    for (const text of ["Set 3 alarms", "Do 5 sets of push-ups", "Comprar 2 pães", "Find out 2 ideas", "Ler capítulo 12"]) {
      expect(p(text)).toMatchObject({ title: text, dueAt: null });
    }
    expect(p("5 set").dueAt).toEqual(at(9, 5)); // Portuguese day-first abbreviation still works
  });

  it("only removes what it understood and tidies spaces", () => {
    expect(p("  Ligar  à Ana   amanhã   às 9h  !alta ").title).toBe("Ligar à Ana");
  });

  it("is safe with emoji in the title", () => {
    expect(p("🎂 Bolo da Ana amanhã #festa")).toMatchObject({ title: "🎂 Bolo da Ana", category: "festa", dueAt: at(5, 16) });
  });
});
