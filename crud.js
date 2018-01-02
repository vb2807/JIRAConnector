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

const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const jade = require('jade');

function getModel () {
  return require(`./model-${config.get('DATA_BACKEND')}`);
}

var JIRAConnector = require('./JIRAConnector');

const router = express.Router();

// Automatically parse request body as form data
router.use(bodyParser.urlencoded({ extended: false }));

// Set Content-Type for all responses for these routes
router.use((req, res, next) => {
  res.set('Content-Type', 'text/html');
  next();
});

/**
 * GET /books/add
 *
 * Display a page of books (up to ten at a time).
 */
router.get('/groominghealth', (req, res, next) => {
  console.log('req.query.type:' + req.query.type);
  // console.log('req.query.which:' + req.query.which);
  getModel().fetchIterationView(req.query.type, false, (err, scrums, comboObjs, connectivityInvestmentBuckets, connectivityInvestmentStoryPoints) => {
    if (err) {
      console.log(err);
      next(err);
      return;
    }
    if(!comboObjs) {
      console.log('ComboObjs in null.');
      res.end('ComboObjs in null.');
      return;
    }
    // console.log(pmstories);
    if(comboObjs) {
        console.log('returned all the combo objs. Ready to send HTML');
        console.log('comboObjs:' + JSON.stringify(comboObjs));
        /*
        comboObjs.forEach((x) => {
          console.log('x:' + JSON.stringify(x));
          console.log('x:' + x);
          console.log('x.pmstory:' + x.pmstory);
          console.log('x.enggstories:' + x.enggstories);

          x.enggstories.forEach ((enggstory) => {
            console.log(enggstory);
          })

        });
        */

        res.render('pmstorystatus.jade', {
            scrums: scrums,
            ComboObjs: comboObjs
        });
    }
  });
});

router.get('/iterationview', (req, res, next) => {
    JIRAConnector.logger.debug('req.query.type:' + req.query.type);
    // console.log('req.query.which:' + req.query.which);
    getModel().fetchIterationView(req.query.type, false, (err, scrums, comboObjs, connectivityInvestmentBuckets, connectivityInvestmentStoryPoints, connectivityInvestmentDoneStoryPoints, connectivityInvestmentCountStories, connectivityInvestmentCountDoneStories, iterationSummary, iterations, startDateMsec, endDateMsec) => {
        if (err) {
            JIRAConnector.logger.error(err);
            res.render('error.jade', {
                err: err
            });
            return;
        }
        if(!comboObjs) {
            JIRAConnector.logger.error('ComboObjs in null.');
            res.render('error.jade', {
                err: 'ComboObjs in null.'
            });
            return;
        }
        // console.log(pmstories);
        if(comboObjs) {
            JIRAConnector.logger.debug('returned all the combo objs. Ready to send HTML');
            JIRAConnector.logger.debug('comboObjs:' + JSON.stringify(comboObjs));
            JIRAConnector.logger.debug('scrums:' + JSON.stringify(scrums));
            JIRAConnector.logger.debug('connectivityInvestmentBuckets:' + JSON.stringify(connectivityInvestmentBuckets));
            JIRAConnector.logger.debug('connectivityInvestmentStoryPoints:' + JSON.stringify(connectivityInvestmentStoryPoints));
            JIRAConnector.logger.debug('connectivityInvestmentCountStories:' + JSON.stringify(connectivityInvestmentCountStories));
            JIRAConnector.logger.debug('connectivityInvestmentCountDoneStories:' + JSON.stringify(connectivityInvestmentCountDoneStories));
            /*
             comboObjs.forEach((x) => {
             console.log('x:' + JSON.stringify(x));
             console.log('x:' + x);
             console.log('x.pmstory:' + x.pmstory);
             console.log('x.enggstories:' + x.enggstories);

             x.enggstories.forEach ((enggstory) => {
             console.log(enggstory);
             })

             });
             */
            JIRAConnector.getGroomingHealth((err, groomingScrums, groomingHealthEngg, groomingHealthPM, groomingHealthCountStories, groomingHealthCountStoriesPMReviewed) => {
                JIRAConnector.logger.debug('groomingScrums:' + JSON.stringify(groomingScrums));
                JIRAConnector.logger.debug('groomingHealthEngg:' + JSON.stringify(groomingHealthEngg));
                JIRAConnector.logger.debug('groomingHealthPM:' + JSON.stringify(groomingHealthPM));
                JIRAConnector.getPMStoryChanges(startDateMsec, endDateMsec, (err, changedPMStories) => {
                    JIRAConnector.logger.debug('changedPMStories:' + JSON.stringify(changedPMStories));
                    JIRAConnector.logger.debug('iterationSummary:' + JSON.stringify(iterationSummary));
                    res.render('base.jade', {
                        groomingScrums: groomingScrums,
                        groomingHealthEngg: groomingHealthEngg,
                        groomingHealthPM: groomingHealthPM,
                        groomingHealthCountStories: groomingHealthCountStories,
                        groomingHealthCountStoriesPMReviewed: groomingHealthCountStoriesPMReviewed,
                        iterationSummary: iterationSummary,
                        changedPMStories: changedPMStories,
                        scrums: scrums,
                        ComboObjs: comboObjs,
                        connectivityInvestmentBuckets: connectivityInvestmentBuckets,
                        connectivityInvestmentStoryPoints: connectivityInvestmentStoryPoints,
                        connectivityInvestmentDoneStoryPoints: connectivityInvestmentDoneStoryPoints,
                        connectivityInvestmentCountStories: connectivityInvestmentCountStories,
                        connectivityInvestmentCountDoneStories: connectivityInvestmentCountDoneStories
                    });
                });
            });
        }
    });

});

