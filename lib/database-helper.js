var arango = require('arangojs');
var url = require('url');

var defaultOptions = {};

var DatabaseHelper = module.exports = function(options, collectionName) {
  options = options || {};

  this.db = arango({
    url: options.url,
    databaseName: options.databaseName,
  });

  var db_url = url.parse(options.url);
  if (db_url.auth) {
    var auth = db_url.auth.split(':');

    if (auth.length >= 1) {
      options.username = auth[ 0 ];
    }

    if (auth.length >= 2) {
      options.password = auth[ 1 ];
    }
  }

  this.options = options;
  this.collectionName = collectionName;
};

DatabaseHelper.Collection = function(db, name) {
    this.collection = db.collection(name);
};

DatabaseHelper.Collection.prototype = {
    findOne: function(example, options) {
      return this.collection.firstExample(example, options);
    },
    insert: function(data, options) {
      return this.collection.save(data, options);
    },
    update: function(example, newValue, options) {
      return this.collection.updateByExample(example, newValue, options);
    },
    remove: function(example, options) {
      return this.collection.removeByExample(this.name, example, options);
    },
    truncate: function() {
      return this.collection.truncate();
    },
    count: function() {
      return this.collection.count();
    },
};

DatabaseHelper.prototype = {
  ensureCollection: function () {
    var collection = this.db.collection(this.collectionName);;

    // Try to get the info, if error try to create the database;
    return collection.get().catch(function (e) {
      return collection.create();
    }).then(function () {
      return collection.indexes();
    }).then(function (indexes) {
      var exists = indexes.filter(function (index) {
        return index.type === 'skiplist';
      }).length > 0;

      if (!exists) {
        collection.createSkipList(['expires']);
      }

      return collection;
    });
  },

  collection: function () {
    return new DatabaseHelper.Collection(this.db, this.collectionName);
  }
};
