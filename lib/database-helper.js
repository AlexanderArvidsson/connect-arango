let arango = require("arangojs");
let url = require("url");

let defaultOptions = {
	schema: "http",
};

let DatabaseHelper = (module.exports = function (config, collectionName) {
	this.db = new arango.Database(config);
	this.collectionName = collectionName;
});

DatabaseHelper.Collection = function (db, name) {
	this.collection = db.collection(name);
};

DatabaseHelper.Collection.prototype = {
	get: function (id) {
		return this.collection.document(id);
	},
	exists: function (id) {
		return this.collection.documentExists(id);
	},
	insert: function (data, options) {
		return this.collection.save(data);
	},
	update: function (id, data) {
		return this.collection.update(id, data);
	},
	remove: function (id) {
		return this.collection.remove(id);
	},
	truncate: function () {
		return this.collection.truncate();
	},
	count: function () {
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
