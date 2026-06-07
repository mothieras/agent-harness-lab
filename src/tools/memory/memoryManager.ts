import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { MemoryEntry, MemoryType } from "./types.js";

export class MemoryManager {
  private readonly dir: string;
  private readonly client: Anthropic;
  private readonly model: string;
  #dirtyThisTurn: boolean = false;

  constructor(memoryDir: string, client: Anthropic, model: string) {
    this.dir = memoryDir;
    this.client = client;
    this.model = model;
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  buildIndex(): string {
    const entries = this.list();
    if (entries.length === 0) return "";
    return entries
      .map((e) => `- [${e.name}](${e.filename})[${e.type}] — ${e.description}`)
      .join("\n");
  }

  list(): MemoryEntry[] {
    if (!existsSync(this.dir)) return [];

    const result: MemoryEntry[] = [];
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith(".md")) continue;
      const raw = readFileSync(path.join(this.dir, f), "utf8");
      const { meta, body } = this.#parseFrontmatter(raw);
      result.push({
        filename: f,
        name: meta.name ?? f.replace(".md", ""),
        description: meta.description ?? "",
        type: (meta.type as MemoryType) ?? "user",
        body,
      });
    }
    return result;
  }

  write(
    name: string,
    type: MemoryType,
    description: string,
    body: string,
  ): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    let filename = `${slug}.md`;
    if (existsSync(path.join(this.dir, filename))) {
      filename = `${slug}-${Date.now()}.md`;
    }
    // prettier-ignore
    const content = [
      `---`,
      `name: ${name}`,
      `description: ${description}`,
      `type: ${type}`,
      `---`,
      ``,
      body,
      ``,
    ].join("\n");
    writeFileSync(path.join(this.dir, filename), content, "utf8");
    this.#dirtyThisTurn = true;
    return filename;
  }

  async extract(messages: Anthropic.Messages.MessageParam[]): Promise<void> {
    if (this.#dirtyThisTurn) {
      this.#dirtyThisTurn = false;
      return;
    }
    const dialogue = this.#formatRecentMessages(messages);
    if (!dialogue.trim()) return;

    const existing = this.list();
    const existingDesc =
      existing.length > 0
        ? existing.map((e) => `- ${e.name}: ${e.description}`).join("\n")
        : "(none)";

    const prompt = [
      "Extract user preferences, constraints, or project facts from this dialogue.",
      "Return a JSON array. Each item: {name, type, description, body}.",
      "- name: short kebab-case identifier (e.g. 'user-preference-tabs')",
      "- type: one of 'user', 'feedback', 'project', 'reference'",
      "- description: one-line summary for index lookup",
      "- body: full detail in markdown",
      "If nothing new or already covered by existing memories, return [].",
      "",
      `Existing memories:\n${existingDesc}`,
      "",
      `Dialogue:\n${dialogue.slice(0, 4000)}`,
    ].join("\n");

    try {
      const response = await this.client.messages.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 800,
      });

      const text = response.content.find((b) => b.type === "text")?.text ?? "";
      const match = text.match(/\[.*\]/s);
      if (!match) return;

      const items = JSON.parse(match[0]) as Array<{
        name?: string;
        type?: string;
        description?: string;
        body?: string;
      }>;

      let count = 0;
      for (const mem of items) {
        const memName = mem.name ?? `memory_${Date.now()}`;
        const memType = (
          ["user", "feedback", "project", "reference"].includes(mem.type ?? "")
            ? mem.type
            : "user"
        ) as MemoryType;
        const desc = mem.description ?? "";
        const memBody = mem.body ?? "";
        if (desc && memBody) {
          this.write(memName, memType, desc, memBody);
          count++;
        }
      }
      if (count > 0) {
        console.log(`\x1b[33m[Memory: extracted ${count} new memories]\x1b[0m`);
      }
    } catch {
      console.warn(`[Memory: extraction failed]`);
    }
  }

  async consolidate(): Promise<void> {
    const files = this.list();
    if (files.length < 10) return;

    const catalog = files
      .map(
        (f) =>
          `## ${f.filename}\nname: ${f.name}\ndescription: ${f.description}\ntype: ${f.type}\n\n${f.body}`,
      )
      .join("\n\n");

    const prompt = [
      "Consolidate the following memory files:",
      "1. Merge duplicates into one",
      "2. Remove outdated or contradicted memories",
      "3. Keep total under 30",
      "4. Preserve user preferences above all",
      "Return a JSON array: [{name, type, description, body}].",
      "",
      catalog.slice(0, 16000),
    ].join("\n");

    try {
      const response = await this.client.messages.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 3000,
      });

      const text = response.content.find((b) => b.type === "text")?.text ?? "";
      const match = text.match(/\[.*\]/s);
      if (!match) return;

      const items = JSON.parse(match[0]) as Array<{
        name?: string;
        type?: string;
        description?: string;
        body?: string;
      }>;

      for (const f of readdirSync(this.dir)) {
        if (f.endsWith(".md")) rmSync(path.join(this.dir, f));
      }

      for (const mem of items) {
        const memName = mem.name ?? `memory_${Date.now()}`;
        const memType = (["user", "feedback", "project", "reference"].includes(
          mem.type ?? "",
        )
          ? mem.type
          : "user") as MemoryType;
        const desc = mem.description ?? "";
        const memBody = mem.body ?? "";
        if (desc && memBody) {
          this.write(memName, memType, desc, memBody);
        }
      }

      console.log(
        `\x1b[33m[Memory: consolidated ${files.length} → ${items.length} memories]\x1b[0m`,
      );
    } catch {
      console.warn(`[Memory: consolidation failed]`);
    }
  }

  #parseFrontmatter(text: string): {
    meta: Record<string, string>;
    body: string;
  } {
    if (!text.startsWith("---")) return { meta: {}, body: text };

    const parts = text.split("---", 3);
    if (parts.length < 3) return { meta: {}, body: text };

    const meta: Record<string, string> = {};
    for (const line of parts[1]!.trim().split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line
          .slice(colonIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        meta[key] = value;
      }
    }
    return { meta, body: parts[2]!.trim() };
  }

  #formatRecentMessages(messages: Anthropic.Messages.MessageParam[]): string {
    const parts: string[] = [];
    for (const msg of messages.slice(-10)) {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : (msg.content
              ?.filter((b) => b.type === "text")
              .map((b) => b.text)
              .join(" ") ?? "");
      if (content.trim()) {
        parts.push(`${msg.role}: ${content}`);
      }
    }
    return parts.join("\n");
  }
}
