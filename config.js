// Copyright 2015-2016, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

// Hierarchical node.js configuration with command-line arguments, environment
// variables, and files.
const nconf = module.exports = require('nconf');
const path = require('path');

nconf
  // 1. Command-line arguments
  .argv()
  // 2. Environment variables
  .env([
    'DATA_BACKEND',
    'GCLOUD_PROJECT',
    'PORT',
//    'JIRA_USER_ID',
//    'JIRA_PASSWORD',
    'CONSUMER_KEY',
//    'PRIVATE_KEY_PEM_FILE',
    'ACCESS_TOKEN',
    'TOKEN_SECRET',
    'HARBOR_USER_ID',
    'HARBOR_PASSWORD'
  ])
  // 3. Config file
  .file({ file: path.join(__dirname, 'config.json') })
  // 4. Defaults
  .defaults({
    // Port the HTTP server
    PORT: 8080
  });

// Check for required settings
checkConfig('DATA_BACKEND');
checkConfig('GCLOUD_PROJECT');
// checkConfig('JIRA_USER_ID');
// checkConfig('JIRA_PASSWORD');
checkConfig('HARBOR_USER_ID');
checkConfig('HARBOR_PASSWORD');
checkConfig('CONSUMER_KEY');
checkConfig('ACCESS_TOKEN');
checkConfig('TOKEN_SECRET');
// checkConfig('PRIVATE_KEY_PEM_FILE');

function checkConfig (setting) {
  if (!nconf.get(setting)) {
    throw new Error(`You must set ${setting} as an environment variable or in config.json!`);
  }
}
