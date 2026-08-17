import type React from 'react'

import { interfaceThemeDefinitions, type InterfaceTheme } from '../../../shared/interface-theme'

type SkinTheme = Exclude<InterfaceTheme, 'default'>

function MinecraftBackground(): React.JSX.Element {
  return (
    <div className="skin-minecraft-stage">
      <div className="skin-minecraft-skybox">
        <span className="skin-minecraft-face skin-minecraft-front" />
        <span className="skin-minecraft-face skin-minecraft-back" />
        <span className="skin-minecraft-face skin-minecraft-left" />
        <span className="skin-minecraft-face skin-minecraft-right" />
        <span className="skin-minecraft-face skin-minecraft-top" />
        <span className="skin-minecraft-face skin-minecraft-bottom" />
      </div>
      <span className="skin-minecraft-cloud skin-minecraft-cloud-one" />
      <span className="skin-minecraft-cloud skin-minecraft-cloud-two" />
      <span className="skin-minecraft-cube">
        <i />
        <i />
        <i />
      </span>
      <span className="skin-minecraft-scrim" />
    </div>
  )
}

const backgroundSlots: Record<SkinTheme, React.JSX.Element> = {
  'blue-fantasy': (
    <>
      <span className="skin-constellations" />
      <span className="skin-orbit skin-orbit-one" />
      <span className="skin-orbit skin-orbit-two" />
    </>
  ),
  'dragon-heir': (
    <>
      <span className="skin-dragon-seal">龙</span>
      <span className="skin-dragon-rule" />
    </>
  ),
  miku: <span className="skin-miku-grid" />,
  minecraft: <MinecraftBackground />,
  qq98: (
    <>
      <span className="skin-crystal skin-crystal-one" />
      <span className="skin-crystal skin-crystal-two" />
    </>
  ),
  ths: <span className="skin-market-grid" />,
  trading: <span className="skin-trading-grid" />,
  'whale-song': (
    <>
      <span className="skin-constellations" />
      <span className="skin-gold-thread skin-gold-thread-one" />
      <span className="skin-gold-thread skin-gold-thread-two" />
    </>
  ),
  xp: <span className="skin-xp-horizon" />
}

function isSkinTheme(theme: InterfaceTheme): theme is SkinTheme {
  return theme !== 'default'
}

export function ThemeChrome(): React.JSX.Element {
  return (
    <div
      className="theme-chrome theme-chrome-background"
      data-theme-chrome-slot="background"
      aria-hidden="true"
    >
      {interfaceThemeDefinitions.map(({ id }) =>
        isSkinTheme(id) ? (
          <div className="theme-chrome-skin" data-theme-id={id} key={id}>
            {backgroundSlots[id]}
          </div>
        ) : null
      )}
    </div>
  )
}
