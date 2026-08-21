import { WorkflowReleasePage } from '@/WorkflowReleasePage'

export default async function WorkflowReleaseRoute({
  params,
}: {
  params: Promise<{ groupId: string; skillSlug: string }>
}) {
  const { groupId, skillSlug } = await params
  return <WorkflowReleasePage groupId={groupId} skillSlug={skillSlug} />
}
