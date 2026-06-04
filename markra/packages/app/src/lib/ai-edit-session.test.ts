import { describe, expect, it } from "vitest";
import { collectAiEditHistory, collectMessageEditEntries, sessionPreviewToAiResult } from "./ai-edit-session";

describe("ai-edit-session", () => {
  it("collects previews from assistant messages with user prompts", () => {
    const messages = [
      { id: 1, role: "user" as const, text: "Polish intro" },
      {
        id: 2,
        role: "assistant" as const,
        text: "Done.",
        previews: [
          {
            original: "hello",
            replacement: "hello world",
            type: "replace" as const
          }
        ]
      }
    ];

    expect(collectAiEditHistory(messages)).toEqual([
      expect.objectContaining({
        id: "2:0",
        messageId: 2,
        userPrompt: "Polish intro"
      })
    ]);
  });

  it("converts session preview back to editor diff result", () => {
    const preview = {
      from: 1,
      original: "a",
      replacement: "b",
      to: 2,
      type: "replace" as const
    };

    expect(sessionPreviewToAiResult(preview)).toEqual({
      from: 1,
      original: "a",
      replacement: "b",
      to: 2,
      type: "replace"
    });
  });

  it("collects previews for a single assistant message", () => {
    const message = {
      id: 9,
      role: "assistant" as const,
      text: "",
      preview: {
        original: "",
        replacement: "new",
        type: "insert" as const
      }
    };

    expect(collectMessageEditEntries(message, "Add section")).toHaveLength(1);
  });
});
