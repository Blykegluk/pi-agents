"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  History,
  DollarSign,
  Bot,
  Wrench,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Sessions", href: "/sessions", icon: History },
  { label: "Costs", href: "/costs", icon: DollarSign },
  { label: "Workflows", href: "/agents", icon: Bot },
  { label: "Pipelines", href: "/pipelines", icon: GitBranch },
  { label: "Tools", href: "/tools", icon: Wrench },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 border-r bg-muted/30 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Pi Agent Monitor
        </h1>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t text-xs text-muted-foreground">
        Pi Agent v0.64.0
      </div>
    </aside>
  );
}
