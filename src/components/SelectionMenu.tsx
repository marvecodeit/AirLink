import { Check, Copy, TextSelect } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../stores/appStore";

interface MenuState {
  x: number;
  y: number;
  text: string;
}

/** A small, native-feeling copy menu for selected text in the app chrome. */
export function SelectionMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [copied, setCopied] = useState(false);
  const pushToast = useAppStore((state) => state.pushToast);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      const text = window.getSelection()?.toString().trim() ?? "";
      if (!text) {
        setMenu(null);
        return;
      }
      event.preventDefault();
      setCopied(false);
      setMenu({
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 104),
        text,
      });
    };

    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };

    document.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!menu) return null;

  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(menu.text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = menu.text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    pushToast("success", "Copied to clipboard");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMenu(null), 900);
  };

  const selectAll = (event: React.MouseEvent) => {
    event.stopPropagation();
    window.getSelection()?.selectAllChildren(document.body);
    setMenu(null);
  };

  return (
    <div
      className="fixed z-[200] min-w-[178px] overflow-hidden rounded-lg border border-hairline bg-surface p-1 shadow-float"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={(event) => void copy(event)}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-ink hover:bg-surface-muted"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-brand" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-ink-tertiary" />
        )}
        {copied ? "Copied" : "Copy selection"}
        <span className="ml-auto font-mono text-[9px] text-ink-tertiary">⌘C</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={selectAll}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] text-ink hover:bg-surface-muted"
      >
        <TextSelect className="h-3.5 w-3.5 text-ink-tertiary" />
        Select all
        <span className="ml-auto font-mono text-[9px] text-ink-tertiary">⌘A</span>
      </button>
    </div>
  );
}
