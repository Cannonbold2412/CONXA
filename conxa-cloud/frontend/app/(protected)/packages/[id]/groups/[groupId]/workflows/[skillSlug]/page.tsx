import { WorkflowReleasePage } from '@/WorkflowReleasePage'

export default async function WorkflowReleaseRoute({
  params,
}: {
  params: Promise<{ id: string; groupId: string; skillSlug: string }>
}) {
  const { id, groupId, skillSlug } = await params
  return <WorkflowReleasePage companySlug={id} groupId={groupId} skillSlug={skillSlug} />
}
