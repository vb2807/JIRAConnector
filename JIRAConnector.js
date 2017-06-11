/**
 * Created by vikas.bansal on 12/04/17.
 */

'use strict';

var groomingHealthScrums = [];
var groomingHealthStoryPoints = [];
var EnggStoriesPromises = [];
var PMStoryPromises = [];
var groomingData = [];
const config = require('./config');
const Datastore = require('@google-cloud/datastore');
var schedule = require('node-schedule');
var winston = require('winston');
// require('winston-gae');

const tsFormat = () => (new Date()).toString();
const maxResults = 50;
const waitTimeForRetry = 1000;
const frequencyprocessSearchResults = 60000;
const AllJIRAProjects = 'CIQ, CDN, CONBOGIBEE, CONMF, CONHOWRAH, CONVASHI, CONUMSHIAN, CONPAMBAN, CONNAMDANG, CONHELIX, CONELLIS, CONSEALINK, CONJADUKAT, CONCHENAB';

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
        username: '',
        password: ''
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
});

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
    var JQLString = "project in (" + JIRAProjects + ") and  issuetype in (Story, Epic) and status = 'Accepted'"
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
            "timespent",
            "customfield_10016",
            "customfield_10109",
            "fixVersions",
            "assignee",
            "customfield_14407",
            "components"
        ],
        expand: [
            "transitions.fields",
            "changelog.fields"
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
                /*
                getModel().writeLastUpdateTime(updateTime.getTime(), (err) => {
                    if (err) logger.error('writeLastUpdateTime failed');
                    var resetCursor = 0;
                    setTimeout(processSearchResults, frequencyprocessSearchResults, JIRAProjects, resetCursor, new Date(), updateTime.getTime());
                    return;
                });
                */
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
                        if (scrum == 'CIQ' || scrum == 'CDN' || scrum == 'CONPM' || scrum == 'CON') PMStoryFlag = true;
                        if (PMStoryFlag) {
                            if (specificIssue.fields.assignee == null) {
                                jira.issue.addComment({
                                    issueId: specificIssue.id,
                                    comment: {'body': '[~vikas.bansal]' + ' Assignee is not defined for this PM Epic / Story.'}
                                }, function (error, result) {
                                    if (error) logger.error(error);
                                    else logger.error("Assigneed not defined for:" + specificIssue.key);
                                });
                            }
                            var PMStoryKey = getModel().ds.key(['PMStory', parseInt(specificIssue.id, 10)]);
                            var PMStoryEntity = {
                                    key: PMStoryKey,
                                    data: [
                                        {
                                            name: 'entityUpdateTime',
                                            value: updateTime.toJSON()
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
                                            name: 'components',
                                            value: specificIssue.fields.components.map((obj) => {
                                                    return obj.name
                                                }
                                            ),
                                            excludeFromIndexes: true
                                        }
                                        ,
                                    ]
                                }
                            ;
                            // console.log('about to create PM entity:' + JSON.stringify(PMStoryEntity));
                            issueCounter++;
                            saveEntity(PMStoryEntity, 'PMStory', specificIssue, searchResult.issues.length, searchResult.total, issueCounter, cursor, deltaSince, updateTime, JIRAProjects);
                        }
                        else {
                            var PMStoryKey = null;
                            var PMStoryID = null;
                            for (var indexLink = 0; indexLink < specificIssue.fields.issuelinks.length; indexLink++) {
                                var specificIssueLink = specificIssue.fields.issuelinks[indexLink];
                                if (specificIssueLink.inwardIssue && (specificIssueLink.type.inward.toLowerCase() == 'is caused by' || specificIssueLink.type.inward.toLowerCase() == 'relates to')) {
                                    PMStoryKey = specificIssueLink.inwardIssue.key;
                                    PMStoryID = specificIssueLink.inwardIssue.id;
                                    break;
                                }
                            }
                            var EnggStoryEntityKey = getModel().ds.key(['EnggStory', parseInt(specificIssue.id, 10)]);
                            var EnggStoryEntity = {
                                    key: EnggStoryEntityKey,
                                    data: [
                                        {
                                            name: 'entityUpdateTime',
                                            value: updateTime.toJSON()
                                        },
                                        {
                                            name: 'PMStoryID',
                                            value: PMStoryID
                                        },
                                        {
                                            name: 'PMStoryKey',
                                            value: PMStoryKey,
                                            excludeFromIndexes: true
                                        },
                                        {
                                            name: 'currentKey',
                                            value: specificIssue.key,
                                            excludeFromIndexes: true
                                        },
                                        {
                                            name: 'summary',
                                            value: specificIssue.fields.summary,
                                            excludeFromIndexes: true
                                        },
                                        {
                                            name: 'status',
                                            value: specificIssue.fields.status.name
                                        },
                                        {
                                            name: 'fixVersion',
                                            value: specificIssue.fields.fixVersions.map((obj) => {
                                                return obj.name
                                            }),
                                            excludeFromIndexes: true
                                        },
                                        {
                                            name: 'storyPoints',
                                            value: specificIssue.fields.customfield_10109 == null ? null : specificIssue.fields.customfield_10109,
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
                                            value: specificIssue.fields.created,
                                            excludeFromIndexes: true
                                        },
                                        {
                                            name: 'timeSpent',
                                            value: specificIssue.fields.timespent,
                                            excludeFromIndexes: true
                                        },
                                        {
                                            name: 'acceptedDate',
                                            value: specificIssue.fields.status == 'Accepted' ? new Date().toJSON() : null
                                        },
                                        {
                                            name: 'sprint',
                                            value: specificIssue.fields.customfield_10016,
                                            excludeFromIndexes: true
                                        }
                                    ]
                                }
                            ;
                            logger.debug('about to create engg entity:' + JSON.stringify(EnggStoryEntity));
                            logger.debug('updateTime:' + updateTime);
                            issueCounter++;
                            saveEntity(EnggStoryEntity, 'EnggStory', specificIssue, searchResult.issues.length, searchResult.total, issueCounter, cursor, deltaSince, updateTime, JIRAProjects);
                        }
                    }
                }
            )
            ;
        }
    });
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
                /*
                getModel().writeLastUpdateTime(updateTime.getTime(), (err) => {
                    if (err) logger.error('writeLastUpdateTime failed');
                    var resetCursor = 0;
                    setTimeout(processSearchResults, frequencyprocessSearchResults, JIRAProjects, resetCursor, new Date(), updateTime.getTime());
                    return;
                });
                */
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

function _deltaAgg(optionSelected) {
    var JIRAProjects;
    if (optionSelected == 'all') JIRAProjects = AllJIRAProjects;
    else JIRAProjects = optionSelected;

    getModel().getLastUpdateTime(JIRAProjects, (err, JIRAProjects, deltaSince) => {
        var cursor = 0;
        if (err) {
            logger.error('Could not get last update time.');
            logger.error(err);
            return;
        }
        processSearchResults(JIRAProjects, cursor, new Date(), deltaSince);
    });
}

module.exports = {
    deltaAgg: _deltaAgg
}