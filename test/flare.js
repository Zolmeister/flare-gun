/*globals describe, it, before*/
'use strict'

var ROOT = {
  URL: 'http://localhost:3091',
  PORT: 3091
}

var Promise = require('bluebird')
var Flare = require('../')
var flare = new Flare().route(ROOT.URL)
var assert = require('assert')
var Joi = require('joi')
var fs = require('fs')
var _ = require('lodash')
var express = require('express')
var bodyParser = require('body-parser')
var basicAuth = require('basic-auth')

describe('Flare Gun', function () {
  before(function (done) {

    function respond(req, res, next) {
      res.send('hello ' + req.params.name)
      next()
    }

    function mirror(req, res, next) {
      res.json(req.body)
      next()
    }

    function mirrorQuery(req, res, next) {
      res.json(req.query)
      next()
    }

    var server = express()
    server.use(bodyParser.json())

    server.get('/hello/:name', respond)
    server.get('/hello/:name/:friend', function (req, res, next) {
      res.send('hello ' + req.params.name + ' from ' + req.params.friend)
      next()
    })

    server.get('/authed', function (req, res) {
      var user = basicAuth(req)
      if (!user || !user.name || !user.pass) {
        return res.status(401).end()
      }

      res.json({
        user: user.name,
        pass: user.pass
      })
    })

    server.get('/mirror', mirror)
    server.post('/mirror', mirror)
    server.put('/mirror', mirror)
    server.patch('/mirror', mirror)
    server.delete('/mirror', mirror)

    server.get('/mirrorQuery', mirrorQuery)
    server.post('/mirrorQuery', mirrorQuery)
    server.put('/mirrorQuery', mirrorQuery)
    server.delete('/mirrorQuery', mirrorQuery)

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
        assert(err.message === 'Status code should be 200, not 404', 'Bad Error')
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
      .expect(200, Joi.array().includes({
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
      .expect(200, function (res, stashed) {
        assert(res.body === 'hello joe')
        assert(stashed.mirror.text === 'boom' )
      })
  })

  it('stashes', function () {
    return flare
      .post('/mirror', {text: 'boom', nestor: { nested: 'nes'}})
      .stash('mirror')
      .get('/hello/:mirror.text/:mirror.nestor.nested')
      .expect(200, function (res) {
        assert(res.body === 'hello boom from nes')
      })
      .get('/hello/bob/joe')
      .stash('mirrorString')
      .get('/hello/:mirror.text/:mirrorString')
      .expect(200, function (res) {
        assert(res.body === 'hello boom from hello bob from joe')
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

  it('docs', function () {
    return flare
      .docFile(__dirname + '/flare_doc.json')
      .post('/mirror', {my: 'me'})
      .expect(200, {
        my: Joi.string()
      })
      .doc('Hello', 'Say hello to the mirror')
      .then(function (flare) {
        var doc = JSON.parse(fs.readFileSync(__dirname + '/flare_doc.json'))
        assert(doc[0].title === 'Hello')
        assert(doc[0].description === 'Say hello to the mirror')
        assert(doc[0].req.uri.indexOf('/mirror') !== -1)
        assert(doc[0].req.method === 'post')
        assert(doc[0].req.json.my === 'me')
        assert(doc[0].schema.my)
        assert(doc[0].res.body.my === 'me')

        return flare
      })
      .get('/hello/joe')
      .expect(200, function (res) {
        assert(res.body)
      })
      .doc('Hello', 'Say hello to joe')
      .put('/mirror', {re: 'flect'})
      .expect(200, {
        re: Joi.string()
      })
      .doc('Hello', 'Reflect joe')
      .patch('/mirror', {re: 'flect'})
      .expect(200, {
        re: Joi.string()
      })
      .doc('Hello', 'Patch joe')
      .get('/404')
      .expect(404)
      .doc('Errors', '404 error!!!!!!')
      .get('/rawr')
      .expect(404)
      .doc('Errors', '404 error!!!!!!')
      .del('/mirror', {de: 'lete'})
      .expect(200, {
        de: Joi.string()
      })
      .doc('Delete', 'No errors here')
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

  it('flares', function () {
    return flare
      .flare(function (flare) {

        // create experiments
        return Promise.map(Array(4), function (experiment) {
          return flare
            .post('/experiments', experiment)
        })
      })
      .flare(function (flare) {
        return Promise.map(Array(4), function () {
          return flare
            .request({
              uri: ROOT.URL + '/authed',
              method: 'get'
            })
        })
      })
  })

  it('binds express objects', function () {
    var app = express()

    app.use(function (req, res, next) {
      res.end('hello ' + req.url)
    })

    return new Flare().express(app)
      .get('/test')
      .expect(200, 'hello /test')
  })

  it('binds express objects with base path', function () {
    var app = express()

    app.use(function (req, res, next) {
      res.end('hello ' + req.url)
    })

    return new Flare().express(app, '/base')
      .get('/test')
      .expect(200, 'hello /base/test')
  })

})
