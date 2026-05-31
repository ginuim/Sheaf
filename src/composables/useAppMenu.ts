import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";

export type AppMenuHandlers = {
  onOpen: () => void;
  onOpenRecent: (path: string) => void;
  onSave: () => void;
  onSaveAs: () => void;
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
        text: "（无最近文档）",
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
      text: "清除菜单",
      action: () => handlers!.onClearRecent(),
    }),
  );
}

export async function setupAppMenu(menuHandlers: AppMenuHandlers) {
  handlers = menuHandlers;

  recentSubmenu = await Submenu.new({
    text: "打开最近使用",
    items: [],
  });

  const fileSubmenu = await Submenu.new({
    text: "文件",
    items: [
      await MenuItem.new({
        id: "file-open",
        text: "打开…",
        accelerator: "CmdOrCtrl+O",
        action: () => handlers!.onOpen(),
      }),
      recentSubmenu,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "file-save",
        text: "保存",
        accelerator: "CmdOrCtrl+S",
        action: () => handlers!.onSave(),
      }),
      await MenuItem.new({
        id: "file-save-as",
        text: "另存为…",
        accelerator: "CmdOrCtrl+Shift+S",
        action: () => handlers!.onSaveAs(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "file-export-pdf",
        text: "导出 PDF",
        action: () => handlers!.onExportPdf(),
      }),
      await MenuItem.new({
        id: "file-copy-wechat-html",
        text: "复制公众号 HTML",
        action: () => handlers!.onCopyWechatHtml(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "file-settings",
        text: "设置…",
        accelerator: "CmdOrCtrl+,",
        action: () => handlers!.onOpenSettings(),
      }),
    ],
  });

  const editSubmenu = await Submenu.new({
    text: "编辑",
    items: [
      await PredefinedMenuItem.new({ item: "Undo" }),
      await PredefinedMenuItem.new({ item: "Redo" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Cut" }),
      await PredefinedMenuItem.new({ item: "Copy" }),
      await PredefinedMenuItem.new({ item: "Paste" }),
      await PredefinedMenuItem.new({ item: "SelectAll" }),
    ],
  });

  const helpSubmenu = await Submenu.new({
    text: "帮助",
    items: [
      await MenuItem.new({
        id: "help-about",
        text: "关于 Sheaf…",
        action: () => handlers!.onOpenAbout(),
      }),
    ],
  });

  const isMac = navigator.userAgent.includes("Macintosh");

  const menuItems: Submenu[] = [];

  if (isMac) {
    menuItems.push(
      await Submenu.new({
        text: "Sheaf",
        items: [
          await MenuItem.new({
            id: "app-about",
            text: "关于 Sheaf…",
            action: () => handlers!.onOpenAbout(),
          }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await PredefinedMenuItem.new({ item: "Services" }),
          await PredefinedMenuItem.new({ item: "Separator" }),
          await MenuItem.new({
            id: "app-settings",
            text: "设置…",
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
