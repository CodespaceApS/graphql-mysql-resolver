var jwt = require('jsonwebtoken');

const defaultState = {
  name: 'guest',
  rules: ['guest']
}

const jwtToken = process.env.jwt_token

module.exports = {
  login: user => jwt.sign(user, jwtToken),
  getUser: token => token ? jwt.decode(token) || defaultState : defaultState,
  printAuth: (_, props, _ctx) => {
    return _ctx.user
  }
}