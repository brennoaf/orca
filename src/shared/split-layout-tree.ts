export type SplitDirection = 'horizontal' | 'vertical'
export type SplitSide = 'left' | 'right' | 'up' | 'down'
export type SplitPathSegment = 'first' | 'second'
export type SplitPath = readonly SplitPathSegment[]

export type SplitTreeChildren<TNode> = {
  direction: SplitDirection
  ratio: number | undefined
  first: TNode
  second: TNode
}

export type SplitTreeAdapter<TNode, TLeaf> = {
  leaf: (node: TNode) => TLeaf | undefined
  children: (node: TNode) => SplitTreeChildren<TNode> | undefined
  createSplit: (input: SplitTreeChildren<TNode>) => TNode
  replaceChildren: (node: TNode, first: TNode, second: TNode) => TNode
  replaceRatio: (node: TNode, ratio: number) => TNode
}

export type SplitRatioRange = {
  min: number
  max: number
}

export const DEFAULT_SPLIT_RATIO_RANGE: SplitRatioRange = { min: 0.15, max: 0.85 }

function childAtPath<TNode, TLeaf>(
  node: TNode,
  path: SplitPath,
  adapter: SplitTreeAdapter<TNode, TLeaf>
): TNode | undefined {
  let current = node
  for (const segment of path) {
    const children = adapter.children(current)
    if (!children) {
      return undefined
    }
    current = children[segment]
  }
  return current
}

function replaceAtPath<TNode, TLeaf>(
  node: TNode,
  path: SplitPath,
  replacement: TNode,
  adapter: SplitTreeAdapter<TNode, TLeaf>
): TNode | undefined {
  if (path.length === 0) {
    return replacement
  }
  const children = adapter.children(node)
  if (!children) {
    return undefined
  }
  const [segment, ...remaining] = path
  const updatedChild = replaceAtPath(children[segment], remaining, replacement, adapter)
  if (updatedChild === undefined) {
    return undefined
  }
  return segment === 'first'
    ? adapter.replaceChildren(node, updatedChild, children.second)
    : adapter.replaceChildren(node, children.first, updatedChild)
}

function removeAtPath<TNode, TLeaf>(
  node: TNode,
  path: SplitPath,
  adapter: SplitTreeAdapter<TNode, TLeaf>
): TNode | null | undefined {
  if (path.length === 0) {
    return adapter.leaf(node) === undefined ? undefined : null
  }
  const children = adapter.children(node)
  if (!children) {
    return undefined
  }
  const [segment, ...remaining] = path
  const updatedChild = removeAtPath(children[segment], remaining, adapter)
  if (updatedChild === undefined) {
    return undefined
  }
  if (updatedChild === null) {
    return segment === 'first' ? children.second : children.first
  }
  return segment === 'first'
    ? adapter.replaceChildren(node, updatedChild, children.second)
    : adapter.replaceChildren(node, children.first, updatedChild)
}

export function clampSplitRatio(
  ratio: number,
  range: SplitRatioRange = DEFAULT_SPLIT_RATIO_RANGE
): number | undefined {
  if (!Number.isFinite(ratio) || !Number.isFinite(range.min) || !Number.isFinite(range.max)) {
    return undefined
  }
  if (range.min < 0 || range.max > 1 || range.min > range.max) {
    return undefined
  }
  return Math.min(Math.max(ratio, range.min), range.max)
}

export function listSplitLeaves<TNode, TLeaf>(
  node: TNode,
  adapter: SplitTreeAdapter<TNode, TLeaf>
): TLeaf[] {
  const leaf = adapter.leaf(node)
  if (leaf !== undefined) {
    return [leaf]
  }
  const children = adapter.children(node)
  if (!children) {
    return []
  }
  return [...listSplitLeaves(children.first, adapter), ...listSplitLeaves(children.second, adapter)]
}

export function removeSplitLeaf<TNode, TLeaf>(
  root: TNode,
  path: SplitPath,
  adapter: SplitTreeAdapter<TNode, TLeaf>
): TNode | null | undefined {
  return removeAtPath(root, path, adapter)
}

export function replaceSplitLeaf<TNode, TLeaf>(
  root: TNode,
  path: SplitPath,
  replacement: TNode,
  adapter: SplitTreeAdapter<TNode, TLeaf>
): TNode | undefined {
  const target = childAtPath(root, path, adapter)
  if (target === undefined || adapter.leaf(target) === undefined) {
    return undefined
  }
  return replaceAtPath(root, path, replacement, adapter)
}

export function splitAtLeaf<TNode, TLeaf>(
  root: TNode,
  path: SplitPath,
  side: SplitSide,
  inserted: TNode,
  adapter: SplitTreeAdapter<TNode, TLeaf>,
  ratio = 0.5,
  range: SplitRatioRange = DEFAULT_SPLIT_RATIO_RANGE
): TNode | undefined {
  const target = childAtPath(root, path, adapter)
  const clampedRatio = clampSplitRatio(ratio, range)
  if (target === undefined || adapter.leaf(target) === undefined || clampedRatio === undefined) {
    return undefined
  }
  const direction: SplitDirection = side === 'left' || side === 'right' ? 'horizontal' : 'vertical'
  const first = side === 'left' || side === 'up' ? inserted : target
  const second = side === 'left' || side === 'up' ? target : inserted
  return replaceAtPath(
    root,
    path,
    adapter.createSplit({ direction, ratio: clampedRatio, first, second }),
    adapter
  )
}

export function updateSplitRatioAtPath<TNode, TLeaf>(
  root: TNode,
  path: SplitPath,
  ratio: number,
  adapter: SplitTreeAdapter<TNode, TLeaf>,
  range: SplitRatioRange = DEFAULT_SPLIT_RATIO_RANGE
): TNode | undefined {
  const target = childAtPath(root, path, adapter)
  const clampedRatio = clampSplitRatio(ratio, range)
  if (target === undefined || !adapter.children(target) || clampedRatio === undefined) {
    return undefined
  }
  return replaceAtPath(root, path, adapter.replaceRatio(target, clampedRatio), adapter)
}
