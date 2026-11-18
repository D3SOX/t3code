import { useGT } from "gt-react";

import { AndroidIcon } from "../Icons";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

export function MobileAppSettingsRow() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  return (
    <SettingsRow
      {...searchableSetting("mobile-app")}
      description={gt("Connect to your server from your phone or tablet.")}
      control={
        <Button
          size="sm"
          variant="outline"
          render={
            <a
              href="https://github.com/D3SOX/t3code#android-nightly"
              target="_blank"
              rel="noreferrer noopener"
            />
          }
        >
          <AndroidIcon />
          Android
        </Button>
      }
    />
  );
}
