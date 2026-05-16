// Placeholder Bicep module.
// Real resources (Static Web App, Function App, Cosmos DB, Storage, Web PubSub,
// Key Vault, Application Insights) are added in Plan 5 (Deploy).

targetScope = 'resourceGroup'

@description('Environment name (azd-injected).')
param environmentName string

@description('Primary Azure region (azd-injected).')
param location string

output AZURE_LOCATION string = location
output AZURE_ENVIRONMENT_NAME string = environmentName
