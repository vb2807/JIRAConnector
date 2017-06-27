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

const Datastore = require('@google-cloud/datastore');
const config = require('./config');
const twoWksInMsec = 14*24*60*60*1000;
const oneDayInMsec = 24*60*60*1000;
const waitTimeForRetry = 5*1000; //5 seconds

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

function asyncFetchEnggStories (iterationName, iterationStartDateMsec, iterationEndDateMsec, cb) {
    // const PMStoryKey = ds.key(['Event', event, 'PMStories', parseInt(pmstoryid, 10)]);
    // const PMStoryKey = ds.key(['PMStories', pmstoryid]);
    const q = ds.createQuery(['EnggStory'])
        .filter('sprintsTravelled', '=', iterationName);
    // .order('entityUpdateTimeMsec')
    // .order('PMStoryID');

    ds.runQuery(q, (err, EnggEntities, nextQuery) => {
        if (err) {
            logger.error(err);
            cb(err, null);
            return;
        }
        if (!EnggEntities) {
            cb('Something wrong. Could not get enggStories changed in iteration starting:' + new Date(iterationStartDateMsec), null);
            return;
        }
        if (EnggEntities.length == 0) {
            cb('no engg story changed in this iteration:' + new Date(iterationStartDateMsec), null);
            return;
        }
        if (EnggEntities) {
            // logger.debug('entities:' + JSON.stringify(entities));
            // lets iteration thru all entities and get their PMStory Ids so we can query all PMStory Entities also
            var keys = [];
            var EnggStoriesOfAPMStory = [];
            var EnggStoriesWithNullPMStory = [];
            var uniquePMStories =  [];
            var comboObj = [];

            for (var k = 0; k < EnggEntities.length; k++) {
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
    });
}

function fetchEnggStoriesOfPMStory(iterationStartDateMsec, iterationEndDateMsec, PMEntity, EnggStoriesWithNullPMStory, cb) {

    if (!PMEntity) {
        buildSpecificComboObj(iterationStartDateMsec, iterationEndDateMsec, null, EnggStoriesWithNullPMStory, (err, specificComboObj) => {
            if (err) {
                logger.error(err);
                return cb (err, null);
            }
            else return cb (null, specificComboObj);
        });
    }

    else {
        const q = ds.createQuery(['EnggStory']).filter('PMStoryID', '=', PMEntity.key.id);

        ds.runQuery(q, (err, EnggEntities, nextQuery) => {
            if (err) {
                cb(err, null);
                return;
            }
            if (!EnggEntities) {
                cb('Something wrong. Could not get enggStories changed in iteration starting:' + new Date(iterationStartDateMsec), null);
                return;
            }
            if (EnggEntities.length == 0) {
                cb('no engg story assigned with PMStoryID:' + PMEntity.key.id, null);
                return;
            }
            else {
                buildSpecificComboObj(iterationStartDateMsec, iterationEndDateMsec, PMEntity.data, EnggEntities, (err, specificComboObj) => {
                    if (err) {
                        logger.error(err);
                        return cb (err, null);
                    }
                    else return cb (null, specificComboObj);
                });
            }
        });
    }
}

function buildSpecificComboObj (iterationStartDateMsec, iterationEndDateMsec, pmStoryData, entities, cb) {

    var count = entities.length;

    var comboObjEnggstories = [];
    var PMStoryEntityData = null;
    if (pmStoryData) {
        PMStoryEntityData = {};
        PMStoryEntityData.id = pmStoryData.id;
        PMStoryEntityData.key = pmStoryData.currentKey;
        PMStoryEntityData.summary = pmStoryData.summary;
        PMStoryEntityData.status = pmStoryData.status;
        PMStoryEntityData.fixVersion = pmStoryData.fixVersion;
        PMStoryEntityData.totalStoriesThisIteration = 0;
        PMStoryEntityData.totalStoriesLastIteration = 0;
        PMStoryEntityData.storyAcceptedThisIteration = 0;
        PMStoryEntityData.storyAcceptedLastIteration = 0;
    }

    logger.debug('pmStoryData:' + JSON.stringify(pmStoryData));

    for (var i=0; i < entities.length; i++) {
        let enggDataForComboObj = null;
        let entityData = fromDatastore(entities[i]);

        var acceptedDateMsec = new Date(entityData.acceptedDate).getTime();
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

        var storyCreatedPriorToThisIteration = false;

        if (dateCreatedMsec <= (iterationEndDateMsec - twoWksInMsec)) storyCreatedPriorToThisIteration = true;
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
            cycleTime = parseInt((entityData.status == 'Accepted'? ((acceptedDateMsec - firstSprintStartDateMsec) / (oneDayInMsec)) : ((new Date().getTime() - firstSprintStartDateMsec) / (oneDayInMsec))), 10);
        }
        else {
            if (entityData.status == 'Accepted') cycleTime = parseInt(((acceptedDateMsec - dateCreatedMsec) / (oneDayInMsec)), 10);
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
            fixVersionsAtIterationStart = null;
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

        logger.debug('enggDataForComboObj' + JSON.stringify(enggDataForComboObj));
        comboObjEnggstories.push(enggDataForComboObj);
        count --;

        if (pmStoryData){
            PMStoryEntityData.totalStoriesThisIteration = PMStoryEntityData.totalStoriesThisIteration + 1;
            if (storyCreatedPriorToThisIteration) PMStoryEntityData.totalStoriesLastIteration = PMStoryEntityData.totalStoriesLastIteration + 1;
            if (enggDataForComboObj.statusAtIterationEnd == 'Accepted') PMStoryEntityData.storyAcceptedThisIteration = PMStoryEntityData.storyAcceptedThisIteration + 1;
            if (enggDataForComboObj.statusAtIterationStart == 'Accepted') PMStoryEntityData.storyAcceptedLastIteration = PMStoryEntityData.storyAcceptedLastIteration + 1;
        }

    }

    if (count == 0) {
        logger.debug('completed pushing all engg stories.');
        if (PMStoryEntityData) {
            PMStoryEntityData.percentComplete = PMStoryEntityData.totalStoriesThisIteration == 0 ? 0 : parseInt(PMStoryEntityData.storyAcceptedThisIteration*100 / PMStoryEntityData.totalStoriesThisIteration, 10);
            PMStoryEntityData.percentCompleteLastIteration = PMStoryEntityData.totalStoriesLastIteration == 0 ? 0 : parseInt(PMStoryEntityData.storyAcceptedLastIteration*100 / PMStoryEntityData.totalStoriesLastIteration, 10);
            PMStoryEntityData.percentChange = PMStoryEntityData.percentCompleteLastIteration > 0 ? '+' + PMStoryEntityData.percentCompleteLastIteration : PMStoryEntityData.percentCompleteLastIteration;
        }
        cb(null, {'pmstory': PMStoryEntityData, 'enggstories': comboObjEnggstories});
        return;
    }
}

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
            logger.error('Sprint Not Found. iterationName:' + iterationName);
            cb(null, 'Sprint Not Found');
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
    ds,
    twoWksInMsec
};
// [END exports]

