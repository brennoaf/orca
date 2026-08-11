import { describe, expect, it } from 'vitest'
import {
  clampSplitRatio,
  listSplitLeaves,
  removeSplitLeaf,
  replaceSplitLeaf,
  splitAtLeaf,
  updateSplitRatioAtPath,
  type SplitTreeAdapter
} from './split-layout-tree'

type TestNode =
  | { type: 'leaf'; id: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      ratio?: number
      first: TestNode
      second: TestNode
    }

const treeAdapter: SplitTreeAdapter<TestNode, string> = {
  leaf: (node) => (node.type === 'leaf' ? node.id : undefined),
  children: (node) =>
    node.type === 'split'
      ? { direction: node.direction, ratio: node.ratio, first: node.first, second: node.second }
      : undefined,
  createSplit: ({ direction, ratio, first, second }) => ({
    type: 'split',
    direction,
    ratio,
    first,
    second
  }),
  replaceChildren: (node, first, second) => {
    if (node.type === 'leaf') {
      throw new Error('Expected split node')
    }
    return { ...node, first, second }
  },
  replaceRatio: (node, ratio) => {
    if (node.type === 'leaf') {
      throw new Error('Expected split node')
    }
    return { ...node, ratio }
  }
}

const leaf = (id: string): TestNode => ({ type: 'leaf', id })

describe('split layout tree', () => {
  it('lists leaves in display order through nested splits', () => {
    const tree: TestNode = {
      type: 'split',
      direction: 'vertical',
      first: { type: 'split', direction: 'horizontal', first: leaf('a'), second: leaf('b') },
      second: leaf('c')
    }
    expect(listSplitLeaves(tree, treeAdapter)).toEqual(['a', 'b', 'c'])
  })

  it.each([
    ['left', 'horizontal', ['x', 'a']],
    ['right', 'horizontal', ['a', 'x']],
    ['up', 'vertical', ['x', 'a']],
    ['down', 'vertical', ['a', 'x']]
  ] as const)('splits a leaf on the %s side', (side, direction, leaves) => {
    const result = splitAtLeaf(leaf('a'), [], side, leaf('x'), treeAdapter)
    expect(result).toBeDefined()
    expect(result && listSplitLeaves(result, treeAdapter)).toEqual(leaves)
    expect(result).toMatchObject({ type: 'split', direction })
  })

  it('inserts a subtree without flattening it', () => {
    const inserted: TestNode = {
      type: 'split',
      direction: 'vertical',
      ratio: 0.4,
      first: leaf('b'),
      second: leaf('c')
    }
    const result = splitAtLeaf(leaf('a'), [], 'right', inserted, treeAdapter)
    expect(result).toBeDefined()
    expect(result && listSplitLeaves(result, treeAdapter)).toEqual(['a', 'b', 'c'])
    expect(result && result.type === 'split' && result.second).toBe(inserted)
  })

  it('removes nested leaves and collapses their ancestor splits', () => {
    const tree: TestNode = {
      type: 'split',
      direction: 'horizontal',
      first: { type: 'split', direction: 'vertical', first: leaf('a'), second: leaf('b') },
      second: leaf('c')
    }
    const afterFirstRemoval = removeSplitLeaf(tree, ['first', 'first'], treeAdapter)
    expect(afterFirstRemoval && listSplitLeaves(afterFirstRemoval, treeAdapter)).toEqual(['b', 'c'])
    const afterSecondRemoval =
      afterFirstRemoval && removeSplitLeaf(afterFirstRemoval, ['first'], treeAdapter)
    expect(afterSecondRemoval && listSplitLeaves(afterSecondRemoval, treeAdapter)).toEqual(['c'])
    expect(removeSplitLeaf(leaf('only'), [], treeAdapter)).toBeNull()
  })

  it('replaces only a leaf at the requested path', () => {
    const tree: TestNode = {
      type: 'split',
      direction: 'horizontal',
      first: leaf('a'),
      second: leaf('b')
    }
    const result = replaceSplitLeaf(tree, ['second'], leaf('x'), treeAdapter)
    expect(result && listSplitLeaves(result, treeAdapter)).toEqual(['a', 'x'])
    expect(replaceSplitLeaf(tree, [], leaf('x'), treeAdapter)).toBeUndefined()
  })

  it('clamps valid ratios and rejects malformed ranges or paths', () => {
    expect(clampSplitRatio(-1)).toBe(0.15)
    expect(clampSplitRatio(2)).toBe(0.85)
    expect(clampSplitRatio(Number.NaN)).toBeUndefined()
    expect(clampSplitRatio(0.5, { min: 0.9, max: 0.1 })).toBeUndefined()

    const tree: TestNode = {
      type: 'split',
      direction: 'horizontal',
      first: leaf('a'),
      second: leaf('b')
    }
    const result = updateSplitRatioAtPath(tree, [], 2, treeAdapter)
    expect(result).toMatchObject({ type: 'split', ratio: 0.85 })
    expect(updateSplitRatioAtPath(tree, ['first'], 0.4, treeAdapter)).toBeUndefined()
    expect(removeSplitLeaf(tree, ['first', 'first'], treeAdapter)).toBeUndefined()
    expect(splitAtLeaf(tree, ['first', 'first'], 'left', leaf('x'), treeAdapter)).toBeUndefined()
  })
})
