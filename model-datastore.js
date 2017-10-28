/**
 * Created by vikas.bansal on 17/04/17.
 */

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


const JIRAConnector = require('./JIRAConnector.js');
var https = require('https');

const Datastore = require('@google-cloud/datastore');
const config = require('./config');
const twoWksInMsec = 14*24*60*60*1000;
const oneDayInMsec = 24*60*60*1000;
const waitTimeForRetry = 5*1000; //5 seconds
const AllStories = 1;
const OnlyPickedUpInIteration = 2;
const OnlyAcceptedInIteration = 3;

// [START config]
const ds = Datastore({
    projectId: config.get('GCLOUD_PROJECT')
    // projectId: "pmproject-164704"
});

var winston = require('winston');

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

// const kind = 'PMStory';
// [END config]

// Translates from Datastore's entity format to
// the format expected by the application.
//
// Datastore format:
//   {
//     key: [kind, id],
//     data: {
//       property: value
//     }
//   }
//
// Application format:
//   {
//     id: id,
//     property: value
//   }
function fromDatastore (obj) {
    obj.data.id = obj.key.id;
    return obj.data;
}

function fromDatastoreName (obj) {
    obj.data.name = obj.key.name;
    return obj.data;
}

// Translates from the application's format to the datastore's
// extended entity property format. It also handles marking any
// specified properties as non-indexed. Does not translate the key.
//
// Application format:
//   {
//     id: id,
//     property: value,
//     unindexedProperty: value
//   }
//
// Datastore extended format:
//   [
//     {
//       name: property,
//       value: value
//     },
//     {
//       name: unindexedProperty,
//       value: value,
//       excludeFromIndexes: true
//     }
//   ]
function toDatastore (obj, nonIndexed) {
    nonIndexed = nonIndexed || [];
    const results = [];
    Object.keys(obj).forEach((k) => {
        if (obj[k] === undefined) {
        return;
    }
    results.push({
        name: k,
        value: obj[k],
        excludeFromIndexes: nonIndexed.indexOf(k) !== -1
    });
});
    return results;
}

// Lists all books in the Datastore sorted alphabetically by title.
// The ``limit`` argument determines the maximum amount of results to
// return per page. The ``token`` argument allows requesting additional
// pages. The callback is invoked with ``(err, books, nextPageToken)``.
// [START list]
function list (kind, cb) {
    const q = ds.createQuery([kind]);
        //.limit(limit);
        //.order('title')
        //.start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        cb(null, entities.map(fromDatastore), hasMore);
    });
}
// [END list]

function fetchEnggStory (enggstoryid, cb) {
    const EnggStoryKey = ds.key(['EnggStories', parseInt(pmstoryid, 10)]);
    // const PMStoryKey = ds.key(['PMStories', pmstoryid]);
    const q = ds.createQuery(['EnggStories'])
        .filter('id', enggstoryid);
    //.limit(limit);
    //.order('title')
    //.start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        if (entities.length == 0) {
            cb(null);
        }

        if (entities.length == 1) {
            cb(entities);
        }
    })
}

function fetchEnggStories (pmstoryid, cb) {
    const PMStoryKey = ds.key(['PMStories', parseInt(pmstoryid, 10)]);
    // const PMStoryKey = ds.key(['PMStories', pmstoryid]);
    const q = ds.createQuery(['EnggStories'])
        .hasAncestor(PMStoryKey);
    //.limit(limit);
    //.order('title')
    //.start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        cb(null, entities.map(fromDatastore), hasMore);
    });
}

function asyncFetchEvents (cb) {
    // console.log('asyncFetchEvents:');
    const q = ds.createQuery(['Event']);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        if (!entities) {
            cb('Something wrong. No `Event` objects found');
        }
        if (entities) {
            var count = entities.length;
            var returnObj = [];
            if (entities.length == 0) {
                console.log('There are no `Events`.');
                // returnObj.push([]);
                cb(null, null);
            }
            for (var i=0; i < entities.length; i++) {
                returnObj.push(fromDatastoreName(entities[i]));
                // console.log('pushed Entity:' + entities[i].key.name);
                count --;
                if(count == 0) {
                    // console.log('completed pushing `Event` objects');
                    cb(null, returnObj);
                }
            }
        }
    });
}

function _getPMStoryIDFromPMStoryKey(PMStoryKey, cb) {
    const q = ds.createQuery(['PMStory'])
        .filter('currentKey', '=', PMStoryKey);
    ds.runQuery(q, (err, PMEntities, nextQuery) => {
        if (err) {
            logger.error(err);
            return cb(err, null, null);
        }
        if (!PMEntities) {
            logger.error('Something wrong. Could not get PMStory for PMStoryKey:' + PMStoryKey);
            return cb('Something wrong. Could not get PMStory for PMStoryKey:' + PMStoryKey, null, null);
        }
        if (PMEntities.length > 1) {
            logger.error('Multiple PMStories found for PMStoryKey:' + PMStoryKey);
            return cb('Multiple PMStories found for PMStoryKey:' + PMStoryKey, null, null);
        }
        if (PMEntities.length == 0) {
            logger.info('No PMStoryEntity yet for PMStoryKey:' + PMStoryKey + '. Need to get it from JIRA.');
            return cb(null, null, null);
        }
        logger.debug('PMStoryID:' + PMEntities[0].key.id);
        return cb (null, PMEntities[0].key.id, PMEntities[0].data.PMOwner);
    });
}

function getEnggStoriesOfIteration(iterationName, cb) {
    const q = ds.createQuery(['EnggStory'])
        .filter('sprintsTravelled', '=', iterationName);

    ds.runQuery(q, (err, EnggEntities, nextQuery) => {
        if (err) {
            logger.error(err);
            return cb(err, null);
        }
        if (!EnggEntities) {
            return cb('Something wrong. Could not get enggStories changed in iteration: ' + iterationName, null);
        }
        return cb (null, EnggEntities);
    });
}

function asyncFetchEnggStoriesForADuration (iterations, cb) {
    var allEnggEntities = [];
    var count = 0;
    logger.debug('asyncFetchEnggStoriesForADuration: iterations:' + JSON.stringify(iterations));
    if (!iterations || iterations.length == 0) {
        logger.info('asyncFetchEnggStoriesForADuration: iterations object is either null or empty: ' + iterations);
        return cb('asyncFetchEnggStoriesForADuration: iterations object is either null or empty: ' + iterations, null);
    }

    logger.debug('iterations.length:' + iterations.length);
    for (var iterationCount = 0; iterationCount < iterations.length; iterationCount++) {
        getEnggStoriesOfIteration(iterations[iterationCount], (err, enggEntities) => {
            if (err) logger.error(err);
            else allEnggEntities = allEnggEntities.concat(enggEntities);
            count ++;
            if (count == iterations.length) cb(null, allEnggEntities);
        });
    }
}

function processEnggStoriesForADuration (EnggEntities, iterationStartDateMsec, iterationEndDateMsec, cb) {

    if (EnggEntities) {
            // logger.debug('entities:' + JSON.stringify(entities));
            // lets iteration thru all entities and get their PMStory Ids so we can query all PMStory Entities also
            var keys = [];
            var EnggStoriesOfAPMStory = [];
            var EnggStoriesWithNullPMStory = [];
            var uniquePMStories =  [];
            var comboObj = [];
            logger.debug('processEnggStoriesForADuration:EnggEntities:' + JSON.stringify(EnggEntities));
            logger.debug('processEnggStoriesForADuration:EnggEntities.length:' + EnggEntities.length);
            for (var k = 0; k < EnggEntities.length; k++) {
                logger.debug('k:' + k + ', EnggEntities[k]:' + JSON.stringify(EnggEntities[k]));
                logger.debug('EnggEntities[k].key.id:' + EnggEntities[k].key.id);
                logger.debug('EnggEntities[k].data.PMStoryID:' + EnggEntities[k].data.PMStoryID);
                if (!EnggEntities[k].data.PMStoryID) EnggStoriesWithNullPMStory.push(EnggEntities[k]);
                else if (uniquePMStories.indexOf(EnggEntities[k].data.PMStoryID) == -1) {
                    uniquePMStories.push(EnggEntities[k].data.PMStoryID);
                    keys.push(ds.key(['PMStory', EnggEntities[k].data.PMStoryID]));
                }
            }
            ds.get(keys, (err, PMEntities) => {
                if (err) {
                    logger.error(err);
                    logger.debug('asyncFetchEnggStories:count:' + count);
                    return cb (err);
                }
                else {
                    var count = PMEntities.length;
                    if (count != keys.length) {
                        logger.info('Some PMStory Entities not present in Google Datastore.')
                        for (var k=0; k < keys.length; k++) {
                            var flagKeyFound = false;
                            for (var z=0; z < PMEntities.length; z++) {
                                if (keys[k].id == PMEntities[z].key.id) {
                                    flagKeyFound = true;
                                    break;
                                }
                            }
                            if (!flagKeyFound) logger.error ('PMEntity not found for PMStoryID:' + keys[k].id);
                        }
                    }
                    if (EnggStoriesWithNullPMStory.length > 0) {
                        PMEntities.push(null);
                        count ++;
                        logger.debug('EnggStoriesWithNullPMStory:' + JSON.stringify(EnggStoriesWithNullPMStory));
                    }

                    PMEntities.forEach(function (PMEntity) {
                            fetchEnggStoriesOfPMStory(iterationStartDateMsec, iterationEndDateMsec, PMEntity, EnggStoriesWithNullPMStory, (err, specificComboObj) => {
                                if (err) {
                                    logger.error(err);
                                    count --;
                                    logger.debug('separate:asyncFetchEnggStories:count:' + count);
                                    if (count == 0) return cb(null, comboObj);
                                }
                                else {
                                    comboObj.push(specificComboObj);
                                    count --;
                                    logger.debug('separate:asyncFetchEnggStories:count:' + count);
                                    if (count == 0) return cb(null, comboObj);
                                }
                            })
                        }
                    );
                }
            });
        }
}

