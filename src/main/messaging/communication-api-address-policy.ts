import { BlockList, isIP } from 'node:net'

const BLOCKED_IPV4_CIDRS =
  '0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.88.99.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4'.split(
    ' '
  )
const BLOCKED_IPV6_CIDRS =
  '::/96 ::1/128 64:ff9b::/96 64:ff9b:1::/48 100::/64 2001:2::/48 2001:10::/28 2001:20::/28 2001:db8::/32 2002::/16 3fff::/20 5f00::/16 fc00::/7 fe80::/10 fec0::/10 ff00::/8'.split(
    ' '
  )
const METADATA_HOSTNAMES =
  'metadata metadata.google.internal metadata.azure.internal instance-data instance-data.ec2.internal metadata.oraclecloud.com'.split(
    ' '
  )
const blockedAddresses = new BlockList()

function addBlockedSubnets(cidrs: readonly string[], family: 'ipv4' | 'ipv6'): void {
  for (const cidr of cidrs) {
    const separator = cidr.lastIndexOf('/')
    const address = cidr.slice(0, separator)
    const prefix = Number(cidr.slice(separator + 1))
    blockedAddresses.addSubnet(address, prefix, family)
    if (family === 'ipv4') {
      blockedAddresses.addSubnet(`::ffff:${address}`, prefix + 96, 'ipv6')
    }
  }
}

addBlockedSubnets(BLOCKED_IPV4_CIDRS, 'ipv4')
addBlockedSubnets(BLOCKED_IPV6_CIDRS, 'ipv6')

export function isBlockedCommunicationAddress(address: string): boolean {
  const family = isIP(address)
  const familyName = family === 4 ? 'ipv4' : family === 6 ? 'ipv6' : null
  return familyName === null || blockedAddresses.check(address, familyName)
}

export function isBlockedCommunicationHostname(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return (
    value === 'localhost' ||
    value === 'local' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local') ||
    METADATA_HOSTNAMES.some((blocked) => value === blocked || value.endsWith(`.${blocked}`)) ||
    (isIP(value) !== 0 && isBlockedCommunicationAddress(value))
  )
}
