var arango = require( "arangojs" );
var url = require( "url" );

var defaultOptions = {
    host: '127.0.0.1',
    port: 8529,
};

var DatabaseHelper = module.exports = function( options ) {
    options = options || {};
    
    if (options.url) {
        var db_url = url.parse( options.url );

        if (db_url.port) {
            options.port = parseInt( db_url.port );
        }

        if (db_url.pathname) {
            var pathname = db_url.pathname.split( "/" );

            if (pathname.length >= 3 && pathname[ 2 ]) {
                options.db = pathname[ 2 ];
            }

            var collectionIndex = db_url.hash.indexOf( "collection/" );
            var collectionPath = db_url.hash.substring( collectionIndex + 11 );
            var collectionData = collectionPath.split( "/" );

            if (collectionData.length > 0 && collectionData[ 0 ]) {
                options.collection = collectionData[ 0 ];
            }
        }

        if (db_url.hostname) {
            options.host = db_url.hostname;
        }

        if (db_url.auth) {
            var auth = db_url.auth.split( ":" );

            if (auth.length >= 1) {
                options.username = auth[ 0 ];
            }

            if (auth.length >= 2) {
                options.password = auth[ 1 ];
            }
        }
    }

    var host = options.host || defaultOptions.host;
    var port = options.port || defaultOptions.port;
    
    this.sysdb = arango({
      url: "http://" + options.username + ":" + options.password + "@" + host + ":" + port,
      databaseName: options.db
    });

    this.db = this.sysdb;
    this.options = options;
};

DatabaseHelper.Collection = function( db, name ) {
    this.db = db;
    this.name = name;
};

DatabaseHelper.Collection.prototype = {
    find: function( example, options, callback ) {
        return this.db.simple.example( this.name, example, options, callback );
    },
    findOne: function( example, options, callback ) {
        return this.db.simple.firstByExample( this.name, example, options, callback );
    },
    insert: function( data, options, callback ) {
        return this.db.document.create( this.name, data, options, callback );
    },
    update: function( example, newValue, options, callback ) {
        return this.db.simple.updateByExample( this.name, example, newValue, options, callback );
    },
    replace: function( example, data, options, callback ) {
        return this.db.simple.replaceByExample( this.name, example, data, options, callback );
    },
    remove: function( example, options, callback ) {
        return this.db.simple.removeByExample( this.name, example, options, callback );
    },
    truncate: function( callback ) {
        return this.db.collection.truncate( this.name, callback );
    },
    list: function( options, callback ) {
        return this.db.simple.list( this.name, options, callback );
    },
    count: function( callback ) {
        return this.db.collection.count( this.name, callback );
    },
    any: function( callback ) {
        return this.db.simple.any( this.name, callback );
    },
    first: function( count, callback ) {
        return this.db.simple.first( this.name, count, callback );
    },
    last: function( count, callback ) {
        return this.db.simple.last( this.name, count, callback );
    }
};

DatabaseHelper.prototype = {
    ensureDatabase: function( name, callback ) {
        var self = this;

    callback = callback || function() {};

        self.sysdb.database.list().then( function( res ) {
                var list = res.result;
                var contains = list.indexOf( name ) != -1;

                if (contains) {
                    callback.call( self, undefined, self.use( name ) );
                }
                else {
                    self.sysdb.database.createDatabase( name, [ {
                        username: self.options.username,
                            passwd: self.options.password,
                        } ] ).then( function( res ) {
                            callback.call( self, undefined, self.use( name ) );
                        }, function( err ) {
                            callback.call( self, err );
                        } )
                        .catch( function( e ) {
                            throw e;
                        } );
                }
            }, function( err ) {
                callback.call( self, err );
            } )
            .catch( function( e ) {
                throw e;
            } );
    },
    ensureCollection: function( collection, callback ) {
        var self = this;

        callback = callback || function() {};

        var time = new Date().getTime();

        self.db.collection.get( collection ).then( function( res ) {
                callback.call( self, undefined, self.db );
            }, function( err ) {
                self.db.collection.create( collection ).then( function( res ) {
                        callback.call( self, undefined, self.db );
                    }, function( err ) {
                        callback.call( self, err );
                    } )
                .catch( function( e ) {
                    throw e;
                } );
            } )
            .catch( function( e ) {
                throw e;
            } );
    },
    use: function( path ) {
       var db = this.db = this.sysdb;
       return this;
    },
    collection: function( collection ) {
        return new DatabaseHelper.Collection( this.db, collection );
    },
    query: function() {
        return this.db.query;
    }
};