function processOnlyPickedUpEnggStoriesForADuration (EnggEntities, iterationStartDateMsec, iterationEndDateMsec, flagOnlyEnggStoriesPickedUpInIteration, cb) {

    if (EnggEntities) {
        // logger.debug('entities:' + JSON.stringify(entities));
        // lets iteration thru all entities and get their PMStory Ids so we can query all PMStory Entities also
        var keys = [];
        var EnggStoriesOfAPMStory = [];
        var EnggStoriesWithNullPMStory = [];
        var CurrentKeyEnggStoriesWithNullPMStory = [];
        var uniquePMStories =  [];
        var comboObj = null;
        var scrums = null;
        var connectivityInvestmentBuckets = null;
        var connectivityInvestmentStoryPoints = null;
        var connectivityInvestmentCountStories = null;
        var connectivityInvestmentDoneStoryPoints = null;
        var connectivityInvestmentCountDoneStories = null;
        var iterationHealthScrums = null;
        var iterationHealthStoryPoints = null;
        var iterationHealthCountStories = null;
        var iterationHealthDoneStoryPoints = null;
        var iterationHealthCountDoneStories = null;

        logger.debug('processEnggStoriesForADuration:EnggEntities:' + JSON.stringify(EnggEntities));
        logger.debug('processEnggStoriesForADuration:EnggEntities.length:' + EnggEntities.length);
        for (var k = 0; k < EnggEntities.length; k++) {
            logger.debug('k:' + k + ', EnggEntities[k]:' + JSON.stringify(EnggEntities[k]));
            logger.debug('EnggEntities[k].key.id:' + EnggEntities[k].key.id);
            logger.debug('EnggEntities[k].data.PMStoryID:' + EnggEntities[k].data.PMStoryID);
            if (!EnggEntities[k].data.PMStoryID) {
                EnggStoriesWithNullPMStory.push(EnggEntities[k]);
                CurrentKeyEnggStoriesWithNullPMStory.push(EnggEntities[k].data.currentKey);
            }
            else {
                var indexOfPMStoryID = uniquePMStories.indexOf(EnggEntities[k].data.PMStoryID);
                if (indexOfPMStoryID == -1) {
                    EnggStoriesOfAPMStory.push([EnggEntities[k].data.currentKey]);
                    uniquePMStories.push(EnggEntities[k].data.PMStoryID);
                    keys.push(ds.key(['PMStory', EnggEntities[k].data.PMStoryID]));
                }
                else {
                    logger.debug('EnggStoriesOfAPMStory[indexOfPMStoryID]:' + EnggStoriesOfAPMStory[indexOfPMStoryID]);
                    EnggStoriesOfAPMStory[indexOfPMStoryID].push(EnggEntities[k].data.currentKey);

                    // let currentEnggStoriesOfAPMStoryArray = EnggStoriesOfAPMStory[indexOfPMStoryID];
                    /*
                    for (let x = 0; x < EnggStoriesOfAPMStory[indexOfPMStoryID].length; x++) {
                        if (EnggEntities[k].data.currentKey < (EnggStoriesOfAPMStory[indexOfPMStoryID])[x].data.currentKey) {
                            EnggStoriesOfAPMStory[indexOfPMStoryID].splice(x, 0, EnggEntities[k]);
                            break;
                        }
                    }
                    */

                }
            }
        }
        ds.get(keys, (err, PMEntities) => {
            if (err) {
                logger.error(err);
                logger.debug('asyncFetchEnggStories:count:' + count);
                return cb (err);
            }
            else {
                var count = PMEntities.length;
                if (count != keys.length) {
                    logger.info('Some PMStory Entities not present in Google Datastore.')
                    for (var k=0; k < keys.length; k++) {
                        var flagKeyFound = false;
                        for (var z=0; z < PMEntities.length; z++) {
                            if (keys[k].id == PMEntities[z].key.id) {
                                flagKeyFound = true;
                                break;
                            }
                        }
                        if (!flagKeyFound) logger.error ('PMEntity not found for PMStoryID:' + keys[k].id);
                    }
                }
                if (EnggStoriesWithNullPMStory.length > 0) {
                    // PMEntities.push(null);
                    PMEntities.splice(0, 0, null);
                    count ++;
                    logger.debug('EnggStoriesWithNullPMStory:' + JSON.stringify(EnggStoriesWithNullPMStory));
                }

                PMEntities.forEach(function (PMEntity) {
                    fetchEnggStoriesOfPMStory(PMEntity, EnggStoriesWithNullPMStory, (err, EnggEntities) => {
                        if (err) {
                            logger.error(err);
                            count--;
                            logger.debug('processOnlyPickedUpEnggStoriesForADuration:count:' + count);
                            if (count == 0) return cb(null, scrums, comboObj);
                        }
                        else {
                            buildSpecificComboObj(iterationStartDateMsec, iterationEndDateMsec, PMEntity ? PMEntity.data : null, EnggEntities, PMEntity ? EnggStoriesOfAPMStory[uniquePMStories.indexOf(PMEntity.key.id)] : CurrentKeyEnggStoriesWithNullPMStory, flagOnlyEnggStoriesPickedUpInIteration, (err, scrum, specificComboObj) => {
                                if (err) {
                                    logger.error(err);
                                    count--;
                                    logger.debug('processOnlyPickedUpEnggStoriesForADuration:count:' + count);
                                    if (count == 0) return cb(null, scrums, comboObj);
                                }
                                else {
                                    logger.debug('After buildSpecificComboObj(), scrum:' + scrum + ', specificComboObj:' + JSON.stringify(specificComboObj));
                                    if (!scrums && !comboObj) {
                                        scrums = [scrum];
                                        comboObj = [[specificComboObj]];
                                    }
                                    else {
                                        var scrumIndex = scrums.indexOf(scrum);
                                        if (scrumIndex == -1) {
                                            for (var scrumOrder = 0; scrumOrder < scrums.length; scrumOrder++) {
                                                if (!scrum) {
                                                    scrums.splice(0, 0, scrum);
                                                    comboObj.splice(0, 0, [specificComboObj]);
                                                    break;
                                                }
                                                if (scrums[scrumOrder] > scrum) {
                                                    scrums.splice(scrumOrder, 0, scrum);
                                                    comboObj.splice(scrumOrder, 0, [specificComboObj]);
                                                    break;
                                                }
                                                else if (scrumOrder == scrums.length - 1) {
                                                    scrums.push(scrum);
                                                    comboObj.push([specificComboObj]);
                                                    break;
                                                }
                                            }
                                        }
                                        else {
                                            for (var pmStoryOrder = 0; pmStoryOrder < comboObj[scrumIndex].length; pmStoryOrder++) {
                                                if ((comboObj[scrumIndex])[pmStoryOrder].pmstory.key > specificComboObj.pmstory.key) {
                                                    comboObj[scrumIndex].splice(pmStoryOrder, 0, specificComboObj);
                                                    break;
                                                }
                                                else if(pmStoryOrder == comboObj[scrumIndex].length - 1) {
                                                    comboObj[scrumIndex].push(specificComboObj);
                                                    break;
                                                }
                                            }
                                        }
                                    }

                                    if (specificComboObj.pmstory) {
                                        if (!connectivityInvestmentBuckets) {
                                            connectivityInvestmentBuckets = [specificComboObj.pmstory.connectivityInvestment];
                                            connectivityInvestmentStoryPoints = [specificComboObj.pmstory.storyPoints];
                                            connectivityInvestmentCountStories = [specificComboObj.pmstory.countStoriesThisIteration];
                                            connectivityInvestmentDoneStoryPoints = [specificComboObj.pmstory.doneStoryPoints];
                                            connectivityInvestmentCountDoneStories = [specificComboObj.pmstory.storiesDoneThisIteration];
                                        }
                                        else if (connectivityInvestmentBuckets.indexOf(specificComboObj.pmstory.connectivityInvestment) == -1) {
                                            for (var connInvestIndex = 0; connInvestIndex < connectivityInvestmentBuckets.length; connInvestIndex++) {
                                                if (connectivityInvestmentBuckets[connInvestIndex] > specificComboObj.pmstory.connectivityInvestment) {
                                                    connectivityInvestmentBuckets.splice(connInvestIndex, 0, specificComboObj.pmstory.connectivityInvestment);
                                                    connectivityInvestmentStoryPoints.splice(connInvestIndex, 0, specificComboObj.pmstory.storyPoints);
                                                    connectivityInvestmentCountStories.splice(connInvestIndex, 0, specificComboObj.pmstory.countStoriesThisIteration);
                                                    connectivityInvestmentDoneStoryPoints.splice(connInvestIndex, 0, specificComboObj.pmstory.doneStoryPoints);
                                                    connectivityInvestmentCountDoneStories.splice(connInvestIndex, 0, specificComboObj.pmstory.storiesDoneThisIteration);
                                                    break;
                                                }
                                                else if(connInvestIndex == connectivityInvestmentBuckets.length - 1) {
                                                    connectivityInvestmentBuckets.push(specificComboObj.pmstory.connectivityInvestment);
                                                    connectivityInvestmentStoryPoints.push(specificComboObj.pmstory.storyPoints);
                                                    connectivityInvestmentCountStories.push(specificComboObj.pmstory.countStoriesThisIteration);
                                                    connectivityInvestmentDoneStoryPoints.push(specificComboObj.pmstory.doneStoryPoints);
                                                    connectivityInvestmentCountDoneStories.push(specificComboObj.pmstory.storiesDoneThisIteration);
                                                    break;
                                                }
                                            }
                                        }
                                        else {
                                            connectivityInvestmentStoryPoints[connectivityInvestmentBuckets.indexOf(specificComboObj.pmstory.connectivityInvestment)] = connectivityInvestmentStoryPoints[connectivityInvestmentBuckets.indexOf(specificComboObj.pmstory.connectivityInvestment)] + specificComboObj.pmstory.storyPoints;
                                            connectivityInvestmentDoneStoryPoints[connectivityInvestmentBuckets.indexOf(specificComboObj.pmstory.connectivityInvestment)] = connectivityInvestmentDoneStoryPoints[connectivityInvestmentBuckets.indexOf(specificComboObj.pmstory.connectivityInvestment)] + specificComboObj.pmstory.doneStoryPoints;
                                            connectivityInvestmentCountStories[connectivityInvestmentBuckets.indexOf(specificComboObj.pmstory.connectivityInvestment)] = connectivityInvestmentCountStories[connectivityInvestmentBuckets.indexOf(specificComboObj.pmstory.connectivityInvestment)] + specificComboObj.pmstory.countStoriesThisIteration;
                                            connectivityInvestmentCountDoneStories[connectivityInvestmentBuckets.indexOf(specificComboObj.pmstory.connectivityInvestment)] = connectivityInvestmentCountDoneStories[connectivityInvestmentBuckets.indexOf(specificComboObj.pmstory.connectivityInvestment)] + specificComboObj.pmstory.storiesDoneThisIteration;
                                        }
                                    }

                                    // let's build iteration summary
                                    for (var idxItrSummary = 0; idxItrSummary < specificComboObj.enggstories.length; idxItrSummary++) {
                                        if (!specificComboObj.enggstories[idxItrSummary].pickedUpInThisIteration) continue;
                                        var itrHealthScrumName = specificComboObj.enggstories[idxItrSummary].currentKey.substring(0, specificComboObj.enggstories[idxItrSummary].currentKey.indexOf('-'));
                                        if (!iterationHealthScrums) {
                                            iterationHealthScrums = [itrHealthScrumName];
                                            iterationHealthCountStories = [1];
                                            if (!isNaN(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd)) iterationHealthStoryPoints = [specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd];
                                            else iterationHealthStoryPoints = [0];
                                            if (specificComboObj.enggstories[idxItrSummary].statusAtIterationEnd == 'Done' || specificComboObj.enggstories[idxItrSummary].statusAtIterationEnd == 'Accepted') {
                                                iterationHealthCountDoneStories = [1];
                                                if (!isNaN(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd)) iterationHealthDoneStoryPoints = [specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd];
                                                else iterationHealthDoneStoryPoints = [0];

                                            }
                                            else {
                                                iterationHealthCountDoneStories = [0];
                                                iterationHealthDoneStoryPoints = [0];
                                            }
                                        }
                                        else if ((iterationHealthScrums.indexOf(itrHealthScrumName)) == -1) {
                                            for (var idxIterationHealthScrums = 0; idxIterationHealthScrums < iterationHealthScrums.length; idxIterationHealthScrums++) {
                                                if (iterationHealthScrums[idxIterationHealthScrums] > itrHealthScrumName) {
                                                    iterationHealthScrums.splice(idxIterationHealthScrums, 0, itrHealthScrumName);
                                                    iterationHealthCountStories.splice(idxIterationHealthScrums, 0, 1);
                                                    if (!isNaN(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd))
                                                        iterationHealthStoryPoints.splice(idxIterationHealthScrums, 0, specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd);
                                                    else
                                                        iterationHealthStoryPoints.splice(idxIterationHealthScrums, 0, 0);
                                                    if (specificComboObj.enggstories[idxItrSummary].statusAtIterationEnd == 'Done' || specificComboObj.enggstories[idxItrSummary].statusAtIterationEnd == 'Accepted') {
                                                        iterationHealthCountDoneStories.splice(idxIterationHealthScrums, 0, 1);
                                                        if (!isNaN(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd))
                                                            iterationHealthDoneStoryPoints.splice(idxIterationHealthScrums, 0, specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd);
                                                        else
                                                            iterationHealthDoneStoryPoints.splice(idxIterationHealthScrums, 0, 0);
                                                    }
                                                    else {
                                                        iterationHealthCountDoneStories.splice(idxIterationHealthScrums, 0, 0);
                                                        iterationHealthDoneStoryPoints.splice(idxIterationHealthScrums, 0, 0);
                                                    }
                                                    break;
                                                }
                                                else if(idxIterationHealthScrums == iterationHealthScrums.length - 1) {
                                                    iterationHealthScrums.push(itrHealthScrumName);
                                                    iterationHealthCountStories.push(1);
                                                    if (!isNaN(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd))
                                                        iterationHealthStoryPoints.push(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd);
                                                    else iterationHealthStoryPoints.push(0);
                                                    if (specificComboObj.enggstories[idxItrSummary].statusAtIterationEnd == 'Done' || specificComboObj.enggstories[idxItrSummary].statusAtIterationEnd == 'Accepted') {
                                                        iterationHealthCountDoneStories.push(1);
                                                        if (!isNaN(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd))
                                                            iterationHealthDoneStoryPoints.push(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd);
                                                        else
                                                            iterationHealthDoneStoryPoints.push(0);
                                                    }
                                                    else {
                                                        iterationHealthCountDoneStories.push(0);
                                                        iterationHealthDoneStoryPoints.push(0);
                                                    }
                                                    break;
                                                }
                                            }
                                        }
                                        else {
                                            let scrumIndexInIterationHealthScrums = iterationHealthScrums.indexOf(itrHealthScrumName);
                                            iterationHealthCountStories[scrumIndexInIterationHealthScrums]++;
                                            if (!isNaN(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd))
                                                iterationHealthStoryPoints[scrumIndexInIterationHealthScrums] =  iterationHealthStoryPoints[scrumIndexInIterationHealthScrums] + specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd;
                                            if (specificComboObj.enggstories[idxItrSummary].statusAtIterationEnd == 'Done' || specificComboObj.enggstories[idxItrSummary].statusAtIterationEnd == 'Accepted') {
                                                iterationHealthCountDoneStories[scrumIndexInIterationHealthScrums]++;
                                                if (!isNaN(specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd))
                                                    iterationHealthDoneStoryPoints[scrumIndexInIterationHealthScrums] =  iterationHealthDoneStoryPoints[scrumIndexInIterationHealthScrums] + specificComboObj.enggstories[idxItrSummary].storyPointsAtIterationEnd;
                                            }
                                        }
                                    }

                                    count--;
                                    logger.debug('processOnlyPickedUpEnggStoriesForADuration:count:' + count);
                                    logger.debug('After buildSpecificComboObj(), scrums:' + JSON.stringify(scrums));
                                    logger.debug('After buildSpecificComboObj(), comboObj:' + JSON.stringify(comboObj));

                                    if (count == 0) return cb(null, scrums, comboObj, connectivityInvestmentBuckets, connectivityInvestmentStoryPoints, connectivityInvestmentDoneStoryPoints, connectivityInvestmentCountStories, connectivityInvestmentCountDoneStories, {'iterationHealthScrums': iterationHealthScrums, 'iterationHealthStoryPoints': iterationHealthStoryPoints, 'iterationHealthCountStories': iterationHealthCountStories, 'iterationHealthDoneStoryPoints': iterationHealthDoneStoryPoints, 'iterationHealthCountDoneStories': iterationHealthCountDoneStories});
                                }
                            })
                        }
                    });
                });
            }
        });
    }
}