router.get('/ingrooming', (req, res, next) => {
    JIRAConnector.logger.debug('req.query.type:' + req.query.type);
    // console.log('req.query.which:' + req.query.which);
    getModel().fetchIterationView(req.query.type, false, (err, scrums, comboObjs, connectivityInvestmentBuckets, connectivityInvestmentStoryPoints, connectivityInvestmentDoneStoryPoints, connectivityInvestmentCountStories, connectivityInvestmentCountDoneStories, iterationSummary, iterations, startDateMsec, endDateMsec) => {
        if (err) {
            JIRAConnector.logger.error(err);
            return;
        }
        if(!comboObjs) {
            JIRAConnector.logger.error('ComboObjs in null.');
            return;
        }
        // console.log(pmstories);
        if(comboObjs) {
            JIRAConnector.logger.debug('returned all the combo objs. Ready to send HTML');
            JIRAConnector.logger.debug('comboObjs:' + JSON.stringify(comboObjs));
            JIRAConnector.logger.debug('scrums:' + JSON.stringify(scrums));
            JIRAConnector.logger.debug('connectivityInvestmentBuckets:' + JSON.stringify(connectivityInvestmentBuckets));
            JIRAConnector.logger.debug('connectivityInvestmentStoryPoints:' + JSON.stringify(connectivityInvestmentStoryPoints));
            JIRAConnector.logger.debug('connectivityInvestmentCountStories:' + JSON.stringify(connectivityInvestmentCountStories));
            JIRAConnector.logger.debug('connectivityInvestmentCountDoneStories:' + JSON.stringify(connectivityInvestmentCountDoneStories));
            /*
             comboObjs.forEach((x) => {
             console.log('x:' + JSON.stringify(x));
             console.log('x:' + x);
             console.log('x.pmstory:' + x.pmstory);
             console.log('x.enggstories:' + x.enggstories);

             x.enggstories.forEach ((enggstory) => {
             console.log(enggstory);
             })

             });
             */
            JIRAConnector.getGroomingHealth((err, groomingScrums, groomingHealthEngg, groomingHealthPM, groomingHealthCountStories, groomingHealthCountStoriesPMReviewed) => {
                JIRAConnector.logger.debug('groomingScrums:' + JSON.stringify(groomingScrums));
                JIRAConnector.logger.debug('groomingHealthEngg:' + JSON.stringify(groomingHealthEngg));
                JIRAConnector.logger.debug('groomingHealthPM:' + JSON.stringify(groomingHealthPM));
                JIRAConnector.getPMStoryChanges(startDateMsec, endDateMsec, (err, changedPMStories) => {
                    JIRAConnector.logger.debug('changedPMStories:' + JSON.stringify(changedPMStories));
                    JIRAConnector.logger.debug('iterationSummary:' + JSON.stringify(iterationSummary));
                    res.render('base.jade', {
                        groomingScrums: groomingScrums,
                        groomingHealthEngg: groomingHealthEngg,
                        groomingHealthPM: groomingHealthPM,
                        groomingHealthCountStories: groomingHealthCountStories,
                        groomingHealthCountStoriesPMReviewed: groomingHealthCountStoriesPMReviewed,
                        iterationSummary: iterationSummary,
                        changedPMStories: changedPMStories,
                        scrums: scrums,
                        ComboObjs: comboObjs,
                        connectivityInvestmentBuckets: connectivityInvestmentBuckets,
                        connectivityInvestmentStoryPoints: connectivityInvestmentStoryPoints,
                        connectivityInvestmentDoneStoryPoints: connectivityInvestmentDoneStoryPoints,
                        connectivityInvestmentCountStories: connectivityInvestmentCountStories,
                        connectivityInvestmentCountDoneStories: connectivityInvestmentCountDoneStories
                    });
                });
            });
        }
    });

});

