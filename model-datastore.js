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

const Datastore = require('@google-cloud/datastore');
const config = require('./config');

// [START config]
const ds = Datastore({
    projectId: config.get('GCLOUD_PROJECT')
    // projectId: "pmproject-164704"
});
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

function asyncFetchEnggStories (event, pmstoryid, cb) {
    console.log('asyncFetchEnggStories:' + pmstoryid);
    const PMStoryKey = ds.key(['Event', event, 'PMStories', parseInt(pmstoryid, 10)]);
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
            cb('Something wrong. engg stories for PMStory:' + pmstoryid + ' is null', null);
        }
        if (entities) {
            var count = entities.length;
            var returnObj = [];
            if (entities.length == 0) {
                console.log('there are no engg stories for PMStory:' + pmstoryid);
                returnObj.push([]);
                cb(null, returnObj);
            }
            for (var i=0; i < entities.length; i++) {
                returnObj.push(fromDatastore(entities[i]));
                console.log('pushed engg story:' + entities[i].key.id + ', for PMStory:' + pmstoryid);
                count --;
                if(count == 0) {
                    console.log('completed pushing engg stories for PMStory:' + pmstoryid);
                    cb(null, returnObj);
                }
            }
        }
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

function fetchComboStories (event, cb) {
    const EventKey = ds.key(['Event', event]);
    const q = ds.createQuery(['PMStories'])
        .hasAncestor(EventKey);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        // const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        if(!entities || entities.length == 0) {
            cb(null, null);
            return;
        }
        if(entities) {
            var count = entities.length;
            console.log('count total:' + count);
            var comboObj = [];
            // console.log('length of entities map:' + entities.map().length);
            entities.forEach(function(x) {
                console.log(x.key.id);
                asyncFetchEnggStories(event, x.key.id, (err, enggStories) => {
                    if (err) {
                        console.log('could not get enggStories for PMStory:' + x.key.id);
                        console.log(err);
                        count --;
                        if (count == 0) {
                            console.log('completed comboObjs for all PMStories. calling the call back');
                            cb(null, comboObj);
                        }
                    }
                    if (enggStories) {
                        console.log('call back after obtaining all enggstories for PMStory:' + x.key.id);
                        count --;
                        comboObj.push({pmstory: fromDatastore(x), enggstories: enggStories});
                        console.log('pushed the combo object for PMStory:' + x.key.id + ', count:' + count);
                        if (count == 0) {
                            console.log('completed comboObjs for all PMStories. calling the call back');
                            cb(null, comboObj);
                        }
                    }
                    if (!err && !enggStories) {
                        console.log('not sure what happended. call back after obtaining all enggstories for PMStory:' + x.key.id);
                        count --;
                        if (count == 0) {
                            console.log('completed comboObjs for all PMStories. calling the call back');
                            cb(null, comboObj);
                        }
                    }
                });
            });
        }
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

function create (kind, id, parentKind, parentId, data, cb) {
    update(kind, id, parentKind, parentId, data, cb);
}

function read (kind, id, parentID, eventName, cb) {
    const key = ds.key(['Event', eventName, 'PMStories', parseInt(parentID, 10), kind, parseInt(id, 10)]);
    // const key = ds.key(['PMStories', parentID, kind, id]);
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

function _deleteAllStories (kind, cb) {
    const q = ds.createQuery([kind]);

    ds.runQuery(q, (err, entities, nextQuery) => {
        if (err) {
            cb(err);
            return;
        }
        // const hasMore = nextQuery.moreResults !== Datastore.NO_MORE_RESULTS ? nextQuery.endCursor : false;
        // cb(null, entities.map(fromDatastore), hasMore);
        entities.forEach(function(x) {
            _delete(kind, x.key.id, (err) => {
                if (err) {
                    console.log('Error in deleting story. Kind:' + kind + ', key:' + x.key.id);
                    cb(err);
                    return;
                }
                else console.log('Deleted story. Kind:' + kind + ', key:' + x.key.id);
            });
        });
        cb(null);
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
    fetchComboStories: fetchComboStories,
    asyncFetchEvents: asyncFetchEvents,
    fetchPMEntities: fetchPMEntities,
    fetchEnggEntities: fetchEnggEntities,
    getLastUpdateTime: _getLastUpdateTime,
    writeLastUpdateTime: _writeLastUpdateTime,
    reverseLastUpdateTime: _reverseLastUpdateTime,
    getPMStoryEntityViaJIRAKey: _getPMStoryEntityViaJIRAKey,
    ds
};
// [END exports]

