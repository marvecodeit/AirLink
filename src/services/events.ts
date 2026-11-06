import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BrowserState, ConnectionState, NetworkStatus } from "../types";

export const eventNames = {
  status: "wifi://status",
  transition: "wifi://transition",
  browserState: "browser://state",
  browserPageLoad: "browser://page-load",
  browserNavigating: "browser://navigating",
  browserPopupBlocked: "browser://popup-blocked",
  browserDownloadBlocked: "browser://download-blocked",
  browserNavigationBlocked: "browser://navigation-blocked",
  menuAction: "menu://action",
  menuCheckComplete: "menu://check-complete",
} as const;

export interface PageLoadEvent {
  url: string;
  loading: boolean;
}

export function listenToAppEvents(handlers: {
  onStatus: (status: NetworkStatus) => void;
  onTransition: (state: ConnectionState) => void;
  onBrowserState: (state: BrowserState) => void;
  onPageLoad: (event: PageLoadEvent) => void;
  onBrowserNotice: (message: string) => void;
  onMenuAction: (action: string) => void;
  onMenuCheckComplete: (status: NetworkStatus) => void;
}): Promise<() => void> {
  const unlisteners: UnlistenFn[] = [];

  const register = async <T>(
    name: string,
    handler: (payload: T) => void,
  ): Promise<void> => {
    const unlisten = await listen<T>(name, (event) => handler(event.payload));
    unlisteners.push(unlisten);
  };

  return (async () => {
    await register<NetworkStatus>(eventNames.status, handlers.onStatus);
    await register<ConnectionState>(eventNames.transition, handlers.onTransition);
    await register<BrowserState>(eventNames.browserState, handlers.onBrowserState);
    await register<PageLoadEvent>(eventNames.browserPageLoad, handlers.onPageLoad);
    await register<string>(eventNames.menuAction, handlers.onMenuAction);
    await register<NetworkStatus>(
      eventNames.menuCheckComplete,
      handlers.onMenuCheckComplete,
    );

    for (const name of [
      eventNames.browserPopupBlocked,
      eventNames.browserDownloadBlocked,
      eventNames.browserNavigationBlocked,
    ]) {
      await register<string>(name, (message) => handlers.onBrowserNotice(message));
    }

    return () => {
      for (const unlisten of unlisteners) unlisten();
    };
  })();
}
