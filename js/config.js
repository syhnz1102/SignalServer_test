const ini = require('ini');
const fs = require('fs');

module.exports = (() => {
  // TODO: ivypark, change to singleton pattern
  let cfg = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
  if (process.argv.includes('dev')) cfg.server.env = 'dev';
  const env = cfg.server.env;

  return {
    env,
    process: Number(cfg.server.cluster) || 1,
    port: cfg.server.port,
    serviceType: cfg.server.service.type || 'ccc',
    ssl: cfg.server.ssl[env],
    was: cfg.server.was[env],
    media: cfg.server.media[env],
    sync: cfg.server.sync[env],
    license: cfg.server.license
  };
})();
