import type { MenuAction } from "@react-native-menu/menu";
import type { AndroidAnchoredMenuProps } from "../../components/ui/AndroidAnchoredMenu";

export interface ThreadListToolbarProps {
  readonly searchQuery: string;
  readonly onSearchQueryChange: (query: string) => void;
  readonly filterActions: MenuAction[];
  readonly renderFilterIcon?: AndroidAnchoredMenuProps["renderActionIcon"];
  readonly filterCustomized: boolean;
  readonly onFilterSelect: (id: string) => void;
  readonly onOpenEnvironments: () => void;
  readonly onRequestVisibility?: () => void;
}
