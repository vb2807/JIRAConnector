/**
 * Created by vikas.bansal on 12/04/17.
 */

'use strict';

var groomingHealthScrums = [];
var groomingHealthStoryPoints = [];
var EnggStoriesPromises = [];
var PMStoryPromises = [];
var groomingData = [];
const express = require('express');
const config = require('./config');
const Datastore = require('@google-cloud/datastore');
var schedule = require('node-schedule');
var winston = require('winston');
// require('winston-gae');

const tsFormat = () => (new Date()).toString();
const maxResults = 50;
const waitTimeForRetry = 1000;
const frequencyprocessSearchResults = 60000;
const AllJIRAProjects = 'CONPM, CONBOGIBEE, CONMF, CONHOWRAH, CONVASHI, CONUMSHIAN, CONPAMBAN, CONNAMDANG, CONHELIX, CONELLIS, CONSEALINK, CONJADUKAT, CONCHENAB';

const logger = new (winston.Logger)({
    transports: [
        // colorize the output to the console
        new (winston.transports.Console)({
            timestamp: tsFormat,
            colorize: true,
        })
    ]
});

logger.level = 'info';


var pageCounter;
var pageDone = false;

var addWatcherScheduler;

// [START config]
var JiraClient = require('jira-connector');

var jira = new JiraClient({
    host: 'sailpoint.atlassian.net',
    basic_auth: {
        username: 'vikas.bansal',
        password: 'Iw2baw$2tmpf'
    }
});

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
    if (val == 'getComboObj') {
        getModel().fetchComboObj('Iteration 11 - 2017', (err, comboObjs) => {
            if (err) logger.error(err);
            logger.debug('fetchComboObj:comboObjs:' + JSON.stringify(comboObjs));
        });
        return;
    }
    if (val == 'copyWeeklyData') {
        _copyWeeklyData();
        return;
    }
    if (val == 'testgetIterationsAndStartEndDates') {
        testgetIterationsAndStartEndDates(array[index + 1]);
        return;
    }

    if (val == 'publishHarborReport') {
        publishHarborReport('iteration');
        return;
    }
    if (val == 'getPMStoryChanges') {
        _getPMStoryChanges(1503270000000, 1504479599999, (err, changedPMStories) => {
            console.log('changedPMStories:' + JSON.stringify(changedPMStories));
            return;
        });
    }

    if (val == 'getGroomingHealth') {
        getGroomingHealth((err, groomingHealth, groomingHealthPM) => {
            console.log('err:' + err);
            console.log('groomingHealth:' + JSON.stringify(groomingHealth));
            console.log('groomingHealthPM:' + JSON.stringify(groomingHealthPM));
            return;
        });
        return;
    }
});

function publishHarborReport(reportType ){

    getModel().fetchIterationView(reportType, true, (err, scrums, comboObjs, connectivityInvestmentBuckets, connectivityInvestmentStoryPoints, connectivityInvestmentDoneStoryPoints, iterations, startDateMsec, endDateMsec) => {
        if (err) {
            logger.error(err);
            return;
        }
        if(!comboObjs) {
            logger.error('ComboObjs in null.');
            return;
        }
        // console.log(pmstories);
        if(comboObjs) {
            logger.debug('returned all the combo objs. Ready to send HTML');
            logger.debug('comboObjs:' + JSON.stringify(comboObjs));
            logger.debug('scrums:' + JSON.stringify(scrums));
            logger.debug('connectivityInvestmentBuckets:' + JSON.stringify(connectivityInvestmentBuckets));
            logger.debug('connectivityInvestmentStoryPoints:' + JSON.stringify(connectivityInvestmentStoryPoints));
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
            _getGroomingHealth((err, groomingScrums, groomingHealthEngg, groomingHealthPM) => {
                console.log('groomingScrums:' + JSON.stringify(groomingScrums));
                console.log('groomingHealthEngg:' + JSON.stringify(groomingHealthEngg));
                console.log('groomingHealthPM:' + JSON.stringify(groomingHealthPM));
                _getPMStoryChanges(startDateMsec, endDateMsec, (err, changedPMStories) => {
                    console.log('changedPMStories:' + JSON.stringify(changedPMStories));
                    express().render('harboriterationstatus.jade', {
                        groomingScrums: groomingScrums,
                        groomingHealthEngg: groomingHealthEngg,
                        groomingHealthPM: groomingHealthPM,
                        changedPMStories: changedPMStories,
                        scrums: scrums,
                        ComboObjs: comboObjs,
                        connectivityInvestmentBuckets: connectivityInvestmentBuckets,
                        connectivityInvestmentStoryPoints: connectivityInvestmentStoryPoints,
                        connectivityInvestmentDoneStoryPoints: connectivityInvestmentDoneStoryPoints
                    }, function (err, html) {
                        if (err) {
                            logger.error('express().render(harboriterationstatus.jade):' + err);
                            getModel().publishOnHarbor('Connectivity Health', 'Unable to get HTML');
                        }
                        else getModel().publishOnHarbor(iterations, html);
                        return
                    });
                });
            });
        }
    });
}