function fetchEnggStoriesOfPMStory(PMEntity, EnggStoriesWithNullPMStory, cb) {

    if (!PMEntity) return cb(null, EnggStoriesWithNullPMStory);

    const q = ds.createQuery(['EnggStory'])
        .filter('PMStoryID', '=', PMEntity.key.id);

    ds.runQuery(q, (err, EnggEntities, nextQuery) => {
        if (err) {
            return cb(err, null);
        }
        if (!EnggEntities) {
            return cb('Something wrong. Could not get enggStories changed in iteration starting:' + new Date(iterationStartDateMsec), null);
        }
        if (EnggEntities.length == 0) {
            return cb('no engg story assigned with PMStoryID:' + PMEntity.key.id, null);
        }
        else {
            return cb (null, EnggEntities);
        }
    });
}

function buildSpecificComboObj (iterationStartDateMsec, iterationEndDateMsec, pmStoryData, entities, enggStoriesPickedUpInIteration, flagOnlyEnggStoriesPickedUpInIteration, cb) {

    var count = entities.length;

    var scrum = null;

    var comboObjEnggstories = [];
    var PMStoryEntityData = null;
    // index used to order the stories i.e. to first display engg stories picked up in this iteration, followed by other engg stories attached to PMStory but not picked up in this iteration
    var lastIndexStoriesPickedUpInThisIteration = 0;

    if (pmStoryData) {
        PMStoryEntityData = {};
        PMStoryEntityData.id = pmStoryData.id;
        PMStoryEntityData.key = pmStoryData.currentKey;
        PMStoryEntityData.summary = pmStoryData.summary;
        PMStoryEntityData.status = pmStoryData.status;
        PMStoryEntityData.fixVersion = pmStoryData.fixVersion.length > 0 ? pmStoryData.fixVersion : ['Not Specified'];
        PMStoryEntityData.totalStoriesThisIteration = 0;
        PMStoryEntityData.countStoriesThisIteration = 0;
        PMStoryEntityData.totalStoriesLastIteration = 0;
        PMStoryEntityData.storyAcceptedThisIteration = 0;
        PMStoryEntityData.storiesDoneThisIteration = 0;
        PMStoryEntityData.storyAcceptedLastIteration = 0;
        PMStoryEntityData.connectivityInvestment = pmStoryData.connectivityInvestment ? pmStoryData.connectivityInvestment[0] : 'Not Specified';
        PMStoryEntityData.storyPoints = 0;
        PMStoryEntityData.doneStoryPoints = 0;
        PMStoryEntityData.fixVersionMatches = true;
    }

    logger.debug('pmStoryData:' + JSON.stringify(pmStoryData));

    for (var i=0; i < entities.length; i++) {
        let enggDataForComboObj = null;
        let entityData = fromDatastore(entities[i]);

        var dateCreatedMsec = new Date(entityData.dateCreated).getTime();
        var firstSprintStartDateMsec = new Date(entityData.firstSprintStartDate).getTime();

        logger.debug('entityData:' + JSON.stringify(entityData));

        if (entityData.dateCreatedMsec > iterationEndDateMsec) {
            count --;
            continue;
        }

        enggDataForComboObj = {};
        enggDataForComboObj.currentKey = entityData.currentKey;
        enggDataForComboObj.summary = entityData.summary;
        enggDataForComboObj.acceptanceReviewedByPM = entityData.acceptanceReviewedByPM;

        var storyCreatedPriorToThisIteration = false;

        if (dateCreatedMsec <= iterationStartDateMsec) storyCreatedPriorToThisIteration = true;
        var queueTime = parseInt((!entityData.firstSprintStartDate ? (new Date().getTime() - dateCreatedMsec) /(oneDayInMsec) : (firstSprintStartDateMsec - dateCreatedMsec) /(oneDayInMsec)), 10);
        var months = 0;
        while (queueTime >= 30) {
            months++;
            queueTime = queueTime - 30;
        }
        var weeks = 0;
        while (queueTime >= 7) {
            weeks++;
            queueTime = queueTime - 7;
        }
        var queueTimeStr = null;
        if(months > 0) queueTimeStr = months + 'm';
        if(weeks > 0) queueTimeStr = queueTimeStr ? (queueTimeStr + ' ' + weeks + 'w') : (weeks + 'w');
        if(queueTime > 0) queueTimeStr = queueTimeStr ? (queueTimeStr + ' ' + queueTime + 'd') : (queueTime + 'd');
        enggDataForComboObj.queueTime = queueTimeStr ? queueTimeStr : '0d';

        var cycleTime;
        var cycleTimeStr = null;
        if (entityData.firstSprintStartDate) {
            cycleTime = parseInt((entityData.status == 'Accepted'? ((entityData.acceptedDateMsec - firstSprintStartDateMsec) / (oneDayInMsec)) : ((new Date().getTime() - firstSprintStartDateMsec) / (oneDayInMsec))), 10);
        }
        else {
            cycleTime = parseInt((entityData.status == 'Accepted'? ((entityData.acceptedDateMsec - dateCreatedMsec) / (oneDayInMsec)) : ((new Date().getTime() - dateCreatedMsec) / (oneDayInMsec))), 10);
            // if (entityData.status == 'Accepted') cycleTime = parseInt(((entityData.acceptedDateMsec - dateCreatedMsec) / (oneDayInMsec)), 10);
        }
        months = 0;
        while (cycleTime >= 30) {
            months++;
            cycleTime = cycleTime - 30;
        }
        weeks = 0;
        while (cycleTime >= 7) {
            weeks++;
            cycleTime = cycleTime - 7;
        }
        if(months > 0) cycleTimeStr = months + 'm';
        if(weeks > 0) cycleTimeStr = cycleTimeStr ? (cycleTimeStr + ' ' + weeks + 'w') : (weeks + 'w');
        if(cycleTime > 0) cycleTimeStr = cycleTimeStr ? (cycleTimeStr + ' ' + cycleTime + 'd') : (cycleTime + 'd');
        enggDataForComboObj.cycleTime = cycleTimeStr;

        // let's get the change in status
        var statusAtIterationStart = null;
        var statusAtIterationEnd = null;
        var flagStatusAtIterationStart = false;
        var flagStatusAtIterationEnd = false;

        if (entityData.dateCreatedMsec > iterationStartDateMsec){
            statusAtIterationStart = 'New';
            flagStatusAtIterationStart = true;
        }

        for (var j=0; j < entityData.statusHistory.length; j++) {
            let historyLine = JSON.parse(entityData.statusHistory[j]);
            if (!flagStatusAtIterationEnd && iterationEndDateMsec >= historyLine[1]) {
                statusAtIterationEnd = historyLine[2];
                flagStatusAtIterationEnd = true;
            }

            if (!flagStatusAtIterationStart && iterationStartDateMsec >= historyLine[1]) {
                statusAtIterationStart = historyLine[2];
                flagStatusAtIterationStart = true;
            }
        }
        enggDataForComboObj.statusAtIterationEnd = statusAtIterationEnd;
        enggDataForComboObj.statusAtIterationStart = statusAtIterationStart;
        enggDataForComboObj.statusChanged = statusAtIterationEnd == statusAtIterationStart ? false : true;

        // let's get the change in StoryPoint
        var storyPointsAtIterationStart = null;
        var storyPointsAtIterationEnd = null;
        var flagStoryPointsAtIterationStart = false;
        var flagStoryPointsAtIterationEnd = false;

        if (entityData.dateCreatedMsec > iterationStartDateMsec){
            storyPointsAtIterationStart = 'New';
            flagStoryPointsAtIterationStart = true;
        }

        for (var j=0; j < entityData.storyPointsHistory.length; j++) {
            let historyLine = JSON.parse(entityData.storyPointsHistory[j]);

            if (!flagStoryPointsAtIterationEnd && iterationEndDateMsec >= historyLine[1]) {
                if(historyLine[2]) storyPointsAtIterationEnd = historyLine[2];
                else storyPointsAtIterationEnd = 'NS';
                flagStoryPointsAtIterationEnd = true;
            }

            if (!flagStoryPointsAtIterationStart && iterationStartDateMsec >= historyLine[1]) {
                if(historyLine[2]) storyPointsAtIterationStart = historyLine[2];
                else storyPointsAtIterationStart = 'NS';
                flagStoryPointsAtIterationStart = true;
            }
        }
        enggDataForComboObj.storyPointsAtIterationEnd = storyPointsAtIterationEnd;
        enggDataForComboObj.storyPointsAtIterationStart = storyPointsAtIterationStart;
        enggDataForComboObj.storyPointsChanged = storyPointsAtIterationEnd == storyPointsAtIterationStart ? false : true;

        // let's get the change in fixVersions
        var fixVersionsAtIterationStart = null;
        var fixVersionsAtIterationEnd = null;
        var flagFixVersionsAtIterationStart = false;
        var flagFixVersionsAtIterationEnd = false;

        if (entityData.dateCreatedMsec > iterationStartDateMsec){
            fixVersionsAtIterationStart = [];
            flagFixVersionsAtIterationStart = true;
        }

        for (var j=0; j < entityData.fixVersionHistory.length; j++) {
            let historyLine = JSON.parse(entityData.fixVersionHistory[j]);

            if (!flagFixVersionsAtIterationEnd && iterationEndDateMsec >= historyLine[1]) {
                if(historyLine[2]) fixVersionsAtIterationEnd = historyLine[2];
                else fixVersionsAtIterationEnd = 'NS';
                flagFixVersionsAtIterationEnd = true;
            }

            if (!flagFixVersionsAtIterationStart && iterationStartDateMsec >= historyLine[1]) {
                if(historyLine[2]) fixVersionsAtIterationStart = historyLine[2];
                else fixVersionsAtIterationStart = 'NS';
                flagFixVersionsAtIterationStart = true;
            }
        }
        enggDataForComboObj.fixVersionsAtIterationEnd = fixVersionsAtIterationEnd;
        enggDataForComboObj.fixVersionsAtIterationStart = fixVersionsAtIterationStart;

        // let's compare the two arrays of fixVersionsAtIterationEnd and fixVersionsAtIterationStart
        enggDataForComboObj.fixVersionsChanged = true;

        if (fixVersionsAtIterationEnd.length ==  0 && fixVersionsAtIterationStart.length == 0) {
            enggDataForComboObj.fixVersionsChanged = false;
        }
        else if (fixVersionsAtIterationStart.length == fixVersionsAtIterationEnd.length) {
            var flagFixVersionChanged = false;
            for (let idxFixVersionLength = 0; idxFixVersionLength < fixVersionsAtIterationStart.length && !flagFixVersionChanged; idxFixVersionLength++) {
                if (fixVersionsAtIterationStart.indexOf(fixVersionsAtIterationEnd[idxFixVersionLength]) == -1) flagFixVersionChanged = true;
            }
            if (!flagFixVersionChanged) enggDataForComboObj.fixVersionsChanged = false;
        }


        logger.debug('enggDataForComboObj' + JSON.stringify(enggDataForComboObj));
        if (enggStoriesPickedUpInIteration.indexOf(enggDataForComboObj.currentKey) != -1) enggDataForComboObj.pickedUpInThisIteration = true;
        else enggDataForComboObj.pickedUpInThisIteration = false;

        if (!flagOnlyEnggStoriesPickedUpInIteration || enggDataForComboObj.pickedUpInThisIteration) {
            if (enggDataForComboObj.pickedUpInThisIteration) {
                comboObjEnggstories.splice(lastIndexStoriesPickedUpInThisIteration, 0, enggDataForComboObj);
                lastIndexStoriesPickedUpInThisIteration++;
            }
            else {
                comboObjEnggstories.push(enggDataForComboObj);
            }

            if (pmStoryData) {
                if (!scrum) scrum = entityData.scrum;
                else if (scrum.indexOf(entityData.scrum) == -1) scrum = scrum + ', ' + entityData.scrum;
            }
        }


        count --;

        if (pmStoryData){
            PMStoryEntityData.totalStoriesThisIteration = PMStoryEntityData.totalStoriesThisIteration + 1;
            if (storyCreatedPriorToThisIteration) PMStoryEntityData.totalStoriesLastIteration = PMStoryEntityData.totalStoriesLastIteration + 1;
            if (enggDataForComboObj.statusAtIterationEnd == 'Accepted') {
                PMStoryEntityData.storyAcceptedThisIteration = PMStoryEntityData.storyAcceptedThisIteration + 1;
            }
            if (enggDataForComboObj.statusAtIterationStart == 'Accepted') PMStoryEntityData.storyAcceptedLastIteration = PMStoryEntityData.storyAcceptedLastIteration + 1;
            if (enggStoriesPickedUpInIteration.indexOf(enggDataForComboObj.currentKey) != -1) {
                if (!isNaN(enggDataForComboObj.storyPointsAtIterationEnd)) PMStoryEntityData.storyPoints = PMStoryEntityData.storyPoints + parseInt(enggDataForComboObj.storyPointsAtIterationEnd);
                PMStoryEntityData.countStoriesThisIteration++;
                if (enggDataForComboObj.statusAtIterationEnd == 'Done' || enggDataForComboObj.statusAtIterationEnd == 'Accepted') {
                    if (!isNaN(enggDataForComboObj.storyPointsAtIterationEnd)) PMStoryEntityData.doneStoryPoints = PMStoryEntityData.doneStoryPoints + parseInt(enggDataForComboObj.storyPointsAtIterationEnd);
                    PMStoryEntityData.storiesDoneThisIteration++;
                }
            }

            // let's be sure each of the fixVersionsAtIterationEnd matches with fixVersion in PMStory
            for (let idxFixVersionLength = 0; idxFixVersionLength < fixVersionsAtIterationEnd.length && PMStoryEntityData.fixVersionMatches; idxFixVersionLength++) {
                if (PMStoryEntityData.fixVersion.indexOf(fixVersionsAtIterationEnd[idxFixVersionLength]) == -1) {
                    PMStoryEntityData.fixVersionMatches = false;
                }
            }
        }
    }

    if (count == 0) {
        logger.debug('completed pushing all engg stories.');
        if (PMStoryEntityData) {
            PMStoryEntityData.percentComplete = PMStoryEntityData.totalStoriesThisIteration == 0 ? 0 : parseInt(PMStoryEntityData.storyAcceptedThisIteration*100 / PMStoryEntityData.totalStoriesThisIteration, 10);
            PMStoryEntityData.percentCompleteLastIteration = PMStoryEntityData.totalStoriesLastIteration == 0 ? 0 : parseInt(PMStoryEntityData.storyAcceptedLastIteration*100 / PMStoryEntityData.totalStoriesLastIteration, 10);
            let percentChangeLocal = PMStoryEntityData.percentComplete - PMStoryEntityData.percentCompleteLastIteration;
            PMStoryEntityData.percentChange = percentChangeLocal >= 0 ? '+' + percentChangeLocal : percentChangeLocal;
        }
        cb(null, scrum, {'pmstory': PMStoryEntityData, 'enggstories': comboObjEnggstories});
        return;
    }
}
/*
function _fetchComboObj (iterationName, cb) {
    _getIterationDates(iterationName, (err, iterationStartDate, iterationStartDateMsec, iterationEndDate, iterationEndDateMsec) => {
        asyncFetchEnggStories(iterationName, iterationStartDateMsec, iterationEndDateMsec, (err, comboObj) => {
            if (err) logger.error(err);
            else logger.debug('asyncFetchEnggStories complete. comboObj:' + JSON.stringify(comboObj))
            cb(err, comboObj);
            return;
        });
    });
}
*/
function _fetchComboObj (reportType, cb) {
    _getIterationsAndStartEndDates(reportType, (err, iterations, startDateMsec, endDateMsec) => {
        asyncFetchEnggStoriesForADuration (iterations, (err, enggEntitiesChangedinIterations) => {
            if (err) {
                logger.error(err);
                return cb (err, null);
            }
            else {
                logger.debug('asyncFetchEnggStoriesForADuration complete. enggStories:' + JSON.stringify(enggEntitiesChangedinIterations))
                processEnggStoriesForADuration(enggEntitiesChangedinIterations, startDateMsec, endDateMsec, (err, comboObj) => {
                    if (err) {
                        logger.error('asyncFetchEnggStoriesForADuration: Error: ' + err);
                        return cb (err, null);
                    }
                    else return cb (null, comboObj);
                });
            }
        });
    });
}

