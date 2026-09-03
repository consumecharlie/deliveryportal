import Image from "next/image";
import Link from "next/link";

export interface Crumb {
  label: string;
  href: string;
}

interface Props {
  clientName: string;
  /** Page title; defaults to the client name. The project view passes the project name. */
  title?: string;
  crumbs: Crumb[];
}

export function PortalHeader({ clientName, title, crumbs }: Props) {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-3">
        <Image src="/pacman-brand.svg" alt="Consume Media" width={36} height={36} className="h-9 w-auto" unoptimized />
        <span className="text-sm font-semibold tracking-wide text-neutral-600">Consume Media</span>
      </div>
      {crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mt-8 text-sm text-neutral-500">
          {crumbs.map((c) => (
            <span key={c.href}>
              <Link href={c.href} className="hover:underline">
                {c.label}
              </Link>
              <span className="mx-2 text-neutral-400">/</span>
            </span>
          ))}
          <span className="text-neutral-700">{title ?? clientName}</span>
        </nav>
      )}
      <h1 className={`${crumbs.length > 0 ? "mt-3" : "mt-8"} text-3xl font-semibold tracking-tight`}>
        {title ?? clientName}
      </h1>
      <p className="mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-neutral-500">
        Bookmark this page. Every deliverable we share lands here.
      </p>
    </header>
  );
}