function _recursePMStoryChanges(changedPMStories, startDateMsec, endDateMsec, token, cb) {
    getModel().getPMStoriesChangedBetween(startDateMsec, endDateMsec, token, (err, PMEntities, hasMore) => {
        logger.debug('PMEntities.length:' + PMEntities.length);
        for (var i = 0; i < PMEntities.length; i++) {
            // let's get the change in status
            var statusAtStart = null;
            var statusAtEnd = null;
            var flagStatusAtStart = false;
            var flagStatusAtEnd = false;

            if (PMEntities[i].createTimeMsec > startDateMsec){
                statusAtStart = 'New';
                flagStatusAtStart = true;
            }

            for (var j=0; j < PMEntities[i].statusHistory.length; j++) {
                let historyLine = JSON.parse(PMEntities[i].statusHistory[j]);
                if (!flagStatusAtEnd && endDateMsec >= historyLine[1]) {
                    statusAtEnd = historyLine[2];
                    flagStatusAtEnd = true;
                }

                if (!flagStatusAtStart && startDateMsec >= historyLine[1]) {
                    statusAtStart = historyLine[2];
                    flagStatusAtStart = true;
                }
            }
            if (statusAtEnd != statusAtStart) {
                let pmstorydata = {};
                pmstorydata.statusAtEnd = statusAtEnd;
                pmstorydata.statusAtStart = statusAtStart;
                pmstorydata.pmstorykey = PMEntities[i].currentKey;
                pmstorydata.summary = PMEntities[i].summary;
                logger.debug('Changed PMEntity:' + pmstorydata.pmstorykey + ', ' + pmstorydata.summary + ', ' + pmstorydata.statusAtEnd + ', ' + pmstorydata.statusAtStart);
                if (!changedPMStories) changedPMStories = [pmstorydata];
                else {
                    var flagEntryDone = false;
                    var categoryFound = false;
                    for (var k = 0; k < changedPMStories.length && !flagEntryDone; k++) {
                        if (changedPMStories[k].statusAtEnd == pmstorydata.statusAtEnd) categoryFound = true;
                        if (!categoryFound && changedPMStories[k].statusAtEnd > pmstorydata.statusAtEnd) {
                            changedPMStories.splice(k, 0, pmstorydata);
                            flagEntryDone = true;
                            break;
                        }
                        if (categoryFound && changedPMStories[k].statusAtEnd != pmstorydata.statusAtEnd) {
                            changedPMStories.splice(k, 0, pmstorydata);
                            flagEntryDone = true;
                            break;
                        }
                        else if (categoryFound && changedPMStories[k].pmstorykey > pmstorydata.pmstorykey) {
                            changedPMStories.splice(k, 0, pmstorydata);
                            flagEntryDone = true;
                            break;
                        }
                    }
                    if (!flagEntryDone) {
                        changedPMStories.push(pmstorydata);
                    }
                }
            }
        }
        if (hasMore) _recursePMStoryChanges(changedPMStories, startDateMsec, endDateMsec, hasMore, cb);
        else return cb(null, changedPMStories);
    });
}

function _getPMStoryChanges(startDateMsec, endDateMsec, cb) {
    var changedPMStories = null;
    var token = 0;
    _recursePMStoryChanges(changedPMStories, startDateMsec, endDateMsec, token, (err, changedPMStories) => {
        return cb (null, changedPMStories);
    });
}

function testgetIterationsAndStartEndDates(reportType) {
    getModel().getIterationsAndStartEndDates(reportType, (err, iterations, startDate, endDate) => {
        console.log('iterations:' + JSON.stringify(iterations));
        console.log('startDate:' + startDate);
        console.log('endDate:' + endDate);
    });
}

function _copyWeeklyData() {
    var rule = new schedule.RecurrenceRule();
    // rule.hour = 1;
    rule.second = 5;

    addWatcherScheduler = schedule.scheduleJob(rule, function () {
        logger.info('calling scheduled copyData()');
        copyData();
    });
    console.log('returning from the copyWeeklyData()');
    return;
}

function copyData() {
    var now = new Date();
    var copyDateStr = now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate();
    var deleteDateObj = new Date(now.getTime() - getModel().twoWksInMsec);
    var deleteDateStr = deleteDateObj.getFullYear() + "-" + (deleteDateObj.getMonth() + 1) + "-" + deleteDateObj.getDate();
    getModel().copyAndDeleteEntities('EnggStory', 'EnggHistory', copyDateStr, deleteDateStr, 0, (err) => {
        if (err) {
            logger.error('Error in copying and deleting the EnggStory entities. Returning.');
            return;
        }
        logger.info ('Copied and deleted EnggStory entities for: copyDateStr:' + copyDateStr + ', deleteDateStr:' + deleteDateStr)
        return;
    });

    getModel().copyAndDeleteEntities('PMStory', 'PMHistory', copyDateStr, deleteDateStr, 0, (err) => {
        if (err) {
            logger.error('Error in copying and deleting the PMStory entities. Returning.');
            logger.error(err);
            return;
        }
        logger.info ('Copied and deleted PMStory entities for: copyDateStr:' + copyDateStr + ', deleteDateStr:' + deleteDateStr)
        return;
    });
    return;
}

