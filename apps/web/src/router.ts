import { createRouter, RouterHistory } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { createAppHistory } from "./appHistory";

export function getRouter(history: RouterHistory) {
  return createRouter({
    routeTree,
    history: createAppHistory(history),
    context: {},
    defaultPreload: "intent",
  });
}

export type AppRouter = ReturnType<typeof getRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
