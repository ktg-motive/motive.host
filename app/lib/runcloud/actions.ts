// Phase 2 stubs — not implemented yet

export function createActionCommands(_client: unknown) {
  async function rebuildApp(_appId: number): Promise<void> {
    throw new Error('Not implemented — Phase 2');
  }

  async function forceDeploy(_appId: number): Promise<void> {
    throw new Error('Not implemented — Phase 2');
  }

  async function redeploySSL(_appId: number): Promise<void> {
    throw new Error('Not implemented — Phase 2');
  }

  return { rebuildApp, forceDeploy, redeploySSL };
}