function _publishOnHarbor(iterations, html) {

    // GET call to check if there is already a document. If so, retrieve it
    // header for GET
    var getheaders = {
            'Authorization': 'Basic ' + new Buffer(config.get('HARBOR_USER_ID') + ':' + config.get('HARBOR_PASSWORD')).toString('base64')
    };

    // options for GET
    var optionsget = {
        host : 'harbor.sailpoint.com', // here only the domain name
        // (no http/https !)
        port : 443,
        path : '/api/core/v3/contents?filter=tag(' + encodeURIComponent(iterations[0].toLowerCase()) + ')', // the rest of the url with parameters if needed
        method : 'GET', // do GET
        headers: getheaders
    };

    logger.debug('Options prepared:');
    logger.debug(optionsget);
    logger.debug('Do the GET call');

    var contentID = null;
    // do the GET request
    var reqGet = https.request(optionsget, function(res) {
        // uncomment it for header details
        //  console.log("headers: ", res.headers);
        var getResponse = null;
        res.on('data', function(d) {
            logger.debug('GET result:\n');
            getResponse = getResponse ? getResponse + d.toString() : d.toString();
            // process.stdout.write(d);
            logger.debug('\n\nCall completed:' + getResponse);
        });

        res.on('end', function() {
            getResponse = getResponse.substring(getResponse.indexOf('{'));
            if (JSON.parse(getResponse).list.length > 0) {
                contentID = JSON.parse(getResponse).list[0].contentID;
            }

            // do a POST request
            // create the JSON object

            var jsonObject = JSON.stringify({
                "type": "document",
                "subject": 'Connectivity Update: ' + iterations[0],
                "visibility": "hidden",
                "content": {
                    "type": "text/html",
                    "text": html
                },
                "tags": [iterations[0]]
            });

            // prepare the header
            var postheaders = {
                'Content-Type' : 'application/json',
                'Content-Length' : Buffer.byteLength(jsonObject, 'utf8'),
                'Authorization': 'Basic ' + new Buffer(config.get('HARBOR_USER_ID') + ':' + config.get('HARBOR_PASSWORD')).toString('base64')
            };

            // the post options
            var optionspost = {
                host : 'harbor.sailpoint.com',
                port : 443,
                path : contentID ? ('/api/core/v3/contents/' + contentID) : '/api/core/v3/contents',
                method : contentID ? 'PUT' : 'POST',
                headers : postheaders
            };

            // do the POST call
            var reqPost = https.request(optionspost, function(res) {
                logger.debug("statusCode: ", res.statusCode);
                // uncomment it for header details
                //  console.log("headers: ", res.headers);

                res.on('data', function(d) {
                    logger.debug('POST result:\n');
                    // process.stdout.write(d);
                    logger.debug('\n\nPOST completed');
                });
            });
            // write the json data
            reqPost.write(jsonObject);
            reqPost.end();
            reqPost.on('error', function(e) {
                logger.error(e);
            });
        });

    });

    reqGet.end();
    reqGet.on('error', function(e) {
        console.error(e);
    });
}

