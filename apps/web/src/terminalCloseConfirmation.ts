import { getClientSettings } from "./hooks/useSettings";
import { readLocalApi } from "./localApi";

/** User-requested closes confirm once; session exits bypass this helper. */
export function requestTerminalClose(close: () => void) {
  if (!getClientSettings().confirmTerminalClose) {
    close();
    return;
  }
  const api = readLocalApi();
  if (!api) return;
  void api.dialogs
    .confirm("Close the terminal? Running processes will stop and its history will be deleted.", {
      variant: "destructive",
    })
    .then(
      (confirmed) => {
        if (confirmed) close();
      },
      () => undefined,
    );
}