function createEventEntities() {
    var events = ['SOS', 'Iteration', 'EndOfWeek', 'getLatest'];
    // var frequency = [10080, 20160, 10080]
    var frequency = [1, 2, 3, 4]
    for (var i = 0; i < events.length; i++) {
        var eventKey = getModel().ds.key(['Event', events[i]]);
        var eventEntity = {
            key: eventKey,
            data: [
                {
                    name: 'updateDate',
                    value: null
                },
                {
                    name: 'nextUpdateDate',
                    value: null
                },
                {
                    name: 'nextUpdateTimeMsec',
                    value: null
                },
                {
                    name: 'frequency',
                    value: frequency[i]
                },
            ]
        };
        getModel().ds.save(eventEntity, (err) => {
            if (err) {
                console.log('Could not create `Event` object for Event name:' + events[i]);
                console.log(err);
                return;
            }
            else {
                console.log('Created `Event` object for Event name:' + events[i]);
                return;
            }
        })
        ;
    }
}

var processSearchResults = function processSearchResults(JIRAProjects, cursor, updateTime, deltaSince) {
    var JQLString = "project in (" + JIRAProjects + ") and  issuetype in (Story, Epic, MRG)"
    // var JQLString = "key in (CONNAMDANG-583)";
    // var JQLString = "key in (CONPAMBAN-550)";

    if (deltaSince) {
        var deltaSinceDateObj = new Date(deltaSince);
        JQLString = JQLString + "  and updatedDate >= '" + deltaSinceDateObj.getFullYear() + "-" + (deltaSinceDateObj.getMonth() + 1) + "-" + deltaSinceDateObj.getDate() + " " + deltaSinceDateObj.getHours() + ":" + deltaSinceDateObj.getMinutes() + "'";
    }

    logger.info('JQLString:' + JQLString);
    jira.search.search({
        jql: JQLString,
        startAt: cursor,
        maxResults: maxResults,

        fields: [
            "summary",
            "status",
            "issuelinks",
            "issuetype",
            "created",
            "updated",
            "timespent",
            "customfield_10016", //Sprint field in JIRA
            "customfield_10109",
            "customfield_10017", // Epic link
            "customfield_16602", // Acceptance Criteria Reviewed by PM
            "fixVersions",
            "assignee",
            "customfield_14407",
            "components"
        ],

        expand: [
//            "operations.fields",
//            "versionedRepresentations.fields",
//            "editmeta.fields",
            "changelog.fields",
//            "transitions.fields",
//            "renderedFields.fields"
        ]
    }, function (error, searchResult) {
        if (error) {
            logger.error('jira.search.search threw an error. Retrying after 5 secs:');
            logger.error(error);
            // retry after 5 secs for 5 times
            setTimeout(processSearchResults, waitTimeForRetry, JIRAProjects, cursor, updateTime, deltaSince);
        }
        else {
            logger.debug(searchResult);
            logger.debug(searchResult.issues.length);
            if (!searchResult || searchResult.issues.length == 0) {
                logger.info('No issues found for the search criteria:' + JQLString);
                searchComplete(updateTime, JIRAProjects);
                return;
            }
            var issueCounter = 0;

            searchResult.issues.forEach((specificIssue, indexIssues, arrayIssues) => {
                    if (specificIssue) {
//                    console.log('processing specificIssue:' + specificIssue);
                        logger.debug('processing:' + JSON.stringify(specificIssue));
                        // let's check if this is PM Story or Engg Story
                        var PMStoryFlag = false;
                        var scrum = specificIssue.key.slice(0, specificIssue.key.indexOf("-"));
                        // let's check if it's a PMStory
                        if (scrum == 'CONPM' || scrum == 'CON') PMStoryFlag = true;
                        if (PMStoryFlag) {
                            /*
                            if (specificIssue.fields.assignee == null) {
                                jira.issue.addComment({
                                    issueId: specificIssue.id,
                                    comment: {'body': '[~vikas.bansal]' + ' Assignee is not defined for this PM Epic / Story.'}
                                }, function (error, result) {
                                    if (error) logger.error(error);
                                    else logger.error("Assigneed not defined for:" + specificIssue.key);
                                });
                            }
                            */
                            // console.log('about to create PM entity:' + JSON.stringify(PMStoryEntity));
                            buildPMEntity(specificIssue, updateTime, (PMStoryEntity) => {
                                issueCounter++;
                                saveEntity(PMStoryEntity, 'PMStory', specificIssue, searchResult.issues.length, searchResult.total, issueCounter, cursor, deltaSince, updateTime, JIRAProjects);
                            });
                        }
                        else {
                            // It's an EnggStory
                            // let's find its parent PMStory
                            getModel().read('EnggStory', specificIssue.id, (err, curentEnggEntity) => {
                                if (err) {
                                    logger.error('Error in reading curentEnggEntity. key:' + specificIssue.key);
                                    logger.error(err);
                                    return;
                                }
                                getPMStoryKey(specificIssue, (err, PMStoryID, PMStoryKey) => {
                                    if (err) {
                                        logger.error('Error in reading PMStoryID and PMStoryKey. key:' + specificIssue.key);
                                        logger.error(err);
                                        return;
                                    }
                                    logger.debug('PMStoryID:' + PMStoryID + ', PMStoryKey:' + PMStoryKey);
                                    issueCounter++;
                                    upsertEnggEntity(specificIssue, curentEnggEntity, issueCounter, updateTime, scrum, searchResult, cursor, deltaSince, JIRAProjects, PMStoryID, PMStoryKey);
                                });
                            });
                        }
                    }
                }
            )
            ;
        }
    });
}