function _fetchIterationView (reportType, flagOnlyEnggStoriesPickedUpInIteration, cb) {
    _getIterationsAndStartEndDates(reportType, (err, iterations, startDateMsec, endDateMsec) => {
        asyncFetchEnggStoriesForADuration (iterations, (err, enggEntitiesChangedinIterations) => {
            if (err) {
                logger.error(err);
                return cb (err, null);
            }
            else {
                logger.debug('asyncFetchEnggStoriesForADuration complete. enggStories:' + JSON.stringify(enggEntitiesChangedinIterations))
                processOnlyPickedUpEnggStoriesForADuration(enggEntitiesChangedinIterations, startDateMsec, endDateMsec, flagOnlyEnggStoriesPickedUpInIteration, (err, scrums, comboObj, connectivityInvestmentBuckets, connectivityInvestmentStoryPoints, connectivityInvestmentDoneStoryPoints, connectivityInvestmentCountStories, connectivityInvestmentCountDoneStories, iterationSummary) => {
                    if (err) {
                        logger.error('asyncFetchEnggStoriesForADuration: Error: ' + err);
                        return cb (err, null, null);
                    }
                    else return cb (null, scrums, comboObj, connectivityInvestmentBuckets, connectivityInvestmentStoryPoints, connectivityInvestmentDoneStoryPoints, connectivityInvestmentCountStories, connectivityInvestmentCountDoneStories, iterationSummary, iterations, startDateMsec, endDateMsec);
                });
            }
        });
    });
}


