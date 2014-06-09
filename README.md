# REST JSON API testing framework

```js
// Returns a bluebird Promise
flare
  .get('/user/1')
  .expect(200, {
    // JSON schema v4
  })
  .stash('jim')
  .get('/user/:jim.id')
  .expect(200)
  .post('/user', {})
  .expect(200, function (res) {

  })
  .then(function (flare) {
    return flare
      .get('/non')
      .expect(404)
  })
```
