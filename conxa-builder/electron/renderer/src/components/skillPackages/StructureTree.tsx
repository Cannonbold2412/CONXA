import { Fragment, type ComponentType, type ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { iconForFile, type PathTrieNode } from '@/lib/skillPackageTree'

export const ROW_TRANSITION = 'transition-colors duration-200 motion-reduce:transition-none'

export function TreeItem({
  active = false,
  depth,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean
  depth: number
  icon: ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
}) {
  const className = cn(
    'flex w-full items-center gap-2 rounded-xl py-2 pr-2 text-left text-xs font-mono text-white',
    ROW_TRANSITION,
    active && 'bg-emerald-500/12 text-emerald-50',
    !active && 'text-white',
    onClick && 'cursor-pointer hover:bg-white/[0.05]',
    !onClick && 'cursor-default',
  )
  const content = (
    <>
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          active ? 'text-emerald-300' : 'text-white/85',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </>
  )
  const style = { paddingLeft: `${0.8 + depth * 1.05}rem` }

  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick}>
        {content}
      </button>
    )
  }

  return (
    <div className={className} style={style}>
      {content}
    </div>
  )
}

export function StructureTrieRows({
  nodes,
  depth,
  pathPrefix,
  activeFile,
  onPick,
}: {
  nodes: PathTrieNode[]
  depth: number
  pathPrefix: string
  activeFile: string | null
  onPick: (key: string) => void
}): ReactNode {
  return (
    <>
      {nodes.map((child) => {
        const childPath = pathPrefix ? `${pathPrefix}/${child.segment}` : child.segment
        const hasKids = child.children.length > 0
        const fileKey = child.fileKey

        if (hasKids && fileKey) {
          return (
            <Fragment key={childPath}>
              <TreeItem
                depth={depth}
                icon={iconForFile(fileKey)}
                label={child.segment}
                active={activeFile === fileKey}
                onClick={() => onPick(fileKey)}
              />
              <TreeItem depth={depth} icon={FolderOpen} label={`${child.segment}/`} />
              <StructureTrieRows
                nodes={child.children}
                depth={depth + 1}
                pathPrefix={childPath}
                activeFile={activeFile}
                onPick={onPick}
              />
            </Fragment>
          )
        }

        if (hasKids) {
          return (
            <Fragment key={`dir:${childPath}`}>
              <TreeItem depth={depth} icon={FolderOpen} label={`${child.segment}/`} />
              <StructureTrieRows
                nodes={child.children}
                depth={depth + 1}
                pathPrefix={childPath}
                activeFile={activeFile}
                onPick={onPick}
              />
            </Fragment>
          )
        }

        if (fileKey) {
          return (
            <TreeItem
              key={fileKey}
              depth={depth}
              icon={iconForFile(fileKey)}
              label={child.segment}
              active={activeFile === fileKey}
              onClick={() => onPick(fileKey)}
            />
          )
        }

        return null
      })}
    </>
  )
}
