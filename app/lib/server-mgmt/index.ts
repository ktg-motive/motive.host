// app/lib/server-mgmt/index.ts
// Barrel export for all server management modules.

export { execLocal, execSudo, execBash, writeSudoFile, ExecError, assertValidSlug, BUILD_TIMEOUT, CLONE_TIMEOUT, CERTBOT_TIMEOUT } from './exec';
export type { ExecResult } from './exec';

export {
  generateServerBlock, generateSslConf, generateRedirectConf,
  buildServerNames, buildCertDomains,
  writeServerBlock, removeServerBlock, writeSSLConfig, writeRedirectConfig,
  detectNginxState, writeBasicAuthHtpasswd,
} from './nginx';
export type { ServerBlockOptions, AppTemplate, NginxState, WwwBehavior } from './nginx';

export {
  createAppDirectory, removeAppDirectory, configureNginx, installSSL,
  generateDeployKey, seedKnownHosts, verifyRepoAccess, cloneRepo, provisionApp,
  rollbackProvision, setupPythonVenv, startPythonApp,
} from './provision';
export type { ProvisionAppOptions } from './provision';

export { pullLatest, deployAndRestart, writeDeployLog } from './deploy';
export type { DeployOptions, DeployResult } from './deploy';

export { restartApp, stopApp, getAppStatus, renewSSL, getDeployLog, getAppLogs } from './actions';

export {
  verifyGitHubSignature, verifyGitLabToken,
  extractBranch, shouldDeploy, generateWebhookSecret,
} from './webhook';

export { encryptValue, decryptValue, isValidEnvKey, renderDotEnv, writeEnvFile, readEnvFile } from './env';
export type { EnvVar } from './env';

export {
  beginOperation, heartbeat, startHeartbeat, completeOperation, failOperation,
  recoverStaleOperations, getActiveOperation, getRecentOperations,
  OPERATION_TIMEOUTS, HEARTBEAT_INTERVAL, STALE_THRESHOLD,
} from './operations';
export type { OperationType, OperationStatus, TriggerSource, OperationRow } from './operations';
