'use strict'
var Promise = require('bluebird/js/main/promise')()
var _request = require('request')
var Joi = require('joi')
var fs = Promise.promisifyAll(require('fs'))
var _ = require('lodash')

module.exports = Promise

function Flare(opts) {
  opts = opts || {}
  this.docFile = opts.docFile || ''
  this.path = opts.path || ''
  this.stash = opts.stash || {}
  this.res = opts.res || {}
  this.schema = opts.schema || {}
  this.req = opts.res || {}
  this.actors = opts.actors || {}
  this.currentActor = opts.currentActor || {
    req: {}
  }
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

Promise.docFile = function Promise$docFile(path) {
  return Promise.resolve(new Flare()).docFile(path)
}

Promise.actor = function Promise$actor(name, req) {
  return Promise.resolve(new Flare()).actor(name, req)
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
  return this._then(function (flare) {
    flare.actors[name] = req || {}
    return flare
  })
}

Promise.prototype.as = function (name) {
  return this._then(function (flare) {
    flare.currentActor = flare.actors[name]
    return flare
  })
}

Promise.prototype.docFile = function Promise$docFile(path) {
  return this._then(function (flare) {
    flare.docFile = path
    return flare
  })
}

Promise.prototype.doc = function Promise$doc(title, description) {
  return this._then(function (flare) {
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
  return _.mapValues(_.cloneDeep(json), function (val) {
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

  return this._then(function (flare) {

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

    flare.schema = schema
    return new Promise(function (resolve, reject) {
      var status = flare.res.statusCode

      if (typeof status === 'number' && status !== statusCode) {
        return reject(new Error('Status Code: ' + status))
      }

      if (typeof status === 'function') {
        schema = status
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

      Joi.validate(flare.res.body, schema, function (err) {
        if (err) {
          return reject(err)
        }

        resolve(flare)
      })
    })
  })
}

Promise.prototype.stash = function (name) {
  return this._then(function (flare) {
    flare.stash[name] = flare.res.body
    return flare
  })
}
