'use strict'
var Promise = require('bluebird/js/main/promise')()
var request = require('request')

function Flare() {
  this.path = ''
  this.stash = {}
  this.current = {}
}

Promise.get = function Promise$get(url) {
  return Promise.resolve(new Flare()).get(url)
}

Promise.route = function Promise$route(url) {
  return Promise.resolve(new Flare()).route(url)
}

Promise.post = function Promise$route(url, body) {
  return Promise.resolve(new Flare()).post(url, body)
}

Promise.prototype.route = function(url) {
  return this._then(function (flare) {
    flare.path = url
    return flare
  })
}

Promise.prototype.get = function (url) {
  return this._then(function (flare) {
    return new Promise(function (resolve, reject) {
      request.get(flare.path + url, function (err, res) {
        if (err) {
          return reject(err)
        }

        resolve(res)
      })
    }).then(function (res) {
      flare.current = res
      return flare
    })
  })
}

Promise.prototype.post = function (url , body) {
  return this._then(function (flare) {
    return new Promise(function (resolve, reject) {
      request.post(flare.path + url, body, function (err, res) {
        if (err) {
          return reject(err)
        }

        resolve(res)
      })
    }).then(function (res) {
      flare.current = res
      return flare
    })
  })
}

Promise.prototype.expect = function (statusCode) {
  return this._then(function (flare) {
    var status = flare.current.statusCode
    if (status !== statusCode) {
      throw new Error('Status Code: ' + status)
    }

    return flare
  })
}

module.exports = Promise
