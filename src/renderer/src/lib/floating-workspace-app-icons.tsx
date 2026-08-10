import type { ComponentPropsWithoutRef } from 'react'
import type { FloatingWorkspaceAppId } from '../../../shared/floating-workspace-apps'

type FloatingWorkspaceAppIconProps = ComponentPropsWithoutRef<'svg'> & {
  size?: number | string
}

type FloatingWorkspaceAppIcon = (props: FloatingWorkspaceAppIconProps) => React.JSX.Element

function WhatsappIcon({ size, ...props }: FloatingWorkspaceAppIconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.50002 12C3.50002 7.30558 7.3056 3.5 12 3.5C16.6944 3.5 20.5 7.30558 20.5 12C20.5 16.6944 16.6944 20.5 12 20.5C10.3278 20.5 8.77127 20.0182 7.45798 19.1861C7.21357 19.0313 6.91408 18.9899 6.63684 19.0726L3.75769 19.9319L4.84173 17.3953C4.96986 17.0955 4.94379 16.7521 4.77187 16.4751C3.9657 15.176 3.50002 13.6439 3.50002 12ZM12 1.5C6.20103 1.5 1.50002 6.20101 1.50002 12C1.50002 13.8381 1.97316 15.5683 2.80465 17.0727L1.08047 21.107C0.928048 21.4637 0.99561 21.8763 1.25382 22.1657C1.51203 22.4552 1.91432 22.5692 2.28599 22.4582L6.78541 21.1155C8.32245 21.9965 10.1037 22.5 12 22.5C17.799 22.5 22.5 17.799 22.5 12C22.5 6.20101 17.799 1.5 12 1.5ZM14.2925 14.1824L12.9783 15.1081C12.3628 14.7575 11.6823 14.2681 10.9997 13.5855C10.2901 12.8759 9.76402 12.1433 9.37612 11.4713L10.2113 10.7624C10.5697 10.4582 10.6678 9.94533 10.447 9.53028L9.38284 7.53028C9.23954 7.26097 8.98116 7.0718 8.68115 7.01654C8.38113 6.96129 8.07231 7.046 7.84247 7.24659L7.52696 7.52195C6.76823 8.18414 6.3195 9.2723 6.69141 10.3741C7.07698 11.5163 7.89983 13.314 9.58552 14.9997C11.3991 16.8133 13.2413 17.5275 14.3186 17.8049C15.1866 18.0283 16.008 17.7288 16.5868 17.2572L17.1783 16.7752C17.4313 16.5691 17.5678 16.2524 17.544 15.9269C17.5201 15.6014 17.3389 15.308 17.0585 15.1409L15.3802 14.1409C15.0412 13.939 14.6152 13.9552 14.2925 14.1824Z"
      />
    </svg>
  )
}

function DiscordIcon({ size, ...props }: FloatingWorkspaceAppIconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 192 192" fill="none" width={size} height={size} aria-hidden="true" {...props}>
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="12"
        d="m68 138-8 16c-10.19-4.246-20.742-8.492-31.96-15.8-3.912-2.549-6.284-6.88-6.378-11.548-.488-23.964 5.134-48.056 19.369-73.528 1.863-3.334 4.967-5.778 8.567-7.056C58.186 43.02 64.016 40.664 74 39l6 11s6-2 16-2 16 2 16 2l6-11c9.984 1.664 15.814 4.02 24.402 7.068 3.6 1.278 6.704 3.722 8.567 7.056 14.235 25.472 19.857 49.564 19.37 73.528-.095 4.668-2.467 8.999-6.379 11.548-11.218 7.308-21.769 11.554-31.96 15.8l-8-16m-68-8s20 10 40 10 40-10 40-10"
      />
      <ellipse cx="71" cy="101" rx="13" ry="15" fill="currentColor" />
      <ellipse cx="121" cy="101" rx="13" ry="15" fill="currentColor" />
    </svg>
  )
}

function SlackIcon({ size, ...props }: FloatingWorkspaceAppIconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 192 192" fill="none" width={size} height={size} aria-hidden="true" {...props}>
      <rect width="22" height="64" x="106" y="22" rx="11" stroke="currentColor" strokeWidth="12" />
      <rect width="22" height="64" x="64" y="106" rx="11" stroke="currentColor" strokeWidth="12" />
      <rect
        width="22"
        height="64"
        x="170"
        y="106"
        rx="11"
        transform="rotate(90 170 106)"
        stroke="currentColor"
        strokeWidth="12"
      />
      <rect
        width="22"
        height="64"
        x="86"
        y="64"
        rx="11"
        transform="rotate(90 86 64)"
        stroke="currentColor"
        strokeWidth="12"
      />
      <path
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="12"
        d="M75 44c-6.075 0-11-4.925-11-11s4.925-11 11-11 11 4.925 11 11v11H75Zm42 104c6.075 0 11 4.925 11 11s-4.925 11-11 11-11-4.925-11-11v-11h11Zm31-73c0-6.075 4.925-11 11-11s11 4.925 11 11-4.925 11-11 11h-11V75ZM44 117c0 6.075-4.925 11-11 11s-11-4.925-11-11 4.925-11 11-11h11v11Z"
      />
    </svg>
  )
}

export const FLOATING_WORKSPACE_APP_ICONS: Record<
  FloatingWorkspaceAppId,
  FloatingWorkspaceAppIcon
> = {
  'whatsapp-web': WhatsappIcon,
  slack: SlackIcon,
  discord: DiscordIcon
}
