let arango = require('arangojs');
let url = require('url');

let defaultOptions = {
    schema: 'http'
};

let DatabaseHelper = module.exports = function(config, collectionName) {
  this.db = new arango.Database(config);
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
	ensureCollection: async function () {
		let collection = this.db.collection(this.collectionName);
		if (!(await collection.exists())) {
			await collection.create();
		}
		const indexes = await collection.indexes();
		if (indexes.filter((index) => index.type === "skiplist").length > 0) {
			collection.createSkipList(["expires"]);
		}
		return collection;
	},

	collection: function () {
		return new DatabaseHelper.Collection(this.db, this.collectionName);
	},
};
