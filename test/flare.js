/*globals describe, it, before*/
'use strict'

var flare = require('../').route('http://localhost:3001')
var assert = require('assert')
var restify = require('restify')
var Joi = require('joi')
var fs = require('fs')

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

    server.get('/hello/:name', respond)
    server.get('/hello/:name/:friend', function (req, res, next) {
      res.send('hello ' + req.params.name + ' from ' + req.params.friend)
      next()
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

  it('stashes', function () {
    return flare
      .post('/mirror', {text: 'boom', friend: 'mob'})
      .stash('mirror')
      .get('/hello/:mirror.text/:mirror.friend')
      .expect(200, function (res) {
        assert(res.body === '"hello boom from mob"')
      })
  })

  it('docs', function () {
    return flare
      .docFile(__dirname + '/flare_doc.json')
      .post('/mirror', {my: 'me'})
      .expect(200, {
        my: Joi.string()
      })
      .doc('Hello', 'Say hello to Joe')
      .then(function () {
        var doc = JSON.parse(fs.readFileSync(__dirname + '/flare_doc.json'))
        assert(doc[0].title === 'Hello')
        assert(doc[0].description === 'Say hello to Joe')
        assert(doc[0].req.uri.indexOf('/mirror') !== -1)
        assert(doc[0].req.method === 'post')
        assert(doc[0].req.json.my === 'me')
        assert(doc[0].schema.my)
        assert(doc[0].res.body.my === 'me')
      })
  })
})
