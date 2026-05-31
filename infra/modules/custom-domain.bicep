@description('Apex domain bound to the Static Web App, e.g. echolingo.audio.')
param domainName string

@description('Azure DNS zone name (equals the apex domain).')
param dnsZoneName string

@description('Static Web App name — child custom-domain resources attach to it.')
param staticWebAppName string

@description('Static Web App resource id — alias target for the apex A record.')
param staticWebAppResourceId string

@description('Static Web App default hostname (no scheme) — CNAME target for www.')
param staticWebAppDefaultHostname string

// Zone is created by the dns module; reference it to add records.
resource dnsZone 'Microsoft.Network/dnsZones@2023-07-01-preview' existing = {
  name: dnsZoneName
}

// SWA is created by the static-web-app module; reference it to attach domains.
resource swa 'Microsoft.Web/staticSites@2024-04-01' existing = {
  name: staticWebAppName
}

// Apex (@) as an ALIAS A record targeting the Static Web App resource. Azure DNS
// supports alias-to-resource at the apex, which a plain CNAME cannot do — this is
// why the zone lives in Azure DNS rather than at the registrar (GoDaddy can't do it).
resource apexAlias 'Microsoft.Network/dnsZones/A@2023-07-01-preview' = {
  parent: dnsZone
  name: '@'
  properties: {
    TTL: 3600
    targetResource: {
      id: staticWebAppResourceId
    }
  }
}

// www -> SWA default hostname. The www custom domain validates against this CNAME.
resource wwwCname 'Microsoft.Network/dnsZones/CNAME@2023-07-01-preview' = {
  parent: dnsZone
  name: 'www'
  properties: {
    TTL: 3600
    CNAMERecord: {
      cname: staticWebAppDefaultHostname
    }
  }
}

// Apex custom domain. dns-txt-token is the only apex-capable validation method.
//
// FIRST-TIME BOOTSTRAP ONLY: on initial creation this resource enters "Validating"
// and ARM blocks until a TXT record holding its generated validationToken exists at
// the apex — a token it only emits *after* being created (a documented ARM catch-22).
// Bootstrap it once out-of-band:
//   az staticwebapp hostname set  -n <swa> -g <rg> --hostname <domain> -m dns-txt-token --no-wait
//   token=$(az staticwebapp hostname show -n <swa> -g <rg> --hostname <domain> --query validationToken -o tsv)
//   az network dns record-set txt add-record -g <rg> -z <zone> -n @ -v "$token"
// Once the domain is Ready, this declaration is idempotent and re-provisions cleanly.
resource apexDomain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = {
  parent: swa
  name: domainName
  properties: {
    validationMethod: 'dns-txt-token'
  }
  dependsOn: [
    apexAlias
  ]
}

// www custom domain — validates automatically against the CNAME above; no token.
resource wwwDomain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = {
  parent: swa
  name: 'www.${domainName}'
  properties: {
    validationMethod: 'cname-delegation'
  }
  dependsOn: [
    wwwCname
  ]
}

output apexUrl string = 'https://${domainName}'
output wwwUrl string = 'https://www.${domainName}'
