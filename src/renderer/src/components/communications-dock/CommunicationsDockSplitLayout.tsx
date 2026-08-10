import type {
  CommunicationsDockLayoutNode,
  CommunicationsDockUpdateRatioRequest
} from '../../../../shared/communications-dock'
import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'
import { CommunicationsDockDivider } from './CommunicationsDockDivider'
import { CommunicationsDockLeaf } from './CommunicationsDockLeaf'

const ROOT_PATH: readonly ('first' | 'second')[] = []

export function CommunicationsDockSplitLayout({
  node,
  tabId,
  activeLeafAppId,
  path = ROOT_PATH,
  setContentTarget,
  onActivateLeaf,
  onUpdateRatio
}: {
  node: CommunicationsDockLayoutNode
  tabId: string
  activeLeafAppId: FloatingWorkspaceAppId
  path?: readonly ('first' | 'second')[]
  setContentTarget: (appId: FloatingWorkspaceAppId, element: HTMLDivElement | null) => void
  onActivateLeaf: (tabId: string, appId: FloatingWorkspaceAppId) => void
  onUpdateRatio: (
    request: Pick<CommunicationsDockUpdateRatioRequest, 'tabId' | 'path' | 'ratio'>
  ) => void
}): React.JSX.Element {
  if (node.type === 'leaf') {
    return (
      <CommunicationsDockLeaf
        appId={node.appId}
        tabId={tabId}
        active={node.appId === activeLeafAppId}
        setContentTarget={setContentTarget}
        onActivate={onActivateLeaf}
      />
    )
  }
  const horizontal = node.direction === 'horizontal'
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      style={{ flexDirection: horizontal ? 'row' : 'column' }}
    >
      <div className="flex min-h-0 min-w-0 overflow-hidden" style={{ flex: `${node.ratio} 1 0%` }}>
        <CommunicationsDockSplitLayout
          node={node.first}
          tabId={tabId}
          activeLeafAppId={activeLeafAppId}
          path={[...path, 'first']}
          setContentTarget={setContentTarget}
          onActivateLeaf={onActivateLeaf}
          onUpdateRatio={onUpdateRatio}
        />
      </div>
      <CommunicationsDockDivider
        direction={node.direction}
        ratio={node.ratio}
        onRatioChange={(ratio) => onUpdateRatio({ tabId, path, ratio })}
      />
      <div
        className="flex min-h-0 min-w-0 overflow-hidden"
        style={{ flex: `${1 - node.ratio} 1 0%` }}
      >
        <CommunicationsDockSplitLayout
          node={node.second}
          tabId={tabId}
          activeLeafAppId={activeLeafAppId}
          path={[...path, 'second']}
          setContentTarget={setContentTarget}
          onActivateLeaf={onActivateLeaf}
          onUpdateRatio={onUpdateRatio}
        />
      </div>
    </div>
  )
}
