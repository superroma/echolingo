@description('azd environment name.')
param environmentName string

@description('Primary location.')
param location string

@description('Tags applied to all resources.')
param tags object

module logAnalytics 'br/public:avm/res/operational-insights/workspace:0.7.0' = {
  name: 'log-${environmentName}'
  params: {
    name: 'log-echolingo-${environmentName}'
    location: location
    tags: tags
    skuName: 'PerGB2018'
    dataRetention: 30
  }
}

module appInsights 'br/public:avm/res/insights/component:0.4.2' = {
  name: 'appi-${environmentName}'
  params: {
    name: 'appi-echolingo-${environmentName}'
    location: location
    tags: tags
    workspaceResourceId: logAnalytics.outputs.resourceId
    applicationType: 'web'
    kind: 'web'
  }
}

output appInsightsConnectionString string = appInsights.outputs.connectionString
output appInsightsInstrumentationKey string = appInsights.outputs.instrumentationKey
output logAnalyticsWorkspaceResourceId string = logAnalytics.outputs.resourceId
