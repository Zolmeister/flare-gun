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
var Flare = require('flare-gun')

var flare = new Flare().route('http://myapp.com/api')

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

##### `.get(String uri, Object queryString)` -> `FlarePromise`

##### `.expect(String statusCode, Object|{Joi} response)` -> `FlarePromise`

##### `.post(String uri, Object body)` -> `FlarePromise`

##### `.put(String uri, Object body)` -> `FlarePromise`

##### `.patch(String uri, Object body)` -> `FlarePromise`

##### `.del(String uri, Object body)` -> `FlarePromise`

##### `.stash(String name)` -> `FlarePromise`

Stashed variables can be injected in any string, by prefixing with a `:`  
e.g.

```js
flare
  .post('/user')
  .stash('joe')
  .post('/users/:joe.id', {name: ':joe.name'})
  .expect(200, {id: ':joe.id'})
```

##### `.actor(String name, Object requestObj)` -> `FlarePromise`

requestObj gets combind with requests before being passed to [request.js](https://github.com/mikeal/request)

##### `.as(String name)` -> `FlarePromise`

```js
flare
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

##### `.flare(Function handler(flare))` -> `FlarePromise`

Multiple requests in parallel

```js
.flare(function (flare) {

  // create experiments
  return Promise.map(Array(4), function (experiment) {
    return flare
      .post('/experiments', {id: 23})
  })
})
```

##### `.route(String url)` -> `FlarePromise`

Set the base url for requests

##### `.express({Express} app)` -> `FlarePromise`

Pass in an express server object to make calls to, instead of a url


## Contributing

```sh
$ npm test
```
