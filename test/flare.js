/*globals describe, it, before*/
'use strict'

var Promise = require('bluebird')
var Flare = require('../')
var flare = new Flare().route('http://localhost:3001')
var assert = require('assert')
var restify = require('restify')
var Joi = require('joi')
var fs = require('fs')
var _ = require('lodash')
var express = require('express')

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

    var server = restify.createServer()
    server.use(restify.bodyParser({ mapParams: false }))
    server.use(restify.authorizationParser())

    server.get('/hello/:name', respond)
    server.get('/hello/:name/:friend', function (req, res, next) {
      res.send('hello ' + req.params.name + ' from ' + req.params.friend)
      next()
    })

    server.get('/authed', function (req, res) {
      if (!req.authorization || !req.authorization.basic) {
        return res.send(401)
      }
      var user = req.authorization.basic.username
      var pass = req.authorization.basic.password

      res.json({
        user: user,
        pass: pass
      })
    })

    server.get('/mirror', mirror)
    server.post('/mirror', mirror)
    server.put('/mirror', mirror)
    server.del('/mirror', mirror)

    server.listen(3001, done)
  })

  it('requests', function () {
    return flare
      .request({
        uri: 'http://localhost:3001/hello/joe',
        method: 'get'
      })
      .then(function (flare) {
        assert(flare.res.body === '"hello joe"', 'Flare didn\'t get!')
      })
  })

  it('gets', function () {
    return flare
      .get('/hello/joe')
      .then(function (flare) {
        assert(flare.res.body === '"hello joe"', 'Flare didn\'t get!')
      })
  })

  it('expects status codes', function () {
    return flare
      .get('/NULL')
      .expect(200)
      .then(null, function (err) {
        assert(err.message === 'Status Code: 404', 'Bad Error')
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

  it('puts', function () {
    return flare
      .put('/mirror', {meta: 'eta'})
      .then(function (flare) {
        assert(flare.res.body.meta === 'eta', 'Flare didn\'t put!')
      })
  })

  it('deletes', function () {
    return flare
      .del('/mirror', {meta: 'eta'})
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

  it('expects support schema with stash', function () {
    return flare
      .post('/mirror', {
        string: 'str'
      })
      .stash('joe')
      .expect(200, {
        string: ':joe.string'
      })
      .post('/mirror', [
        {
          a: 'b'
        }
      ])
      .expect(200, Joi.array().includes({
        a: 'b'
      }))
  })

  it('stashes', function () {
    return flare
      .post('/mirror', {text: 'boom', friend: 'mob'})
      .stash('mirror')
      .get('/hello/:mirror.text/:mirror.friend')
      .expect(200, function (res) {
        assert(res.body === '"hello boom from mob"')
      })
      .post('/mirror', {text: ':mirror.boom', friend: ':mirror.mob'})
      .expect(200, {
        text: 'boom',
        friend: 'mob'
      })
  })

  it('stashes with bodies', function () {
    return flare
      .post('/mirror', {text: 'boom'})
      .stash('mirror')
      .post('/mirror', {text: ':mirror.text'})
      .expect(200, {
        text: Joi.string('boom').required()
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
              uri: 'http://localhost:3001/authed',
              method: 'get'
            })
        })
      })
  })

  it('binds express objects', function () {
    var app = express()

    app.use(function (req, res, next) {
      res.end('hello')
    })

    return new Flare().express(app).get('/test').expect(200, 'hello')
  })
})
