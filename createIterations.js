/**
 * Created by vikas.bansal on 12/04/17.
 */

'use strict';

const config = require('./config');
const Datastore = require('@google-cloud/datastore');
var winston = require('winston');

var moment = require('moment');

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
    if (val == 'createCONIteration') {
        createCONIteration();
        return;
    }
    if (val == 'createIteration') {
        _create2017Iterations(array[index + 1]);
        return;
    }
});

function _create2016Iterations(cb) {

    // let's create 20 CONIterations i.e. 'CON - Iteration 01' thru 'CON - Iteration 20'
    var startDateMsecCONIteration01 = new Date('2015-12-20T18:00:00.000-05:00').getTime();
    // var endDateMsecCONIteration01 = new Date('1-Jan-2016').getTime();

    var counter = 21;

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
                value: moment(new Date(startDateMsec)).format()
            },
            {
                name: 'startDateMsec',
                value: startDateMsec
            },
            {
                name: 'endDate',
                value: moment(new Date(endDateMsec)).format()
            },
            {
                name: 'endDateMsec',
                value: endDateMsec
            }
            ];

        getModel().createIteration(iterationName, iterationData, (err, itrName, itrData) => {
            if(err) {
                counter--;
                logger.error(err);
                return cb (err);
            }
            else {
                counter--;
                logger.info(itrName + ' created.' + 'itrData:' + JSON.stringify(itrData));
            }
        });
        if (i == 9) {
            getModel().createIteration('CON - Iteration 9', iterationData, (err, itrName, itrData) => {
                if(err) {
                    counter--;
                    logger.error(err);
                    return cb (err);
                }
                else {
                    counter--;
                    logger.info(itrName + ' created.' + 'itrData:' + JSON.stringify(itrData));
                }
            });
        }
    }
    if (counter == 0) return cb (null);
}

function _create2017Iterations(reqDate, cb) {
    // let's create 20 CONIterations i.e. 'CON - Iteration 01' thru 'CON - Iteration 20'
    if (!reqDate) {
        logger.error('Provide date until when iterations are to be created. Date format: YYYY-MM-DD');
        return cb ('Provide date until when iterations are to be created. Date format: YYYY-MM-DD');
    }
    var startDateMsecIteration01 = new Date('2017-01-08T18:00:00.000-05:00').getTime();
    var continueIterationCreation = true;
    var reqDateMsec = new Date(reqDate);

    var countIterationsRequested = 0;
    var countIterationsRequestedAttempted = 0;

    for (var i = 1; continueIterationCreation; i++) {
        var iterationName;
        var startDateMsec = startDateMsecIteration01 + ((i-1)*14*24*60*60*1000);
        var endDateMsec = startDateMsec + 14*24*60*60*1000 - 1;
        if (endDateMsec <= reqDateMsec) {
            countIterationsRequested++;
            if (i < 10) iterationName = 'Iteration 0' + i + ' - 2017';
            else iterationName = 'Iteration ' + i + ' - 2017';

            logger.debug('iterationName:' + iterationName);
            var iterationData = [
                {
                    name: 'startDate',
                    value: moment(new Date(startDateMsec)).format()
                },
                {
                    name: 'startDateMsec',
                    value: startDateMsec
                },
                {
                    name: 'endDate',
                    value: moment(new Date(endDateMsec)).format()
                },
                {
                    name: 'endDateMsec',
                    value: endDateMsec
                }
            ];

            getModel().upsertIteration(iterationName, iterationData, (err, newIterationData, newIterationName) => {
                if(err) {
                    countIterationsRequestedAttempted++;
                    logger.error(err);
                    return cb (err);
                }
                if (newIterationData) {
                    countIterationsRequestedAttempted++;
                    logger.info('upsertIteration: iterationName:' + newIterationName + '. Start date:' + newIterationData.startDate + '. End date:' + newIterationData.endDate);
                    // return;
                }
            });
        }
        else {
            logger.info('endDateMsec > reqDateMsec, ' + ' endDateMsec:' + endDateMsec + ' reqDateMsec:' + reqDateMsec );
            continueIterationCreation = false;
        }
    }

    if (countIterationsRequested == countIterationsRequestedAttempted) return cb (null);
}

module.exports = {
    create2016Iterations: _create2016Iterations,
    create2017Iterations: _create2017Iterations
}