@description('Apex domain to host in Azure DNS, e.g. echolingo.audio.')
param domainName string

@description('Tags applied to all resources.')
param tags object

// Native resource (not AVM) — a public DNS zone is trivial and this avoids pinning an
// AVM module version. The zone is always global.
resource dnsZone 'Microsoft.Network/dnsZones@2023-07-01-preview' = {
  name: domainName
  location: 'global'
  tags: tags
  properties: {
    zoneType: 'Public'
  }
}

output dnsZoneName string = dnsZone.name
output dnsZoneResourceId string = dnsZone.id

// Paste these four values into GoDaddy → Domain → Nameservers ("I'll use my own").
// Delegation must propagate before the SWA custom domain (Phase 3) can validate.
output dnsNameServers array = dnsZone.properties.nameServers