function getQuarterDates(qtr, cb) {
    var now = new Date();
    var year = now.getFullYear();
    var startOfQ1 = new Date(year + '-Jan-1');
    var startOfQ2 = new Date(year + '-Apr-1');
    var startOfQ3 = new Date(year + '-Jul-1');
    var startOfQ4 = new Date(year + '-Oct-1');
    var startDate =  null;
    var endDate = null;

    if (qtr == 'q1') {
        if (now > startOfQ1) {
            startDate = startOfQ1;
            endDate = new Date(year + '-Mar-31');
        }
        else {
            startDate = new Date(year - 1 + '-Jan-1');
            endDate = new Date(year - 1 + '-Mar-31');
        }
        return cb (startDate.getTime(), endDate.getTime());
    }

    if (qtr == 'q2') {
        if (now > startOfQ2) {
            startDate = startOfQ2;
            endDate = new Date(year + '-Jun-30');
        }
        else {
            startDate = new Date(year - 1 + '-Apr-1');
            endDate = new Date(year - 1 + '-Jun-30');
        }
        return cb (startDate.getTime(), endDate.getTime());
    }

    if (qtr == 'q3') {
        if (now > startOfQ3) {
            startDate = startOfQ3;
            endDate = new Date(year + '-Sep-30');
        }
        else {
            startDate = new Date(year - 1 + '-Jul-1');
            endDate = new Date(year - 1 + '-Sep-30');
        }
        return cb (startDate.getTime(), endDate.getTime());
    }

    if (qtr == 'q4') {
        if (now > startOfQ4) {
            startDate = startOfQ4;
            endDate = new Date(year + '-Dec-31');
        }
        else {
            startDate = new Date(year - 1 + '-Oct-1');
            endDate = new Date(year - 1 + '-Dec-31');
        }
        return cb (startDate.getTime(), endDate.getTime());
    }
}

function _getIterationsAndStartEndDates (reportType, cb) {
    if (reportType.startsWith('iteration')) {
        _getIterationNameAndDates(reportType, (err, iterationName, startDateMsec, endDateMsec) => {
            if (err) return cb (err, null, null, null);
            else return cb(null, iterationName, startDateMsec, endDateMsec);
        });
    }
    if (reportType.startsWith('q')) {
        getQuarterDates(reportType, (startDateMsec, endDateMsec) => {
            logger.error('startDateMsec:' + startDateMsec);
            logger.error('endDateMsec:' + endDateMsec);
            getIterationsWithinDates(startDateMsec, endDateMsec, (err, iterations) => {
                if (err) {
                    logger.error('Error in obtaining iterations in a quarter:' + err);
                    return cb (err, null, null, null);
                }
                else {
                    var iterationNames = [];
                    for (var j = 0; j < iterations.length; j++) iterationNames.push(iterations[j].key.name);
                    return cb (null, iterationNames, iterations[0].data.startDateMsec, iterations[iterations.length - 1].data.endDateMsec);
                }
            });
        });
    }
}

function _getIterationNameAndDates(simplifiedName, cb) {
    var howFarBack = simplifiedName.split('-');
    var now = new Date().getTime();
    getIterationsWithinDates(now, now, (err, iterations) => {
        if (!iterations ||iterations.length == 0) return cb ('No iteration found', null, null, null);
        if (iterations.length > 1) return cb ('More than one iteration found', null, null, null);
        var iterationName = iterations[0].key.name;
        var iterationNameArray = iterationName.split(' ');
        var iterationNumber = null;
        var newIterationNumber = null;
        var newIterationName = null;
        if (iterationNameArray[0] == 'CON') {
            iterationNumber = iterationNameArray[3];
            if (howFarBack.length == 1) newIterationNumber = iterationNumber;
            else newIterationNumber = iterationNumber - howFarBack[1];
            if (newIterationNumber < 1) return cb ('Invalid iteration', null, null, null);
            if (newIterationNumber <= 9) newIterationName = 'CON - Iteration 0' + newIterationNumber;
            else newIterationName = 'CON - Iteration ' + newIterationNumber;
        }
        else {
            iterationNumber = iterationNameArray[1];
            if (howFarBack.length == 1) newIterationNumber = iterationNumber;
            else newIterationNumber = iterationNumber - howFarBack[1];
            if (newIterationNumber < 1) return cb ('Invalid Iteration', null, null, null);
            if (newIterationNumber <= 9) newIterationName = iterationNameArray[0] + ' ' + '0' + newIterationNumber + ' - ' + iterationNameArray[3];
            else newIterationName = iterationNameArray[0] + ' ' + newIterationNumber + ' - ' + iterationNameArray[3];
        }
        _getIterationDates(newIterationName, (err, startDate, startDateMsec, endDate, endDateMsec) => {
            if (err) return cb (err, null, null, null);
            else return cb (null, [newIterationName], startDateMsec, endDateMsec);
        });
    });
}

function getIterationsWithinDates(startDateMsec, endDateMsec, cb) {
    getIterationsEndingAfterASpecificTime(startDateMsec, (err, iterationsSuperSet) => {
        if (err) return cb (err, null);
        getIterationsStartedAfterASpecificTime(endDateMsec, (err, iterationSubSet) => {
            if (err) return cb (err, null);
            diffIterations(iterationsSuperSet, iterationSubSet, (difference) => {
                return cb (null, difference);
            });
        });
    });
}

function diffIterations (iterationsSuperSet, iterationsSubSet, cb) {
    var difference = [];
    for (var i = 0; i < iterationsSuperSet.length; i++) {
        var flagFound = false;
        for (var j = 0; j < iterationsSubSet.length; j++) {
            if (iterationsSuperSet[i].key.name == iterationsSubSet[j].key.name) {
                flagFound = true;
                break;
            }
        }
        if (!flagFound) difference.push(iterationsSuperSet[i]);
    }
    return cb (difference);
}

