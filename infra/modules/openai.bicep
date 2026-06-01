@description('Location for this Azure OpenAI account (model availability is regional).')
param location string

@description('Tags.')
param tags object

@description('Cognitive Services account name (also used as the custom subdomain).')
param accountName string

@description('Model deployments for this account: array of { name, version, skuName, capacity }. The deployment name matches the model name.')
param deployments array

@description('Object id of a user principal granted Cognitive Services OpenAI User (local dev). Empty in CI deploys.')
param principalId string = ''

module account 'br/public:avm/res/cognitive-services/account:0.9.1' = {
  name: 'aoai-${accountName}'
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
      for d in deployments: {
        name: d.name
        model: {
          format: 'OpenAI'
          name: d.name
          version: d.version
        }
        sku: {
          name: d.skuName
          capacity: d.capacity
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

output endpoint string = account.outputs.endpoint
output accountName string = account.outputs.name
output accountResourceId string = account.outputs.resourceId
