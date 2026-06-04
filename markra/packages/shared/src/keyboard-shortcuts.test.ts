import {
  defaultKeyboardShortcuts,
  keyboardShortcutActions,
  normalizeKeyboardShortcuts
} from "./keyboard-shortcuts";

describe("keyboard shortcuts", () => {
  it("includes read-only mode as a configurable application shortcut", () => {
    expect(keyboardShortcutActions).toContain("toggleReadOnlyMode");
    expect(defaultKeyboardShortcuts.toggleReadOnlyMode).toBe("Mod+Alt+L");
    expect(normalizeKeyboardShortcuts({
      toggleReadOnlyMode: "Mod+Alt+R"
    }).toggleReadOnlyMode).toBe("Mod+Alt+R");
  });
});
