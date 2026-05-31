@description('azd environment name.')
param environmentName string

@description('Location for SWA (limited regions; westeurope is supported).')
param location string

@description('Tags.')
param tags object

@description('Resource id of the Function App to link as the /api/* backend (requires Standard SKU).')
param linkedFunctionAppResourceId string

var swaName = 'stapp-echolingo-${environmentName}'

module swa 'br/public:avm/res/web/static-site:0.6.0' = {
  name: 'swa-${environmentName}'
  params: {
    name: swaName
    location: location
    tags: union(tags, { 'azd-service-name': 'web' })
    sku: 'Standard'
    allowConfigFileUpdates: true
    // Standard SKU only: proxy /api/* to the Function App so the frontend can use
    // same-origin relative paths instead of calling the Function App directly.
    // region defaults to this module's `location` (westeurope), matching the Function App.
    linkedBackend: {
      resourceId: linkedFunctionAppResourceId
    }
  }
}

output staticWebAppName string = swa.outputs.name
output staticWebAppResourceId string = swa.outputs.resourceId
output defaultHostname string = 'https://${swa.outputs.defaultHostname}'
// Raw hostname (no scheme) — CNAME target for the www custom domain.
output defaultHostnameRaw string = swa.outputs.defaultHostname
