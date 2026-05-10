export interface WorkspaceMember {
  id: number;
  username: string;
  email: string;
  profilePicture?: string;
  initials: string;
}

export function filterMembersByAllowlist(
  members: WorkspaceMember[],
  allowed: Set<number>
): WorkspaceMember[] {
  return members
    .filter((m) => allowed.has(m.id))
    .sort((a, b) => a.username.localeCompare(b.username));
}

type ClickUpTeamMember = {
  user: { id: number; username: string; email: string; profilePicture?: string };
};

export function clickupUserToMember(m: ClickUpTeamMember): WorkspaceMember {
  const u = m.user;
  const name = (u.username ?? u.email ?? "").trim();
  const initials = name
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => (p[0] ?? "").toUpperCase())
    .join("");
  return {
    id: u.id ?? 0,
    username: u.username ?? "",
    email: u.email ?? "",
    profilePicture: u.profilePicture ?? undefined,
    initials,
  };
}
