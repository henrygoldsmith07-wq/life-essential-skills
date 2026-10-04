'use strict';
const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'tests/e2e',fullyParallel:false,workers:1,retries:0,timeout:60000,
  reporter:'list',use:{baseURL:'http://127.0.0.1:8011',trace:'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})},
  webServer:{command:'"'+(process.env.PYTHON_BIN||'python3')+'" -m http.server 8011 --bind 127.0.0.1',url:'http://127.0.0.1:8011/learner/',reuseExistingServer:!process.env.CI,timeout:30000}
});
