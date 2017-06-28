/**
 * Created by vikas.bansal on 12/04/17.
 */

'use strict';

const config = require('./config');
const Datastore = require('@google-cloud/datastore');
var winston = require('winston');
// require('winston-gae');

const tsFormat = () => (new Date()).toString();

const logger = new (winston.Logger)({
    transports: [
        // colorize the output to the console
        new (winston.transports.Console)({
            timestamp: tsFormat,
            colorize: true,
        })
    ]
});

logger.level = 'debug';


// [START config]

function getModel() {
    return require(`./model-${config.get('DATA_BACKEND')}`);
}

process.argv.forEach(function (val, index, array) {
    // console.log(index + ': ' + val);
    if (val == 'cleanEngg') {
        getModel().deleteAllStories('EnggStory', (err) => {
            if (err) logger.error(err);
            else logger.debug('In callback after deleting EnggStory');
            return;
        });
        logger.info('EnggStory entities should be deleted after all callbacks are complete.');
        return;
    }

    if (val == 'clearLastUpdateTime') {
        getModel().deleteByName('lastUpdateTime', 'lastUpdateTime', (err) => {
            if (err) logger.error(err);
            else logger.debug('In callback after deleting entity lastUpdateTime');
            return;
        });
        logger.info('lastUpdateTime entities should be deleted after all callbacks are complete.');
        return;
    }


    if (val == 'cleanPM') {
        getModel().deleteAllStories('PMStory', (err) => {
            if (err) console.log(err);
            else console.log('In callback after deleting PMStory');
            return;
        });
        console.log('PMStory entities should be deleted after all callbacks are complete.');
        return;
    }

    if (val == 'deleteAll') {
        getModel().deleteAllStoriesIteratively((err) => {
            if (err) console.log(err);
            else
                console.log('In callback after deleting PMStory');
            return;
        })
        ;
        console.log('PMStories & EnggStories should be deleted after all callbacks are complete');
        return;
    }
    if (val == 'import') {
        importData(array[index + 1]);
        return;
    }
    if (val == 'checkRulesAndImport') {
        CheckRulesAndUpdateData(array[index + 1]);
        return;
    }
    if (val == 'addPMAsWatcher') {
        addPMasWatcherToEnggStories('all');
        return;
    }
    if (val == 'checkRulesAndImportScheduler') {

        var rule = new schedule.RecurrenceRule();
        // rule.hour = 1;
        rule.second = 5;

        addWatcherScheduler = schedule.scheduleJob(rule, function () {
            console.log('calling scheduler to checkRulesAndImport');
            // addPMasWatcherToEnggStories('all');
            CheckRulesAndUpdateData('CDN-3');
        });
        console.log('Ending the addWatcher if statement');
        return;
    }
    if (val == 'cancelAddWatcher') {
        addWatcherScheduler.cancel();
        return;
    }
    if (val == 'readAll') {
        getModel().readAll('PMStories');
        return;
    }
    if (val == 'printPMStories') {
        getModel().fetchPMEntities(function (err, entities) {
            if (err) {
                console.log(err);
            }
            if (entities) {
                console.log(entities);
            }
        });
        return;
    }
    if (val == 'printEnggStories') {
        getModel().fetchEnggEntities(function (err, entities) {
            if (err) {
                console.log(err);
            }
            if (entities) {
                console.log('hello');
                console.log(entities);
            }
        });
        return;
    }
    if (val == 'createEventEntities') {
        createEventEntities();
        return;
    }
    if (val == 'deltaAgg') {
        _deltaAgg(array[index + 1]);
        return;
    }
    if (val == 'createCONIteration') {
        createCONIteration();
        return;
    }
    if (val == 'createIteration') {
        createIteration(array[index + 1]);
        return;
    }
});

function createCONIteration() {

    // let's create 20 CONIterations i.e. 'CON - Iteration 01' thru 'CON - Iteration 20'
    var startDateMsecCONIteration01 = new Date('2015-12-20T18:00:00.000-05:00').getTime();
    // var endDateMsecCONIteration01 = new Date('1-Jan-2016').getTime();

    for (var i = 1; i <= 20; i++) {
        var iterationName;
        if (i < 10) iterationName = 'CON - Iteration 0' + i;
        else iterationName = 'CON - Iteration ' + i;
        var startDateMsec = startDateMsecCONIteration01 + ((i-1)*14*24*60*60*1000);
        var endDateMsec = startDateMsec + 14*24*60*60*1000 - 1;
        // logger.debug('endDateMsecCONIteration01 + (i*14*24*60*60*1000):' + (endDateMsecCONIteration01 + (i*14*24*60*60*1000)));
        var iterationData = [
            {
                name: 'startDate',
                value: new Date(startDateMsec)
            },
            {
                name: 'startDateMsec',
                value: startDateMsec
            },
            {
                name: 'endDate',
                value: new Date(endDateMsec)
            },
            {
                name: 'endDateMsec',
                value: endDateMsec
            }
            ];

        getModel().createIteration(iterationName, iterationData, (err, itrName, itrData) => {
            if(err) logger.error(err);
            else logger.info(itrName + ' created.' + 'itrData:' + JSON.stringify(itrData));
        });
        if (i == 9) {
            getModel().createIteration('CON - Iteration 9', iterationData, (err, itrName, itrData) => {
                if(err) logger.error(err);
                else logger.info(itrName + ' created.' + 'itrData:' + JSON.stringify(itrData));
            });
        }
    }
}

function createIteration(reqDate) {
    // let's create 20 CONIterations i.e. 'CON - Iteration 01' thru 'CON - Iteration 20'
    if (!reqDate) {
        logger.error('Provide date until when iterations are to be created');
        return;
    }
    var startDateMsecIteration01 = new Date('2017-01-08T18:00:00.000-05:00').getTime();
    var continueIterationCreation = true;
    var reqDateMsec = new Date(reqDate);

    for (var i = 1; continueIterationCreation; i++) {
        var iterationName;
        var startDateMsec = startDateMsecIteration01 + ((i-1)*14*24*60*60*1000);
        var endDateMsec = startDateMsec + 14*24*60*60*1000 - 1;
        if (endDateMsec > reqDateMsec) {
            logger.info('endDateMsec > reqDateMsec, ' + ' endDateMsec:' + endDateMsec + ' reqDateMsec:' + reqDateMsec );
            return;
        }
        if (i < 10) iterationName = 'Iteration 0' + i + ' - 2017';
        else iterationName = 'Iteration ' + i + ' - 2017';

        logger.debug('iterationName:' + iterationName);
        var iterationData = [
            {
                name: 'startDate',
                value: new Date(startDateMsec)
            },
            {
                name: 'startDateMsec',
                value: startDateMsec
            },
            {
                name: 'endDate',
                value: new Date(endDateMsec)
            },
            {
                name: 'endDateMsec',
                value: endDateMsec
            }
        ];

        getModel().upsertIteration(iterationName, iterationData, (err, newIterationData, newIterationName) => {
            if(err) {
                logger.error(err);
                return;
            }
            if (iterationData) {
                logger.info('upsertIteration: iterationName:' + newIterationName + '. Start date:' + newIterationData.startDate + '. End date:' + newIterationData.endDate);
                return;
            }
        });
    }
}