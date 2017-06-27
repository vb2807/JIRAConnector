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

const path = require('path');
const express = require('express');
var stylus = require('stylus');
var nib = require('nib');
const config = require('./config');

const jiraconnector = require('./JIRAConnector.js');

const app = express();

function compile(str, path) {
    return stylus(str)
        .set('filename', path)
        .use(nib())
}

app.disable('etag');
app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'jade');
app.set('trust proxy', true);

app.use(stylus.middleware(
    { src: path.join(__dirname + '/public')
        , compile: compile
    }
));


// groomingHealth
app.use(express.static(path.join(__dirname + '/public')));
app.use('/', require('./crud'));
// app.use('/api/books', require('./books/api'));

// Redirect root to /groominghealth
app.get('/', (req, res) => {
  res.redirect('/groominghealth');
});

/*
app.get('/public/stylesheets/style.css', (req, res) => {
    res.sendFile(__dirname + '/public/stylesheets/style.css');
});
*/
/*
app.get('/', function (req, res) {
    res.end('Hello Vikas. Hi there!')
});
*/

/*
// Basic 404 handler
app.use((req, res) => {
  res.status(404).send('Not Found');
});
*/

/*
// Basic error handler
app.use((err, req, res, next) => {
  // jshint unused:false
  console.error(err);
  // If our routes specified a specific response, then send that. Otherwise,
  // send a generic message so as not to leak anything.
  res.status(500).send(err.response || 'Something broke!');
});
*/

if (module === require.main) {
  // Start the server
  const server = app.listen(config.get('PORT'), () => {
    const port = server.address().port;
    console.log(`App listening on port ${port}`);
    jiraconnector.deltaAgg('all');
    // jiraconnector.copyWeeklyData();
    //  jiraconnector.copyData();
  });
}

module.exports = app;
