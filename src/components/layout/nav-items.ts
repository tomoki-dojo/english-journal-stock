import { Bookmark, BookOpen, BrainCircuit, Search, Settings, type LucideIcon } from "lucide-react";

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
    label: "単語帳",
    href: "/vocabulary",
    icon: BookOpen,
  },
  {
    label: "単語学習",
    href: "/vocabulary/learn",
    icon: BrainCircuit,
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
