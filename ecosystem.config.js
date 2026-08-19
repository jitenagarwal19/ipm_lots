/**
 * PM2 process definitions.
 *
 * Three processes, because the app genuinely is three things. The worker is the
 * one people forget: `index.ts` does not start it, so an app deployed without it
 * looks completely healthy while Gmail ingest silently never happens.
 *
 *   pm2 start ecosystem.config.js
 *   pm2 save && pm2 startup      # survive a reboot
 */

// Logs go next to the checkout by default, which works on macOS without sudo.
// Override with IPM_LOG_DIR on a Linux host that prefers /var/log.
const path = require('node:path');
const LOG_DIR = process.env.IPM_LOG_DIR || path.join(__dirname, 'logs');

module.exports = {
  apps: [
    {
      name: 'ipm-api',
      cwd: './backend',
      script: 'dist/index.js',
      env: { NODE_ENV: 'production' },
      instances: 1,
      // The rate limiter holds counters in memory, so more than one instance
      // would multiply the effective limit. Move it to Redis before scaling up.
      exec_mode: 'fork',
      max_memory_restart: '600M',
      error_file: path.join(LOG_DIR, 'api.err.log'),
      out_file: path.join(LOG_DIR, 'api.out.log'),
      time: true,
    },
    {
      name: 'ipm-worker',
      cwd: './backend',
      script: 'dist/worker.js',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '600M',
      // Gmail polling every 30s; a crash loop here should back off, not spin.
      restart_delay: 5000,
      error_file: path.join(LOG_DIR, 'worker.err.log'),
      out_file: path.join(LOG_DIR, 'worker.out.log'),
      time: true,
    },
    {
      name: 'ipm-web',
      cwd: './frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '800M',
      error_file: path.join(LOG_DIR, 'web.err.log'),
      out_file: path.join(LOG_DIR, 'web.out.log'),
      time: true,
    },
  ],
};
