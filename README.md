connect-arango
==============

ArangoDB session store for Connect.

## Notes

* Requires that database is created.

## Installation

via npm:

    $ npm install github:antioxidanz/connect-arango

## Options

  - `hash` (optional) Hash is an object, which will determine wether hash the sid in arango, since it's not undefined, means sid will be hashed
  - `hash.salt` Salt will be used to hash the sid in arango, default salt is "connect-arango"
  - `hash.algorithm` Hash algorithm, default algorithm is "sha1"
  - `db` Database config as used in [arangojs](https://arangodb.github.io/arangojs/latest/modules/_connection_.html#config), ie. `new Database(config)`
  - `stringify` If true, connect-arango will serialize sessions using `JSON.stringify` before
                setting them, and deserialize them with `JSON.parse` when getting them.
                (optional, default: true). This is useful if you are using types that
                ArangoDB doesn't support.
  - `serialize` Custom hook for serializing sessions to arangoDB. This is helpful if you need
                to modify the session before writing it out.
  - `unserialize` Custom hook for unserializing sessions from ArangoDB. This can be used in
                scenarios where you need to support different types of serializations
                (e.g., objects and JSON strings) or need to modify the session before using
                it in your app.
  - `clear_interval` The amount of milliseconds to wait between session accesses to clear expired sessions.
  - `ttl` ttl value in milliseconds used with clear_interval

The second parameter to the `ArangoStore` constructor is a callback which will be called once the database is ready.

## Example

With express4:
    
    var session = require('express-session');
    var ArangoStore = require('connect-arango')(session);

    app.use(session({
        secret: settings.cookie_secret,
        store: new ArangoStore({
          db : settings.db,
        })
      }));

With express<4:

    var express = require('express');
    var ArangoStore = require('connect-arango')(express);

    app.use(express.session({
        secret: settings.cookie_secret,
        store: new ArangoStore({
          db: settings.db
        })
      }));

With connect:

    var connect = require('connect');
    var ArangoStore = require('connect-arango')(connect);

## Removing expired sessions

  Since ArangoDB does not have a TTL entry for documents, this is done using an AQL query in the session store.
  Every time a session is accessed, it will clear expired sessions, but only if it has passed more than `clear_interval` milliseconds (default 60 seconds)
  between each access.

## Contributions

  Feel free to contribute anything you would like. I will make sure to check pull requests as often as I can.

## License

(The MIT License)

Copyright (c) 2014 Metamist

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
