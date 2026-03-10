module.exports = {
  apps: [
    {
      name: "bridge-agent",
      script: "packages/agent/dist/index.js",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
    {
      name: "bridge-whatsapp",
      script: "packages/bridge/dist/index.js",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
  ],
};
