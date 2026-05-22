@description('azd environment name.')
param environmentName string

@description('Location for AOAI (e.g. westeurope).')
param location string

@description('Tags.')
param tags object

@description('LLM model name; deployment name will match.')
param llmModelName string

@description('LLM model version (Azure-managed snapshot).')
param llmModelVersion string = '2026-03-17'

@description('TTS model name; deployment name will match.')
param ttsModelName string

@description('TTS model version.')
param ttsModelVersion string = '001'

@description('Quota per deployment in thousand tokens per minute.')
param quotaTpm int

@description('Object id of the local developer principal — receives Cognitive Services OpenAI User. Empty in CI deploys.')
param principalId string

var accountName = 'aoai-echolingo-${environmentName}'

module openai 'br/public:avm/res/cognitive-services/account:0.9.1' = {
  name: 'aoai-${environmentName}'
  params: {
    name: accountName
    location: location
    tags: tags
    kind: 'OpenAI'
    sku: 'S0'
    customSubDomainName: accountName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    deployments: [
      {
        name: llmModelName
        model: {
          format: 'OpenAI'
          name: llmModelName
          version: llmModelVersion
        }
        sku: {
          name: 'GlobalStandard'
          capacity: quotaTpm
        }
        versionUpgradeOption: 'OnceCurrentVersionExpired'
      }
      {
        name: ttsModelName
        model: {
          format: 'OpenAI'
          name: ttsModelName
          version: ttsModelVersion
        }
        sku: {
          name: 'Standard'
          capacity: 3
        }
        versionUpgradeOption: 'OnceCurrentVersionExpired'
      }
    ]
    roleAssignments: empty(principalId) ? [] : [
      {
        principalId: principalId
        roleDefinitionIdOrName: 'Cognitive Services OpenAI User'
        principalType: 'User'
      }
    ]
  }
}

output endpoint string = openai.outputs.endpoint
output accountName string = openai.outputs.name
output accountResourceId string = openai.outputs.resourceId
output llmDeployment string = llmModelName
output ttsDeployment string = ttsModelName
