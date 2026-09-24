import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import type { NavItem } from '@/nav';

/** C0 placeholder body. Later phases replace the body per route; header/shell stay. */
export function StubPage({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader title={item.title} tagline={item.tagline} quote={item.quote} />
      <EmptyState
        icon={item.icon}
        title="Nothing here yet"
        hint={`This view is built in ${item.phase}. Load a project to get started.`}
      />
    </>
  );
}
