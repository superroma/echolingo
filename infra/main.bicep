targetScope = 'subscription'

@minLength(1)
@maxLength(20)
@description('Name of the azd environment.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('Location for Azure OpenAI (some models have regional availability).')
param openAiLocation string = 'westeurope'

@description('Object id of the principal deploying — granted Cognitive Services OpenAI User on the AOAI resource for local dev.')
param principalId string = ''

@description('Azure OpenAI LLM model name (deployment name will match).')
param llmModelName string = 'gpt-5.4-mini'

@description('Azure OpenAI TTS model name (deployment name will match).')
param ttsModelName string = 'tts'

@description('Quota in thousand tokens per minute for each deployment.')
param deploymentQuotaTpm int = 150

var resourceToken = uniqueString(subscription().id, environmentName, location)
var tags = {
  'azd-env-name': environmentName
  project: 'echolingo'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-echolingo-${environmentName}'
  location: location
  tags: tags
}

module monitoring './modules/monitoring.bicep' = {
  scope: rg
  name: 'monitoring'
  params: {
    environmentName: environmentName
    location: location
    tags: tags
  }
}

module storage './modules/storage.bicep' = {
  scope: rg
  name: 'storage'
  params: {
    environmentName: environmentName
    resourceToken: resourceToken
    location: location
    tags: tags
  }
}

module openai './modules/openai.bicep' = {
  scope: rg
  name: 'openai'
  params: {
    environmentName: environmentName
    location: openAiLocation
    tags: tags
    llmModelName: llmModelName
    ttsModelName: ttsModelName
    quotaTpm: deploymentQuotaTpm
    principalId: principalId
  }
}

module functionApp './modules/function-app.bicep' = {
  scope: rg
  name: 'functionApp'
  params: {
    environmentName: environmentName
    location: location
    tags: tags
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
    storageAccountName: storage.outputs.storageAccountName
    storageBlobEndpoint: storage.outputs.storageBlobEndpoint
    storageQueueEndpoint: storage.outputs.storageQueueEndpoint
    lessonsContainer: storage.outputs.lessonsContainer
    audioContainer: storage.outputs.audioContainer
    rateLimitContainer: storage.outputs.rateLimitContainer
    scriptGenQueue: storage.outputs.scriptGenQueue
    ttsSentenceQueue: storage.outputs.ttsSentenceQueue
    openAiEndpoint: openai.outputs.endpoint
    openAiLlmDeployment: openai.outputs.llmDeployment
    openAiTtsDeployment: openai.outputs.ttsDeployment
  }
}

module roleAssignments './modules/role-assignments.bicep' = {
  scope: rg
  name: 'roles'
  params: {
    functionAppPrincipalId: functionApp.outputs.principalId
    storageAccountName: storage.outputs.storageAccountName
    openAiAccountName: openai.outputs.accountName
  }
}

module staticWebApp './modules/static-web-app.bicep' = {
  scope: rg
  name: 'staticWebApp'
  params: {
    environmentName: environmentName
    location: 'westeurope'
    tags: tags
    linkedFunctionAppResourceId: functionApp.outputs.functionAppResourceId
  }
}

output AZURE_LOCATION string = location
output AZURE_ENVIRONMENT_NAME string = environmentName
output AZURE_OPENAI_ENDPOINT string = openai.outputs.endpoint
output AZURE_OPENAI_LLM_DEPLOYMENT string = openai.outputs.llmDeployment
output AZURE_OPENAI_TTS_DEPLOYMENT string = openai.outputs.ttsDeployment
output AZURE_STORAGE_ACCOUNT_NAME string = storage.outputs.storageAccountName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.appInsightsConnectionString
output FUNCTION_APP_NAME string = functionApp.outputs.functionAppName
output WEB_URL string = staticWebApp.outputs.defaultHostname
