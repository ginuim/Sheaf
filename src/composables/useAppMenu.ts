import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { translate } from "./useLocale";

export type AppMenuHandlers = {
  onNew: () => void;
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
  onFormatSpacing: () => void;
  onExportPdf: () => void;
  onCopyWechatHtml: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onClearRecent: () => void;
};

let recentSubmenu: Submenu | null = null;
let handlers: AppMenuHandlers | null = null;

async function clearSubmenuItems(submenu: Submenu) {
  const items = await submenu.items();
  for (let i = items.length - 1; i >= 0; i--) {
    await submenu.removeAt(i);
  }
}

export async function refreshRecentMenu(paths: string[]) {
  if (!recentSubmenu || !handlers) return;

  await clearSubmenuItems(recentSubmenu);

  if (paths.length === 0) {
    await recentSubmenu.append(
      await MenuItem.new({
        id: "recent-empty",
        text: translate("menu.recentEmpty"),
        enabled: false,
      }),
    );
    return;
  }

  const fileItems = await Promise.all(
    paths.map((path, index) =>
      MenuItem.new({
        id: `recent-${index}`,
        text: path.split(/[/\\]/).pop() ?? path,
        action: () => handlers!.onOpenRecent(path),
      }),
    ),
  );

  await recentSubmenu.append(fileItems);
  await recentSubmenu.append(
    await PredefinedMenuItem.new({ item: "Separator" }),
  );
  await recentSubmenu.append(
    await MenuItem.new({
      id: "recent-clear",
      text: translate("menu.clearRecent"),
      action: () => handlers!.onClearRecent(),
    }),
  );
}

export async function setupAppMenu(menuHandlers: AppMenuHandlers) {
  handlers = menuHandlers;

  recentSubmenu = await Submenu.new({
    text: translate("menu.openRecent"),
    items: [],
  });

  const fileSubmenu = await Submenu.new({
    text: translate("menu.file"),
    items: [
      await MenuItem.new({
        id: "file-new",
        text: translate("menu.new"),
        accelerator: "CmdOrCtrl+N",
        action: () => handlers!.onNew(),
      }),
      await MenuItem.new({
        id: "file-open",
        text: translate("menu.open"),
        accelerator: "CmdOrCtrl+O",
        action: () => handlers!.onOpen(),
      }),
      recentSubmenu,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "file-save",
        text: translate("menu.save"),
        accelerator: "CmdOrCtrl+S",
        action: () => handlers!.onSave(),
      }),
      await MenuItem.new({
        id: "file-save-as",
        text: translate("menu.saveAs"),
        accelerator: "CmdOrCtrl+Shift+S",
        action: () => handlers!.onSaveAs(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "file-export-pdf",
        text: translate("menu.exportPdf"),
        action: () => handlers!.onExportPdf(),
      }),
      await MenuItem.new({
        id: "file-copy-wechat-html",
        text: translate("menu.copyWechatHtml"),
        action: () => handlers!.onCopyWechatHtml(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "file-settings",
        text: translate("menu.settings"),
        accelerator: "CmdOrCtrl+,",
        action: () => handlers!.onOpenSettings(),
      }),
    ],
  });

  const editSubmenu = await Submenu.new({
    text: translate("menu.edit"),
    items: [
      await PredefinedMenuItem.new({ item: "Undo" }),
      await PredefinedMenuItem.new({ item: "Redo" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Cut" }),
      await PredefinedMenuItem.new({ item: "Copy" }),
      await PredefinedMenuItem.new({ item: "Paste" }),
      await PredefinedMenuItem.new({ item: "SelectAll" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "edit-format-cjk-spacing",
        text: translate("menu.formatSpacing"),
        accelerator: "CmdOrCtrl+Shift+Space",
        action: () => handlers!.onFormatSpacing(),
      }),
    ],
  });

  const helpSubmenu = await Submenu.new({
    text: translate("menu.help"),
    items: [
      await MenuItem.new({
        id: "help-about",
        text: translate("menu.about"),
        action: () => handlers!.onOpenAbout(),
      }),
    ],
  });

  const isMac = navigator.userAgent.includes("Macintosh");

  const menuItems: Submenu[] = [];

  if (isMac) {
    menuItems.push(
      await Submenu.new({
        text: translate("app.title"),
        items: [
          await MenuItem.new({
            id: "app-about",
            text: translate("menu.about"),
            action: () => handlers!.onOpenAbout(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "Services" }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "app-settings",
            text: translate("menu.settings"),
            accelerator: "CmdOrCtrl+,",
            action: () => handlers!.onOpenSettings(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "Hide" }),
          await PredefinedMenuItem.new({ item: "HideOthers" }),
          await PredefinedMenuItem.new({ item: "ShowAll" }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "Quit" }),
        ],
      }),
    );
  }

  menuItems.push(fileSubmenu, editSubmenu, helpSubmenu);

  const menu = await Menu.new({ items: menuItems });

  if (isMac) {
    await menu.setAsAppMenu();
  } else {
    await menu.setAsWindowMenu();
  }
}
