import { SkillPackageVersionsPage } from '@/SkillPackageVersionsPage'

export default async function SkillPackageVersionsRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SkillPackageVersionsPage companySlug={id} />
}
