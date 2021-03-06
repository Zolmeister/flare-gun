/*globals describe, it, before*/
'use strict'

var ROOT = {
  URL: 'http://localhost:3091',
  PORT: 3091
}

var flareGun = require('../')
var flare = flareGun.route(ROOT.URL)
var assert = require('assert')
var Joi = require('joi')
var fs = require('fs')
var _ = require('lodash')
var express = require('express')
var bodyParser = require('body-parser')
var basicAuth = require('basic-auth')
var SocketIO = require('socket.io')
var http = require('http')

describe('Flare Gun', function () {
  before(function (done) {

    function respond(req, res) {
      res.send('hello ' + req.params.name)
    }

    function mirror(req, res) {
      res.json(req.body)
    }

    function mirrorQuery(req, res) {
      res.json(req.query)
    }

    function mirrorHeaders(req, res) {
      res.json(req.headers)
    }

    var app = express()
    app.use(bodyParser.json())

    app.post('/json', function (req, res) {
      res.json({
        json: 'json'
      })
    })
    app.get('/hello/:name', respond)
    app.get('/hello/:name/:friend', function (req, res, next) {
      res.send('hello ' + req.params.name + ' from ' + req.params.friend)
      next()
    })

    app.get('/authed', function (req, res) {
      var user = basicAuth(req)
      if (!user || !user.name || !user.pass ||
        user.name === 'INVALID' || user.pass === 'INVALID') {
        return res.status(401).end()
      }

      res.json({
        user: user.name,
        pass: user.pass
      })
    })

    app.get('/mirror', mirror)
    app.post('/mirror', mirror)
    app.put('/mirror', mirror)
    app.patch('/mirror', mirror)
    app.delete('/mirror', mirror)

    app.get('/mirrorHeaders', mirrorHeaders)

    app.get('/mirrorQuery', mirrorQuery)
    app.post('/mirrorQuery', mirrorQuery)
    app.put('/mirrorQuery', mirrorQuery)
    app.delete('/mirrorQuery', mirrorQuery)

    app.post('/exoid', function (req, res) {
      res.json({
        results: [req.body.requests[0].body],
        errors: [null],
        cache: []
      })
    })

    app.post('/graphql', function (req, res) {
      res.json({
        data: req.body.variables
      })
    })

    var server = http.createServer(app)
    var io = SocketIO(server)

    io.on('connection', function (socket) {
      socket.on('graphql', function (message) {
        socket.emit('graphql', {
          handshake: socket.handshake,
          message: message
        })
      })
    })

    server.listen(ROOT.PORT, done)
  })

  it('requests', function () {
    return flare
      .request({
        uri: ROOT.URL + '/hello/joe',
        method: 'get'
      })
      .then(function (flare) {
        assert(flare.res.body === 'hello joe', 'Flare didn\'t get!')
      })
  })

  it('requests with browser headers defaulted', function () {
    return flare
      .request({
        uri: ROOT.URL + '/mirrorHeaders',
        method: 'get'
      })
      .then(function (flare) {
        assert.deepStrictEqual(JSON.parse(flare.res.body), {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'accept-encoding': 'gzip, deflate',
          'accept-language': 'en-US,en;q=0.9',
          'cache-control': 'max-age=0',
          'connection': 'keep-alive',
          'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64 Mobile Safari/537.36',
          'content-length': '0',
          'host': 'localhost:3091'
        })
      })
  })

  it('gets', function () {
    return flare
      .get('/hello/joe')
      .then(function (flare) {
        assert(flare.res.body === 'hello joe', 'Flare didn\'t get!')
      })
  })

  it('gets with query params', function () {
    return flare
      .get('/mirrorQuery', {hello: 'world'})
      .then(function (flare) {
        assert(flare.res.body.hello === 'world')
      })
  })

  it('gets with opts', function () {
    return flare
      .get('/mirrorQuery', null, {qs: {hello: 'world'}})
      .then(function (flare) {
        assert(flare.res.body.hello === 'world')
      })
  })

  it('expects status codes', function () {
    return flare
      .get('/NULL')
      .expect(200)
      .then(null, function (err) {
        assert(
          _.includes(err.message, 'Status code should be 200, not 404'),
          'Bad Error'
        )
        return flare
      })
      .get('/NULL')
      .expect(404)
      .get('/hello/joe')
      .expect(200)
  })

  it('posts', function () {
    return flare
      .post('/mirror', { hello: 'world' })
      .then(function (flare) {
        assert(flare.res.body.hello === 'world', 'Flare didn\'t post!')
      })
  })

  it('posts with opts', function () {
    return flare
      .post('/mirror', null, {json: { hello: 'world' }})
      .then(function (flare) {
        assert(flare.res.body.hello === 'world', 'Flare didn\'t post!')
      })
  })

  it('calls exoid methods', function () {
    return flare
      .exoid('test.all', {abc: 'xyz'})
      .then(function (flare) {
        assert(flare.res.body.abc === 'xyz', 'Flare didn\'t exoid!')
        assert(flare.res.cache.length === 0, 'Flare didn\'t send cache')
      })
  })

  it('calls graphql methods', function () {
    return flare
      .graph('{mirror($abc: String!)}', {abc: 'xyz'})
      .then(function (flare) {
        assert(flare.res.body.abc === 'xyz', 'Flare didn\'t graphql!')
      })
  })

  it('returns json with post, without body', function () {
    return flare
      .post('/json')
      .expect(200, {json: 'json'})
  })

  it('puts', function () {
    return flare
      .put('/mirror', {meta: 'eta'})
      .then(function (flare) {
        assert(flare.res.body.meta === 'eta', 'Flare didn\'t put!')
      })
  })

  it('puts with opts', function () {
    return flare
      .put('/mirror', null, {json: {meta: 'eta'}})
      .then(function (flare) {
        assert(flare.res.body.meta === 'eta', 'Flare didn\'t put!')
      })
  })

  it('patches', function () {
    return flare
      .patch('/mirror', {meta: 'eta'})
      .then(function (flare) {
        assert(flare.res.body.meta === 'eta', 'Flare didn\'t patch!')
      })
  })

  it('patches with opts', function () {
    return flare
      .patch('/mirror', null, {json: {meta: 'eta'}})
      .then(function (flare) {
        assert(flare.res.body.meta === 'eta', 'Flare didn\'t patch!')
      })
  })

  it('deletes', function () {
    return flare
      .del('/mirror', {meta: 'eta'})
      .then(function (flare) {
        assert(flare.res.body.meta === 'eta', 'Flare didn\'t delete!')
      })
  })

  it('deletes with opts', function () {
    return flare
      .del('/mirror', null, {json: {meta: 'eta'}})
      .then(function (flare) {
        assert(flare.res.body.meta === 'eta', 'Flare didn\'t delete!')
      })
  })

  it('expects support joi schema', function () {
    return flare
      .post('/mirror', {
        err: 'none'
      })
      .expect(200, {
        err: 'err'
      })
      .then(function () {
        throw 'Did not catch invalid'
      }, function (err) {
        assert(err.message.length > 0)
        return flare
      })
      .post('/mirror', {
        string: 'str',
        num: 123,
        nest: {
          string: 'str',
          num: 123
        }
      })
      .expect(200, {
        string: Joi.string(),
        num: Joi.number(),
        nest: Joi.object().keys({
            string: Joi.string(),
            num: Joi.number()
        })
      })
  })

  it('expects default joi schema to required mode checking', function () {
    return flare
      .post('/mirror', {
        a: 'abc'
      })
      .expect(200, Joi.object().keys({
        a: 'abc',
        b: Joi.string()
      }))
      .then(function () {
        throw 'Did not catch invalid'
      }, function (err) {
        assert(err.message.length > 0)
        return flare
      })
  })

  it('expects support schema with stash', function () {
    return flare
      .post('/mirror', {
        string: 'str'
      })
      .stash('joe')
      .expect(200, {
        string: ':joe.string'
      })
      .post('/mirror', [{
          a: 'b'
        }]
      )
      .expect(200, Joi.array().items({
        a: 'b'
      }))
  })

  it('expects support schema with top-level stash', function () {
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror')
      .post('/mirror', {text:'boom'})
      .expect(200, ':mirror')
  })

  it('expects supports callback parameter', function () {
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror')
      .get('/hello/joe')
      .expect(200, function (body, stash) {
        assert(body === 'hello joe')
        assert(stash.mirror.text === 'boom' )
      })
  })

  it('expects supports promise response', function () {
    flare
      .get('/hello/joe')
      .expect(200, function () {
        return new Promise(function (resolve, reject) {
          reject(new Error('async error'))
        })
      })
      .then(() => {
        throw new Error('Expected error')
      }, (err) => {
        assert(err.message === 'async error')
      })
  })

  it('stashes', function () {
    return flare
      .post('/mirror', {text: 'boom', nestor: { nested: 'nes'}})
      .stash('mirror')
      .get('/hello/:mirror.text/:mirror.nestor.nested')
      .expect(200, function (body) {
        assert(body === 'hello boom from nes')
      })
      .get('/hello/bob/joe')
      .stash('mirrorString')
      .get('/hello/:mirror.text/:mirrorString')
      .expect(200, function (body) {
        assert(body === 'hello boom from hello bob from joe')
      })
      .post('/mirror', {
        top: ':mirrorString',
        text: ':mirror.text',
        nes: ':mirror.nestor.nested'
      })
      .expect(200, {
        top: 'hello bob from joe',
        text: 'boom',
        nes: 'nes'
      })
      // escape character support
      .post('/mirror', {
        text: '\\:mirror2.text',
        nes: '\\:mirror2.nestor.nested'
      })
      .stash('mirror2')
      .then(function (flare) {
        assert(flare.res.body.text === ':mirror2.text')
        assert(flare.res.body.nes === ':mirror2.nestor.nested')
        return flare
      })
  })

  it('passes stash to request body functions', function () {
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror')
      .get('/mirrorQuery', function ({stash}) {
        return stash.mirror
      })
      .expect({text: ':mirror.text'})
      .post('/mirror', function ({stash}) {
        return stash.mirror
      })
      .expect({text: ':mirror.text'})
      .put('/mirror', function ({stash}) {
        return stash.mirror
      })
      .expect({text: ':mirror.text'})
      .patch('/mirror', function ({stash}) {
        return stash.mirror
      })
      .expect({text: ':mirror.text'})
      .del('/mirror', function ({stash}) {
        return stash.mirror
      })
      .expect({text: ':mirror.text'})
      .exoid('mirror.mirror', function ({stash}) {
        return stash.mirror
      })
      .expect({text: ':mirror.text'})
      .graph('{mirror($abc: String!)}', function ({stash}) {
        return {abc: stash.mirror}
      })
      .expect({abc: {text: ':mirror.text'}})
  })

  it('overrides previous stashes', function () {
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror')
      .post('/mirror', {text: 'RAH'})
      .stash('mirror')
      .post('/mirror', {
        text: ':mirror.text'
      })
      .expect(200, {
        text: 'RAH'
      })
  })

  it('stashes with bodies', function () {
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror')
      .post('/mirror', {text: ':mirror.text'})
      .expect(200, {
        text: 'boom'
      })
  })

  it('stashes with Joi objects', function () {
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror')
      .post('/mirror', {text: ':mirror.text'})
      .expect(200, Joi.object().required().keys({
        text: ':mirror.text'
      }))
  })

  it('retrieves stash for top-level objects', function () {
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror')
      .post('/mirror', ':mirror')
      .expect(200, {text: 'boom'})
  })

  it('retrieves stash for GET query string params', function () {
    return flare
        .get('/mirrorQuery', {hello: 'world'})
        .stash('hello')
        .get('/mirrorQuery', {hello: ':hello.hello'})
        .then(function (flare) {
          assert(flare.res.body.hello === 'world')
        })
  })

  it('retrieves stash for top level GET query string params', function () {
    return flare
        .get('/mirrorQuery', {hello: 'world'})
        .stash('hello')
        .get('/mirrorQuery', ':hello')
        .then(function (flare) {
          assert(flare.res.body.hello === 'world')
        })
  })

  it('is pure', function () {
    return flare
      .get('/mirrorQuery', {hello: 'world'})
      .stash('query')
      .then(function (_flare) {
        assert(_flare.stash.query.hello === 'world')
        return flare
      })
      .then(function (flare) {
        assert(flare.stash.query === undefined)
      })
  })

  it('thrus', function () {
    return flare
      .get('/mirrorQuery', {hello: 'world'})
      .stash('query')
      .thru(function (flare) {
        return flare
          .get('/mirrorQuery', {hello: 'world2'})
          .stash('query2')
          .then(function (flare) {
            assert(flare.stash.query.hello === 'world')
            assert(flare.stash.query2.hello === 'world2')
            return flare
          })
      })
      .then(function (flare) {
        assert(flare.stash.query.hello === 'world')
        assert(flare.stash.query2.hello === 'world2')
      })
  })

  it('acts', function () {
    return flare
      .actor('joe', {
        auth: {
          user: 'joe',
          pass: 'joePass'
        }
      })
      .actor('anon')
      .as('anon')
      .get('/authed')
      .expect(401)
      .as('joe')
      .get('/authed')
      .expect(200, {
        user: 'joe',
        pass: 'joePass'
      })
  })

  it('overrides old actors', function () {
    return flare
      .actor('joe', {
        auth: {
          user: 'joe',
          pass: 'joePass'
        }
      })
      .as('joe')
      .get('/authed')
      .expect(200)
      .actor('joe', {
        auth: {
          user: 'INVALID',
          pass: 'INVALID'
        }
      })
      .as('joe')
      .get('/authed')
      .expect(401)
  })

  it('de-stashes actors', function () {
    return flare
      .post('/mirror', {user: 'joe', pass: 'joePass'})
      .stash('creds')
      .get('/authed')
      .expect(401)
      .actor('joe', {
        auth: {
          user: ':creds.user',
          pass: ':creds.pass'
        }
      })
      .as('joe')
      .post('/mirror', {user: 'joe2', pass: 'joePass2'})
      .stash('creds')
      .get('/authed')
      .expect(200)
  })

  it('binds express objects', function () {
    var app = express()

    app.use(function (req, res, next) {
      res.end('hello ' + req.url)
    })

    return flareGun.express(app)
      .get('/test')
      .expect(200, 'hello /test')
  })

  it('binds express objects with base path', function () {
    var app = express()

    app.use(function (req, res, next) {
      res.end('hello ' + req.url)
    })

    return flareGun.express(app, '/base')
      .get('/test')
      .expect(200, 'hello /base/test')
  })

  it('binds express objects wrapped in promises', function () {
    var app = express()

    var appPromise = new Promise(function (resolve) {
      resolve(app)
    })

    app.use(function (req, res, next) {
      res.end('hello ' + req.url)
    })

    return flareGun.express(appPromise)
      .get('/test')
      .expect(200, 'hello /test')
  })

  it('closes express server', function () {
    var app = express()

    app.use(function (req, res, next) {
      res.end('hello ' + req.url)
    })

    return flareGun.express(app)
      .get('/test')
      .expect(200, 'hello /test')
      .close()
  })

  it('supports Socket.io WebSockets', function () {
    var called = 0
    return flare
      .withSocket('x', {query: {token: 'abc'}}, function (flare) {
        return flare.socketEmit('graphql', {
          query: 'subscription ($id: ID!) { user(id: $id) }',
          variables: {id: '123'}
        })
        .socketOn('graphql', function ({handshake, message}) {
          called += 1
          assert(handshake.query.token === 'abc', 'Token missing')
          assert.deepStrictEqual(message, {
            query: 'subscription ($id: ID!) { user(id: $id) }',
            variables: {id: '123'}
          })
        })
        .thru(function (flare) {
          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              try {
                assert(called === 1, 'Socket did not respond')
              } catch (err) {
                return reject(err)
              }
              resolve(flare)
            }, 30)
          })
        })
      })
  })

  it('stashes with transform', function () {
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror', function (res) {
        assert.deepStrictEqual(res, {text: 'boom'})
        return 'xxx'
      })
      .post('/mirror', {text: ':mirror'})
      .expect(200, {text: 'xxx'})
      .stash('mirror', function () {
        return {a: {b: 'c'}}
      })
      .post('/mirror', {text: ':mirror.a'})
      .expect(200, {text: {b: 'c'}})
  })

  it('do, like thru, but without chaining from result promise', function () {
    var called = 0
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror')
      .do(function (flare) {
        assert.deepStrictEqual(flare.stash.mirror, {text: 'boom'})
        return Promise.resolve(null).then(function () {
          called += 1
        })
      })
      .expect(200, {text: 'boom'})
      .expect(function () {
        assert(called === 1, 'Promise not resolved')
      })
  })
})
