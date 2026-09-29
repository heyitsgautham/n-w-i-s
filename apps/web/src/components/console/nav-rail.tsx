"use client";

import { ChartSpline, FileText, Info, Layers3, MapPinned, ScanText, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Section", icon: Layers3 },
  { href: "/map", label: "Map", icon: MapPinned },
  { href: "/search", label: "Search", icon: Search },
  { href: "/compare", label: "Compare", icon: ChartSpline },
  { href: "/briefing", label: "Briefing", icon: FileText },
  { href: "/ingestion", label: "Ingest", icon: ScanText },
];

function Item({ href, label, icon: Icon, active }: (typeof ITEMS)[number] & { active: boolean }) {
  return (
    <Link
      href={href}
      data-nav={label.toLowerCase()}
      aria-current={active ? "page" : undefined}
      className={`relative flex h-[62px] w-full flex-col items-center justify-center gap-1.5 transition-colors ${
        active ? "text-ink-bright" : "text-ink-dim hover:text-ink"
      }`}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[3px] bg-ink-bright" />}
      <Icon className="size-[19px]" strokeWidth={1.6} />
      <span className="label-caps text-[9.5px] tracking-[0.1em]">{label}</span>
    </Link>
  );
}

export function NavRail() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="flex w-[68px] shrink-0 flex-col items-center border-r border-rule bg-chrome py-1.5">
      {ITEMS.map((item) => (
        <Item key={item.href} {...item} active={isActive(item.href)} />
      ))}
      <div className="flex-1" />
      <Item href="/about" label="About" icon={Info} active={isActive("/about")} />
    </nav>
  );
}