function getIterationsStartedAfterASpecificTime(specificTimeMsec, cb) {
    const q = ds.createQuery(['Iteration'])
        .filter('startDateMsec', '>', specificTimeMsec);

    ds.runQuery(q, (err, iterations, nextQuery) => {
        if (err) {
            logger.error(err);
            return cb(err, null);
        }
        if (!iterations) {
            return cb('Something wrong. Could not get Iteration', null);
        }
        return cb (null, iterations);
    });
}

function getIterationsEndingAfterASpecificTime(specificTimeMsec, cb) {
    const q = ds.createQuery(['Iteration'])
        .filter('endDateMsec', '>', specificTimeMsec);

    ds.runQuery(q, (err, iterations, nextQuery) => {
        if (err) {
            logger.error(err);
            return cb(err, null);
        }
        if (!iterations) {
            return cb('Something wrong. Could not get Iteration', null);
        }
        return cb (null, iterations);
    });
}

function _getPMStoriesChangedBetween(startDateMsec, endDateMsec, token, cb) {
    var limit = 50;
    const q = ds.createQuery(['PMStory'])
        .filter('updatedMsec', '>', startDateMsec)
        .filter('updatedMsec', '<=', endDateMsec)
        .limit(limit)
        .start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            logger.error(err);
            return cb(err, null);
        }
        if (!entities) {
            return cb('Something wrong. Could not get PMStories', null);
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        return cb(null, entities.map(fromDatastore), hasMore);
    });
}

function asyncDeleteEnggStories (pmstoryid, cb) {
    console.log('asyncDeleteEnggStories:' + pmstoryid);
    const PMStoryKey = ds.key(['PMStories', parseInt(pmstoryid, 10)]);
    // const PMStoryKey = ds.key(['PMStories', pmstoryid]);
    const q = ds.createQuery(['EnggStories'])
        .hasAncestor(PMStoryKey);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        if (!entities) {
            cb('Something wrong. EnggStories for PMStory:' + pmstoryid + ' is null', null);
        }
        if (entities) {
            var count = entities.length;
            if (entities.length == 0) {
                console.log('there are no EnggStories for PMStory:' + pmstoryid);
                cb(null);
            }
            for (var i=0; i < entities.length; i++) {
                ds.delete(ds.key(['EnggStories', entities[i].key.id]), (err) => {
                    if (err) {
                        console.log('could not delete the engg story:' + entities[i].key.id, 'belonging to PMStory:', pmstoryid);
                        cb(err);
                        return;
                    }
                });
                console.log('deleted engg story:' + entities[i].key.id + ', belonging to PMStory:' + pmstoryid);
                count --;
                if(count == 0) {
                    console.log('completed pushing engg stories for PMStory:' + pmstoryid);
                    cb(null);
                }
            }
        }
    });
}

function deleteAllStoriesIteratively (cb) {
    const q = ds.createQuery(['PMStories']);
    //    .filter('entitytype', '=', 'PMStory');
    //.limit(limit);
    //.order('title')
    //.start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        // const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        if(entities) {
            var count = entities.length;
            console.log('count total:' + count);
            // console.log('length of entities map:' + entities.map().length);
            entities.forEach(function(x) {
                console.log(x.key.id);
                asyncDeleteEnggStories(x.key.id, (err) => {
                    if (err) {
                        console.log('could not delete enggStories for PMStory:' + x.key.id);
                        cb(err);
                        return;
                    }
                    ds.delete(ds.key(['PMStories', x.key.id]), (err) => {
                        if (err) {
                            console.log('could not delete PMStory:' + x.key.id);
                            cb(err);
                            return;
                        }
                        count --;
                        if (count == 0) {
                            console.log('deleted all PMStories. calling the call back');
                            cb(null);
                        }
                    });
                });
            });
        }
    });
}

function fetchPMStories (cb) {
    const q = ds.createQuery(['PMStories']);
    //    .filter('entitytype', '=', 'PMStory');
    //.limit(limit);
    //.order('title')
    //.start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        cb(null, entities.map(fromDatastore), hasMore);
    });
}

function fetchPMEntities (cb) {
    const q = ds.createQuery(['PMStory']);
    //    .filter('entitytype', '=', 'PMStory');
    //.limit(limit);
    //.order('title')
    //.start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        cb(null, entities, hasMore);
    });
}

function fetchEnggEntities (cb) {
    const q = ds.createQuery(['EnggStory']);
    //    .filter('entitytype', '=', 'PMStory');
    //.limit(limit);
    //.order('title')
    //.start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        cb(null, entities, hasMore);
    });
}

function _getReadyReadyEnggStories (enggStoryStatus, token, cb) {
    var limit = 50;
    const q = ds.createQuery(['EnggStory'])
        .filter('currentStatus', '=', enggStoryStatus)
        .filter('groomingStory', '=', 'No')
        .filter('flagged', '=', 'No')
        //.filter('acceptanceReviewedByPM', '=', 'Yes')
        .limit(limit)
        .start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        cb(null, entities, hasMore);
    });
}

function _getNotReadyReadyEnggStories (enggStoryStatus, token, cb) {
    var limit = 50;
    const q = ds.createQuery(['EnggStory'])
        .filter('currentStatus', '=', enggStoryStatus)
        // .filter('groomingStory', '=', 'No')
        .filter('acceptanceReviewedByPM', '=', 'No')
        .limit(limit)
        .start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        cb(null, entities, hasMore);
    });
}

function _getPMStoryEntityViaJIRAKey (JIRAKey, cb) {
    const q = ds.createQuery('PMStory').filter('currentKey', '=', JIRAKey);
    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        if (entities.length == 0) {
            cb (null, null);
            return;
        }
        if (entities.length > 1) {
            console.log('more than one PMStory entity for JIRAKey:' + JIRAKey);
            cb (null, null);
            return;
        }
        cb(null, entities);
        return;
    });
}

function getPMStoriesInExecution (kind, limit, token, cb) {
    const q = ds.createQuery('PMStory').filter('status', '=', 'In Execution');

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        cb(null, entities.map(fromDatastore), hasMore);
    });
}

// Creates a new book or updates an existing book with new data. The provided
// data is automatically translated into Datastore format. The book will be
// queued for background processing.
// [START update]

function createkey(kind, id, parentKind, parentID) {
    let key;
    if(parentKind == null && parentID == null){
        if (id) {
            key = ds.key([kind, parseInt(id, 10)]);
            // key = ds.key([kind, id]);
            return key;
        } else {
            key = ds.key(kind);
            return key;
        }
    }
    if(parentKind && parentID){
        if (id) {
            // key = ds.key([parentKind, parseInt(parentID, 10), kind, parseInt(id, 10)]);
            key = ds.key([kind, parseInt(id, 10), parentKind, parseInt(parentID, 10)]);
            // key = ds.key([kind, id, parentKind, parentID]);
            return key;
        } else {
            key = ds.key(parentKind, parseInt(parentID, 10), kind);
            // key = ds.key(parentKind, parentID, kind);
            return key;
        }
    }
}

function update (kind, id, parentKind, parentId, data, cb) {
    let key;
    /*
    if (id) {
        key = ds.key([kind, parseInt(id, 10)]);
    } else {
        key = ds.key(kind);
    }
    */
    key = createkey(kind, id, parentKind, parentId);

    const entity = {
        key: key,
        data: toDatastore(data, ['summary'])
    };

    ds.save(
        entity,
        (err) => {
            data.id = entity.key.id;
            cb(err, err ? null : data);
        });
}
// [END update]

function _createIteration (iterationName, data, cb) {
    let key;
    if (iterationName) {
        key = ds.key(['Iteration', iterationName]);
    } else {
        cb ('Iteration name not provided.');
        return;
    }

    const entity = {
        key: key,
        data: data
    };

    ds.save(
        entity,
        (err) => {
            if (err) cb(err);
            else cb(null, iterationName, data);
        }
    );
}

function _upsertIteration (iterationName, data, cb) {
    let key;
    if (iterationName) {
        key = ds.key(['Iteration', iterationName]);
    } else {
        cb ('Iteration name not provided.');
        return;
    }

    ds.get(key, (err, entity) => {
        if (err) {
            cb(err);
            return;
        }
        if (!entity) {
            const newEntity = {
                key: key,
                data: data
            };

            ds.save(
                newEntity,
                (err) => {
                    if (err) cb(err);
                    else cb(null, fromDatastore(newEntity), newEntity.key.name);
                }
            );
            return;
        }
        cb(null, fromDatastore(entity), entity.key.name);
    });

}

function _getIterationDates (iterationName, cb) {
    let key;
    if (iterationName) {
        key = ds.key(['Iteration', iterationName]);
    } else {
        cb ('Iteration name not provided.');
        return;
    }

    ds.get(key, (err, entity) => {
        if (err) {
            cb(err);
            return;
        }
        if (!entity) {
            logger.error('Iteration `' + iterationName + '`' + ' not found.');
            cb(null, 'Iteration `' + iterationName + '`' + ' not found.');
            return;
        }
        cb(null, entity.data.startDate, entity.data.startDateMsec, entity.data.endDate, entity.data.endDateMsec);
        return;
    });
}