function getPMStoryKeyfromJIRA (PMStoryKey, cb) {
    jira.search.search({
        jql: 'key in (' + PMStoryKey + ')',
        startAt: 0,
        maxResults: maxResults,
        fields: [],
        expand: []
    }, function (error, searchResult) {
        if (error) {
            logger.error('jira.search.search' + 'key in (' + PMStoryKey + ')' + 'threw an error. Retrying after 5 secs:');
            logger.error(error);
            // retry after 5 secs for 5 times
            setTimeout(getPMStoryKeyfromJIRA, waitTimeForRetry, PMStoryKey, cb);
        }
        logger.debug('getPMStoryKeyfromJIRA: PMStoryID:' + searchResult.issues[0].id + ' for PMStoryKey:' + PMStoryKey);
        return cb (null, searchResult.issues[0].id);
    });
}

function getPMStoryKey(specificIssue, cb) {
    var PMStoryKey = null;
    var PMStoryID = null;
    if (specificIssue.fields.customfield_10017) {
        PMStoryKey = specificIssue.fields.customfield_10017;
        getModel().getPMStoryIDFromPMStoryKey(PMStoryKey, (err, PMStoryID) => {
            if (err) {
                logger.error(err);
                return cb (err, null);
            }
            if (!PMStoryID) {
                // connect to JIRA to get the PMStoryKey
                logger.debug('PMStoryID is null for PMStoryKey:' + PMStoryKey);
                getPMStoryKeyfromJIRA(PMStoryKey, (err, PMStoryID) => {
                    if (err) return cb (err, null);
                    else return cb (null, PMStoryID, PMStoryKey);
                });

            }
            else return cb (null, PMStoryID, PMStoryKey);
        });
    }
    else {
        for (var indexLink = 0; indexLink < specificIssue.fields.issuelinks.length; indexLink++) {
            var specificIssueLink = specificIssue.fields.issuelinks[indexLink];
            if (specificIssueLink.inwardIssue && (specificIssueLink.type.inward.toLowerCase() == 'is caused by' || specificIssueLink.type.inward.toLowerCase() == 'relates to')) {
                PMStoryKey = specificIssueLink.inwardIssue.key;
                PMStoryID = specificIssueLink.inwardIssue.id;
                return cb(null, PMStoryID, PMStoryKey);
            }
        }
        return cb(null, null, null);
    }
}

