'use strict'
var FlarePromise = require('bluebird/js/main/promise')()
var _request = require('request')
var Joi = require('joi')
var fs = FlarePromise.promisifyAll(require('fs'))
var _ = require('lodash')
var http = require('http')
var SocketIO = require('socket.io-client')

var flareGun = new FlarePromise(function (resolve) {
  resolve({
    path: '',
    stash: {},
    res: {},
    currentActorName: null,
    currentSocketActorName: null,
    actors: {},
    sockets: {},
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

// IDEA: use ES6 template variables
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
    var finalOpts = {
      followRedirect: false,
      gzip: true,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64 Mobile Safari/537.36'
      }
    }
    _.merge(finalOpts, flare.actors[flare.currentActorName])
    _.merge(finalOpts, unstash(opts, flare.stash))

    return new FlarePromise(function (resolve, reject) {
      _request(finalOpts, function (err, res) {
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
    var actors = {}
    actors[actorName] = unstash(actor, flare.stash)
    return _.defaults({
      actors: _.defaults(actors, flare.actors)
    }, flare)
  })
}

FlarePromise.prototype.socketEmit = function (channel, message) {
  return this.then(function (flare) {
    var socket = flare.sockets[flare.currentSocketActorName]
    if (!socket) {
      throw new Error('Unknown socket actor ' + flare.currentSocketActorName)
    }

    socket.emit(channel, unstash(message, flare.stash))

    return flare
  })
}

FlarePromise.prototype.withSocket = function (socketActor, opts, callback) {
  return this.then(function (flare) {
    var sockets = {}
    sockets[socketActor] = SocketIO(flare.path,
        _.assign({forceNew: true}, unstash(opts, flare.stash))
    )

    flare = _.defaults({
      currentSocketActorName: socketActor,
      sockets: _.defaults(sockets, flare.sockets)
    }, flare)

    return callback(FlarePromise.resolve(flare)).then(function (flare) {
      sockets[socketActor].disconnect()
      return flare
    })
  })
}

// TODO: support mutliple open sockets
// FlarePromise.prototype.asSocket = function (socketActorName) {
//   return this.then(function (flare) {
//     return _.defaults({currentSocketActorName: socketActorName}, flare)
//   })
// }

FlarePromise.prototype.socketOn = function (channel, schema) {
  return this.then(function (flare) {
    var socket = flare.sockets[flare.currentSocketActorName]
    if (!socket) {
      throw new Error('Unknown socket actor ' + flare.currentSocketActorName)
    }

    socket.on(channel, function (message) {
      if (typeof schema !== 'function') {
        schema = unstash(schema, flare.stash)
      }

      if (!schema) {
        return null
      }

      if (typeof schema === 'function') {
        schema(message)
        return null
      }

      Joi.validate(message, schema, {
        convert: false,
        presence: 'required'
      }, function (err) {
        if (err) {
          err.message += '\n    at ' +
            JSON.stringify(message, null, 2).replace(/\n/g,'\n    at ')
          throw err
        }
      })
    })

    return flare
  })
}

FlarePromise.prototype.express = function FlarePromise$express(server, base) {
  return this.then(function (flare) {
    return FlarePromise.resolve(server).then(function (server) {
      return new FlarePromise(function (resolve, reject) {
        if (!server.address) {
          server = http.Server(server)
        }
        server.listen(0, '127.0.0.1', function() {
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
        var res = schema(flare.res.body, flare.stash)
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
