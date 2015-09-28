# Flare Gun [![Build Status](https://drone.io/github.com/Zolmeister/flare-gun/status.png)](https://drone.io/github.com/Zolmeister/flare-gun/latest)

### A JSON REST API testing framework

## Install

```sh
$ npm install flare-gun
```

## Example, using mocha

```sh
$ npm install mocha Joi
```

Default config for Joi validation:

```js
{
  convert: false,
  presence: 'required'
}
```

```js
var Joi = require('joi')
var flareGun = require('flare-gun')
var flare = flareGun.route('http://myapp.com/api')

describe('MyApp', function () {
  it('gets users', function () {
    return flare
      .get('/users')
      .expect(200, Joi.array().includes({
        id: Joi.number(),
        username: Joi.string().required(),
        avatar: Joi.string()
      }))
  })

  it('creates users', function () {
    return flare
      .post('/users', {username: 'joe'})
      .expect(200)
      .stash('joe')
      .get('/users/:joe.id')
      .expect(200, {
        id: Joi.number(),
        username: Joi.string().required(),
        avatar: Joi.string()
      })
  })
})
```

## Usage

##### `.request({String uri, String method})` -> `FlarePromise`

##### `.get(String uri, Object queryString, Object options)` -> `FlarePromise`

##### `.expect(String statusCode, Object|{Joi} response)` -> `FlarePromise`

##### `.post(String uri, Object body, Object options)` -> `FlarePromise`

##### `.put(String uri, Object body, Object options)` -> `FlarePromise`

##### `.patch(String uri, Object body, Object options)` -> `FlarePromise`

##### `.del(String uri, Object body, Object options)` -> `FlarePromise`

##### `.stash(String name)` -> `FlarePromise`

##### `.thru(Function<FlarePromise>(FlarePromise))` -> `FlarePromise`

Options are passed through to [request](https://github.com/request/request)
Stashed variables can be injected in any string, by prefixing with a `:`  
e.g.

```js
flareGun
  .post('/user')
  .stash('joe')
  .post('/users/:joe.id', {name: ':joe.name'})
  .expect(200, {id: ':joe.id'})
  .post('/users/:joe.id', {name: ':joe.name'})
  .expect(200, Joi.object().keys({
    id: ':joi.id'
  }))
  .post('/users/friends', ':joe')
  .expect(200, ':joe.id')
  .get('/users/:joe.id')
  .expect(200, ':joe')
```

##### `.actor(String name, Object requestObj)` -> `FlarePromise`

requestObj gets combind with requests before being passed to [request.js](https://github.com/mikeal/request)

##### `.as(String name)` -> `FlarePromise`

```js
flareGun
  .actor('joe', {
    auth: {
      user: 'joe',
      pass: 'joePass'
    }
  })
  .actor('anon', {})
  .as('joe')
  .get('/asJoe')
  .as('anon')
  .get('/asAnon')
```

##### `.route(String url)` -> `FlarePromise`

Set the base url for requests

##### `.express({Express} app)` -> `FlarePromise`

Pass in an express server object to make calls to, instead of a url
Also accepts a promise of an express server

##### `.close()` -> `FlarePromise`

Close express server. May close more connections in the future.

##### `.exoid(String path, Object body)` -> `FlarePromise`

Calls an exoid method at '/exoid'. See https://github.com/Zorium/exoid

## Contributing

```sh
$ npm test
```

## Changelog

  - 0.5.x -> 0.6.0
    - Flare gun has become properly pure, which means that side effects will not impact other chains  
      This also means that Flare gun has become a singleton, without needing to be instantiated.
    - Removed `flare` method
    - Added `thru` method
