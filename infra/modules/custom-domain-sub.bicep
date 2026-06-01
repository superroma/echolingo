@description('Static Web App name to bind the custom domain to.')
param staticWebAppName string

@description('Full subdomain to bind, e.g. dev.echolingo.audio.')
param fullDomain string

resource swa 'Microsoft.Web/staticSites@2024-04-01' existing = {
  name: staticWebAppName
}

// Subdomain custom domain. Unlike the apex (which needs dns-txt-token), a
// subdomain validates against its CNAME — created in the parent zone by the
// dns-record-sub module this depends on (wired via dependsOn in main.bicep).
// Idempotent once the domain reaches "Ready".
resource subDomain 'Microsoft.Web/staticSites/customDomains@2024-04-01' = {
  parent: swa
  name: fullDomain
  properties: {
    validationMethod: 'cname-delegation'
  }
}

output url string = 'https://${fullDomain}'
