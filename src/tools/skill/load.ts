import { requireNonEmptyString } from "../input.js";
import type { SkillLoader } from "./skillLoader.js";
import { builtinTool, type RegisteredTool } from "../types.js";

export function createLoadSkillTool(deps: {
  skillLoader: SkillLoader;
}): RegisteredTool {
  return builtinTool(
    {
      name: "load_skill",
      description:
        "Load specialized knowledge by name. Call before tackling unfamiliar topics listed under 'Skills available' in the system prompt.",
      input_schema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Skill name to load (must match one listed in the system prompt).",
          },
        },
        required: ["name"],
      },
    },
    (input) => {
      const name = requireNonEmptyString(input, "name", "load_skill tool");
      if ("error" in name) return name.error;
      return `<skill name="${name.value}">\n${deps.skillLoader.getContent(name.value)}\n</skill>`;
    },
  );
}
