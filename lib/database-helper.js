let arango = require('arangojs');
let url = require('url');

let defaultOptions = {
    schema: 'http'
};

let DatabaseHelper = module.exports = function(options, collectionName) {
  options = options || {};

  options.schema = options.schema || defaultOptions.schema;

  this.db = new arango.Database({
    url: `${options.schema}://${options.host}:${options.port}`
  });
  this.db.useDatabase(options.database);
  this.db.useBasicAuth(options.username, options.password);

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
    let collection = this.db.collection(this.collectionName);;

    // Try to get the info, if error try to create the database;
    return collection.get().catch(function (e) {
      return collection.create();
    }).then(function () {
      return collection.indexes();
    }).then(function (indexes) {
      let exists = indexes.filter(function (index) {
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
