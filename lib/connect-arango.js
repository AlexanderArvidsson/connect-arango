/*!
 * connect-arango
 * Copyright (c) 2014 Metamist
 * MIT Licensed
 */

/**
 * Module dependencies
 */

let crypto = require('crypto');
let arango = require('arangojs');
let url = require('url');
let debug = require('debug')('connect-arango');
let DatabaseHelper = require('./database-helper.js');


/**
 * Default options
 */

let defaultOptions = {
  collection: 'sessions',
  ttl:  1000 * 60 * 60 * 24 * 14,
  clear_interval: 60000
};


function defaultSerializer (session) {
  // Copy each property of the session to a new object
  let obj = {};
  for (let prop in session) {
    if (prop === 'cookie') {
      // Convert the cookie instance to an object, if possible
      // This gets rid of the duplicate object under
      // session.cookie.data property

      obj.cookie =
        session.cookie.toJSON ? session.cookie.toJSON() : session.cookie;
    } else {
      obj[prop] = session[prop];
    }
  }

  return obj;
}


function identity (x) {
  return x;
}


module.exports = function (connect) {
  let Store = connect.Store || connect.session.Store;

  /**
   * Initialize ArangoStore with the given `options`.
   * Optional calls `readyCallback` when db connection is ready
   * (mainly for testing purposes).
   *
   * @param {Object} options
   * @param {Function} readyCallback (optional)
   * @api public
   */
  function ArangoStore (options, readyCallback) {
    options = options || {};

    if (options.hash) {
      let defaultSalt = 'connect-arango';
      let defaultAlgorithm = 'sha1';
      this.hash = {};
      this.hash.salt =
        options.hash.salt ? options.hash.salt : defaultSalt;
      this.hash.algorithm =
        options.hash.algorithm ? options.hash.algorithm : defaultAlgorithm;
    }

    Store.call(this, options);

    if(!options.db) {
      throw new Error('Required ArangoStore option `db` missing');
    }

    this.collectionName =
      options.collection || defaultOptions.collection;

    this.ttl = options.ttl || defaultOptions.ttl;

    if (options.stringify || (!('stringify' in options) && !('serialize' in options) && !('unserialize' in options))) {
      this._serialize_session = JSON.stringify;
      this._unserialize_session = JSON.parse;
    } else {
      this._serialize_session = options.serialize || defaultSerializer;
      this._unserialize_session = options.unserialize || identity;
    }

    let self = this;

    this.dbHelper = new DatabaseHelper(options.db, self.collectionName);
    this.dbHelper.ensureCollection().then(function (collection) {
      readyCallback && readyCallback();
    }).catch(function(error) {
      readyCallback && readyCallback(error);
    });

    this.db_clear_expires_time = 0;
    this.db_clear_expires_interval =
      options.clear_interval || defaultOptions.clear_interval;
  }

  /**
   * Inherit from `Store`.
   */

  ArangoStore.prototype.__proto__ = Store.prototype;

  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */

  ArangoStore.prototype.get = function(sid, callback) {
    sid = this.hash ?
      crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;

    let self = this;

    this.dbHelper.collection().findOne({
      sid: sid,
    }).then(function (session) {
      try {
        if (session) {
          callback && callback(null,
            self._unserialize_session(session.session));
        } else {
          callback && callback();
        }
      } catch (err) {
        debug('Unable to deserialize session');
        callback && callback(err);
      }
    }).catch(function( err ) {
      if (err.code == 404) {
        callback && callback();
      } else {
        callback && callback(err);
      }
    });

    let time = new Date().getTime();
    if (time - this.db_clear_expires_time >= this.db_clear_expires_interval) {
      this.clearExpired();
      this.db_clear_expires_time = time;
    }
  };

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} callback
   * @api public
   */

  ArangoStore.prototype.set = function (sid, session, callback) {
    sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;

    let s;
    try {
      s = {
        _id: sid,
        session: this._serialize_session(session)
      };
    } catch (err) {
      debug('Unable to serialize session');
      callback && callback(err);
    }

    if (session && session.cookie && session.cookie.expires) {
      s.expires = new Date(session.cookie.expires).getTime();
    } else {
      // If there's no expiration date specified, it is
      // browser-session cookie or there is no cookie at all,
      // as per the connect docs.
      //
      // So we set the expiration to two-weeks from now
      // - as is common practice in the industry (e.g Django) -
      // or the default specified in the options.
      let date = new Date();
      date.setTime(date.getTime() + this.ttl);
      s.expires = date;
    }

    let self = this;
    let data = {
      sid: s._id,
      session: s.session,
      expires: s.expires
    };

    this.dbHelper.collection().update({ sid: sid }, data)
      .then(function (res) {
        if (res.updated == 0) {
          self.dbHelper.collection().insert(data)
            .then(function (res) {
              callback && callback();
            }).catch(function (err) {
              debug( 'Unable to insert session' );
              callback && callback(err);
            });
        } else {
          callback && callback();
        }
      }).catch(function (err) {
        debug('Unable to update session');
        callback && callback( err );
    });

    let time = new Date().getTime();
    if (time - this.db_clear_expires_time >= this.db_clear_expires_interval) {
      this.clearExpired();
      this.db_clear_expires_time = time;
    }
  };

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */
  ArangoStore.prototype.destroy = function (sid, callback) {
    sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;

    this.dbHelper.collection().remove({ sid: sid })
      .then(function (res) {
        callback && callback();
      }).catch(function (err) {
        debug('Unable to destroy session: ' + sid);
        callback && callback(err);
      });
  };

  /**
   * Fetch number of sessions.
   *
   * @param {Function} callback
   * @api public
   */

  ArangoStore.prototype.length = function (callback) {
    this.dbHelper.collection().count().then(function (res) {
      callback && callback(undefined, res.count);
    }).catch(function (err) {
      debug('Unable to count sessions');
      callback && callback(err);
    });
  };

  /**
   * Clear all sessions.
   *
   * @param {Function} callback
   * @api public
   */
  ArangoStore.prototype.clear = function(callback) {
    this.dbHelper.collection().truncate()
      .then(function (res) {
        callback();
      }).catch(function (err) {
        debug('Not able to truncate sessions');
        callback(err);
      });
  };


  /**
   * Clear expired sessions.
   *
   * @param {Function} callback
   * @api public
   */
  ArangoStore.prototype.clearExpired = function(callback) {
    this.dbHelper.db.query('FOR s IN @@collection ' +
      'FILTER s.expires <= DATE_NOW() REMOVE s IN @@collection', {
        '@collection': this.collectionName,
      }).then(function (res) {
        callback && callback();
      }).catch(function (err) {
        console.log(err);
        debug('Unable to clear expired session');
        callback && callback(err);
      });
  }

  return ArangoStore;
};
