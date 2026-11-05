import Link from "next/link";
import { listProjects } from "@/lib/repo";
import { ProjectSwitcher } from "./project-switcher";
import { Logo } from "./ui";

/** Creator app shell: logo, game switcher, alpha notice. */
export function Shell({ children, projectId }: { children: React.ReactNode; projectId?: string }) {
  const projects = listProjects().map((p) => ({ id: p.id, name: p.name }));
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-display text-[17px] font-semibold tracking-tight">
            <Logo /> Playtest
          </Link>
          <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
          <ProjectSwitcher projects={projects} currentId={projectId} />
          <span className="ml-auto hidden text-xs text-muted sm:block" title="No login yet: everything runs on this computer">Alpha, local only</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}

