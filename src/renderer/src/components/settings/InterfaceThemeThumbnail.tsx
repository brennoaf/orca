import type React from 'react'

import type { InterfaceTheme } from '../../../../shared/interface-theme'

type InterfaceThemeThumbnailProps = {
  theme: InterfaceTheme
}

function PreviewRows(): React.JSX.Element {
  return (
    <span className="interface-theme-thumbnail-rows">
      <i />
      <i />
      <i />
    </span>
  )
}

export function InterfaceThemeThumbnail({
  theme
}: InterfaceThemeThumbnailProps): React.JSX.Element {
  if (theme === 'default') {
    return (
      <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
        <span className="interface-theme-thumbnail-title">
          <i />
          <i />
          <i />
        </span>
        <span className="interface-theme-thumbnail-sidebar">
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-canvas">
          <b />
          <PreviewRows />
        </span>
      </span>
    )
  }

  if (theme === 'xp') {
    return (
      <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
        <span className="interface-theme-thumbnail-xp-title">
          <b>Orca</b>
          <i />
          <i />
          <i />
        </span>
        <span className="interface-theme-thumbnail-xp-sidebar">
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-xp-canvas">
          <b />
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-xp-taskbar">
          <strong>Start</strong>
          <i />
          <i />
        </span>
      </span>
    )
  }

  if (theme === 'minecraft') {
    return (
      <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
        <span className="interface-theme-thumbnail-minecraft-sky">
          <i />
          <i />
        </span>
        <span className="interface-theme-thumbnail-minecraft-ground" />
        <span className="interface-theme-thumbnail-minecraft-panel">
          <b />
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-minecraft-block">
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>
    )
  }

  if (theme === 'trading') {
    return (
      <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
        <span className="interface-theme-thumbnail-market-title">
          <b>MARKET</b>
          <i>+1.28%</i>
        </span>
        <span className="interface-theme-thumbnail-candles">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="interface-theme-thumbnail-ticker">
          <b>BTC</b>
          <i>▲</i>
          <b>ETH</b>
          <i>▼</i>
        </span>
      </span>
    )
  }

  if (theme === 'ths') {
    return (
      <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
        <span className="interface-theme-thumbnail-ths-title">
          <b>同花顺</b>
          <i>上证 +0.42%</i>
        </span>
        <span className="interface-theme-thumbnail-ths-sidebar">
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-ths-grid">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="interface-theme-thumbnail-ths-status">
          <b>涨 3261</b>
          <i>跌 1842</i>
        </span>
      </span>
    )
  }

  if (theme === 'qq98') {
    return (
      <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
        <span className="interface-theme-thumbnail-qq-title">
          <b>98</b>
          <i>Orca</i>
        </span>
        <span className="interface-theme-thumbnail-qq-sidebar">
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-qq-card">
          <b />
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-qq-status">
          <i />
          <i />
          <i />
        </span>
      </span>
    )
  }

  if (theme === 'miku') {
    return (
      <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
        <span className="interface-theme-thumbnail-miku-title">
          <b>01</b>
          <i>Orca Studio</i>
        </span>
        <span className="interface-theme-thumbnail-miku-card">
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-wave">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="interface-theme-thumbnail-miku-chips">
          <i />
          <i />
          <i />
        </span>
      </span>
    )
  }

  if (theme === 'dragon-heir') {
    return (
      <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
        <span className="interface-theme-thumbnail-dragon-rule" />
        <span className="interface-theme-thumbnail-dragon-panel">
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-dragon-seal">龙</span>
      </span>
    )
  }

  if (theme === 'blue-fantasy') {
    return (
      <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
        <span className="interface-theme-thumbnail-orbit">
          <i />
          <i />
          <i />
        </span>
        <span className="interface-theme-thumbnail-glass">
          <b />
          <PreviewRows />
        </span>
        <span className="interface-theme-thumbnail-stars">
          <i />
          <i />
          <i />
          <i />
        </span>
      </span>
    )
  }

  return (
    <span className="interface-theme-thumbnail" data-thumbnail-theme={theme}>
      <span className="interface-theme-thumbnail-whale">
        <i />
        <i />
      </span>
      <span className="interface-theme-thumbnail-whale-card">
        <PreviewRows />
      </span>
      <span className="interface-theme-thumbnail-gold">
        <i />
        <i />
      </span>
    </span>
  )
}
