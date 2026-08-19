import { GroupPage } from '@/GroupPage'

export default async function GroupRoute({ params }: { params: Promise<{ id: string; groupId: string }> }) {
  const { id, groupId } = await params
  return <GroupPage companySlug={id} groupId={groupId} />
}
