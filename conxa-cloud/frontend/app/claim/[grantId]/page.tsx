import { ClaimPage } from '@/ClaimPage'

export default async function ClaimRoute({ params }: { params: Promise<{ grantId: string }> }) {
  const { grantId } = await params
  return <ClaimPage grantId={grantId} />
}