function upsertEnggEntity(specificIssue, curentEnggEntity, issueCounter, updateTime, scrum, searchResult, cursor, deltaSince, JIRAProjects, PMStoryID, PMStoryKey) {
    // let's get its changelog
    var arrayHistories = specificIssue.changelog.histories;
    var acceptedDate = null;
    // var createDate = specificIssue.fields.created.substring(0,10);
    var createDate = specificIssue.fields.created;
    var createDateMsec = new Date(createDate).getTime();

    var statusHistory = [];
    var sprintHistory = [];
    var storyPointsHistory = [];
    var fixVersionHistory = [];

    // let's first set the current information with create date assuming we don't find any history for anything
    statusHistory.push(JSON.stringify([createDate, createDateMsec, specificIssue.fields.status.name]));

    if (specificIssue.fields.customfield_10109 != null) storyPointsHistory.push(JSON.stringify([createDate, createDateMsec, parseInt(specificIssue.fields.customfield_10109, 10)]));
    else storyPointsHistory.push(JSON.stringify([createDate, createDateMsec, null]));

    var currentFixVersions = null;
    if (specificIssue.fields.fixVersions != null) {

        logger.debug('specificIssue.fields.fixVersions:' + JSON.stringify(specificIssue.fields.fixVersions));
        currentFixVersions = [];
        for (var idxFixVersions=0; idxFixVersions < specificIssue.fields.fixVersions.length; idxFixVersions++) {
            currentFixVersions.push(specificIssue.fields.fixVersions[idxFixVersions].name);
        }
    }
    fixVersionHistory.push(JSON.stringify([createDate, createDateMsec, currentFixVersions]));

    var currentSprintsStrArray = null;
    var sprintsTravelled = null;

    if (specificIssue.fields.customfield_10016 != null) {
        var currentSprintsObjArray = specificIssue.fields.customfield_10016;
        currentSprintsStrArray = [];
        sprintsTravelled = [];

        for (var idxCurrentSprintsArray=0; idxCurrentSprintsArray < currentSprintsObjArray.length; idxCurrentSprintsArray++) {
            let keyName = ',name='; // this is the string to look for in currentSprintStr
            let indexOfName = currentSprintsObjArray[idxCurrentSprintsArray].indexOf(keyName);
            let indexOfNextComma = currentSprintsObjArray[idxCurrentSprintsArray].indexOf(',', indexOfName + 1);
            let sprintName = currentSprintsObjArray[idxCurrentSprintsArray].substring(indexOfName + keyName.length, indexOfNextComma);
            currentSprintsStrArray.push(sprintName);
            sprintsTravelled.push(sprintName);
        }
    }
    sprintHistory.push(JSON.stringify([createDate, createDateMsec, currentSprintsStrArray]));

    var firstSprint = null;
    if (currentSprintsStrArray && (currentSprintsStrArray.join().startsWith('CON - Iteration') || currentSprintsStrArray.join().startsWith('Iteration'))) firstSprint = currentSprintsStrArray.join();

    // now let's iterate thru history, and shift data if we find something
    var indexHistories = arrayHistories.length;
//    for (var indexHistories = arrayHistories.length - 1; indexHistories >=  0; indexHistories--) {
    while (indexHistories >  0) {
        indexHistories--;
        var specificHistory = arrayHistories[indexHistories];
        var dateHistoryStr = specificHistory.created;
        var dateHistoryObj = new Date(dateHistoryStr);
        var dateHistoryMsec = dateHistoryObj.getTime();

        for (var indexSpecificHistoryItems = specificHistory.items.length - 1; indexSpecificHistoryItems >= 0; indexSpecificHistoryItems--) {
            var historyItem = specificHistory.items[indexSpecificHistoryItems];
            if(historyItem.field == 'status') {
                let lastItemStatusHistory = JSON.parse(statusHistory.pop());
                statusHistory.push(JSON.stringify([dateHistoryStr, dateHistoryMsec, lastItemStatusHistory[2]]));
                statusHistory.push(JSON.stringify([lastItemStatusHistory[0], lastItemStatusHistory[1], historyItem.fromString]));

                if (historyItem.toString == 'Accepted' && !acceptedDate) {
                    acceptedDate = dateHistoryObj;
                    // acceptedDate = dateHistoryObj.getFullYear() + '-' + (dateHistoryObj.getMonth() + 1) + '-' + dateHistoryObj.getDate();
                }
            }
            if(historyItem.field == 'Sprint') {
                let lastItemSprintHistory = JSON.parse(sprintHistory.pop());
                sprintHistory.push(JSON.stringify([dateHistoryStr, dateHistoryMsec, lastItemSprintHistory[2]]));
                sprintHistory.push(JSON.stringify([lastItemSprintHistory[0], lastItemSprintHistory[1], historyItem.fromString]));
                if (historyItem.fromString != null && (historyItem.fromString.startsWith('CON - Iteration') || historyItem.fromString.startsWith('Iteration'))) firstSprint = historyItem.fromString;
                else if (historyItem.toString.startsWith('CON - Iteration') || historyItem.toString.startsWith('Iteration')) firstSprint = historyItem.toString;
                // firstSprint = (historyItem.fromString != null ? historyItem.fromString : historyItem.toString);
                // let's see if the historyItem.fromString has two sprints, if so then break it into two and store in Sprints travelled
                if(historyItem.fromString != null) {
                    logger.debug('historyItem.fromString:' + historyItem.fromString);
                    let arraySprints = historyItem.fromString.split(', ');
                    for (var idxarraySprints = 0; idxarraySprints < arraySprints.length; idxarraySprints++) {
                        if (!sprintsTravelled) sprintsTravelled = [];
                        if (sprintsTravelled.indexOf(arraySprints[idxarraySprints]) == -1) sprintsTravelled.push(arraySprints[idxarraySprints]);
                    }
                }
            }
            if(historyItem.field == 'Story Points') {
                let lastItemStoryPointsHistory = JSON.parse(storyPointsHistory.pop());
                storyPointsHistory.push(JSON.stringify([dateHistoryStr, dateHistoryMsec, lastItemStoryPointsHistory[2]]));
                storyPointsHistory.push(JSON.stringify([lastItemStoryPointsHistory[0], lastItemStoryPointsHistory[1], historyItem.fromString]));
            }
            if(historyItem.field == 'Fix Version') {
                let lastItemFixVersionsHistory = JSON.parse(fixVersionHistory.pop());
                var newFixVersion = lastItemFixVersionsHistory[2];
                logger.debug('newFixVersion:' + newFixVersion);

                // let fixVersionsFromPop = null
                if(fixVersionHistory.length > 0 && JSON.parse(fixVersionHistory[fixVersionHistory.length - 1])[1] == dateHistoryMsec) {
                    // fixVersionsFromPop = JSON.parse(fixVersionHistory[fixVersionHistory.length - 1])[2];
                    // fixVersionHistory.pop();
                }
                else fixVersionHistory.push(JSON.stringify([dateHistoryStr, dateHistoryMsec, newFixVersion]));

                if (historyItem.fromString == null) {
                    logger.debug('newFixVersion:' + JSON.stringify(newFixVersion));
                    if (newFixVersion.indexOf(historyItem.toString) != -1) newFixVersion.splice(newFixVersion.indexOf(historyItem.toString), 1);
                }
                if (historyItem.toString == null) {
                    newFixVersion.push(historyItem.fromString);
                }
                fixVersionHistory.push(JSON.stringify([lastItemFixVersionsHistory[0], lastItemFixVersionsHistory[1], newFixVersion]));
            }
        }
    }

    logger.debug('firstSprint:' + firstSprint);
    if (firstSprint) {
        getModel().getIterationDates(firstSprint, (err, firstSprintStartDate, firstSprintStartDateMsec, firstSprintEndDate, firstSprintEndDateMsec) => {
            if (err) {
                logger.error(err);
                buildEnggEntity(specificIssue, searchResult, issueCounter, cursor, deltaSince, updateTime, JIRAProjects, PMStoryID, PMStoryKey, statusHistory, fixVersionHistory, storyPointsHistory, scrum, acceptedDate, firstSprint, sprintHistory, null, currentFixVersions, currentSprintsStrArray, sprintsTravelled);
                return;
            }
            if (!firstSprintStartDate) {
                logger.error('firstSprintStartDate:' + firstSprintStartDate);
                buildEnggEntity(specificIssue, searchResult, issueCounter, cursor, deltaSince, updateTime, JIRAProjects, PMStoryID, PMStoryKey, statusHistory, fixVersionHistory, storyPointsHistory, scrum, acceptedDate, firstSprint, sprintHistory, null, currentFixVersions, currentSprintsStrArray, sprintsTravelled);
                return;
            }
            if (firstSprintStartDate) {
                logger.debug('firstSprintStartDate:' + firstSprintStartDate);
                buildEnggEntity(specificIssue, searchResult, issueCounter, cursor, deltaSince, updateTime, JIRAProjects, PMStoryID, PMStoryKey, statusHistory, fixVersionHistory, storyPointsHistory, scrum, acceptedDate, firstSprint, sprintHistory, firstSprintStartDate, currentFixVersions, currentSprintsStrArray, sprintsTravelled);
                return;
            }
        });
    }
    else
        buildEnggEntity(specificIssue, searchResult, issueCounter, cursor, deltaSince, updateTime, JIRAProjects, PMStoryID, PMStoryKey, statusHistory, fixVersionHistory, storyPointsHistory, scrum, acceptedDate, firstSprint, sprintHistory, null, currentFixVersions, currentSprintsStrArray, sprintsTravelled);
    return;
}

