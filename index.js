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
    actors: {},
    server: null
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
    return param.replace(/([^\\])(:[a-zA-Z][\w.]+)/g, function (param, prefix, prop) {
      return prefix + prop.replace(/:[a-zA-Z][\w.]+/g, function (match) {
        return unstashString(match, stash)
      })
    }).replace(/\\(:[a-zA-Z][\w.]+)/g, '$1')
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
        // avoid circular reference
        isJoiObj(val) && key != '_currentJoi') {
      result[key] = unstash(val, stash)
    } else {
      result[key] = val
    }
    return result
  })
}

function callMaybe(maybeFn, state) {
  if (typeof maybeFn === 'function') {
    return maybeFn({stash: state.stash})
  } else {
    return maybeFn
  }
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
    opts = _.defaults({followRedirect: false}, unstash(opts, flare.stash))
    opts = _.merge(opts, flare.actors[flare.currentActorName])

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

FlarePromise.prototype.as = function (actorName) {
  return this.then(function (flare) {
    return _.defaults({currentActorName: actorName}, flare)
  })
}

FlarePromise.prototype.actor = function (actorName, actor) {
  return this.then(function (flare) {
    var actors = _.cloneDeep(flare.actors)
    actors[actorName] = unstash(actor, flare.stash)
    return _.defaults({actors: actors}, flare)
  })
}

FlarePromise.prototype.express = function FlarePromise$express(app, base) {
  return this.then(function (flare) {
    return FlarePromise.resolve(app).then(function (app) {
      return new FlarePromise(function (resolve, reject) {
        var server = http.Server(app)
        server.listen(0, '127.0.0.1', function(){
          var host = server.address().address
          var port = server.address().port

          var path = 'http://' + host + ':' + port + (base || '')
          resolve(_.defaults({path: path, server: server}, flare))
        })
      })
    })
  })
}

FlarePromise.prototype.close = function FlarePromise$end() {
  return this.then(function (flare) {
    if (flare.server) {
      flare.server.close()
    }

    return flare
  })
}

FlarePromise.prototype.exoid = function (path, body) {
  var self = this

  return this.then(function (flare) {
    return self.request({
      method: 'post',
      uri: flare.path + '/exoid',
      json: {
        requests: [{path: path, body: callMaybe(body, flare)}]
      }
    })
    .then(function (flare) {
      if (flare.res.statusCode != 200) {
        return flare
      }

      var exoidResponse = flare.res.body
      var error = exoidResponse.errors[0]
      var result = exoidResponse.results[0]

      if (error) {
        return _.defaults({
          res: {
            statusCode: error.status,
            body: error,
            cache: exoidResponse.cache
          }
        }, flare)
      } else {
        return _.defaults({
          res: {
            statusCode: 200,
            body: result,
            cache: exoidResponse.cache
          }
        }, flare)
      }
    })
  })
}

FlarePromise.prototype.graph = function (query, variables) {
  var self = this

  return this.then(function (flare) {
    return self.request({
      method: 'post',
      uri: flare.path + '/graphql',
      json: {
        query: query,
        variables: callMaybe(variables, flare)
      }
    })
    .then(function (flare) {
      if (flare.res.statusCode != 200) {
        return flare
      }

      var error = flare.res.body.errors
      var result = flare.res.body.data

      if (error) {
        return _.defaults({
          res: {
            statusCode: 400,
            body: error
          }
        }, flare)
      } else {
        return _.defaults({
          res: {
            statusCode: 200,
            body: result
          }
        }, flare)
      }
    })
  })
}

FlarePromise.prototype.get = function (uri, queryString, opts) {
  var self = this
  return this.then(function (flare) {
    return self.request(_.defaults(opts || {}, {
      method: 'get',
      uri: flare.path + uri,
      qs: callMaybe(queryString, flare),
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
      json: callMaybe(body, flare) || true
    }))
  })
}

FlarePromise.prototype.put = function (uri, body, opts) {
  var self = this
  return this.then(function (flare) {
    return self.request(_.defaults(opts || {},{
      method: 'put',
      uri: flare.path + uri,
      json: callMaybe(body, flare) || true
    }))
  })
}

FlarePromise.prototype.patch = function (uri, body, opts) {
  var self = this
  return this.then(function (flare) {
    return self.request(_.defaults(opts || {},{
      method: 'patch',
      uri: flare.path + uri,
      json: callMaybe(body, flare) || true
    }))
  })
}

FlarePromise.prototype.del = function (uri, body, opts) {
  var self = this
  return this.then(function (flare) {
    return self.request(_.defaults(opts || {},{
      method: 'delete',
      uri: flare.path + uri,
      json: callMaybe(body, flare) || true
    }))
  })
}

FlarePromise.prototype.expect = function (statusCode, schema) {
  if (!schema && typeof statusCode !== 'number') {
    schema = statusCode
    statusCode = 200
  }

  return this.then(function (flare) {
    return new FlarePromise(function (resolve, reject) {
      var status = flare.res.statusCode

      if (typeof schema !== 'function') {
        schema = unstash(schema, flare.stash)
      }

      if (typeof statusCode === 'number' && status !== statusCode) {
        var body = flare.res.body || null
        var message = 'Status code should be ' + statusCode +
                      ', not ' + status
        message += '\n    at ' +
          JSON.stringify(body, null, 2).replace(/\n/g,'\n    at ')
        return reject(new Error(message))
      }

      if (!schema) {
        return resolve(flare)
      }

      if (typeof schema === 'function') {
        var res = schema(flare.res, flare.stash)
        if (res != null && typeof res.then === 'function') {
          return resolve(res.then(function(){return flare}))
        }
        return resolve(flare)
      }

      Joi.validate(flare.res.body, schema, {
        convert: false,
        presence: 'required'
      }, function (err) {
        if (err) {
          var body = flare.res.body || null
          err.message += '\n    at ' +
            JSON.stringify(body, null, 2).replace(/\n/g,'\n    at ')
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

    var stash = _.cloneDeep(flare.stash)
    stash[name] = body
    return _.defaults({stash: stash}, flare)
  })
}

FlarePromise.prototype.thru = function (cb) {
  var self = this
  return this.then(function (flare) {
    return cb(self)
  })
}
