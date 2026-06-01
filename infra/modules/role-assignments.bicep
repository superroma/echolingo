@description('Function App system-assigned managed identity principal id.')
param functionAppPrincipalId string

@description('Storage account name.')
param storageAccountName string

@description('Azure OpenAI account name (LLM).')
param openAiAccountName string

@description('Azure OpenAI account name (TTS, separate region).')
param openAiTtsAccountName string

@description('Azure AI Speech account name.')
param speechAccountName string

@description('Object id of the principal running azd deploy — receives Storage Blob Data Contributor for package uploads. Empty skips the grant.')
param deployerPrincipalId string = ''

@description('Principal type of deployerPrincipalId: User for local azd up, ServicePrincipal for CI.')
param deployerPrincipalType string = 'User'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: openAiAccountName
}

resource openAiTts 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: openAiTtsAccountName
}

resource speech 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: speechAccountName
}

var blobDataContributor    = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var queueDataContributor   = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
var tableDataContributor   = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
var openAiUser             = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var speechUser             = 'f2dc8367-1007-4938-bd23-fe263f013447'

resource roleStorageBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionAppPrincipalId, blobDataContributor)
  properties: {
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributor)
  }
}

resource roleStorageQueue 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionAppPrincipalId, queueDataContributor)
  properties: {
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', queueDataContributor)
  }
}

resource roleStorageTable 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionAppPrincipalId, tableDataContributor)
  properties: {
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', tableDataContributor)
  }
}

resource roleOpenAi 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: openAi
  name: guid(openAi.id, functionAppPrincipalId, openAiUser)
  properties: {
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUser)
  }
}

resource roleOpenAiTts 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: openAiTts
  name: guid(openAiTts.id, functionAppPrincipalId, openAiUser)
  properties: {
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUser)
  }
}

resource roleSpeech 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: speech
  name: guid(speech.id, functionAppPrincipalId, speechUser)
  properties: {
    principalId: functionAppPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', speechUser)
  }
}

resource roleDeployerStorageBlob 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deployerPrincipalId)) {
  scope: storage
  name: guid(storage.id, deployerPrincipalId, blobDataContributor)
  properties: {
    principalId: deployerPrincipalId
    principalType: deployerPrincipalType
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributor)
  }
}
