import { AndroidIcon } from "../Icons";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function MobileAppSettingsRow() {
  return (
    <SettingsRow
      {...searchableSetting("mobile-app")}
      description="Connect to your server from your phone or tablet."
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
