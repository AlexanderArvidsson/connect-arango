import session from "express-session";
import { Database } from "arangojs";
import crypto from "crypto";

const noop = () => {};

class ArangoSessionStore extends session.Store {
	constructor(options = {}) {
		super(options);
		let {
			db, //arangosjs Database or options for one
			collection = "sessions", // collection name
			hash = true, // encrypt sid, true for defaults, false to turn off, or {salt, algorithm}
			autoRemove = true, // turn off db ttl index
			disableTouch = false, // prevent express-session updating expirey on touch
			serializer = (s) => s, // lazy default so no need for if statements
			deserializer = (s) => s, // lazy default so no need for if statements
		} = options;

		if (db.isArangoDatabase) {
			this.db = db;
		} else {
			this.db = Database(db);
		}
		this.collectionName = collection;

		if (hash) {
			this.hash = {
				salt: "connect-arango",
				algorithm: "sha1",
				...hash,
			};
		}
		this.autoRemove = autoRemove;
		this.disableTouch = disableTouch;
		this.serialize = (s) => {
			try {
				return serializer(s);
			} catch {
				throw Error("Serialization failed.");
			}
		};
		this.deserialize = (s) => {
			try {
				return deserializer(s);
			} catch {
				throw Error("Deserialization failed.");
			}
		};
	}

	// make sure collection is intitiated
	// and return collection
	async initCollection() {
		const collection = this.db.collection(this.collectionName);
		if (!this.initiatedCollection) {
			if (!(await collection.exists())) {
				await collection.create();
			}
			if (this.autoRemove) {
				// arango will remove doc 0 seconds after the "expires" value
				await collection.ensureIndex({
					name: "sessionExpire",
					type: "ttl",
					fields: ["expires"],
					expireAfter: 0,
				});
			}
			this.initiatedCollection = true;
		}
		return collection;
	}

	// can't use async in constructor - or in getter
	// so setup collection here
	// need to await for collection before use
	get collection() {
		return this.initCollection();
	}

	hashId(sid) {
		return this.hash
			? crypto
					.createHash(this.hash.algorithm)
					.update(this.hash.salt + sid)
					.digest("hex")
			: sid;
	}

	get(sid, callback = noop) {
		sid = this.hashId(sid);
		return (async () => {
			try {
				const collection = await this.collection;
				let session = null;
				if (await collection.documentExists(sid)) {
					session = await collection.document(sid);
					session = this.deserialize(session);
				}
				callback(null, session);
			} catch (err) {
				callback(err);
			}
		})();
	}

	async set(sid, session, callback = noop) {
		sid = this.hashId(sid);
		try {
			session = this.serialize({
				_key: sid,
				// expires can also be timestamp in seconds but they don't seem to autoRemove at the correct times
				// date seems to work as expected however
				expires: session?.cookie?.expires,
				...session, // avoid mutating the session
			});
			const collection = await this.collection;
			await collection.save(session, {
				overwrite: true, // depricated in arango 3.7
				overwriteMode: "update", // arango 3.7+
			});
			callback();
		} catch (err) {
			callback(err);
		}
	}

	async touch(sid, session, callback = noop) {
		if (this.disableTouch) return;
		await this.set(sid, session, callback);
	}

	async destroy(sid, callback = noop) {
		sid = this.hashId(sid);
		try {
			const collection = await this.collection;
			if (await collection.documentExists(sid)) {
				await collection.remove(sid);
			}
			callback();
		} catch (err) {
			callback(err);
		}
	}

	async clear(callback = noop) {
		try {
			const collection = await this.collection;
			await collection.truncate();
			callback();
		} catch (err) {
			callback(err);
		}
	}

	async length(callback = noop) {
		try {
			const collection = await this.collection;
			const length = await collection.count();
			callback(null, length);
		} catch (err) {
			callback(err);
		}
	}

	async all(callback = noop) {
		try {
			const cursor = await db.query(`
				FOR doc IN ${this.collectionName}
				RETURN doc
			`);
			callback(null, await cursor.map((s) => this.deserialize(s)));
		} catch (err) {
			callback(err);
		}
	}
}

module.exports = ArangoSessionStore;