function create (kind, id, parentKind, parentId, data, cb) {
    update(kind, id, parentKind, parentId, data, cb);
}

function read (kind, id, cb) {
    const key = ds.key([kind, parseInt(id, 10)]);
    ds.get(key, (err, entity) => {
        if (err) {
            cb(err);
            return;
        }
        if (!entity) {
            cb(null, null);
            return;
        }
        cb(null, fromDatastore(entity));
    });
}

function _readViaName (kind, keyName, cb) {
    const key = ds.key([kind, keyName]);
    ds.get(key, (err, entity) => {
        if (err) {
            cb(err);
            return;
        }
        if (!entity) {
            cb(null, null);
            return;
        }
        cb(null, fromDatastore(entity));
    });
}

function readViaKey (key, cb) {
    ds.get(key, (err, entity) => {
        if (err) {
            cb(err);
            return;
        }
        if (!entity) {
            cb(null, null);
            return;
        }
        cb(null, fromDatastore(entity));
    });
}

function _delete (kind, id, cb) {
    const key = ds.key([kind, parseInt(id, 10)]);
    // const key = ds.key([kind, id]);
    ds.delete(key, cb);
}

function _deleteByName (kind, id, cb) {
    // const key = ds.key([kind, parseInt(id, 10)]);
    const key = ds.key([kind, id]);
    ds.delete(key, cb);
}

function _deleteAllStories (kind, cb) {
    const q = ds.createQuery([kind]);

    ds.runQuery(q, (err, entities) => {
        if (err) {
            cb(err);
            return;
        }
        entities.forEach(function(x) {
            _delete(kind, x.key.id, (err) => {
                if (err) {
                    console.log('Error in deleting story. Kind:' + kind + ', key:' + x.key.id);
                    console.log(err);
                    cb(err);
                    return;
                }
                else {
                    console.log('Deleted story. Kind:' + kind + ', id:' + x.key.id + ', key:' + x.data.currentKey);
                    cb(null);
                    return;
                }
            });
        });
    });
}

function _readAllStories (kind) {
    const q = ds.createQuery([kind]);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            // cb(err);
            console.log(err);
            return;
        }
        // const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        // cb(null, entities.map(fromDatastore), hasMore);
        entities.map(function(x) {
            console.log('Reading:' + JSON.stringify(x));
        });
    });
}

function _reverseLastUpdateTime () {
    return new Promise((resolve, reject) => {
        const q = ds.createQuery(['LastUpdateTime']);
        ds.runQuery(q, (err, entities, nextQuery) => {
            if (err) {
                // cb(err);
                console.log(err);
                return Promise.reject(err);
            }
            if(entities.length == 0) {
                console.log('No entity for LastUpdateTime found.');
                return Promise.reject('No entity for LastUpdateTime found.');
            }
            if(entities.length > 1) {
                console.log('Something wrong as the number of entities in LastUpdateTime is:' + entities.length);
                return Promise.reject('Something wrong as the number of entities in LastUpdateTime is:' + entities.length);
            }
            if(entities.length == 1) {
                const key = ds.key(['LastUpdateTime', 'LastUpdateTime']);
                const entity = {
                    key: key,
                    data: [
                        {
                            name: 'lastUpdateTime',
                            value: entities[0].data.lastUpdateTime
                        },
                        {
                            name: 'previousUpdateTime',
                            value: entities[0].data.lastUpdateTime
                        },
                    ]
                };

                ds.save(
                    entity,
                    (err) => {
                    if (err) {
                        console.log ();
                        return Promise.reject(err);
                    }
                    return Promise.resolve(entities[0].data.lastUpdateTime);
                });
            }
        });
    });
}

function _getIterationsFromDataStore(token, cb) {
    var limit = 50;

    const q = ds.createQuery(['Iteration'])
        .limit(limit)
        .start(token);

    var iterations = [];
    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        for (var i = 0; i < entities.length; i++) {
            iterations.push(entities[i].key.name);
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        return cb(null, iterations, hasMore);
    });
}

function _writeLastUpdateTime (lastUpdateTimeMsec, cb) {
    const keyLastUpdateTime = ds.key(['lastUpdateTime', 'lastUpdateTime']);
    var entityLastUpdateTime = {
        key: keyLastUpdateTime,
        data: [
            {
                name: 'lastUpdateTimeMsec',
                value: lastUpdateTimeMsec
            },
        ]
    }
    ds.save(
        entityLastUpdateTime,
        (err) => {
            cb(err);
        }
    );
}


function _getLastUpdateTime (JIRAProjects, cb) {
    const key = ds.key(['lastUpdateTime', 'lastUpdateTime']);
    ds.get(key, (err, entity) => {
        if (err) {
            cb(err);
            return;
        }
        if (!entity) {
            cb(null, JIRAProjects, null);
            return;
        }
        cb(null, JIRAProjects, entity.data.lastUpdateTimeMsec);
    });
}

function _saveAndDeleteOneEntity(toSaveEntity, toDeleteKey, cb) {
    ds.save(toSaveEntity, (err) => {
        if(err) {
            logger.error('Error in saving:' + JSON.stringify(toSaveEntity));
            cb (err);
            return;
        }
        logger.debug('History entity saved:' + JSON.stringify(toSaveEntity));
        ds.delete(toDeleteKey, (err) => {
            if (err) {
                logger.error('Error while deleting:ds.key[kind, storyEntityKey.id, historyKind, deleteDate]' + JSON.stringify(toDeleteKey));
                cb (err);
                return;
            }
            logger.debug('Entity deleted:' + JSON.stringify(toDeleteKey));
        });
    });
    cb (null);
    return;
}

function _copyAndDeleteEntities(kind, historyKind, copyDate, deleteDate, token, cb) {
    // read the current data in chunks
    var limit = 50;

    const q = ds.createQuery([kind])
        .limit(limit)
        .start(token);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        for (var i = 0; i < entities.length; i++) {
            var historyEntityKey = ds.key([kind, entities[i].key.id, historyKind, copyDate]);
            var historyEntityData = entities[i].data;
            var historyEntity = {
                key: historyEntityKey,
                data: historyEntityData
            };
            var toDeleteKey = ds.key([kind, entities[i].key.id, historyKind, deleteDate]);
            _saveAndDeleteOneEntity(historyEntity, toDeleteKey, (err) => {
                if (err) {
                    setTimeout(_saveAndDeleteOneEntity, waitTimeForRetry, historyEntity, toDeleteKey, (err) => {
                        if (err) {
                            setTimeout(_saveAndDeleteOneEntity, waitTimeForRetry, historyEntity, toDeleteKey, (err) => {
                                if (err) {
                                    logger.error('saveAndDeleteFailed. Three attemps done. historyEntity:' + JSON.stringify(historyEntity) + ', toDeleteKey:' + JSON.stringify(toDeleteKey));
                                    cb(err);
                                    return
                                }
                                else {
                                    cb(null);
                                    return;
                                }
                            });
                        }
                    });
                }
                logger.debug('save and delete done for historyEntity:' + JSON.stringify(historyEntity) + ', toDeleteKey:' + JSON.stringify(toDeleteKey));
            });
        }
        const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        if (hasMore) _copyAndDeleteEntities(kind, historyKind, copyDate, deleteDate, hasMore, cb);
        return;
    });
}

// [START exports]
module.exports = {
    create,
    read,
    update,
    delete: _delete,
    deleteAllStories: _deleteAllStories,
    deleteAllStoriesIteratively: deleteAllStoriesIteratively,
    list,
    createkey,
    readViaKey,
    readAll: _readAllStories,
    fetchEnggStories: fetchEnggStories,
    fetchPMStories: fetchPMStories,
    asyncFetchEvents: asyncFetchEvents,
    fetchPMEntities: fetchPMEntities,
    fetchEnggEntities: fetchEnggEntities,
    getLastUpdateTime: _getLastUpdateTime,
    writeLastUpdateTime: _writeLastUpdateTime,
    reverseLastUpdateTime: _reverseLastUpdateTime,
    getPMStoryEntityViaJIRAKey: _getPMStoryEntityViaJIRAKey,
    deleteByName: _deleteByName,
    createIteration: _createIteration,
    readViaName: _readViaName,
    upsertIteration: _upsertIteration,
    getIterationDates: _getIterationDates,
    copyAndDeleteEntities: _copyAndDeleteEntities,
    fetchComboObj: _fetchComboObj,
    getIterationsFromDataStore: _getIterationsFromDataStore,
    getPMStoryIDFromPMStoryKey: _getPMStoryIDFromPMStoryKey,
    ds,
    getIterationNameAndDates: _getIterationNameAndDates,
    getIterationsAndStartEndDates: _getIterationsAndStartEndDates,
    fetchIterationView: _fetchIterationView,
    twoWksInMsec,
    publishOnHarbor: _publishOnHarbor,
    getReadyReadyEnggStories: _getReadyReadyEnggStories,
    getPMStoriesChangedBetween: _getPMStoriesChangedBetween,
    getNotReadyReadyEnggStories: _getNotReadyReadyEnggStories
};
// [END exports]

