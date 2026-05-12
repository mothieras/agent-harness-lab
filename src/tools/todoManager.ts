type TodoStatus = "pending" | "in_progress" | "completed";

interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
}

export default class TodoManager {
  private items: TodoItem[] = [];

  update(items: TodoItem[]): string {
    if (!Array.isArray(items)) {
      throw new Error("items must be an array");
    }
    if (items.length > 20) {
      throw new Error("Max 20 todos allowed");
    }

    const validated: TodoItem[] = [];
    let inProgressCount = 0;

    for (let i = 0; i < items.length; i += 1) {
      const raw = items[i];
      const id = String(raw?.id ?? i + 1);
      const text = String(raw?.text ?? "").trim();
      const status = String(raw?.status ?? "pending").toLowerCase();

      if (!text) {
        throw new Error(`Item ${id}: text required`);
      }

      if (status !== "pending" && status !== "in_progress" && status !== "completed") {
        throw new Error(`Item ${id}: invalid status '${status}'`);
      }

      if (status === "in_progress") {
        inProgressCount += 1;
      }

      validated.push({
        id,
        text,
        status: status as TodoStatus,
      });
    }

    if (inProgressCount > 1) {
      throw new Error("Only one task can be in_progress at a time");
    }

    // Enforce incremental progress updates.
    const previousById = new Map(this.items.map((item) => [item.id, item]));
    let completedTransitions = 0;
    for (const item of validated) {
      const prev = previousById.get(item.id);
      if (!prev || prev.status === item.status) continue;
      if (prev.status === "pending" && item.status === "completed") {
        throw new Error(`Item ${item.id}: cannot move pending -> completed directly`);
      }
      if (item.status === "completed") {
        completedTransitions += 1;
      }
    }
    if (completedTransitions > 1) {
      throw new Error("Only one task can be completed per todo update");
    }

    this.items = validated;
    return this.render();
  }

  render(): string {
    if (this.items.length === 0) {
      return "No todos.";
    }

    const lines = this.items.map((item) => {
      const marker = {
        pending: "[ ]",
        in_progress: "[>]",
        completed: "[x]",
      }[item.status];
      return `${marker} #${item.id}: ${item.text}`;
    });

    const done = this.items.filter((item) => item.status === "completed").length;
    lines.push(`\n(${done}/${this.items.length} completed)`);
    return lines.join("\n");
  }
}