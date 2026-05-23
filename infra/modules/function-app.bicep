@description('azd environment name.')
param environmentName string

@description('Location.')
param location string

@description('Tags.')
param tags object

@description('App Insights connection string.')
param appInsightsConnectionString string

@description('Storage account name (used for runtime + deployment package).')
param storageAccountName string

@description('Storage blob endpoint.')
param storageBlobEndpoint string

@description('Storage queue endpoint.')
param storageQueueEndpoint string

@description('Lessons container name.')
param lessonsContainer string

@description('Audio container name.')
param audioContainer string

@description('Rate-limit container name.')
param rateLimitContainer string

@description('Script-gen queue name.')
param scriptGenQueue string

@description('TTS-sentence queue name.')
param ttsSentenceQueue string

@description('Azure OpenAI endpoint.')
param openAiEndpoint string

@description('LLM deployment name.')
param openAiLlmDeployment string

@description('TTS deployment name.')
param openAiTtsDeployment string

var planName = 'plan-echolingo-${environmentName}'
var functionAppName = 'func-echolingo-${environmentName}'

module plan 'br/public:avm/res/web/serverfarm:0.3.0' = {
  name: 'plan-${environmentName}'
  params: {
    name: planName
    location: location
    tags: tags
    skuName: 'FC1'
    skuCapacity: 0
    kind: 'FunctionApp'
    reserved: true
    zoneRedundant: false
  }
}

module functionApp 'br/public:avm/res/web/site:0.13.0' = {
  name: 'func-${environmentName}'
  params: {
    name: functionAppName
    location: location
    tags: union(tags, { 'azd-service-name': 'api' })
    kind: 'functionapp,linux'
    serverFarmResourceId: plan.outputs.resourceId
    managedIdentities: { systemAssigned: true }
    httpsOnly: true
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: [ '*' ]
      }
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageBlobEndpoint}/deploymentpackage'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: 2048
        maximumInstanceCount: 100
      }
      runtime: {
        name: 'node'
        version: '22'
      }
    }
    appSettingsKeyValuePairs: {
      APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
      AzureWebJobsStorage__accountName: storageAccountName
      AzureWebJobsStorage__credential: 'managedidentity'
      LESSONS_CONTAINER: lessonsContainer
      AUDIO_CONTAINER: audioContainer
      RATE_LIMIT_CONTAINER: rateLimitContainer
      SCRIPT_GEN_QUEUE: scriptGenQueue
      TTS_SENTENCE_QUEUE: ttsSentenceQueue
      STORAGE_BLOB_ENDPOINT: storageBlobEndpoint
      STORAGE_QUEUE_ENDPOINT: storageQueueEndpoint
      AZURE_OPENAI_ENDPOINT: openAiEndpoint
      AZURE_OPENAI_LLM_DEPLOYMENT: openAiLlmDeployment
      AZURE_OPENAI_TTS_DEPLOYMENT: openAiTtsDeployment
      AZURE_OPENAI_API_VERSION: '2024-08-01-preview'
      LLM_ENGINE: 'openai'
      TTS_ENGINE: 'openai'
      RATE_LIMIT_PER_DAY: '20'
    }
  }
}

output functionAppName string = functionApp.outputs.name
output functionAppResourceId string = functionApp.outputs.resourceId
output principalId string = functionApp.outputs.systemAssignedMIPrincipalId
output defaultHostname string = functionApp.outputs.defaultHostname
