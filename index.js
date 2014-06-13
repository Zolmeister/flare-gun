'use strict'
var Promise = require('bluebird/js/main/promise')()
var _request = require('request')
var Joi = require('joi')
var fs = Promise.promisifyAll(require('fs'))
var _ = require('lodash')

module.exports = Flare

function Flare(opts) {
  opts = opts || {}
  this.docFile = opts.docFile || ''
  this.path = opts.path || ''
  this.stash = opts.stash || {}
  this.res = opts.res || {}
  this.schema = opts.schema || {}
  this.req = opts.res || {}
  this.actors = opts.actors || {}
  this.currentActor = opts.currentActor || {}
  this._isFlare = true
}

Flare.prototype = Object.create(Promise)

Promise.route = classToInstanceFn('route')
Promise.get = classToInstanceFn('get')
Promise.post = classToInstanceFn('post')
Promise.put = classToInstanceFn('put')
Promise.del = classToInstanceFn('del')
Promise.docFile = classToInstanceFn('docFile')
Promise.actor = classToInstanceFn('actor')

function classToInstanceFn(name) {
  return function () {
    var promise = Promise.resolve(this).bind(this)
    return promise[name].apply(promise, arguments)
  }
}

function fillUri(uri, source) {
  var vars = uri.match(/\/:[\w.]+/g)
  if (vars) {
    for (var i = 0; i < vars.length; i++) {
      uri = uri.replace(vars[i], '/' + fillString(vars[i], source))
    }
  }

  return uri
}

function fillString(param, source) {
  var name = param
  name = name.slice(name.indexOf(':') + 1, name.indexOf('.'))

  var pointer = source[name]


  var params = param.match(/\.\w+/g)
  for (var j = 0; j < params.length; j++) {
    pointer = pointer[params[j].slice(1)]
  }

  return pointer
}

Promise.prototype.actor = function (name, req) {
  var flare = this._boundTo
  return this._then(function () {
    flare.actors[name] = req || {}
    return flare
  })
}

Promise.prototype.as = function (name) {
  var flare = this._boundTo
  return this._then(function () {
    flare.currentActor = flare.actors[name]
    return flare
  })
}

Promise.prototype.docFile = function Promise$docFile(path) {
  var flare = this._boundTo
  return this._then(function () {
    flare.docFile = path
    return flare
  })
}

Promise.prototype.doc = function Promise$doc(title, description) {
  var flare = this._boundTo
  return this._then(function () {
    if (!flare.docFile) {
      throw new Error('docFile not specified')
    }
    return fs.readFileAsync(flare.docFile)
      .then(function (file) {
        return JSON.parse(file)
      }, function (err) {
        return []
      })
      .then(function (docs) {
        docs.push({
          title: title,
          description: description,
          req: flare.req,
          res: flare.res,
          schema: flare.schema
        })

        // clear out doc state
        delete flare.schema
        delete flare.req

        return fs.writeFileAsync(flare.docFile, JSON.stringify(docs))
      }).then(function () {
        return flare
      })
  })
}

function fillJson(json, source) {
  return _.mapValues(json, function (val) {
    if (_.isPlainObject(val)) {
      return fillJson(val, source)
    }

    if (typeof val === 'string' && /^:[\w.]+$/.test(val)) {
      return fillString(val, source)
    }

    return val
  })
}

Promise.prototype.request = function (opts) {
  var flare = this._boundTo
  return this._then(function () {

    // materialize the stash
    opts.uri = fillUri(opts.uri, flare.stash)
    opts.json = opts.json && fillJson(opts.json, flare.stash)
    flare.req = _.defaults(opts, flare.currentActor)

    return new Promise(function (resolve, reject) {
      _request(opts, function (err, res) {
        if (err) {
          return reject(err)
        }

        resolve(res)
      })
    }).then(function (res) {
      flare.res = _.pick(res, ['statusCode', 'headers', 'body'])
      return flare
    })
  })
}

Promise.prototype.route = function (uri) {
  var flare = this._boundTo
  return this._then(function () {
    flare.path = uri
    return flare
  })
}

Promise.prototype.get = function (uri) {
  var self = this
  var flare = this._boundTo
  return this._then(function () {
    return self.request({
      method: 'get',
      uri: flare.path + uri
    })
  })
}

Promise.prototype.post = function (uri, body) {
  var self = this
  var flare = this._boundTo
  return this._then(function () {
    return self.request({
      method: 'post',
      uri: flare.path + uri,
      json: body
    })
  })
}

Promise.prototype.put = function (uri, body) {
  var self = this
  var flare = this._boundTo
  return this._then(function () {
    return self.request({
      method: 'put',
      uri: flare.path + uri,
      json: body
    })
  })
}

Promise.prototype.del = function (uri, body) {
  var self = this
  var flare = this._boundTo
  return this._then(function () {
    return self.request({
      method: 'delete',
      uri: flare.path + uri,
      json: body
    })
  })
}

Promise.prototype.expect = function (statusCode, schema) {
  var flare = this._boundTo
  return this._then(function () {

    flare.schema = fillJson(schema, flare.stash)
    return new Promise(function (resolve, reject) {
      var status = flare.res.statusCode

      if (typeof status === 'number' && status !== statusCode) {
        return reject(new Error('Status Code: ' + status))
      }

      if (typeof status === 'function') {
        flare.schema = status
      }

      if (!schema) {
        return resolve(flare)
      }

      if (typeof schema === 'function') {
        try {
          schema(flare.res)
          return resolve(flare)
        } catch(err) {
          return reject(err)
        }
      }

      Joi.validate(flare.res.body, flare.schema, function (err) {
        if (err) {
          return reject(err)
        }

        resolve(flare)
      })
    })
  })
}

Promise.prototype.stash = function (name) {
  var flare = this._boundTo
  return this._then(function () {
    flare.stash[name] = flare.res.body
    return flare
  })
}
