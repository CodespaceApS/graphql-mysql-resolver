# graphql-mysql-resolver

graphql-mysql-resolver is a javascript library for dealing with graphql resolvers.

## Installation

Install with npm
```bash
npm install graphql-mysql-resolver
```

Install with yarn
```bash
yarn add graphql-mysql-resolver
```

## Import
```
const { query, update, create, hardDelete } = require('graphql-mysql-resolver')
```


## Usage
Add .env file to project.
```.env
jwt_token=somerandomstr
host=localhost
user=root
port=3306
password=rootpw
database=mydb
```

## Graphql setup.

Add following directives
```
directive @toOne on FIELD_DEFINITION
directive @toMany on FIELD_DEFINITION
directive @toManyMany on FIELD_DEFINITION
directive @second on FIELD_DEFINITION
directive @first on FIELD_DEFINITION
```
### Relationships example

#### One to One (article has one author)

tables
```
authors
  id,
  name,

articles
  id,
  title,
  authorId,
```

graphql
```
type Author{
  id: Int,
  name: String,
}
type Article {
  id: Int,
  title: String,
  author: Author @toOne,
}
```
#### One to Many (author has many articles)
tables
```
authors
  id,
  name,

articles
  id,
  title,
  authorId,
```

graphql
```
type Author{
  id: Int,
  name: String,
  articles: [Article] @toMany,
}
type Article {
  id: Int,
  title: String,
  author: [Author] @toOne,
}
```
#### Many to Many (one user has many favorites authors and one author has many users favoriting them)
tables
```
authors
  id,
  name,

users
  id,
  name,

users_authors
  id,
  userId,
  authorId
```

graphql
```
type Author{
  id: Int,
  name: String,
  users: [User] @toManyMany @second,
}
type User {
  id: Int,
  name: String,
  authors: [Author] @toManyMany @first,
}
```

if the many to many table were named authors_users then the @first and @second has to be switched.

## Query resolver
#### The query function
the propsReducer is optional. Its used to connect a user to the statement or force an orderBy.
```
query(TypeName, databaseTableName, ?propsReducer)
```

### Simple query
```
 query('Article', 'articles')
```


### Props Reducer example:
```
query('Article', 'articles', ({ props }) => {
    return { orderBy: 'id', where: { active: 1 } }
})
```
```
query('Article', 'articles', ({ props, user }) => {
    return { orderBy: 'id', where: { active: 1, userId: user.id } }
})
```
## Mutation resolvers
All mutations functions is similar.
```
  create(databaseTableName, ?cfgObject)
  update(databaseTableName, ?cfgObject)
  hardDelete(databaseTableName, ?cfgObject)
```
#### the cfg object
In the example, we are sending an array of stringified images with the article and we want to add them after the creation of the article and add the relationship to the article. And we adds the author relationship from the current user.

We are going to remove the image string from the input with the inputReducer, and the create them with the postQuery.

#### the post query has 3 args
client = the knex client

id = the created id

input = the complete input (not the inputReduced)


```
const cfgObject = {
  inputReducer: (acc, { ctx, props }) => {

    const { user } = ctx
    const { images, ...newAcc } = acc // removing images
    return { ...newAcc, authorId: user.id }  // adding authorId

  },
  postQuery: async (client, id, input) => {

    const imagesArr = JSON.parse(input.images)
    await imagesArr.reduce(async (accP, x) => {
      await accP
      return client('articles_images').insert({
        url: x,
        articleId: id
      })

  },
}

```

## Building own resolvers.
You can access the knex client object.

This example is using the graphql
```
  input LoginInput {
    email: String,
    password: String,
  }
  type Token {
    token: String
  }

  type Auth {
    name: String,
    rules: [String]
  }

  Mutation {
    auth(input: LoginInput): Token
  }
```

```
const {mysql, auth} = require('graphql-mysql-resolver')


const authResolver = async (_, props, _ctx, info) => {
  const { input } = props
  const user = await mysql('users').where({email: input.email}).first()
  if(!user) trow 'user not found'
  if(user.password !== input.password) throw 'wrong pw'
  const { password, ...cleanUser } = user // Removing pw
  const token = auth.login({
    ...cleanUser
  })
  return token
}
```

## Auth
There is a auth helper included with this lib.

To get it running you have to add a context handler to your apollo cfg.

This we add the user to your inputReducers.

#### Serverless file
```
const {auth} = require('graphql-mysql-resolver')
const server = new ApolloServer({
  typeDefs, resolvers,
  context: ({ event, context }) => {
    const token = event.headers.Authorization || ''
    const user = auth.getUser(token)
    return { user }
  }
})

```
#### Localhost file
```
const {auth} = require('graphql-mysql-resolver')
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => {
    const token = req.headers.authorization || ''
    const user = auth.getUser(token)
    return { user }
  }
})
```

### Login
The auth login example is included in the "Building own resolvers" text.
just call auth.login(userObj)

### Client Side
Just add the token as a header called: authorization.


### Restricting resolvers
You can write your own resolverHOC to restrict a resolver.
```
 const isAdminHOC = (...args) => func => {
    const { user } = args[2] // the third args is the context where the user is stored.
    if(!user || user.isAdmin != 1) throw 'restricted area'
    return func(...args) // remember to return the next func with all the args.
 }

 const articlesResolver = isAdminHOC(query('Article', 'articles'))

```


## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## License
[MIT](https://choosealicense.com/licenses/mit/)