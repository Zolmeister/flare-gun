'use strict'
var FlarePromise = require('bluebird/js/main/promise')()
var _request = require('request')
var Joi = require('joi')
var fs = FlarePromise.promisifyAll(require('fs'))
var _ = require('lodash')
var http = require('http')

var flareGun = new FlarePromise(function (resolve) {
  resolve({
    path: '',
    stash: {},
    res: {},
    currentActorName: null,
    actors: {}
  })
})

module.exports = flareGun

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

FlarePromise.prototype.flare = function FlarePromise$flare(fn) {
  var self = this
  return this.then(function (flare) {
    FlarePromise.try(function () {
      return fn(self, flare)
    })
  })
}

FlarePromise.prototype.request = function (opts) {
  return this.then(function (flare) {
    // materialize the stash
    opts.uri = unstash(opts.uri, flare.stash)
    opts.json = unstash(opts.json, flare.stash)
    opts.qs = unstash(opts.qs, flare.stash)
    opts.followRedirect = false
    opts = _.defaults(flare.actors[flare.currentActorName] || {}, opts)

    return new FlarePromise(function (resolve, reject) {
      _request(opts, function (err, res) {
        if (err) {
          return reject(err)
        }

        resolve(res)
      })
    }).then(function (res) {
      return _.defaults({
        res: _.pick(res, ['statusCode', 'headers', 'body'])
      }, flare)
    })
  })
}

FlarePromise.prototype.route = function (uri) {
  return this.then(function (flare) {
    return _.defaults({path: uri}, flare)
  })
}

FlarePromise.prototype.actor = function (uri) {
  return this.then(function (flare) {
    return _.defaults({path: uri}, flare)
  })
}

FlarePromise.prototype.as = function (actorName) {
  return this.then(function (flare) {
    return _.defaults({currentActorName: actorName}, flare)
  })
}

FlarePromise.prototype.actor = function (actorName, actor) {
  return this.then(function (flare) {
    var state = {actors: {}}
    state.actors[actorName] = actor
    return _.merge(state, flare)
  })
}

FlarePromise.prototype.express = function FlarePromise$express(app, base) {
  return this.then(function (flare) {
    return FlarePromise.resolve(app).then(function (app) {
      return new FlarePromise(function (resolve, reject) {
        var server = http.Server(app)
        server.listen(0, function(){
          var host = server.address().address
          var port = server.address().port

          var path = 'http://' + host + ':' + port + (base || '')
          resolve(_.defaults({path: path}, flare))
        })
      })
    })
  })
}

FlarePromise.prototype.get = function (uri, queryString, opts) {
  var self = this
  return this.then(function (flare) {
    return self.request(_.defaults(opts || {}, {
      method: 'get',
      uri: flare.path + uri,
      qs: queryString,
      json: true
    }))
  })
}

FlarePromise.prototype.post = function (uri, body, opts) {
  var self = this
  return this.then(function (flare) {
    return self.request(_.defaults(opts || {},{
      method: 'post',
      uri: flare.path + uri,
      json: body
    }))
  })
}

FlarePromise.prototype.put = function (uri, body, opts) {
  var self = this
  return this.then(function (flare) {
    return self.request(_.defaults(opts || {},{
      method: 'put',
      uri: flare.path + uri,
      json: body
    }))
  })
}

FlarePromise.prototype.patch = function (uri, body, opts) {
  var self = this
  return this.then(function (flare) {
    return self.request(_.defaults(opts || {},{
      method: 'patch',
      uri: flare.path + uri,
      json: body
    }))
  })
}

FlarePromise.prototype.del = function (uri, body, opts) {
  var self = this
  return this.then(function (flare) {
    return self.request(_.defaults(opts || {},{
      method: 'delete',
      uri: flare.path + uri,
      json: body
    }))
  })
}

FlarePromise.prototype.expect = function (statusCode, schema) {
  return this.then(function (flare) {
    return new FlarePromise(function (resolve, reject) {
      var status = flare.res.statusCode

      if (typeof schema !== 'function') {
        schema = unstash(schema, flare.stash)
      }

      if (typeof status === 'number' && status !== statusCode) {
        var message = 'Status code should be ' + statusCode +
                      ', not ' + status
        message += '\n    at ' +
          JSON.stringify(flare.res.body, null, 2).replace(/\n/g,'\n    at ')
        return reject(new Error(message))
      }

      if (!schema) {
        return resolve(flare)
      }

      if (typeof schema === 'function') {
        schema(flare.res, flare.stash)
        return resolve(flare)
      }

      Joi.validate(flare.res.body, schema, {
        convert: false,
        presence: 'required'
      }, function (err) {
        if (err) {
          err.message += '\n    at ' +
            JSON.stringify(flare.res.body, null, 2).replace(/\n/g,'\n    at ')
          return reject(err)
        }

        resolve(flare)
      })
    })
  })
}

FlarePromise.prototype.stash = function (name) {
  return this.then(function (flare) {
    var body = flare.res.body

    if (_.isString(body) && flare.res.headers &&
    _.contains(flare.res.headers['content-type'], 'application/json')) {
      body = JSON.parse(body)
    }

    var state = {stash: {}}
    state.stash[name] = body
    return _.merge(state, flare)
  })
}

FlarePromise.prototype.thru = function (cb) {
  var self = this
  return this.then(function (flare) {
    return cb(self)
  })
}
