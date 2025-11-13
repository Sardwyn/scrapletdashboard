module.exports = {
  apps: [{
    name: 'scrapletdashboard',
    script: './index.js',
    cwd: '/root/scrapletdashboard',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
