@description('azd environment name.')
param environmentName string

@description('Resource token for globally-unique names.')
param resourceToken string

@description('Primary location.')
param location string

@description('Tags.')
param tags object

@description('Public apex domain the site is served from. Used to scope audio CORS to real app origins; empty falls back to any origin.')
param domainName string = ''

var storageAccountName = take('stechol${replace(toLower(environmentName), '-', '')}${resourceToken}', 24)

// Origins allowed to read audio cross-origin (for the offline-capable player).
// Audio blobs are public-read, so CORS isn't a security boundary — but scope it
// to the app's real origins anyway. The SWA's *.azurestaticapps.net default host
// is created after storage (it depends on the function app, which depends on this
// module), so it can't be referenced here without a cycle; production traffic
// uses the custom domain. localhost covers a dev server pointed at prod storage.
var audioCorsOrigins = empty(domainName)
  ? ['*']
  : [
      'https://${domainName}'
      'https://www.${domainName}'
      'http://localhost:4280'
      'http://localhost:3000'
    ]

module storage 'br/public:avm/res/storage/storage-account:0.14.3' = {
  name: 'sto-${environmentName}'
  params: {
    name: storageAccountName
    location: location
    tags: tags
    skuName: 'Standard_LRS'
    kind: 'StorageV2'
    accessTier: 'Hot'
    allowBlobPublicAccess: true
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
      // Audio is fetched by the browser with crossorigin="anonymous" so the
      // service worker can cache non-opaque, Range-capable responses for offline
      // replay (opaque cross-origin responses can't be served to <audio>, esp.
      // on iOS Safari). Blobs are already public-read, so GET from any origin is
      // fine; exposing Content-Range/Accept-Ranges lets media range requests work.
      corsRules: [
        {
          allowedOrigins: audioCorsOrigins
          allowedMethods: ['GET', 'HEAD', 'OPTIONS']
          allowedHeaders: ['*']
          exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type']
          maxAgeInSeconds: 3600
        }
      ]
      containers: [
        { name: 'echoes' }
        { name: 'audio', publicAccess: 'Blob' }
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
output echoesContainer string = 'echoes'
output audioContainer string = 'audio'
output rateLimitContainer string = 'rate-limits'
output scriptGenQueue string = 'script-gen'
output ttsSentenceQueue string = 'tts-sentence'
