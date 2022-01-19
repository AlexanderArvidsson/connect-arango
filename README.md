# connect-arango

ArangoDB session store for Connect and Express.

## Installation

    $ npm install connect-arango

    $ yarn add connect-arango

## Requirements

-   arangoDB `>= 3.5.0`
-   arangojs `>= 7.5.0`
-   Existing arango database

## Usage

```js
const session = require("express-session");
const ArangoSessionStore = require("connect-arango");

app.use(
	session({
		secret: process.env.SESSION_SECRET,
		store: new ArangoSessionStore({
			db: {
				url: process.env.DB_URL,
				databaseName: process.env.DB_NAME,
				auth: {
					username: process.env.DB_USER,
					password: process.env.DB_PASSWORD,
				},
			},
		}),
	})
);
```

**Resuse external arangojs Database instance**

```js
const session = require("express-session");
const ArangoSessionStore = require("connect-arango");
const { Database } = require("arangojs");

const db = Database({
	db: {
		url: process.env.DB_URL,
		databaseName: process.env.DB_NAME,
		auth: {
			username: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
		},
	},
});

app.use(
	session({
		secret: process.env.SESSION_SECRET,
		store: new ArangoSessionStore({ db: db }),
	})
);
```

## Options

| Option            |                    Default                    | Description                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | :-------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db` _\*required_ |                                               | Options object for [arangojs.Database()](https://github.com/arangodb/arangojs) method. Can also be provided with existing `Database` instance.                                                                                                                                                                                                                    |
| `collectionName`  |                 `'sessions'`                  | The name of collection used for storing sessions                                                                                                                                                                                                                                                                                                                  |
| `hash`            | `{algorithm: "sha1", salt: "connect-arango"}` | For hashing the session id before storing in the database. You can replace the `algorithm` or `salt` options. Or set to `false` to disable hashing.                                                                                                                                                                                                               |
| `autoRemove`      |                    `true`                     | Sessions are automatically deleted using a `TTL Index` on the database and the session's `maxAge`. Set this to `false` to manage session deletion from the database manually.                                                                                                                                                                                     |
| `disableTouch`    |                    `false`                    | The `express-session` package uses `touch` to signal to the store that the user has interacted with the session but hasn't changed anything in its data. Typically, this helps keep the users session alive if session changes are infrequent but you may want to disable it to cut down the extra calls or to prevent users from keeping sessions open too long. |
| `serialize`       |                                               | Custom hook for serializing sessions to arangoDB. This is helpful if you need to modify the session before writing it out. Accepts a single `session` argument eg. `(session) => serializeSession(session)`                                                                                                                                                       |
| `deserialize`     |                                               | Custom hook for deserializing sessions from ArangoDB. This can be used in scenarios where you need to support different types of serializations or need to modify the session before using it in your app. Accepts a single `session` argument eg. `(session) => deserializeSession(session)`                                                                     |

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
