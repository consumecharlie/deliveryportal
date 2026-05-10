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
