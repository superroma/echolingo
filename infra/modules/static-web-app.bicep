@description('azd environment name.')
param environmentName string

@description('Location for SWA (limited regions; westeurope is supported).')
param location string

@description('Tags.')
param tags object

var swaName = 'stapp-echolingo-${environmentName}'

module swa 'br/public:avm/res/web/static-site:0.6.0' = {
  name: 'swa-${environmentName}'
  params: {
    name: swaName
    location: location
    tags: union(tags, { 'azd-service-name': 'web' })
    sku: 'Free'
    allowConfigFileUpdates: true
  }
}

output staticWebAppName string = swa.outputs.name
output defaultHostname string = 'https://${swa.outputs.defaultHostname}'
