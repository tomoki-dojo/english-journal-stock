import { Bookmark, Search, Settings, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: "Pro";
};

export const navItems: NavItem[] = [
  {
    label: "すべての表現",
    href: "/library",
    icon: Search,
  },
  {
    label: "マイリスト",
    href: "/mylist",
    icon: Bookmark,
  },
  {
    label: "アカウント設定",
    href: "/settings",
    icon: Settings,
  },
];
