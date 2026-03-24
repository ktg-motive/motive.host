// app/lib/server-mgmt/index.ts
// Barrel export for all server management modules.

export { execLocal, execSudo, execBash, writeSudoFile, ExecError, BUILD_TIMEOUT, CLONE_TIMEOUT, CERTBOT_TIMEOUT } from './exec';
export type { ExecResult } from './exec';

export {
  generateServerBlock, generateSslConf, generateRedirectConf,
  buildServerNames, buildCertDomains,
  writeServerBlock, removeServerBlock, writeSSLConfig, writeRedirectConfig,
  detectNginxState,
} from './nginx';
export type { ServerBlockOptions, AppTemplate, NginxState, WwwBehavior } from './nginx';

export {
  createAppDirectory, removeAppDirectory, configureNginx, installSSL,
  generateDeployKey, seedKnownHosts, verifyRepoAccess, cloneRepo, provisionApp,
  rollbackProvision,
} from './provision';
export type { ProvisionAppOptions } from './provision';

export { encryptValue, decryptValue, isValidEnvKey, renderDotEnv, writeEnvFile, readEnvFile } from './env';
export type { EnvVar } from './env';

export {
  beginOperation, heartbeat, completeOperation, failOperation,
  recoverStaleOperations, getActiveOperation, getRecentOperations,
  OPERATION_TIMEOUTS, HEARTBEAT_INTERVAL, STALE_THRESHOLD,
} from './operations';
export type { OperationType, OperationStatus, TriggerSource, OperationRow } from './operations';
