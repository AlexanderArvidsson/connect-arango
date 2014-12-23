/*!
 * connect-arango
 * Copyright (c) 2014 Metamist
 * MIT Licensed
 */

/**
 * Module dependencies
 */

var crypto         = require( "crypto" );
var arango         = require( "arangojs" );
var url            = require( "url" );
var util           = require( "util" );
var debug          = require( "debug" )( "connect-arango" );
var DatabaseHelper = require( "./database_helper.js" );


/**
 * Default options
 */

var defaultOptions = {
    host: '127.0.0.1',
    port: 8529,
    collection: 'sessions',
    defaultExpirationTime:  1000 * 60 * 60 * 24 * 14,
    clear_interval: 60000
};

function defaultSerializer( session ) {
    // Copy each property of the session to a new object
    var obj = {};
    for (var prop in session) {
        if (prop === 'cookie') {

            // Convert the cookie instance to an object, if possible
            // This gets rid of the duplicate object under session.cookie.data property

            obj.cookie = session.cookie.toJSON ? session.cookie.toJSON() : session.cookie;
        } else {
            obj[prop] = session[prop];
        }
    }

    return obj;
}

function identity( x ) { return x; }

module.exports = function( connect ) {
    var Store = connect.Store || connect.session.Store;

    /**
     * Initialize ArangoStore with the given `options`.
     * Calls `readyCallback` when db connection is ready (mainly for testing purposes).
     *
     * @param {Object} options
     * @param {Function} readyCallback
     * @api public
     */

    function ArangoStore( options, readyCallback ) {
        options = options || {};

        if (options.hash) {
            var defaultSalt = "connect-arango";
            var defaultAlgorithm = "sha1";
            this.hash = {};
            this.hash.salt = options.hash.salt ? options.hash.salt : defaultSalt;
            this.hash.algorithm = options.hash.algorithm ? options.hash.algorithm : defaultAlgorithm;
        }
        Store.call( this, options );

        if(!options.db) {
            throw new Error('Required ArangoStore option `db` missing');
        }

        this.db_collection_name = options.collection || defaultOptions.collection;

        if (options.stringify || (!('stringify' in options) && !('serialize' in options) && !('unserialize' in options))) {
            this._serialize_session = JSON.stringify;
            this._unserialize_session = JSON.parse;
        } else {
            this._serialize_session = options.serialize || defaultSerializer;
            this._unserialize_session = options.unserialize || identity;
        }

        var self = this;

        // Workaround to fix errors not showing inside readyCallback (caused by microPromises package from ArangoJS)
        function tempCallback( callback, err ) {
            if (!callback) return;
            setImmediate( function() { callback( err ); } );
        }

        var host = options.host || defaultOptions.host;
        var port = options.port || defaultOptions.port;

        this.dbHelper = new DatabaseHelper( {
            host: host,
            port: port,
            username: options.username,
            password: options.password
        } );

        self.dbHelper.use( options.db );

        self.dbHelper.ensureCollection( self.db_collection_name, function( err, db ) {
            if (err) {
                tempCallback( readyCallback, err );
            }
            else {
                db.index.createSkipListIndex( self.db_collection_name, [ "expires" ], false ).then( function( res ) {
                    tempCallback( readyCallback );
                }, function( err ) {
                    debug( "Unable to create skip-list" );
                    tempCallback( readyCallback, err );
                } );
            }
        } );

        this.db_clear_expires_time = 0;
        this.db_clear_expires_interval = options.clear_interval || defaultOptions.clear_interval;
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

    ArangoStore.prototype.get = function( sid, callback ) {
        sid = this.hash ? crypto.createHash( this.hash.algorithm ).update( this.hash.salt + sid ).digest( "hex" ) : sid;
        var self = this;

        this.dbHelper.collection( this.db_collection_name ).findOne( {
            sid: sid,
        } ).then( function( res ) {
            try {
                var session = res.document;

                if (session) {
                    callback && callback( null, self._unserialize_session( session.session ) );
                }
                else {
                    callback && callback();
                }
            } catch (err) {
                debug( "Unable to deserialize session" );
                callback && callback( err );
            }
        }, function( err ) {
            if (err.code == 404) {
                callback && callback();
            }
            else {
                callback && callback( err );
            }
        } );

        var time = new Date().getTime();
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

    ArangoStore.prototype.set = function(sid, session, callback) {
        sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;

        var s;
        try {
            s = {
                _id: sid,
                session: this._serialize_session( session )
            };
        } catch (err) {
            debug( "Unable to serialize session" );
            callback && callback( err );
        }

        if (session && session.cookie && session.cookie.expires) {
            s.expires = new Date( session.cookie.expires ).getTime();
        }
        else {
            // If there's no expiration date specified, it is
            // browser-session cookie or there is no cookie at all,
            // as per the connect docs.
            //
            // So we set the expiration to two-weeks from now
            // - as is common practice in the industry (e.g Django) -
            // or the default specified in the options.
            var today = new Date();
            s.expires = new Date( today.getTime() + this.defaultExpirationTime );
        }

        var self = this;
        var data = {
            sid: s._id,
            session: s.session,
            expires: s.expires
        };

        this.dbHelper.collection( this.db_collection_name ).update( { sid: sid }, data ).then( function( res ) {
            if (res.updated == 0) {
                self.dbHelper.collection( self.db_collection_name ).insert( data, { createCollection: true } ).then( function( res ) {
                    callback && callback();
                }, function( err ) {
                    debug( "Unable to insert session" );
                    callback && callback( err );
                } );
            }
            else {
                callback && callback();
            }
        }, function( err ) {
            debug( "Unable to update session" );
            callback && callback( err );
        } );
        
        var time = new Date().getTime();
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

    ArangoStore.prototype.destroy = function(sid, callback) {
        sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;

        this.dbHelper.collection( this.db_collection_name ).remove( { sid: sid } ).then( function( res ) {
            callback && callback();
        }, function( err ) {
            debug( "Unable to destroy session: " + sid );
            callback && callback( err );
        } );
    };

    /**
     * Fetch number of sessions.
     *
     * @param {Function} callback
     * @api public
     */

    ArangoStore.prototype.length = function(callback) {
        this.dbHelper.collection( this.db_collection_name ).count().then( function( res ) {
            callback && callback( undefined, res.count );
        }, function( err ) {
            debug( "Unable to count sessions" );
            callback && callback( err );
        } );
    };

    /**
     * Clear all sessions.
     *
     * @param {Function} callback
     * @api public
     */

    ArangoStore.prototype.clear = function(callback) {
        this.dbHelper.collection( this.db_collection_name ).truncate().then( function( res ) {
            callback();
        }, function( err ) {
            debug( "Not able to truncate sessions" );
            callback( err );
        } );
    };


    /**
     * Clear expired sessions.
     *
     * @param {Function} callback
     * @api public
     */

    ArangoStore.prototype.clearExpired = function( callback ) {
        this.dbHelper.query().exec( "FOR s IN SKIPLIST( " + this.db_collection_name + ", { expires: [[ '<', DATE_NOW() ]] } ) REMOVE s IN " + this.db_collection_name ).then( function( res ) {
            callback && callback();
        }, function( err ) {
            debug( "Unable to clear expired session" );
            callback && callback( err );
        } );
    }

    return ArangoStore;
};