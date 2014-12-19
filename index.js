'use strict'
var FlarePromise = require('bluebird/js/main/promise')()
var _request = require('request')
var Joi = require('joi')
var fs = FlarePromise.promisifyAll(require('fs'))
var _ = require('lodash')
var http = require('http')

module.exports = Flare

function Flare(opts) {
  opts = opts || {}
  this.docFilePath = opts.docFilePath || ''
  this.path = opts.path || ''
  this.stashed = opts.stashed || {}
  this.res = opts.res || {}
  this.schema = opts.schema || {}
  this.req = opts.res || {}
  this.actors = opts.actors || {}
  this.currentActor = opts.currentActor || {}
  this._isFlare = true
}

function unstash(obj, stash) {
  if (!obj) return obj

  if (_.isString(obj)) {
    return unstashString(obj, stash)
  }
  return unstashObject(obj, stash)
}

function unstashString(param, stash) {
  if (!/^:[a-zA-Z][\w.]+$/.test(param)) {
    return param.replace(/:[a-zA-Z][\w.]+/g, function (param) {
      return unstashString(param, stash)
    })
  }

  var name = param.slice(param.indexOf(':') + 1).split('.')[0]
  var pointer = stash[name]
  var params = param.match(/\.\w+/g)

  if (params === null) {
    return pointer
  }

  for (var j = 0; j < params.length; j++) {
    pointer = pointer[params[j].slice(1)]
  }

  return pointer
}

function isJoiObj(val) {
  // may break if Joi changes
  return _.isObject(val) && val.isJoi || _.isObject(val) && val._set
}

function unstashObject(obj, stash) {
  return _.transform(obj, function (result, val, key) {
    if (_.isPlainObject(val) ||
        _.isString(val) ||
        _.isArray(val) ||
        isJoiObj(val)) {
      result[key] = unstash(val, stash)
    } else {
      result[key] = val
    }
    return result
  })
}

Flare.prototype.actor = function (name, req) {
  var flare = this
  return FlarePromise.try(function () {
    flare.actors[name] = req || {}
    return flare
  }).bind(flare)
}

Flare.prototype.as = function (name) {
  var flare = this
  return FlarePromise.try(function () {
    flare.currentActor = flare.actors[name]
    return flare
  }).bind(flare)
}

Flare.prototype.docFile = function FlarePromise$docFile(path) {
  var flare = this
  return FlarePromise.try(function () {
    flare.docFilePath = path
    return flare
  }).bind(flare)
}

Flare.prototype.flare = function FlarePromise$flare(fn) {
  var flare = this
  return FlarePromise.try(function () {
    return fn(flare)
  }).bind(flare)
}

Flare.prototype.doc = function FlarePromise$doc(title, description) {
  var flare = this
  return FlarePromise.try(function () {
    if (!flare.docFilePath) {
      throw new Error('docFile not specified')
    }
    return fs.readFileAsync(flare.docFilePath)
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

        return fs.writeFileAsync(flare.docFilePath, JSON.stringify(docs))
      }).then(function () {
        return flare
      })
  }).bind(flare)
}

Flare.prototype.request = function (opts) {
  var flare = this
  return FlarePromise.try(function () {

    // materialize the stash
    opts.uri = unstash(opts.uri, flare.stashed)
    opts.json = unstash(opts.json, flare.stashed)
    opts.qs = unstash(opts.qs, flare.stashed)
    opts.followRedirect = false
    flare.req = _.defaults(_.defaults(opts, flare.currentActor), {
      json: true
    })

    return new FlarePromise(function (resolve, reject) {
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
  }).bind(flare)
}

Flare.prototype.route = function (uri) {
  var flare = this
  return FlarePromise.try(function () {
    flare.path = uri
    return flare
  }).bind(flare)
}

Flare.prototype.express = function FlarePromise$express(app, base) {
  var flare = this
  return FlarePromise.resolve(new FlarePromise(function (resolve, reject) {
    var server = http.Server(app)
    server.listen(0, function(){
      var host = server.address().address
      var port = server.address().port

      flare.path = 'http://' + host + ':' + port + (base || '')
      resolve()
    })
  })).bind(flare)
}

Flare.prototype.get = function (uri, queryString) {
  var self = this
  var flare = this
  return FlarePromise.try(function () {
    return self.request({
      method: 'get',
      uri: flare.path + uri,
      qs: queryString
    })
  }).bind(flare)
}

Flare.prototype.post = function (uri, body) {
  var self = this
  var flare = this
  return FlarePromise.try(function () {
    return self.request({
      method: 'post',
      uri: flare.path + uri,
      json: body
    })
  }).bind(flare)
}

Flare.prototype.put = function (uri, body) {
  var self = this
  var flare = this
  return FlarePromise.try(function () {
    return self.request({
      method: 'put',
      uri: flare.path + uri,
      json: body
    })
  }).bind(flare)
}

Flare.prototype.patch = function (uri, body) {
  var self = this
  var flare = this
  return FlarePromise.try(function () {
    return self.request({
      method: 'patch',
      uri: flare.path + uri,
      json: body
    })
  }).bind(flare)
}

Flare.prototype.del = function (uri, body) {
  var self = this
  var flare = this
  return FlarePromise.try(function () {
    return self.request({
      method: 'delete',
      uri: flare.path + uri,
      json: body
    })
  }).bind(flare)
}

Flare.prototype.expect = function (statusCode, schema) {
  var flare = this
  return FlarePromise.try(function () {

    flare.schema = unstash(schema, flare.stashed)
    return new FlarePromise(function (resolve, reject) {
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
          schema(flare.res, flare.stashed)
          return resolve(flare)
        } catch(err) {
          return reject(err)
        }
      }
      Joi.validate(flare.res.body, flare.schema, {
        convert: false,
        presence: 'required'
      }, function (err) {
        if (err) {
          return reject(err)
        }

        resolve(flare)
      })
    })
  }).bind(flare)
}

Flare.prototype.stash = function (name) {
  var flare = this
  return FlarePromise.try(function () {
    var body = flare.res.body

    if (_.isString(body) && flare.res.headers &&
    _.contains(flare.res.headers['content-type'], 'application/json')) {
      body = JSON.parse(body)
    }

    flare.stashed[name] = body
    return flare
  }).bind(flare)
}

FlarePromise.prototype = _.assign(FlarePromise.prototype,
                      _.transform(Object.keys(Flare.prototype),
                      function (methods, methodName) {

  methods[methodName] = function () {
    var flare = this._boundTo
    var args = arguments
    return this._then(function () {
      if (!flare || !flare._isFlare) {
        throw new Error('Missing flare object binding')
      }

      return flare[methodName].apply(flare, args)
    })
  }
}, {}))
