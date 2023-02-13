import { Database } from "arangojs";
import { Config } from "arangojs/connection";
import { DocumentData } from "arangojs/documents";
import crypto from "crypto";
import session from "express-session";

// Database options
export interface ArangoSessionStoreDatabase {
  url: string;
  databaseName: string;
  auth: {
    username: string;
    password: string;
  };
}

// Hash options
export type ArangoSessionStoreHash = {
  algorithm: string;
  salt: string;
};

// Options object
export interface ArangoSessionStoreOptions {
  db: Database | Config;
  collection: string;
  hash: boolean | ArangoSessionStoreHash;
  autoRemove: boolean;
  disableTouch: boolean;
  serialize: (s: ArangoSessionData) => ArangoSessionData;
  deserialize: (s: ArangoSessionData) => ArangoSessionData;
}

// Define default options
const defaultOptions = {
  collection: "sessions", // collection name
  hash: true, // encrypt sid, true for defaults, false to turn off, or {salt, algorithm}
  autoRemove: true, // turn off db ttl index
  disableTouch: false, // prevent express-session updating expirey on touch
  serialize: (s: ArangoSessionData) => s, // lazy default so no need for if statements
  deserialize: (s: ArangoSessionData) => s, // lazy default so no need for if statements
};

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Session data stored in database
type ArangoSessionData = DocumentData<
  session.SessionData & {
    expires?: Date;
  }
>;

// Constructor arguments, make all default options optional.
type Options = PartialBy<
  ArangoSessionStoreOptions,
  keyof typeof defaultOptions
>;

class ArangoSessionStore extends session.Store {
  private options: ArangoSessionStoreOptions;
  private db: Database;
  private hash?: ArangoSessionStoreHash;

  private initiatedCollection = false;

  constructor(options: Options) {
    super();

    const opts: ArangoSessionStoreOptions = {
      ...defaultOptions,
      ...options,
    };
    const { db, hash } = opts;

    if (db instanceof Database) {
      if (!db.isArangoDatabase)
        throw new Error("Database is not an Arango database");

      this.db = db;
    } else {
      this.db = new Database(db);
    }

    if (hash) {
      this.hash = {
        salt: "connect-arango",
        algorithm: "sha1",
        ...(typeof hash === "boolean" ? {} : hash),
      };
    }

    this.options = opts;
  }

  private serialize(s: ArangoSessionData) {
    try {
      return this.options.serialize?.(s);
    } catch {
      throw Error("Serialization failed.");
    }
  }

  private deserialize(s: ArangoSessionData) {
    try {
      return this.options.deserialize(s);
    } catch {
      throw Error("Serialization failed.");
    }
  }

  // make sure collection is intitiated
  // and return collection
  async initCollection() {
    const collection = this.db.collection(this.options.collection);

    if (!this.initiatedCollection) {
      if (!(await collection.exists())) {
        await collection.create();
      }

      if (this.options.autoRemove) {
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

  hashId(sid: string) {
    return this.hash
      ? crypto
          .createHash(this.hash.algorithm)
          .update(this.hash.salt + sid)
          .digest("hex")
      : sid;
  }

  /**
   * Gets the session from the store given a session ID and passes it to `callback`.
   *
   * The `session` argument should be a `Session` object if found, otherwise `null` or `undefined` if the session was not found and there was no error.
   * A special case is made when `error.code === 'ENOENT'` to act like `callback(null, null)`.
   */
  async get(
    sid: string,
    callback: (err: unknown, session?: session.SessionData | null) => void
  ) {
    sid = this.hashId(sid);

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
  }

  /** Upsert a session in the store given a session ID and `SessionData` */
  async set(
    sid: string,
    session: session.SessionData,
    callback?: (err?: unknown) => void
  ) {
    sid = this.hashId(sid);

    try {
      const arangoSession = this.serialize({
        _key: sid,
        // expires can also be timestamp in seconds but they don't seem to autoRemove at the correct times
        // date seems to work as expected however
        expires: session?.cookie?.expires,
        ...session, // avoid mutating the session
      });

      const collection = await this.collection;
      await collection.save(arangoSession, {
        overwrite: true, // depricated in arango 3.7
        overwriteMode: "update", // arango 3.7+
      });

      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  /** "Touches" a given session, resetting the idle timer. */
  async touch(
    sid: string,
    session: session.SessionData,
    callback?: () => void
  ) {
    if (this.options.disableTouch) {
      callback?.();
    } else {
      await this.set(sid, session, callback);
    }
  }

  /** Destroys the dession with the given session ID. */
  async destroy(sid: string, callback?: (err?: unknown) => void) {
    sid = this.hashId(sid);
    try {
      const collection = await this.collection;

      if (await collection.documentExists(sid)) {
        await collection.remove(sid);
      }

      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  /** Delete all sessions from the store. */
  async clear(callback?: (err?: unknown) => void) {
    try {
      const collection = await this.collection;
      await collection.truncate();

      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  /** Returns the amount of sessions in the store. */
  async length?(callback: (err: unknown, length: number) => void) {
    try {
      const collection = await this.collection;
      const { count: length } = await collection.count();

      callback?.(null, length);
    } catch (err) {
      // express-session expects undefined if error is called.
      // connect-mongo uses ts-ignore, which is not to prefer, so we do explicit cast instead
      callback?.(err, undefined as unknown as number);
    }
  }

  /** Returns all sessions in the store */
  // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/38783, https://github.com/expressjs/session/pull/700#issuecomment-540855551
  async all?(
    callback: (
      err: unknown,
      obj?:
        | session.SessionData[]
        | { [sid: string]: session.SessionData }
        | null
    ) => void
  ) {
    try {
      const cursor = await this.db.query(`
				FOR doc IN ${this.options.collection}
				RETURN doc
			`);
      callback(null, await cursor.map((s) => this.deserialize(s)));
    } catch (err) {
      callback(err);
    }
  }
}

export default ArangoSessionStore;
