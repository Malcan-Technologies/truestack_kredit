const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Expo sets watcher.additionalExts to include "local" / "env" so env file edits trigger reloads.
// That can also surface dotenv files (e.g. `.env.tunnel.local`) as resolvable "source" and Babel
// will try to parse them as JS — use blockList so they never enter the bundle graph.
const posixProjectRoot = path.normalize(projectRoot).replace(/\\/g, '/');
const rootEnvFilePattern = new RegExp(
  '^' + posixProjectRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/\\.env(\\.[^/]+)*$',
);
config.resolver.blockList = [...(config.resolver.blockList ?? []), rootEnvFilePattern];

module.exports = config;
