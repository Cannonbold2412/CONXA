import { GroupPage } from '@/GroupPage'

export default async function GroupRoute({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  return <GroupPage groupId={groupId} />
}