function buildPMEntity(specificIssue, updateTime, cb) {
    // let's get its changelog
    var arrayHistories = specificIssue.changelog.histories;
    var acceptedDate = null;
    // var createDate = specificIssue.fields.created.substring(0,10);
    var createDate = specificIssue.fields.created;
    var createDateMsec = new Date(createDate).getTime();

    var statusHistory = [];

    // let's first set the current information with create date assuming we don't find any history for anything
    statusHistory.push(JSON.stringify([createDate, createDateMsec, specificIssue.fields.status.name]));

    // now let's iterate thru history, and shift data if we find something
    var indexHistories = arrayHistories.length;
    while (indexHistories >  0) {
        indexHistories--;
        var specificHistory = arrayHistories[indexHistories];
        var dateHistoryStr = specificHistory.created;
        var dateHistoryObj = new Date(dateHistoryStr);
        var dateHistoryMsec = dateHistoryObj.getTime();

        for (var indexSpecificHistoryItems = specificHistory.items.length - 1; indexSpecificHistoryItems >= 0; indexSpecificHistoryItems--) {
            var historyItem = specificHistory.items[indexSpecificHistoryItems];
            if(historyItem.field == 'status') {
                let lastItemStatusHistory = JSON.parse(statusHistory.pop());
                statusHistory.push(JSON.stringify([dateHistoryStr, dateHistoryMsec, lastItemStatusHistory[2]]));
                statusHistory.push(JSON.stringify([lastItemStatusHistory[0], lastItemStatusHistory[1], historyItem.fromString]));

                if (historyItem.toString == 'Accepted' && !acceptedDate) {
                    acceptedDate = dateHistoryObj;
                    // acceptedDate = dateHistoryObj.getFullYear() + '-' + (dateHistoryObj.getMonth() + 1) + '-' + dateHistoryObj.getDate();
                }
            }
        }
    }

    var PMStoryEntity = {
        key: getModel().ds.key(['PMStory', parseInt(specificIssue.id, 10)]),
        data: [
            {
                name: 'entityUpdateTime',
                value: updateTime.toJSON()
            },
            {
                name: 'entityUpdateTimeMsec',
                value: updateTime.getTime()
            },
            {
                name: 'createTimeMsec',
                value: new Date(specificIssue.fields.created).getTime()
            },
            {
                name: 'createTime',
                value: new Date(specificIssue.fields.created).toJSON()
            },
            {
                name: 'currentKey',
                value: specificIssue.key
            },
            {
                name: 'id',
                value: specificIssue.id
            },
            {
                name: 'summary',
                value: specificIssue.fields.summary
            },
            {
                name: 'status',
                value: specificIssue.fields.status.name
            },
            {
                name: 'connectivityInvestment',
                value: specificIssue.fields.customfield_14407
            },
            {
                name: 'PMOwner',
                value: specificIssue.fields.assignee == null ? null : specificIssue.fields.assignee.name
            },
            {
                name: 'fixVersion',
                value: specificIssue.fields.fixVersions.map((obj) => {
                        return obj.name
                    }
                ),
                excludeFromIndexes: true
            },
            {
                name: 'updatedMsec',
                value: new Date(specificIssue.fields.updated).getTime()
            },
            {
                name: 'components',
                value: specificIssue.fields.components.map((obj) => {
                        return obj.name
                    }
                ),
                excludeFromIndexes: true
            },
            {
                name: 'statusHistory',
                value: statusHistory,
                excludeFromIndexes: true
            },
        ]
    };
    return cb(PMStoryEntity);
}

