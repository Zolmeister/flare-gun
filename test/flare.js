/*globals describe, it, before*/
'use strict'

var flare = require('../').route('http://localhost:3001')
var assert = require('assert')

describe('Flare Gun', function () {
  before(function (done) {
    var restify = require('restify')

    function respond(req, res, next) {
      res.send('hello ' + req.params.name)
      next()
    }

    var server = restify.createServer()
    server.get('/hello/:name', respond)
    server.post('/hello', function (req, res, next) {
      res.json(req.params.hello)
      next()
    })

    server.listen(3001, done)
  })

  it('gets', function () {
    return flare
      .get('/hello/joe')
      .then(function (flare) {
        assert(flare.current.body === '"hello joe"', 'Flare didn\'t get!')
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
      .post('/hello', { hello: 'world' })
      .expect(200)
      .then(function (flare) {
        console.log(flare.current.statusCode)
        assert(flare.current.body.hello === 'world', 'Flare didn\'t post!')
      })
  })
})
