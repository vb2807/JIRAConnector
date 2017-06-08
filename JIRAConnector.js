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
        getModel().deleteAllStories('EnggStories', (err) => {
            if (err) console.log(err);
            else
                console.log('In callback after deleting EnggStory');
            return;
        })
        ;
        console.log('EnggStories should be deleted after all callbacks are complete');
        return;
    }


    if (val == 'cleanPM') {
        getModel().deleteAllStories('PMStories', (err) => {
            if (err) console.log(err);
            else
                console.log('In callback after deleting PMStory');
            return;
        })
        ;
        console.log('PMStories should be deleted after all callbacks are complete');
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
        deltaAgg(array[index + 1]);
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

function processSearchResults(JQLString, cursor, maxResults, updateTime) {
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
        ]
    }, function (error, searchResult) {
        if (error) {
            logger.error('An error occurred:' + error);
            // retry
            processSearchResults(JQLString, cursor, maxResults, updateTime);
        }
        else {
            logger.debug(searchResult);
            logger.debug(searchResult.issues.length);
            if (!searchResult || searchResult.issues.length == 0) {
                logger.info('No issues found for the search criteria.');
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
                            getModel().ds.save(PMStoryEntity, (err) => {
                                if (err) {
                                    logger.error(err);
                                    logger.error('Could not save entity for issueID:' + specificIssue.id + ', key:' + specificIssue.key);
                                }
                                else {
                                    logger.info('PMStory entity created for issueID:' + specificIssue.id + ', key:' + specificIssue.key);
                                }
                                issueCounter++;
                                logger.debug('issueCounter:' + issueCounter + ', totalIssuesInthisSearch:' + searchResult.issues.length);
                                if (issueCounter == searchResult.issues.length) {
                                    logger.debug('done with page:' + issueCounter);
                                    if (cursor + maxResults >= searchResult.total) return;
                                    else {
                                        cursor = cursor + maxResults;
                                        processSearchResults(JQLString, cursor, maxResults, updateTime);
                                    }
                                }
                            });
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
                                            value: specificIssue.fields.status.name,
                                            excludeFromIndexes: true
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
                                            name: 'sprint',
                                            value: specificIssue.fields.customfield_10016,
                                            excludeFromIndexes: true
                                        }
                                    ]
                                }
                            ;
                            logger.debug('about to create engg entity:' + JSON.stringify(EnggStoryEntity));
                            logger.debug('updateTime:' + updateTime);
                            getModel().ds.save(EnggStoryEntity, (err) => {
                                if (err) {
                                    logger.error('Could not save entity for issueID:' + specificIssue.id + ', key:' + specificIssue.key);
                                    logger.error(err);
                                    // resolve();
                                    // return;
                                }
                                else {
                                    logger.info('updated `EnggStories` for issueID:' + specificIssue.id + ', key:' + specificIssue.key);
                                }
                                issueCounter++;
                                logger.debug('issueCounter:' + issueCounter + ', totalIssuesInthisSearch:' + searchResult.issues.length);
                                if (issueCounter == searchResult.issues.length) {
                                    logger.debug('done with page:' + issueCounter);
                                    if (cursor + maxResults >= searchResult.total) return;
                                    else {
                                        cursor = cursor + maxResults;
                                        processSearchResults(JQLString, cursor, maxResults, updateTime);
                                    }
                                }
                            });
                        }
                    }
                }
            )
            ;
        }
    });
}


function deltaAgg(optionSelected) {
    var JQLString = null;
    // getModel().getLastUpdateTime().then(function(lastUpdateTime) {
    // var lastUpdateTime = '2017-6-4 12:00';
    const q = getModel().ds.createQuery(['EnggStory'])
        .limit(10)
        .order('entityUpdateTime');

    getModel().ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            logger.error(err);
            return;
        }
        logger.debug('entities:' + JSON.stringify(entities));
        if (entities.length == 0) {
            if (optionSelected == 'all') JQLString = "project in (CIQ, CDN, CONBOGIBEE, CONMF, CONHOWRAH, CONVASHI, CONUMSHIAN, CONPAMBAN, CONNAMDANG, CONHELIX, CONELLIS, CONSEALINK, CONJADUKAT, CONCHENAB) and  issuetype in (Story, Epic)";
            else JQLString = "project in (" + optionSelected + ") and issuetype = Story";
        }
        else {
            var deltaSinceEnggStoriesDateObj = new Date(entities[0].data.entityUpdateTime);
            var deltaSincePMStoriesDateObj = null;
            var deltaSinceDateObj = null;
            const q = getModel().ds.createQuery(['PMStory'])
                .limit(10)
                .order('entityUpdateTime');
            getModel().ds.runQuery(q, (err, entitiesPM, nextQuery) => {
                if (err) {
                    logger.error(err);
                }
                deltaSincePMStoriesDateObj = new Date(entitiesPM[0].data.entityUpdateTime);
            });
            if (deltaSincePMStoriesDateObj) deltaSinceDateObj = deltaSinceEnggStoriesDateObj < deltaSincePMStoriesDateObj ? deltaSinceEnggStoriesDateObj : deltaSincePMStoriesDateObj
            else deltaSinceDateObj = deltaSinceEnggStoriesDateObj;
            var deltaSince = deltaSinceDateObj.getFullYear() + '-' + (deltaSinceDateObj.getMonth() + 1) + '-' + deltaSinceDateObj.getDate() + ' ' + deltaSinceDateObj.getHours() + ':' + deltaSinceDateObj.getMinutes();
            logger.debug('deltaSince:' + deltaSince);
            if (optionSelected == 'all') JQLString = "project in (CIQ, CDN, CONBOGIBEE, CONMF, CONHOWRAH, CONVASHI, CONUMSHIAN, CONPAMBAN, CONNAMDANG, CONHELIX, CONELLIS, CONSEALINK, CONJADUKAT, CONCHENAB) and updatedDate >= '" + deltaSince + "' and  issuetype in (Story, Epic)";
            else JQLString = "project in (" + optionSelected + ") and updatedDate >= '" + deltaSince + "' and issuetype = Story";
        }
        var cursor = 0;
        var maxResults = 50;
        processSearchResults(JQLString, cursor, maxResults, new Date());
    });
}