function buildEnggEntity(specificIssue, searchResult, issueCounter, cursor, deltaSince, updateTime, JIRAProjects, PMStoryID, PMStoryKey, statusHistory, fixVersionHistory, storyPointsHistory, scrum, acceptedDate, firstSprint, sprintHistory, firstSprintStartDate, currentFixVersions, currentSprintsStrArray, sprintsTravelled) {
    var dateCreatedObj = new Date(specificIssue.fields.created);
    var dateCreatedMsec = dateCreatedObj.getTime();
    var dateCreatedStr = dateCreatedObj.getFullYear() + '-' + (dateCreatedObj.getMonth() + 1) + '-' + dateCreatedObj.getDate();
    var EnggStoryEntityKey = getModel().ds.key(['EnggStory', parseInt(specificIssue.id, 10)]);
    var EnggStoryEntity = {
        key: EnggStoryEntityKey,
        data: [
            {
                name: 'entityUpdateTimeMsec',
                value: updateTime.getTime()
            },
            {
                name: 'entityUpdateTime',
                value: updateTime.toJSON()
            },
            {
                name: 'PMStoryID',
                value: PMStoryID ? parseInt(PMStoryID, 10) : null
            },
            {
                name: 'PMStoryKey',
                value: PMStoryKey
            },
            {
                name: 'currentKey',
                value: specificIssue.key
            },
            {
                name: 'summary',
                value: specificIssue.fields.summary,
                excludeFromIndexes: true
            },
            {
                name: 'currentStatus',
                value: specificIssue.fields.status.name
            },
            {
                name: 'sprintsTravelled',
                value: sprintsTravelled
            },
            {
                name: 'statusHistory',
                value: statusHistory,
                excludeFromIndexes: true
            },
            {
                name: 'updatedMsec',
                value: new Date(specificIssue.fields.updated).getTime()
            },
            {
                name: 'acceptanceReviewedByPM',
                value: specificIssue.fields.customfield_16602 ? 'Yes' : 'No'
            },
            {
                name: 'fixVersion',
                value: currentFixVersions,
                excludeFromIndexes: true
            },
            {
                name: 'fixVersionHistory',
                value: fixVersionHistory,
                excludeFromIndexes: true
            },
            {
                name: 'storyPoints',
                value: specificIssue.fields.customfield_10109 == null ? null : parseInt(specificIssue.fields.customfield_10109, 10),
                excludeFromIndexes: true
            },
            {
                name: 'storyPointsHistory',
                value: storyPointsHistory,
                excludeFromIndexes: true
            },
            {
                name: 'scrum',
                value: scrum
            },
            {
                name: 'issueType',
                value: specificIssue.fields.issuetype.name,
                excludeFromIndexes: true
            },
            {
                name: 'dateCreated',
                value: dateCreatedStr
            },
            {
                name: 'dateCreatedMsec',
                value: dateCreatedMsec
            },
            {
                name: 'timeSpent',
                value: specificIssue.fields.timespent,
                excludeFromIndexes: true
            },
            {
                name: 'acceptedDateMsec',
                value: acceptedDate ? acceptedDate.getTime() : null
            },
            {
                name: 'acceptedDate',
                value: acceptedDate ? acceptedDate.getFullYear() + '-' + (acceptedDate.getMonth() + 1) + '-' + acceptedDate.getDate() : null
            },
            {
                name: 'currentSprint',
                value: currentSprintsStrArray
            },
            {
                name: 'firstSprint',
                value: firstSprint
            },
            {
                name: 'firstSprintStartDate',
                value: firstSprintStartDate
            },
            {
                name: 'sprintHistory',
                value: sprintHistory,
                excludeFromIndexes: true
            }
        ]
    };
    logger.debug('about to create engg entity:' + JSON.stringify(EnggStoryEntity));
    logger.debug('updateTime:' + updateTime);
    saveEntity(EnggStoryEntity, 'EnggStory', specificIssue, searchResult.issues.length, searchResult.total, issueCounter, cursor, deltaSince, updateTime, JIRAProjects);
}

function saveEntity(entity, entityType, specificIssue, totalIssuesInthisSearch, searchResultTotal, issueCounter, cursor, deltaSince, updateTime, JIRAProjects) {
    getModel().ds.save(entity, (err) => {
        if (err) {
            logger.error('Could not save entity for issueID:' + specificIssue.id + ', key:' + specificIssue.key);
            logger.error(err);
        }
        else {
            logger.info('updated ' + entityType + ' for issueID:' + specificIssue.id + ', key:' + specificIssue.key);
        }
        logger.debug('issueCounter:' + issueCounter + ', totalIssuesInthisSearch:' + totalIssuesInthisSearch);
        if (issueCounter == totalIssuesInthisSearch) {
            logger.debug('done with page:' + issueCounter);
            if (cursor + maxResults >= searchResultTotal) {
                searchComplete(updateTime, JIRAProjects);
                return;
            }
            else {
                cursor = cursor + maxResults;
                processSearchResults(JIRAProjects, cursor, updateTime, deltaSince);
            }
        }
    });
}

