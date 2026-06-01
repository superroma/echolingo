@description('Name of the (existing) parent public DNS zone, e.g. echolingo.audio.')
param zoneName string

@description('Subdomain label created within the zone, e.g. dev (for dev.echolingo.audio).')
param label string

@description('CNAME target — the Static Web App default hostname, no scheme.')
param target string

// The parent zone is owned by another environment (prod); this module is scoped
// to that zone's resource group by the caller, so reference the zone as existing.
resource zone 'Microsoft.Network/dnsZones@2023-07-01-preview' existing = {
  name: zoneName
}

// A subdomain validates against this CNAME (no apex TXT-token dance). The SWA's
// custom-domain binding in custom-domain-sub.bicep depends on this record.
resource cname 'Microsoft.Network/dnsZones/CNAME@2023-07-01-preview' = {
  parent: zone
  name: label
  properties: {
    TTL: 3600
    CNAMERecord: {
      cname: target
    }
  }
}

output fqdn string = '${label}.${zoneName}'
