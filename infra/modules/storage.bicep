@description('azd environment name.')
param environmentName string

@description('Resource token for globally-unique names.')
param resourceToken string

@description('Primary location.')
param location string

@description('Tags.')
param tags object

var storageAccountName = take('stechol${replace(toLower(environmentName), '-', '')}${resourceToken}', 24)

module storage 'br/public:avm/res/storage/storage-account:0.14.3' = {
  name: 'sto-${environmentName}'
  params: {
    name: storageAccountName
    location: location
    tags: tags
    skuName: 'Standard_LRS'
    kind: 'StorageV2'
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    publicNetworkAccess: 'Enabled'
    minimumTlsVersion: 'TLS1_2'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    blobServices: {
      deleteRetentionPolicyEnabled: false
      containerDeleteRetentionPolicyEnabled: false
      containers: [
        { name: 'lessons' }
        { name: 'audio' }
        { name: 'rate-limits' }
        { name: 'deploymentpackage' }
      ]
    }
    queueServices: {
      queues: [
        { name: 'script-gen' }
        { name: 'tts-sentence' }
      ]
    }
  }
}

output storageAccountName string = storage.outputs.name
output storageAccountResourceId string = storage.outputs.resourceId
output storageBlobEndpoint string = 'https://${storage.outputs.name}.blob.${environment().suffixes.storage}'
output storageQueueEndpoint string = 'https://${storage.outputs.name}.queue.${environment().suffixes.storage}'
output lessonsContainer string = 'lessons'
output audioContainer string = 'audio'
output rateLimitContainer string = 'rate-limits'
output scriptGenQueue string = 'script-gen'
output ttsSentenceQueue string = 'tts-sentence'