function searchComplete(updateTime, JIRAProjects) {
    getModel().writeLastUpdateTime(updateTime.getTime(), (err) => {
        if (err) logger.error('writeLastUpdateTime failed');
        var resetCursor = 0;
        setTimeout(processSearchResults, frequencyprocessSearchResults, JIRAProjects, resetCursor, new Date(), updateTime.getTime());
        return;
    });
}

function processEntitiesForGroomingHealth(scrums, groomingHealthEngg, groomingHealthPMReviewed, token, cb) {
    getModel().getReadyReadyEnggStories(token, (err, entities, hasMore) => {
        if (err) {
            logger.error(err);
            return cb(err, scrums, groomingHealthEngg, groomingHealthPMReviewed);
        }
        for (var i = 0; i < entities.length; i++) {
            console.log('entities[' + i + '].data.scrum:' + entities[i].data.scrum);
            console.log('entities[' + i + '].data.storyPoints:' + entities[i].data.storyPoints);

            if (!scrums && !groomingHealthEngg && !groomingHealthPMReviewed) {
                scrums = [entities[i].data.scrum];
                groomingHealthEngg = entities[i].data.storyPoints ? [parseInt(entities[i].data.storyPoints, 10)] : [0];
                groomingHealthPMReviewed = (entities[i].data.acceptanceReviewedByPM == 'Yes' && entities[i].data.storyPoints) ? [parseInt(entities[i].data.storyPoints, 10)] : [0];
            }
            else {
                var scrumIndex = scrums.indexOf(entities[i].data.scrum);
                if (scrumIndex == -1) {
                    for (var scrumOrder = 0; scrumOrder < scrums.length; scrumOrder++) {
                        if (scrums[scrumOrder] > entities[i].data.scrum) {
                            scrums.splice(scrumOrder, 0, entities[i].data.scrum);
                            groomingHealthEngg.splice(scrumOrder, 0, entities[i].data.storyPoints ? [parseInt(entities[i].data.storyPoints, 10)] : [0]);
                            groomingHealthPMReviewed.splice(scrumOrder, 0, (entities[i].data.acceptanceReviewedByPM == 'Yes' && entities[i].data.storyPoints) ? [parseInt(entities[i].data.storyPoints, 10)] : [0]);
                            break;
                        }
                        else if (scrumOrder == scrums.length - 1) {
                            scrums.push(entities[i].data.scrum);
                            groomingHealthEngg.push(entities[i].data.storyPoints ? [parseInt(entities[i].data.storyPoints, 10)] : [0]);
                            groomingHealthPMReviewed.push((entities[i].data.acceptanceReviewedByPM == 'Yes' && entities[i].data.storyPoints) ? [parseInt(entities[i].data.storyPoints, 10)] : [0]);
                            break;
                        }
                    }
                }
                else {
                    groomingHealthEngg[scrumIndex] = parseInt(groomingHealthEngg[scrumIndex], 10) + (entities[i].data.storyPoints ? parseInt(entities[i].data.storyPoints, 10) : 0);
                    groomingHealthPMReviewed[scrumIndex] = parseInt(groomingHealthPMReviewed[scrumIndex], 10) + ((entities[i].data.acceptanceReviewedByPM == 'Yes' && entities[i].data.storyPoints) ? parseInt(entities[i].data.storyPoints, 10) : 0);
                }
            }
        }
        console.log('scrums:' + JSON.stringify(scrums));
        console.log('groomingHealthEngg:' + JSON.stringify(groomingHealthEngg));
        console.log('groomingHealthPMReviewed:' + JSON.stringify(groomingHealthPMReviewed));

        if (!hasMore) return cb (null, scrums, groomingHealthEngg, groomingHealthPMReviewed);
        else return processEntitiesForGroomingHealth(scrums, groomingHealthEngg, groomingHealthPMReviewed, hasMore, cb);
    });
}

function _getGroomingHealth(cb) {
    var token = 0;
    var groomingScrums = null;
    var groomingHealthEngg = null;
    var groomingHealthPMReviewed = null;

    processEntitiesForGroomingHealth(groomingScrums, groomingHealthEngg, groomingHealthPMReviewed, token, (err, groomingScrums, groomingHealthEngg, groomingHealthPMReviewed) => {
        return cb (err, groomingScrums, groomingHealthEngg, groomingHealthPMReviewed);
    });
}

function _deltaAgg(optionSelected) {
    var JIRAProjects;
    if (optionSelected == 'all') JIRAProjects = AllJIRAProjects;
    else JIRAProjects = optionSelected;

    getModel().getLastUpdateTime(JIRAProjects, (err, JIRAProjects, deltaSince) => {
        if (err) {
            logger.error('Could not get last update time.');
            logger.error(err);
            return;
        }
        var cursor = 0;
        processSearchResults(JIRAProjects, cursor, new Date(), deltaSince);
    });
}

module.exports = {
    deltaAgg: _deltaAgg,
    copyWeeklyData: _copyWeeklyData,
    copyData,
    getGroomingHealth: _getGroomingHealth
}