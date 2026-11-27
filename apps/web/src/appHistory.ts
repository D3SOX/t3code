import { createHistory, type HistoryLocation, type RouterHistory } from "@tanstack/react-router";

import { withoutAssistantCitationHash } from "./lib/assistantCitationNavigation";

export function isAppModalPage(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/usage";
}

/** Modal routes belong to the router, while browser history keeps the underlying page. */
export function createAppHistory(history: RouterHistory): RouterHistory {
  let modalLocation: HistoryLocation | undefined;
  let writing = false;

  const write = (path: string, state: HistoryLocation["state"], replace: boolean) => {
    const url = new URL(path, "http://t3.invalid");
    if (isAppModalPage(url.pathname)) {
      modalLocation = {
        href: path,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        state: { ...state, __TSR_index: history.location.state.__TSR_index },
      };
      return;
    }

    const closingModal =
      modalLocation !== undefined &&
      withoutAssistantCitationHash(path) === withoutAssistantCitationHash(history.location.href);
    modalLocation = undefined;
    writing = true;
    try {
      history[
        replace || closingModal || isAppModalPage(history.location.pathname) ? "replace" : "push"
      ](path, state);
    } finally {
      writing = false;
    }
  };

  const appHistory = createHistory({
    getLocation: () => modalLocation ?? history.location,
    getLength: () => history.length,
    pushState: (path, state) => write(path, state, false),
    replaceState: (path, state) => write(path, state, true),
    back: (ignoreBlocker) => history.back({ ignoreBlocker }),
    forward: (ignoreBlocker) => history.forward({ ignoreBlocker }),
    go: (index) => history.go(index),
    createHref: history.createHref,
    flush: history.flush,
    destroy: () => {
      unsubscribe();
      history.destroy();
    },
    notifyOnIndexChange: false,
  });
  appHistory.block = history.block;
  const unsubscribe = history.subscribe(({ action }) => {
    if (writing) return;
    modalLocation = undefined;
    appHistory.notify(action);
  });
  return appHistory;
}
