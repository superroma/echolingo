targetScope = 'subscription'

@minLength(1)
@maxLength(20)
@description('Name of the azd environment.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('Location for the Azure OpenAI LLM account (gpt-5.x-mini has regional availability; Sweden Central has it).')
param openAiLocation string = 'swedencentral'

@description('Location for the Azure OpenAI TTS account. gpt-4o-mini-tts is not offered in Sweden Central, so TTS lives in its own account/region (East US 2 has quota).')
param ttsLocation string = 'eastus2'

@description('Object id of the principal deploying — granted Cognitive Services OpenAI User on the AOAI resources for local dev.')
param principalId string = ''

@description('Azure OpenAI LLM model name (deployment name will match).')
param llmModelName string = 'gpt-5.4-mini'

@description('Azure OpenAI LLM model version snapshot.')
param llmModelVersion string = '2026-03-17'

@description('Azure OpenAI TTS model name (deployment name will match).')
param ttsModelName string = 'gpt-4o-mini-tts'

@description('Azure OpenAI TTS model version snapshot.')
param ttsModelVersion string = '2025-12-15'

@description('Quota in thousand tokens per minute for the LLM deployment.')
param deploymentQuotaTpm int = 150

@description('Quota in thousand tokens per minute for the TTS deployment.')
param ttsQuotaTpm int = 50

@description('Location for the Azure AI Speech resource (the alternative, fixed-voice TTS engine).')
param speechLocation string = 'westeurope'

@description('Which TTS engine the API uses at runtime: openai (gpt-4o-mini-tts) or azurespeech (fixed neural voices).')
@allowed([
  'openai'
  'azurespeech'
])
param ttsEngine string = 'azurespeech'

@description('Apex domain hosted in Azure DNS for the public site. Empty disables the DNS zone.')
param domainName string = 'echolingo.audio'

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
    domainName: domainName
  }
}

// LLM account (gpt-5.x-mini) — Sweden Central.
module openai './modules/openai.bicep' = {
  scope: rg
  name: 'openai'
  params: {
    location: openAiLocation
    tags: tags
    accountName: 'aoai-echolingo-${environmentName}'
    deployments: [
      {
        name: llmModelName
        version: llmModelVersion
        skuName: 'GlobalStandard'
        capacity: deploymentQuotaTpm
      }
    ]
    principalId: principalId
  }
}

// TTS account (gpt-4o-mini-tts) — separate region (East US 2) because the model
// isn't offered in the LLM region. Its own endpoint is wired into the API.
module openaiTts './modules/openai.bicep' = {
  scope: rg
  name: 'openaiTts'
  params: {
    location: ttsLocation
    tags: tags
    accountName: 'aoai-tts-echolingo-${environmentName}'
    deployments: [
      {
        name: ttsModelName
        version: ttsModelVersion
        skuName: 'GlobalStandard'
        capacity: ttsQuotaTpm
      }
    ]
    principalId: principalId
  }
}

// Azure AI Speech — the fixed-voice TTS engine, selectable via ttsEngine.
module speech './modules/speech.bicep' = {
  scope: rg
  name: 'speech'
  params: {
    environmentName: environmentName
    location: speechLocation
    tags: tags
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
    echoesContainer: storage.outputs.echoesContainer
    audioContainer: storage.outputs.audioContainer
    rateLimitContainer: storage.outputs.rateLimitContainer
    scriptGenQueue: storage.outputs.scriptGenQueue
    ttsSentenceQueue: storage.outputs.ttsSentenceQueue
    openAiEndpoint: openai.outputs.endpoint
    openAiLlmDeployment: llmModelName
    openAiTtsEndpoint: openaiTts.outputs.endpoint
    openAiTtsDeployment: ttsModelName
    ttsEngine: ttsEngine
    speechRegion: speech.outputs.region
    speechResourceId: speech.outputs.resourceId
  }
}

module roleAssignments './modules/role-assignments.bicep' = {
  scope: rg
  name: 'roles'
  params: {
    functionAppPrincipalId: functionApp.outputs.principalId
    storageAccountName: storage.outputs.storageAccountName
    openAiAccountName: openai.outputs.accountName
    openAiTtsAccountName: openaiTts.outputs.accountName
    speechAccountName: speech.outputs.accountName
    deployerPrincipalId: principalId
  }
}

module dns './modules/dns.bicep' = if (!empty(domainName)) {
  scope: rg
  name: 'dns'
  params: {
    domainName: domainName
    tags: tags
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

// Bind the apex + www custom domains to the Static Web App and create the DNS
// records in the (delegated) Azure DNS zone. Only when a domain is configured.
module customDomain './modules/custom-domain.bicep' = if (!empty(domainName)) {
  scope: rg
  name: 'customDomain'
  params: {
    domainName: domainName
    dnsZoneName: domainName
    staticWebAppName: staticWebApp.outputs.staticWebAppName
    staticWebAppResourceId: staticWebApp.outputs.staticWebAppResourceId
    staticWebAppDefaultHostname: staticWebApp.outputs.defaultHostnameRaw
  }
  dependsOn: [
    dns
  ]
}

output AZURE_LOCATION string = location
output AZURE_ENVIRONMENT_NAME string = environmentName
output AZURE_OPENAI_ENDPOINT string = openai.outputs.endpoint
output AZURE_OPENAI_LLM_DEPLOYMENT string = llmModelName
output AZURE_OPENAI_TTS_ENDPOINT string = openaiTts.outputs.endpoint
output AZURE_OPENAI_TTS_DEPLOYMENT string = ttsModelName
output AZURE_STORAGE_ACCOUNT_NAME string = storage.outputs.storageAccountName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.appInsightsConnectionString
output FUNCTION_APP_NAME string = functionApp.outputs.functionAppName
output FUNCTION_APP_URL string = 'https://${functionApp.outputs.defaultHostname}'
output WEB_URL string = staticWebApp.outputs.defaultHostname
// The frontend calls relative /api/* (proxied by the SWA linked backend), so it no
// longer needs the Function App URL baked in at build time.
output DNS_ZONE_NAME string = empty(domainName) ? '' : dns.outputs.dnsZoneName
output DNS_NAME_SERVERS array = empty(domainName) ? [] : dns.outputs.dnsNameServers
output CUSTOM_DOMAIN_URL string = empty(domainName) ? '' : customDomain.outputs.apexUrl
output CUSTOM_DOMAIN_WWW_URL string = empty(domainName) ? '' : customDomain.outputs.wwwUrl
