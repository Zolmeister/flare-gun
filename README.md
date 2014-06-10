# REST JSON API testing framework - using Promises

```js
var flare = require('flare-gun').route('http://localhost:3001')

return flare
  .request({
    uri: 'http://localhost:3001/hello/joe',
    method: 'get'
  })
  .get('/hello/joe')
  .then(function (flare) {
    assert(flare.res.body === '"hello joe"', 'Flare didn\'t get!')
  })
  .get('/NULL')
  .expect(200)
  .then(null, function (err) {
    assert(err.message === 'Status Code: 404', 'Bad Error')
    return flare
  })
  .get('/NULL')
  .expect(404)
  .post('/mirror', { hello: 'world' })
  .put('/mirror', {meta: 'eta'})
  .del('/mirror', {meta: 'eta'})
  .post('/mirror', {
    err: 'none'
  })
  .expect(200, {
    err: 'err' // Error generated
  })
  .post('/mirror', {
    string: 'str',
    num: 123,
    nest: {
      string: 'str',
      num: 123
    }
  })
  // See Joi - https://github.com/spumko/joi
  .expect(200, {
    string: Joi.string(),
    num: Joi.number(),
    nest: Joi.object().keys({
        string: Joi.string(),
        num: Joi.number()
    })
  })
  .post('/mirror', {text: 'boom', friend: 'mob'})
  .stash('mirror')
  .get('/hello/:mirror.text/:mirror.friend')
  .post('/mirror', {text: 'boom'})
  .stash('mirror')
  .post('/mirror', {text: ':mirror.text'})
  .expect(200, {
    text: Joi.string('boom').required()
  })
  // auto doc generation via ze-goggles
  // https://github.com/Zolmeister/ze-goggles
  .docFile(__dirname + '/flare_doc.json')
  .post('/mirror', {my: 'me'})
  .expect(200, {
    my: Joi.string()
  })
  .doc('Hello', 'Say hello to the mirror')
  .doc('Delete', 'No errors here')
```