/**
 * GET /books/add
 *
 * Display a form for creating a book.
 */
// [START add_get]
router.get('/add', (req, res) => {
  res.render('books/form.jade', {
    book: {},
    action: 'Add'
  });
});
// [END add_get]

/**
 * POST /books/add
 *
 * Create a book.
 */
// [START add_post]
router.post('/add', (req, res, next) => {
  const data = req.body;

  // Save the data to the database.
  getModel().create(data, (err, savedData) => {
    if (err) {
      next(err);
      return;
    }
    res.redirect(`${req.baseUrl}/${savedData.id}`);
  });
});
// [END add_post]

/**
 * GET /books/:id/edit
 *
 * Display a book for editing.
 */
router.get('/:book/edit', (req, res, next) => {
  getModel().read(req.params.book, (err, entity) => {
    if (err) {
      next(err);
      return;
    }
    res.render('books/form.jade', {
      book: entity,
      action: 'Edit'
    });
  });
});

/**
 * POST /books/:id/edit
 *
 * Update a book.
 */
router.post('/:book/edit', (req, res, next) => {
  const data = req.body;

  getModel().update(req.params.book, data, (err, savedData) => {
    if (err) {
      next(err);
      return;
    }
    res.redirect(`${req.baseUrl}/${savedData.id}`);
  });
});

/**
 * GET /books/:id
 *
 * Display a book.
 */

/*
router.get('/:book', (req, res, next) => {
  getModel().read(req.params.book, (err, entity) => {
    if (err) {
      next(err);
      return;
    }
    res.render('books/view.jade', {
      book: entity
    });
  });
});
*/

/**
 * GET /books/:id/delete
 *
 * Delete a book.
 */
router.get('/:book/delete', (req, res, next) => {
  getModel().delete(req.params.book, (err) => {
    if (err) {
      next(err);
      return;
    }
    res.redirect(req.baseUrl);
  });
});

/**
 * Errors on "/books/*" routes.
 */
router.use((err, req, res, next) => {
  // Format error and forward to generic error handler for logging and
  // responding to the request
  err.response = err.message;
  next(err);
});

module.exports = router;
