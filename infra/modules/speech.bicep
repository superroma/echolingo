@description('Location for the Azure AI Speech resource.')
param location string

@description('Tags.')
param tags object

@description('azd environment name.')
param environmentName string

@description('Object id of the deploying principal, granted Cognitive Services Speech User. Empty skips the grant.')
param principalId string = ''

@description('Principal type of principalId: User for local azd up, ServicePrincipal for CI.')
param principalType string = 'User'

var accountName = 'spch-echolingo-${environmentName}'

// kind 'SpeechServices'. A custom subdomain + disabled local auth are required
// for Microsoft Entra (managed-identity) authentication, matching the rest of
// the stack's keyless model.
module speech 'br/public:avm/res/cognitive-services/account:0.9.1' = {
  name: 'speech-${environmentName}'
  params: {
    name: accountName
    location: location
    tags: tags
    kind: 'SpeechServices'
    sku: 'S0'
    customSubDomainName: accountName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    roleAssignments: empty(principalId) ? [] : [
      {
        principalId: principalId
        roleDefinitionIdOrName: 'Cognitive Services Speech User'
        principalType: principalType
      }
    ]
  }
}

output accountName string = speech.outputs.name
output resourceId string = speech.outputs.resourceId
output region string = location
