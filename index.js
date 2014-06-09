'use strict'
var Promise = require('bluebird/js/main/promise')()
var _request = require('request')
var Joi = require('joi')

module.exports = Promise

function Flare() {
  this.path = ''
  this.stash = {}
  this.res = {}
}

Promise.route = function Promise$route(url) {
  return Promise.resolve(new Flare()).route(url)
}

Promise.get = function Promise$get(url) {
  return Promise.resolve(new Flare()).get(url)
}

Promise.post = function Promise$route(url, body) {
  return Promise.resolve(new Flare()).post(url, body)
}

Promise.put = function Promise$route(url, body) {
  return Promise.resolve(new Flare()).put(url, body)
}

Promise.del = function Promise$route(url, body) {
  return Promise.resolve(new Flare()).del(url, body)
}

Promise.prototype.request = function (opts) {
  return this._then(function (flare) {
    return new Promise(function (resolve, reject) {
      _request(opts, function (err, res) {
        if (err) {
          return reject(err)
        }

        resolve(res)
      })
    }).then(function (res) {
      flare.res = res
      return flare
    })
  })
}

Promise.prototype.route = function (uri) {
  return this._then(function (flare) {
    flare.path = uri
    return flare
  })
}

Promise.prototype.get = function (uri) {
  var self = this
  return this._then(function (flare) {
    return self.request({
      method: 'get',
      uri: flare.path + uri
    })
  })
}

Promise.prototype.post = function (uri, body) {
  var self = this
  return this._then(function (flare) {
    return self.request({
      method: 'post',
      uri: flare.path + uri,
      json: body
    })
  })
}

Promise.prototype.put = function (uri, body) {
  var self = this
  return this._then(function (flare) {
    return self.request({
      method: 'put',
      uri: flare.path + uri,
      json: body
    })
  })
}

Promise.prototype.del = function (uri, body) {
  var self = this
  return this._then(function (flare) {
    return self.request({
      method: 'delete',
      uri: flare.path + uri,
      json: body
    })
  })
}

Promise.prototype.expect = function (statusCode, schema) {
  return this._then(function (flare) {
    return new Promise(function (resolve, reject) {
      var status = flare.res.statusCode

      if (status !== statusCode) {
        throw new Error('Status Code: ' + status)
      }

      if (!schema) {
        return resolve(flare)
      }

      Joi.validate(flare.res.body, schema, function (err) {
        if (err) {
          reject(err)
        }

        resolve(flare)
      })
    })
  })
}
